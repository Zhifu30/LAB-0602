import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { SMTPClient } from "https://deno.land/x/denomailer@1.6.0/mod.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface TestEmailRequest {
  smtp_host: string;
  smtp_port: string;
  smtp_user: string;
  smtp_password: string;
  from_email: string;
  from_name: string;
  test_email: string;
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
    
    // Verify user is authenticated
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      throw new Error("Unauthorized");
    }

    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    
    if (authError || !user) {
      throw new Error("User verification failed");
    }

    const rawConfig: TestEmailRequest = await req.json();
    
    // Trim whitespace from all string fields
    const config = {
      smtp_host: rawConfig.smtp_host?.trim() || "",
      smtp_port: rawConfig.smtp_port?.trim() || "587",
      smtp_user: rawConfig.smtp_user?.trim() || "",
      smtp_password: rawConfig.smtp_password || "",
      from_email: rawConfig.from_email?.trim() || "",
      from_name: rawConfig.from_name?.trim() || "Lab System",
      test_email: rawConfig.test_email?.trim() || "",
    };
    
    const port = parseInt(config.smtp_port);
    
    console.log("Testing email config with SMTP");
    console.log("SMTP Host:", config.smtp_host);
    console.log("SMTP Port:", port);
    console.log("From Email:", config.from_email);
    console.log("Test email to:", config.test_email);

    // Create SMTP client
    const connectionConfig: any = {
      hostname: config.smtp_host,
      port: port,
      auth: {
        username: config.smtp_user,
        password: config.smtp_password,
      },
      tls: port === 465,
    };

    const smtpClient = new SMTPClient({
      connection: connectionConfig,
    });

    // Send simple plain text email - ASCII only
    const timestamp = new Date().toISOString();
    
    await smtpClient.send({
      from: config.from_email,
      to: config.test_email,
      subject: "Email Configuration Test",
      content: `Email configuration test successful.\n\nIf you receive this email, your SMTP settings are correct.\n\nTimestamp: ${timestamp}\n\nThis email was sent automatically by the Lab Equipment Management System.`,
    });

    await smtpClient.close();

    console.log("Test email sent successfully");

    return new Response(
      JSON.stringify({ success: true, message: "Test email sent successfully" }),
      {
        status: 200,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      }
    );
  } catch (error: any) {
    console.error("Error sending test email:", error);
    return new Response(
      JSON.stringify({ error: error.message || "Failed to send test email" }),
      {
        status: 500,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      }
    );
  }
});
