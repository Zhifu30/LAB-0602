import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface EmailConfig {
  smtp_host: string;
  smtp_port: string;
  smtp_user: string;
  smtp_password: string;
  from_email: string;
  from_name: string;
  workday_only?: boolean;
  reminder_days_before?: number;
  consolidate_emails?: boolean;
  send_hour?: number;
  send_minute?: number;
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    
    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    
    // Verify user is admin
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      throw new Error("未授权访问");
    }

    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    
    if (authError || !user) {
      throw new Error("用户验证失败");
    }

    // Check if user is admin
    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("role")
      .eq("user_id", user.id)
      .single();

    if (profileError || profile?.role !== "admin") {
      throw new Error("只有管理员可以配置邮件设置");
    }

    const rawConfig: EmailConfig = await req.json();
    
    // Trim whitespace from all string fields to prevent hostname errors
    const config = {
      smtp_host: rawConfig.smtp_host?.trim() || "",
      smtp_port: rawConfig.smtp_port?.trim() || "465",
      smtp_user: rawConfig.smtp_user?.trim() || "",
      smtp_password: rawConfig.smtp_password || "",
      from_email: rawConfig.from_email?.trim() || "",
      from_name: rawConfig.from_name?.trim() || "",
      workday_only: rawConfig.workday_only ?? true,
      reminder_days_before: rawConfig.reminder_days_before ?? 7,
      consolidate_emails: rawConfig.consolidate_emails ?? true,
      send_hour: rawConfig.send_hour ?? 9,
      send_minute: rawConfig.send_minute ?? 0,
    };
    
    console.log("Saving email config for user:", user.email);
    console.log("SMTP Host:", config.smtp_host);
    console.log("SMTP Port:", config.smtp_port);
    console.log("Workday Only:", config.workday_only);
    console.log("Reminder Days:", config.reminder_days_before);
    console.log("Consolidate Emails:", config.consolidate_emails);
    console.log("Send Time:", `${config.send_hour}:${config.send_minute}`);

    // Store config in email_settings table
    const { error: upsertError } = await supabase
      .from("email_settings")
      .upsert({
        id: "default",
        smtp_host: config.smtp_host,
        smtp_port: config.smtp_port,
        smtp_user: config.smtp_user,
        smtp_password: config.smtp_password,
        from_email: config.from_email,
        from_name: config.from_name,
        workday_only: config.workday_only,
        reminder_days_before: config.reminder_days_before,
        consolidate_emails: config.consolidate_emails,
        send_hour: config.send_hour,
        send_minute: config.send_minute,
        updated_at: new Date().toISOString(),
        updated_by: user.id,
      }, { onConflict: "id" });

    if (upsertError) {
      console.error("Upsert error:", upsertError);
      throw new Error("保存配置失败: " + upsertError.message);
    }

    console.log("Email config saved successfully");

    return new Response(
      JSON.stringify({ success: true, message: "邮件配置已保存" }),
      {
        status: 200,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      }
    );
  } catch (error: any) {
    console.error("Error saving email config:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        status: 500,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      }
    );
  }
});
