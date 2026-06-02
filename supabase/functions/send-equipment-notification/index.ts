// Edge Function: send-equipment-notification
// Updated: 2026-01-25 - Fixed previewOnly mode to return htmlContent
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { SMTPClient } from "https://deno.land/x/denomailer@1.6.0/mod.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface EquipmentListItem {
  scheduleId?: string;
  equipmentId: string;
  equipmentName: string;
  equipmentType?: string;
  maintenanceTitle: string;
  dueDate: string;
  frequency: string;
  description?: string;
}

interface EquipmentNotificationRequest {
  equipmentId: string;
  equipmentName: string;
  status: string;
  reporterName: string;
  // When true, do not send email; just return { subject, htmlContent }
  previewOnly?: boolean;
  reason?: string;
  description?: string;
  imageUrl?: string;
  adminEmail: string;
  responsible?: string;
  // Maintenance reminder fields
  maintenanceTitle?: string;
  maintenanceDescription?: string;
  maintenanceDate?: string;
  maintenanceFrequency?: string;
  assignedPerson?: string;
  // Batch maintenance reminder fields
  equipmentList?: EquipmentListItem[];
}

interface EmailSettings {
  smtp_host: string;
  smtp_port: string;
  smtp_user: string;
  smtp_password: string;
  from_email: string;
  from_name: string;
}

