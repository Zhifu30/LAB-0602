import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const handler = async (req: Request): Promise<Response> => {
  // Handle CORS preflight requests
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    const scheduleId = url.searchParams.get("scheduleId");
    const token = url.searchParams.get("token");

    if (!scheduleId) {
      return generateHtmlResponse("错误", "缺少维护计划ID", false);
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Verify the schedule exists
    const { data: schedule, error: fetchError } = await supabase
      .from("maintenance_schedules")
      .select("*, equipment:equipment_id(id, name)")
      .eq("id", scheduleId)
      .single();

    if (fetchError || !schedule) {
      console.error("Schedule not found:", fetchError);
      return generateHtmlResponse("错误", "未找到该维护计划", false);
    }

    // Calculate next due date based on frequency
    const currentDueDate = new Date(schedule.next_due_date);
    let nextDueDate: Date;

    switch (schedule.frequency) {
      case "daily":
        nextDueDate = new Date(currentDueDate);
        nextDueDate.setDate(nextDueDate.getDate() + 1);
        break;
      case "weekly":
        nextDueDate = new Date(currentDueDate);
        nextDueDate.setDate(nextDueDate.getDate() + 7);
        break;
      case "monthly":
        nextDueDate = new Date(currentDueDate);
        nextDueDate.setMonth(nextDueDate.getMonth() + 1);
        // Handle month end edge cases
        if (nextDueDate.getDate() < currentDueDate.getDate()) {
          nextDueDate.setDate(0); // Set to last day of previous month
        }
        break;
      case "quarterly":
        nextDueDate = new Date(currentDueDate);
        nextDueDate.setMonth(nextDueDate.getMonth() + 3);
        break;
      case "yearly":
        nextDueDate = new Date(currentDueDate);
        nextDueDate.setFullYear(nextDueDate.getFullYear() + 1);
        break;
      default:
        nextDueDate = new Date(currentDueDate);
        nextDueDate.setMonth(nextDueDate.getMonth() + 1);
    }

    const nextDueDateStr = nextDueDate.toISOString().split("T")[0];

    // Update the schedule
    const { error: updateError } = await supabase
      .from("maintenance_schedules")
      .update({
        last_completed_at: new Date().toISOString(),
        next_due_date: nextDueDateStr,
        reminder_sent: false,
        updated_at: new Date().toISOString(),
      })
      .eq("id", scheduleId);

    if (updateError) {
      console.error("Update error:", updateError);
      return generateHtmlResponse("错误", "更新维护计划失败", false);
    }

    // Create maintenance log
    const { error: logError } = await supabase
      .from("maintenance_logs")
      .insert({
        schedule_id: scheduleId,
        equipment_id: schedule.equipment_id,
        completed_by_name: schedule.assigned_name || "邮件确认",
        notes: "通过邮件确认按钮完成",
        completed_at: new Date().toISOString(),
      });

    if (logError) {
      console.error("Log error:", logError);
      // Don't fail the request, just log the error
    }

    const equipmentName = schedule.equipment?.name || schedule.equipment_id;
    const frequencyLabels: Record<string, string> = {
      daily: "每日",
      weekly: "每周",
      monthly: "每月",
      quarterly: "每季度",
      yearly: "每年",
    };

    return generateHtmlResponse(
      "维护完成确认成功",
      `
        <p><strong>设备名称:</strong> ${equipmentName}</p>
        <p><strong>维护项目:</strong> ${schedule.title}</p>
        <p><strong>完成时间:</strong> ${new Date().toLocaleString("zh-CN", { timeZone: "Asia/Shanghai" })}</p>
        <p><strong>下次维护日期:</strong> ${nextDueDateStr}</p>
        <p><strong>维护周期:</strong> ${frequencyLabels[schedule.frequency] || schedule.frequency}</p>
      `,
      true
    );
  } catch (error: any) {
    console.error("Error in maintenance-complete function:", error);
    return generateHtmlResponse("错误", error.message || "处理请求时发生错误", false);
  }
};

function generateHtmlResponse(title: string, content: string, success: boolean): Response {
  const bgColor = success ? "#d4edda" : "#f8d7da";
  const textColor = success ? "#155724" : "#721c24";
  const borderColor = success ? "#c3e6cb" : "#f5c6cb";
  const icon = success ? "&#10004;" : "&#10008;";

  const html = `<!DOCTYPE html><html lang="zh-CN"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>${title}</title><style>body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;display:flex;justify-content:center;align-items:center;min-height:100vh;margin:0;background-color:#f5f5f5}.container{background-color:${bgColor};color:${textColor};border:1px solid ${borderColor};border-radius:8px;padding:30px 40px;max-width:500px;text-align:center;box-shadow:0 2px 10px rgba(0,0,0,0.1)}.icon{font-size:48px;margin-bottom:20px}h1{margin:0 0 20px 0;font-size:24px}.content{text-align:left;line-height:1.6}.content p{margin:8px 0}.footer{margin-top:20px;font-size:14px;color:#666}</style></head><body><div class="container"><div class="icon">${icon}</div><h1>${title}</h1><div class="content">${content}</div><div class="footer">This page can be safely closed.</div></div></body></html>`;

  return new Response(html, {
    status: 200,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      ...corsHeaders,
    },
  });
}

serve(handler);
