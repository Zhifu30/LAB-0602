import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface ScheduleWithEquipment {
  id: string;
  title: string;
  description: string | null;
  next_due_date: string;
  frequency: string;
  assigned_name: string | null;
  assigned_email: string | null;
  equipment_id: string;
  equipment: {
    id: string;
    name: string;
    type: string | null;
    responsible: string | null;
    responsible_email: string | null;
  } | null;
}

interface EmailSettings {
  workday_only: boolean;
  reminder_days_before: number;
  consolidate_emails: boolean;
}

// Check if a date is a workday (Monday-Friday)
function isWorkday(date: Date): boolean {
  const day = date.getDay();
  return day !== 0 && day !== 6; // 0 = Sunday, 6 = Saturday
}

// Check if today is Monday
function isMonday(date: Date): boolean {
  return date.getDay() === 1;
}

// Get extra reminder days for weekend catch-up (Monday needs +2 to cover Sat/Sun)
function getExtraReminderDays(date: Date, workdayOnly: boolean): number {
  if (!workdayOnly) return 0;
  // If today is Monday, need to check tasks that would have been triggered on Sat/Sun
  if (isMonday(date)) return 2;
  return 0;
}

// Get last day of next month
function getLastDayOfNextMonth(date: Date): Date {
  const nextMonth = new Date(date.getFullYear(), date.getMonth() + 2, 0);
  return nextMonth;
}