const handler = async (req: Request): Promise<Response> => {
  // Handle CORS preflight requests
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const requestBody = await req.json();
    const previewOnly = Boolean((requestBody as any)?.previewOnly);
    console.log("[send-equipment-notification] previewOnly:", previewOnly, "status:", (requestBody as any)?.status);

    const {
      equipmentId,
      equipmentName,
      status,
      reporterName,
      previewOnly: _previewOnlyIgnored,
      reason,
      description,
      imageUrl,
      adminEmail,
      responsible,
      maintenanceTitle,
      maintenanceDescription,
      maintenanceDate,
      maintenanceFrequency,
      assignedPerson,
      equipmentList,
    }: EquipmentNotificationRequest = requestBody;

    // Only load SMTP settings when we're actually sending.
    let settings: EmailSettings | null = null;
    let port = 587;
    if (!previewOnly) {
      const supabase = createClient(supabaseUrl, supabaseServiceKey);

      // Get email settings from database
      const { data: emailSettings, error: settingsError } = await supabase
        .from("email_settings")
        .select("*")
        .eq("id", "default")
        .single();

      if (settingsError || !emailSettings) {
        console.error("Failed to get email settings:", settingsError);
        return new Response(
          JSON.stringify({ error: "邮件配置未设置，请先在系统中配置邮件服务器" }),
          { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
        );
      }

      // Trim whitespace from settings
      settings = {
        smtp_host: emailSettings.smtp_host?.trim() || "",
        smtp_port: emailSettings.smtp_port?.trim() || "587",
        smtp_user: emailSettings.smtp_user?.trim() || "",
        smtp_password: emailSettings.smtp_password || "",
        from_email: emailSettings.from_email?.trim() || "",
        from_name: emailSettings.from_name?.trim() || "",
      };

      // Validate SMTP host before attempting connection
      if (!settings.smtp_host) {
        console.error("SMTP host is empty or not configured");
        return new Response(
          JSON.stringify({ error: "SMTP服务器地址未配置，请在邮件设置中配置SMTP服务器地址（如 smtp.gmail.com）" }),
          { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
        );
      }

      port = parseInt(settings.smtp_port) || 587;
      console.log("Using email settings - Host:", settings.smtp_host, "Port:", port, "User:", settings.smtp_user);
    }

    let subject = "";
    let htmlContent = "";

    if (status === "out-of-order") {
      subject = `Equipment Fault Report - ${equipmentName}`;
      htmlContent = `
        <h1>设备故障报告 / Equipment Fault Report</h1>
        <p><strong>设备编号 / Equipment ID:</strong> ${equipmentId}</p>
        <p><strong>设备名称 / Equipment Name:</strong> ${equipmentName}</p>
        <p><strong>报告人 / Reporter:</strong> ${reporterName}</p>
        <p><strong>故障原因 / Fault Reason:</strong> ${reason || '未指定 / Not specified'}</p>
        <p><strong>详细描述 / Description:</strong></p>
        <p>${description || '无详细描述 / No description'}</p>
        ${imageUrl ? `
        <p><strong>故障照片 / Fault Photo:</strong></p>
        <img src="${imageUrl}" alt="故障照片" style="max-width: 500px; border: 1px solid #ddd; border-radius: 8px;">
        ` : ''}
        <p>请及时处理此故障设备。 / Please handle this faulty equipment promptly.</p>
        <p>此邮件由设备管理系统自动发送，请勿回复。 / This email is sent automatically. Please do not reply.</p>
      `;
    } else if (status === "scrapped") {
      subject = `Equipment Scrapped Notification - ${equipmentName}`;
      htmlContent = `
        <h1>设备报废通知 / Equipment Scrapped Notification</h1>
        <p><strong>设备编号 / Equipment ID:</strong> ${equipmentId}</p>
        <p><strong>设备名称 / Equipment Name:</strong> ${equipmentName}</p>
        <p><strong>操作人 / Operator:</strong> ${reporterName}</p>
        <p><strong>报废原因 / Scrap Reason:</strong> ${reason || '未指定 / Not specified'}</p>
        <p><strong>详细说明 / Details:</strong></p>
        <p>${description || '无详细说明 / No details'}</p>
        <p>设备已被标记为报废状态，请进行相应的后续处理。 / Equipment has been marked as scrapped. Please proceed with follow-up actions.</p>
        <p>此邮件由设备管理系统自动发送，请勿回复。 / This email is sent automatically. Please do not reply.</p>
      `;
    } else if (status === "calibration-reminder") {
      subject = `Equipment Calibration Reminder - ${equipmentName}`;
      htmlContent = `
        <h1>设备校正提醒 / Equipment Calibration Reminder</h1>
        <p><strong>设备编号 / Equipment ID:</strong> ${equipmentId}</p>
        <p><strong>设备名称 / Equipment Name:</strong> ${equipmentName}</p>
        <p><strong>负责人 / Responsible Person:</strong> ${responsible || '未指定 / Not specified'}</p>
        <p><strong>提醒内容 / Reminder:</strong></p>
        <p>${description || '该设备即将需要校正 / This equipment needs calibration soon'}</p>
        <p>请提前安排校正工作，确保设备正常运行。 / Please schedule calibration in advance to ensure normal equipment operation.</p>
        <p>此邮件由设备管理系统自动发送，请勿回复。 / This email is sent automatically. Please do not reply.</p>
      `;
    } else if (status === "registration-request") {
      subject = `New User Registration Request - ${equipmentName}`;
      htmlContent = `
        <h1>新用户注册请求 / New User Registration Request</h1>
        <p>${description}</p>
        <p>请登录管理后台的权限管理页面审批此注册请求。 / Please log in to the permission management page to approve this registration request.</p>
        <p>此邮件由设备管理系统自动发送，请勿回复。 / This email is sent automatically. Please do not reply.</p>
      `;
    } else if (status === "maintenance-reminder") {
      subject = `Equipment Maintenance Reminder - ${equipmentName}`;
      htmlContent = `
        <h1>设备维护提醒 / Equipment Maintenance Reminder</h1>
        <p><strong>设备编号 / Equipment ID:</strong> ${equipmentId}</p>
        <p><strong>设备名称 / Equipment Name:</strong> ${equipmentName}</p>
        <p><strong>维护项目 / Maintenance Item:</strong> ${maintenanceTitle || '常规维护 / Regular maintenance'}</p>
        <p><strong>维护周期 / Frequency:</strong> ${maintenanceFrequency || '未设置 / Not set'}</p>
        <p><strong>计划维护日期 / Scheduled Date:</strong> ${maintenanceDate || '未设置 / Not set'}</p>
        <p><strong>指定维护人 / Assigned Person:</strong> ${assignedPerson || '未指定 / Not specified'}</p>
        ${maintenanceDescription ? `<p><strong>维护内容 / Maintenance Details:</strong></p><p>${maintenanceDescription}</p>` : ''}
        <p>请按时完成维护工作。 / Please complete the maintenance on time.</p>
        <p>此邮件由设备管理系统自动发送，请勿回复。 / This email is sent automatically. Please do not reply.</p>
      `;
    } else if (status === "maintenance-batch-reminder") {
      // Batch maintenance reminder - one email for multiple equipment
      const batchList: EquipmentListItem[] = equipmentList || [];
      const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
      subject = "Equipment Maintenance Summary";
      
      // Sort items by equipment type and maintenance content for merged cell display
      const sortedList = [...batchList].sort((a, b) => {
        const typeA = (a as any).equipmentType || '';
        const typeB = (b as any).equipmentType || '';
        if (typeA !== typeB) return typeA.localeCompare(typeB);
        const descA = a.description || '';
        const descB = b.description || '';
        return descA.localeCompare(descB);
      });
      
      // Calculate row spans for merged cells
      const typeSpans: Record<string, number> = {};
      const descSpans: Record<string, number> = {};
      sortedList.forEach((item: any) => {
        const type = item.equipmentType || '未分类';
        typeSpans[type] = (typeSpans[type] || 0) + 1;
        const descKey = `${type}|||${item.description || '-'}`;
        descSpans[descKey] = (descSpans[descKey] || 0) + 1;
      });
      
      // Type card color mapping
// Type card color mapping - comprehensive list for all equipment types
      const typeColors: Record<string, { bg: string; border: string }> = {
        '天平': { bg: '#e3f2fd', border: '#2196f3' },
        'Balance': { bg: '#e3f2fd', border: '#2196f3' },
        '稳定性箱': { bg: '#fff3e0', border: '#ff9800' },
        'Stability Box': { bg: '#fff3e0', border: '#ff9800' },
        'Stability chamber': { bg: '#fff3e0', border: '#ff9800' },
        '分析仪器': { bg: '#e8f5e9', border: '#4caf50' },
        '溶出仪': { bg: '#fce4ec', border: '#e91e63' },
        'Dissolution': { bg: '#fce4ec', border: '#e91e63' },
        'HPLC': { bg: '#f3e5f5', border: '#9c27b0' },
        'GC': { bg: '#e0f2f1', border: '#009688' },
        '水分仪': { bg: '#e1f5fe', border: '#03a9f4' },
        '未分类': { bg: '#fff8e1', border: '#ffc107' },
      };
      
      const getTypeColor = (type: string) => {
        return typeColors[type] || { bg: '#f5f5f5', border: '#9e9e9e' };
      };
      
      let tableRows = '';
      let mobileCards = '';
      const usedTypes = new Set<string>();
      const usedDescs = new Set<string>();
      
      if (sortedList && sortedList.length > 0) {
        tableRows = sortedList.map((item: any) => {
          const completeUrl = item.scheduleId 
            ? `${supabaseUrl}/functions/v1/maintenance-complete?scheduleId=${item.scheduleId}`
            : '';
          const completeButton = item.scheduleId
            ? `<a href="${completeUrl}" style="display:inline-block;background-color:#28a745;color:white;padding:6px 12px;text-decoration:none;border-radius:4px;font-size:12px;">Done</a>`
            : '';
          
          const type = item.equipmentType || '未分类';
          const descKey = `${type}|||${item.description || '-'}`;
          const showType = !usedTypes.has(type);
          const showDesc = !usedDescs.has(descKey);
          
          if (showType) usedTypes.add(type);
          if (showDesc) usedDescs.add(descKey);
          
          const colors = getTypeColor(type);
          
          // Equipment type card cell with visual icon
          const typeCell = showType 
            ? `<td style="border:1px solid #ddd;padding:0;background-color:${colors.bg};border-left:4px solid ${colors.border};vertical-align:middle;text-align:center;width:100px;" rowspan="${typeSpans[type]}"><div style="padding:12px 8px;"><div style="width:45px;height:45px;border-radius:8px;background-color:${colors.border};display:inline-flex;align-items:center;justify-content:center;color:white;font-size:18px;font-weight:bold;box-shadow:0 2px 4px rgba(0,0,0,0.2);margin-bottom:6px;">${type.charAt(0)}</div><div style="font-weight:600;font-size:11px;color:#333;line-height:1.2;">${type}</div><div style="font-size:10px;color:#666;background:rgba(255,255,255,0.7);padding:2px 6px;border-radius:10px;margin-top:4px;display:inline-block;">${typeSpans[type]} 台</div></div></td>` 
            : '';
          const descCell = showDesc 
            ? `<td style="border:1px solid #ddd;padding:8px;background-color:#fafafa;vertical-align:top;" rowspan="${descSpans[descKey]}">${item.description || '-'}</td>` 
            : '';
          
          return `<tr>${typeCell}<td style="border:1px solid #ddd;padding:8px;">${item.equipmentId}</td><td style="border:1px solid #ddd;padding:8px;">${item.equipmentName}</td><td style="border:1px solid #ddd;padding:8px;">${item.maintenanceTitle}</td>${descCell}<td style="border:1px solid #ddd;padding:8px;">${item.dueDate}</td><td style="border:1px solid #ddd;padding:8px;">${item.frequency}</td><td style="border:1px solid #ddd;padding:8px;text-align:center;">${completeButton}</td></tr>`;
        }).join('');

        // Mobile-friendly card layout (prevents horizontal scrolling hiding columns)
        mobileCards = sortedList.map((item: any) => {
          const completeUrl = item.scheduleId 
            ? `${supabaseUrl}/functions/v1/maintenance-complete?scheduleId=${item.scheduleId}`
            : '';
          const completeButton = item.scheduleId
            ? `<a href="${completeUrl}" style="display:inline-block;background-color:#28a745;color:white;padding:10px 14px;text-decoration:none;border-radius:8px;font-size:14px;font-weight:600;">Done</a>`
            : '';

          const type = item.equipmentType || '未分类';
          const colors = getTypeColor(type);

          return `<div class="mobile-card" style="border:1px solid #ddd;border-left:5px solid ${colors.border};background:${colors.bg};border-radius:12px;padding:12px;margin:12px 0;">` +
            `<div style="display:flex;gap:10px;align-items:flex-start;">` +
              `<div style="width:44px;height:44px;border-radius:10px;background:${colors.border};display:flex;align-items:center;justify-content:center;color:white;font-size:18px;font-weight:700;flex:0 0 auto;">${String(type).charAt(0)}</div>` +
              `<div style="flex:1;min-width:0;">` +
                `<div style="font-size:12px;font-weight:700;color:#333;line-height:1.2;">${type}</div>` +
                `<div style="margin-top:4px;font-size:14px;font-weight:700;color:#111;">${item.equipmentId}</div>` +
                `<div style="margin-top:2px;font-size:12px;color:#333;">${item.equipmentName}</div>` +
              `</div>` +
            `</div>` +
            `<div style="margin-top:10px;padding-top:10px;border-top:1px solid rgba(0,0,0,0.08);">` +
              `<div style="font-size:13px;font-weight:700;color:#111;">${item.maintenanceTitle}</div>` +
              `<div style="margin-top:6px;font-size:12px;color:#333;line-height:1.35;">${item.description || '-'}</div>` +
              `<div style="margin-top:10px;display:flex;gap:10px;flex-wrap:wrap;font-size:12px;color:#111;">` +
                `<div><strong>Due:</strong> ${item.dueDate}</div>` +
                `<div><strong>Freq:</strong> ${item.frequency}</div>` +
              `</div>` +
              `<div style="margin-top:12px;">${completeButton}</div>` +
            `</div>` +
          `</div>`;
        }).join('');
      }

      const responsiveStyle = `<style>.desktop-table{display:block}.mobile-cards{display:none}@media only screen and (max-width:600px){.desktop-table{display:none!important}.mobile-cards{display:block!important}}</style>`;

      htmlContent = `<!DOCTYPE html><html><head><meta charset="utf-8">${responsiveStyle}</head><body><h1>Equipment Maintenance Summary</h1><p>Dear Responsible Person,</p><p>The following equipment under your responsibility requires maintenance:</p><div class="desktop-table"><table style="border-collapse:collapse;width:100%;margin:20px 0;"><thead><tr style="background-color:#f2f2f2;"><th style="border:1px solid #ddd;padding:12px;text-align:left;width:100px;">Equipment Type</th><th style="border:1px solid #ddd;padding:12px;text-align:left;">Equipment ID</th><th style="border:1px solid #ddd;padding:12px;text-align:left;">Equipment Name</th><th style="border:1px solid #ddd;padding:12px;text-align:left;">Maintenance Item</th><th style="border:1px solid #ddd;padding:12px;text-align:left;">Maintenance Content</th><th style="border:1px solid #ddd;padding:12px;text-align:left;">Due Date</th><th style="border:1px solid #ddd;padding:12px;text-align:left;">Frequency</th><th style="border:1px solid #ddd;padding:12px;text-align:center;">Action</th></tr></thead><tbody>${tableRows}</tbody></table></div><div class="mobile-cards">${mobileCards}</div><p><strong>Total ${batchList?.length || 0} maintenance plans require attention.</strong></p><p>Click the Done button to mark maintenance as complete. The system will automatically update the next due date.</p><p>This email is sent automatically. Please do not reply.</p></body></html>`;
    }

    // Admin summary: pre-built HTML content with custom subject
    if (status === "admin-summary") {
      if (htmlContent) {
        // Use the pre-built content directly
      } else {
        htmlContent = `<h2>📊 维护提醒汇总</h2><p>发送完成。</p>`;
      }
    }

    // Project notification (合并自 send-project-notification)
    if (status === "project-notification") {
      const { to, projectName, teamName, ownerName, stage, projectId, approvedName } = body;
      const baseUrl = Deno.env.get("SITE_URL") || "https://uvylubaxpkmzymdggoyf.supabase.co";

      switch (stage) {
        case 'scientist_review':
          subject = `项目审核通知 - ${projectName}`;
          htmlContent = `<h2>项目审核通知</h2><p>您好，</p><p>团队 <strong>${teamName}</strong> 的项目需要您的审核：</p><ul><li>项目名称：${projectName}</li><li>负责人：${ownerName}</li><li>团队：${teamName}</li></ul><p>请点击以下链接进行审核：</p><a href="${baseUrl}/empower?review=${projectId}" style="background:#3b82f6;color:white;padding:12px 24px;text-decoration:none;border-radius:6px;display:inline-block;margin:16px 0;">立即审核</a><p>谢谢！</p>`;
          break;
        case 'manager_approval':
          subject = `项目审批通知 - ${approvedName || projectName}`;
          htmlContent = `<h2>项目审批通知</h2><p>您好，</p><p>以下项目已通过科学家审核，需要您的审批：</p><ul><li>原项目名称：${projectName}</li><li>审核后名称：${approvedName}</li><li>负责人：${ownerName}</li><li>团队：${teamName}</li></ul><p>请点击以下链接进行审批：</p><a href="${baseUrl}/empower?approve=${projectId}" style="background:#10b981;color:white;padding:12px 24px;text-decoration:none;border-radius:6px;display:inline-block;margin:16px 0;">立即审批</a><p>谢谢！</p>`;
          break;
        case 'admin_final':
          subject = `项目最终确认 - ${approvedName || projectName}`;
          htmlContent = `<h2>项目最终确认</h2><p>您好，</p><p>以下项目已通过经理审批，请最终确认：</p><ul><li>项目名称：${approvedName || projectName}</li><li>负责人：${ownerName}</li><li>团队：${teamName}</li></ul><p>请点击以下链接进行最终确认：</p><a href="${baseUrl}/empower?finalize=${projectId}" style="background:#6366f1;color:white;padding:12px 24px;text-decoration:none;border-radius:6px;display:inline-block;margin:16px 0;">最终确认</a><p>谢谢！</p>`;
          break;
        case 'completion':
          subject = `项目审批完成 - ${approvedName || projectName}`;
          htmlContent = `<h2>项目审批完成</h2><p>您好 ${ownerName}，</p><p>您的项目已经完成所有审批流程：</p><ul><li>项目名称：${approvedName || projectName}</li><li>团队：${teamName}</li></ul><p>项目现在可以正式开始了！</p><p>谢谢！</p>`;
          break;
      }
      // 覆盖 adminEmail 为 to 参数
      adminEmail = to;
    }

    // Preview mode: return exactly what would be sent (same subject + html)
    if (previewOnly) {
      return new Response(
        JSON.stringify({ subject, htmlContent }),
        {
          status: 200,
          headers: {
            "Content-Type": "application/json",
            ...corsHeaders,
          },
        }
      );
    }

    // Parse recipients - handle comma-separated emails
    const recipients = adminEmail
      .split(',')
      .map((email: string) => email.trim())
      .filter((email: string) => email.length > 0 && email.includes('@'));

    if (recipients.length === 0) {
      console.error("No valid recipient emails found in:", adminEmail);
      return new Response(
        JSON.stringify({ error: "No valid recipient email addresses" }),
        { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    // At this point we are sending, so settings must exist.
    if (!settings) {
      return new Response(
        JSON.stringify({ error: "Email settings not loaded" }),
        { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    console.log("Sending email from:", settings.from_email);
    console.log("To:", recipients);
    console.log("Subject:", subject);

    try {
      // Create SMTP client with proper TLS configuration
      const connectionConfig: any = {
        hostname: settings.smtp_host,
        port: port,
        auth: {
          username: settings.smtp_user,
          password: settings.smtp_password,
        },
      };

      // Port 465 uses implicit TLS, port 587 uses STARTTLS
      if (port === 465) {
        connectionConfig.tls = true;
      } else {
        connectionConfig.tls = false;
      }

      const smtpClient = new SMTPClient({
        connection: connectionConfig,
      });

      // Send email to each recipient (denomailer expects array or single string)
      await smtpClient.send({
        from: settings.from_email,
        to: recipients,
        subject: subject,
        content: "auto",
        html: htmlContent,
      });

      await smtpClient.close();

      console.log("Equipment notification email sent successfully to:", recipients);
    } catch (smtpError: any) {
      console.error("SMTP send error:", smtpError);
      const errorMessage = smtpError.message || "Failed to send email";
      
      // Provide more helpful error messages for common issues
      let userFriendlyError = errorMessage;
      if (errorMessage.includes("lookup address") || errorMessage.includes("No address")) {
        userFriendlyError = `SMTP服务器地址无法解析 (${settings?.smtp_host})。请检查邮件设置中的SMTP服务器地址是否正确。`;
      } else if (errorMessage.includes("authentication") || errorMessage.includes("AUTH")) {
        userFriendlyError = "SMTP认证失败。请检查用户名和密码（授权码）是否正确。";
      } else if (errorMessage.includes("connection") || errorMessage.includes("timeout")) {
        userFriendlyError = `无法连接到SMTP服务器 (${settings?.smtp_host}:${port})。请检查端口设置是否正确。`;
      }
      
      return new Response(
        JSON.stringify({ error: userFriendlyError }),
        { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        ...corsHeaders,
      },
    });
  } catch (error: any) {
    console.error("Error in send-equipment-notification function:", error);
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
