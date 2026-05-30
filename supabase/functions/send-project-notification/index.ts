import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { Resend } from "https://esm.sh/resend@2.0.0";

const resend = new Resend(Deno.env.get("RESEND_API_KEY"));

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

interface ProjectNotificationRequest {
  to: string;
  projectName: string;
  teamName: string;
  ownerName: string;
  stage: 'scientist_review' | 'manager_approval' | 'admin_final' | 'completion';
  projectId: string;
  approvedName?: string;
}

const handler = async (req: Request): Promise<Response> => {
  // Handle CORS preflight requests
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { to, projectName, teamName, ownerName, stage, projectId, approvedName }: ProjectNotificationRequest = await req.json();

    let subject = "";
    let htmlContent = "";
    const baseUrl = req.headers.get('origin') || 'https://uvylubaxpkmzymdggoyf.supabase.co';

    switch (stage) {
      case 'scientist_review':
        subject = `项目审核通知 - ${projectName}`;
        htmlContent = `
          <h2>项目审核通知</h2>
          <p>您好，</p>
          <p>团队 <strong>${teamName}</strong> 的项目需要您的审核：</p>
          <ul>
            <li>项目名称：${projectName}</li>
            <li>负责人：${ownerName}</li>
            <li>团队：${teamName}</li>
          </ul>
          <p>请点击以下链接进行审核：</p>
          <a href="${baseUrl}/empower?review=${projectId}" style="background-color: #3b82f6; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block; margin: 16px 0;">立即审核</a>
          <p>谢谢！</p>
        `;
        break;

      case 'manager_approval':
        subject = `项目审批通知 - ${approvedName || projectName}`;
        htmlContent = `
          <h2>项目审批通知</h2>
          <p>您好，</p>
          <p>以下项目已通过科学家审核，需要您的审批：</p>
          <ul>
            <li>原项目名称：${projectName}</li>
            <li>审核后名称：${approvedName}</li>
            <li>负责人：${ownerName}</li>
            <li>团队：${teamName}</li>
          </ul>
          <p>请点击以下链接进行审批：</p>
          <a href="${baseUrl}/empower?approve=${projectId}" style="background-color: #10b981; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block; margin: 16px 0;">立即审批</a>
          <p>谢谢！</p>
        `;
        break;

      case 'admin_final':
        subject = `项目最终确认 - ${approvedName || projectName}`;
        htmlContent = `
          <h2>项目最终确认</h2>
          <p>您好，</p>
          <p>以下项目已通过经理审批，请最终确认：</p>
          <ul>
            <li>项目名称：${approvedName || projectName}</li>
            <li>负责人：${ownerName}</li>
            <li>团队：${teamName}</li>
          </ul>
          <p>请点击以下链接进行最终确认：</p>
          <a href="${baseUrl}/empower?finalize=${projectId}" style="background-color: #6366f1; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block; margin: 16px 0;">最终确认</a>
          <p>谢谢！</p>
        `;
        break;

      case 'completion':
        subject = `项目审批完成 - ${approvedName || projectName}`;
        htmlContent = `
          <h2>项目审批完成</h2>
          <p>您好 ${ownerName}，</p>
          <p>您的项目已经完成所有审批流程：</p>
          <ul>
            <li>项目名称：${approvedName || projectName}</li>
            <li>团队：${teamName}</li>
          </ul>
          <p>项目现在可以正式开始了！</p>
          <p>谢谢！</p>
        `;
        break;
    }

    const emailResponse = await resend.emails.send({
      from: "实验室管理系统 <noreply@resend.dev>",
      to: [to],
      subject,
      html: htmlContent,
    });

    console.log("Email sent successfully:", emailResponse);

    return new Response(JSON.stringify(emailResponse), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        ...corsHeaders,
      },
    });
  } catch (error: any) {
    console.error("Error sending notification:", error);
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