const handler = async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    console.log("Starting maintenance reminder check...");

    // Get email settings
    const { data: emailSettings, error: settingsError } = await supabase
      .from("email_settings")
      .select("workday_only, reminder_days_before, consolidate_emails")
      .eq("id", "default")
      .single();

    const settings: EmailSettings = {
      workday_only: emailSettings?.workday_only ?? true,
      reminder_days_before: emailSettings?.reminder_days_before ?? 7,
      consolidate_emails: emailSettings?.consolidate_emails ?? true,
    };

    console.log("Email settings:", settings);

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Check if today is a workday (if workday_only is enabled)
    // But if it's Monday, we still run to catch up weekend emails
    if (settings.workday_only && !isWorkday(today)) {
      console.log("Today is not a workday and workday_only is enabled. Skipping email send.");
      return new Response(
        JSON.stringify({
          success: true,
          message: "Skipped - today is not a workday (will catch up on Monday)",
          remindersSent: [],
          errors: [],
          totalChecked: 0,
          totalDue: 0,
          uniqueRecipients: 0,
          schedulesMarked: 0
        }),
        {
          status: 200,
          headers: { "Content-Type": "application/json", ...corsHeaders },
        }
      );
    }

    // Calculate extra days for Monday catch-up
    const extraDays = getExtraReminderDays(today, settings.workday_only);
    const effectiveReminderDays = settings.reminder_days_before + extraDays;
    
    if (extraDays > 0) {
      console.log(`Monday catch-up: Adding ${extraDays} extra days to reminder window (${settings.reminder_days_before} + ${extraDays} = ${effectiveReminderDays})`);
    }

    // Get all active maintenance schedules that haven't been reminded
    const { data: schedules, error: schedulesError } = await supabase
      .from("maintenance_schedules")
      .select("*, equipment:equipment_id(id, name, type, responsible, responsible_email)")
      .eq("is_active", true)
      .eq("reminder_sent", false);

    if (schedulesError) {
      console.error("Error fetching schedules:", schedulesError);
      throw schedulesError;
    }

    console.log(`Found ${schedules?.length || 0} active schedules to check`);

    // Filter schedules that are due for reminder (including weekend catch-up)
    const dueSchedules: ScheduleWithEquipment[] = [];
    for (const schedule of (schedules || []) as ScheduleWithEquipment[]) {
      const nextDueDate = new Date(schedule.next_due_date);
      nextDueDate.setHours(0, 0, 0, 0);
      
      const daysUntilDue = Math.ceil((nextDueDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
      
      console.log(`Schedule: ${schedule.title}, Days until due: ${daysUntilDue}, Effective reminder days: ${effectiveReminderDays}`);

      // Use effective reminder days (includes Monday catch-up)
      if (daysUntilDue <= effectiveReminderDays && daysUntilDue >= 0) {
        dueSchedules.push(schedule);
      }
    }

    console.log(`${dueSchedules.length} schedules need reminders`);

    const remindersSent: string[] = [];
    const errors: string[] = [];
    const schedulesToUpdate: string[] = [];
    const schedulesToResetNextMonth: string[] = [];

    if (settings.consolidate_emails) {
      // Group schedules by recipient email - each person gets ONE consolidated email
      const emailGroups: Map<string, ScheduleWithEquipment[]> = new Map();
      
      for (const schedule of dueSchedules) {
        const recipients: string[] = [];
        
        if (schedule.assigned_email) {
          recipients.push(schedule.assigned_email);
        }
        if (schedule.equipment?.responsible_email) {
          recipients.push(schedule.equipment.responsible_email);
        }
        // Admin always gets notified
        recipients.push("zhifu.feng@brightfuture.com.hk");
        
        // Add schedule to each recipient's group
        const uniqueRecipients = [...new Set(recipients)];
        for (const email of uniqueRecipients) {
          if (!emailGroups.has(email)) {
            emailGroups.set(email, []);
          }
          emailGroups.get(email)!.push(schedule);
        }
      }

      console.log(`Grouped into ${emailGroups.size} unique recipients`);

      // Send ONE consolidated email per recipient
      for (const [email, recipientSchedules] of emailGroups) {
        try {
          // Build equipment list for batch email - 使用 equipment.id 而不是 equipment_id
          // 与前端预览 (EmailSettingsPage) 和手动发送 (MaintenanceDashboard) 保持一致
          const equipmentList = recipientSchedules.map(s => ({
            scheduleId: s.id,
            equipmentId: s.equipment?.id || s.equipment_id || "-",
            equipmentName: s.equipment?.name || "未知设备",
            equipmentType: s.equipment?.type || "未分类",
            maintenanceTitle: s.title || "常规维护",
            description: s.description || `${s.title} - ${s.equipment?.name || s.equipment_id}`,
            dueDate: s.next_due_date || "-",
            frequency: s.frequency || "-",
            assignedPerson: s.assigned_name || s.equipment?.responsible || "未指定"
          }));

          console.log(`Sending consolidated email to ${email} with ${equipmentList.length} items`);

          const response = await fetch(`${supabaseUrl}/functions/v1/send-equipment-notification`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "Authorization": `Bearer ${supabaseServiceKey}`,
            },
            body: JSON.stringify({
              status: "maintenance-batch-reminder",
              adminEmail: email,
              equipmentList: equipmentList,
              reporterName: "系统自动提醒"
            }),
          });

          if (response.ok) {
            console.log(`Consolidated reminder sent successfully to ${email}`);
            remindersSent.push(`${email} (${equipmentList.length} items)`);
            
            // Collect schedule IDs to mark as reminded and to reset
            for (const s of recipientSchedules) {
              if (!schedulesToUpdate.includes(s.id)) {
                schedulesToUpdate.push(s.id);
              }
              // Only reset monthly schedules to next month
              if (s.frequency === 'monthly' && !schedulesToResetNextMonth.includes(s.id)) {
                schedulesToResetNextMonth.push(s.id);
              }
            }
          } else {
            const errorText = await response.text();
            console.error(`Failed to send to ${email}:`, errorText);
            errors.push(`Failed: ${email} - ${errorText}`);
          }
        } catch (emailError: any) {
          console.error(`Error sending to ${email}:`, emailError);
          errors.push(`Error: ${email} - ${emailError.message}`);
        }
      }
    } else {
      // Send individual emails (legacy behavior)
      for (const schedule of dueSchedules) {
        const recipients: string[] = [];
        
        if (schedule.assigned_email) {
          recipients.push(schedule.assigned_email);
        }
        if (schedule.equipment?.responsible_email) {
          recipients.push(schedule.equipment.responsible_email);
        }
        recipients.push("zhifu.feng@brightfuture.com.hk");
        
        const uniqueRecipients = [...new Set(recipients)];
        
        for (const email of uniqueRecipients) {
          try {
            // Use the SAME template as consolidated email (single-item batch)
            // 与前端预览和手动发送保持一致的字段映射
            const equipmentList = [
              {
                scheduleId: schedule.id,
                equipmentId: schedule.equipment?.id || schedule.equipment_id || "-",
                equipmentName: schedule.equipment?.name || "未知设备",
                equipmentType: schedule.equipment?.type || "未分类",
                maintenanceTitle: schedule.title || "常规维护",
                description: schedule.description || `${schedule.title} - ${schedule.equipment?.name || schedule.equipment_id}`,
                dueDate: schedule.next_due_date || "-",
                frequency: schedule.frequency || "-",
                assignedPerson: schedule.assigned_name || schedule.equipment?.responsible || "未指定",
              },
            ];

            const response = await fetch(`${supabaseUrl}/functions/v1/send-equipment-notification`, {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${supabaseServiceKey}`,
              },
              body: JSON.stringify({
                status: "maintenance-batch-reminder",
                adminEmail: email,
                equipmentList,
                reporterName: "系统自动提醒",
              }),
            });

            if (response.ok) {
              remindersSent.push(`${email} - ${schedule.title}`);
              if (!schedulesToUpdate.includes(schedule.id)) {
                schedulesToUpdate.push(schedule.id);
              }
              if (schedule.frequency === 'monthly' && !schedulesToResetNextMonth.includes(schedule.id)) {
                schedulesToResetNextMonth.push(schedule.id);
              }
            } else {
              const errorText = await response.text();
              errors.push(`Failed: ${email} - ${errorText}`);
            }
          } catch (emailError: any) {
            errors.push(`Error: ${email} - ${emailError.message}`);
          }
        }
      }
    }

    // Mark all reminded schedules
    if (schedulesToUpdate.length > 0) {
      const { error: updateError } = await supabase
        .from("maintenance_schedules")
        .update({ reminder_sent: true })
        .in("id", schedulesToUpdate);

      if (updateError) {
        console.error("Error updating reminder_sent status:", updateError);
        errors.push(`Failed to update reminder status for ${schedulesToUpdate.length} schedules`);
      } else {
        console.log(`Marked ${schedulesToUpdate.length} schedules as reminded`);
      }
    }

    // Auto-reset monthly schedules to next month's last day after sending
    let autoResetCount = 0;
    if (schedulesToResetNextMonth.length > 0) {
      const nextMonthLastDay = getLastDayOfNextMonth(today);
      const nextDueDateStr = nextMonthLastDay.toISOString().split("T")[0];
      
      console.log(`Auto-resetting ${schedulesToResetNextMonth.length} monthly schedules to ${nextDueDateStr}`);
      
      const { error: resetError } = await supabase
        .from("maintenance_schedules")
        .update({ 
          next_due_date: nextDueDateStr,
          reminder_sent: false,
          updated_at: new Date().toISOString()
        })
        .in("id", schedulesToResetNextMonth);

      if (resetError) {
        console.error("Error auto-resetting schedules:", resetError);
        errors.push(`Failed to auto-reset ${schedulesToResetNextMonth.length} schedules`);
      } else {
        console.log(`Auto-reset ${schedulesToResetNextMonth.length} schedules to ${nextDueDateStr}`);
        autoResetCount = schedulesToResetNextMonth.length;
      }
    }

    console.log(`Maintenance reminder check completed. Emails sent: ${remindersSent.length}, Errors: ${errors.length}, Auto-reset: ${autoResetCount}`);

    // ──── 发送汇总报告给 15888（管理员） ────
    let summarySent = false;
    try {
      // 查找 15888 的邮箱
      const { data: adminProfile } = await supabase
        .from("profiles")
        .select("email, username")
        .eq("username", "15888")
        .maybeSingle();

      const adminEmail = adminProfile?.email || "zhifu.feng@brightfuture.com.hk";

      if (adminEmail) {
        const todayStr = today.toISOString().split("T")[0];
        const summaryHtml = `
          <h2>📊 维护提醒发送汇总报告</h2>
          <p><strong>日期：</strong>${todayStr}</p>
          <p><strong>周一补发：</strong>${extraDays > 0 ? `是 (+${extraDays}天)` : "否"}</p>
          <hr/>
          <table border="1" cellpadding="8" cellspacing="0" style="border-collapse:collapse;width:100%">
            <tr><td>📋 检查总数</td><td>${schedules?.length || 0}</td></tr>
            <tr><td>⏰ 到期需提醒</td><td>${dueSchedules.length}</td></tr>
            <tr><td>✅ 发送成功</td><td style="color:green">${remindersSent.length}</td></tr>
            <tr><td>❌ 发送失败</td><td style="color:red">${errors.length}</td></tr>
            <tr><td>🔄 自动重置</td><td>${autoResetCount}</td></tr>
            <tr><td>📧 收件人数</td><td>${new Set(dueSchedules.flatMap(s => [s.assigned_email, s.equipment?.responsible_email].filter(Boolean))).size}</td></tr>
          </table>
          ${errors.length > 0 ? `<h3>❌ 失败详情：</h3><ul>${errors.map(e => `<li>${e}</li>`).join("")}</ul>` : ""}
          ${remindersSent.length > 0 ? `<h3>✅ 成功发送：</h3><ul>${remindersSent.map(r => `<li>${r}</li>`).join("")}</ul>` : ""}
          <hr/>
          <p style="color:#666;font-size:12px">此报告由系统自动生成，每天 ${today.getHours()}:${today.getMinutes().toString().padStart(2,"0")} 发送。</p>
        `;

        const summaryResponse = await fetch(`${supabaseUrl}/functions/v1/send-equipment-notification`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${supabaseServiceKey}`,
          },
          body: JSON.stringify({
            status: "admin-summary",
            adminEmail: adminEmail,
            subject: `📊 维护提醒汇总 ${todayStr}`,
            htmlContent: summaryHtml,
            reporterName: "系统自动汇总",
          }),
        });

        if (summaryResponse.ok) {
          console.log(`Summary report sent to ${adminEmail} (15888)`);
          summarySent = true;
        } else {
          const errText = await summaryResponse.text();
          console.error("Failed to send summary:", errText);
        }
      }
    } catch (summaryErr: any) {
      console.error("Error sending summary:", summaryErr);
    }

    return new Response(
      JSON.stringify({
        success: true,
        remindersSent,
        errors,
        totalChecked: schedules?.length || 0,
        totalDue: dueSchedules.length,
        uniqueRecipients: settings.consolidate_emails ? new Set(dueSchedules.flatMap(s => [s.assigned_email, s.equipment?.responsible_email].filter(Boolean))).size : remindersSent.length,
        schedulesMarked: schedulesToUpdate.length,
        autoResetCount,
        settings: settings,
        mondayCatchUp: extraDays > 0
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      }
    );
  } catch (error: any) {
    console.error("Error in send-maintenance-reminders function:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        status: 500,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      }
    );
  }
};

serve(handler);
