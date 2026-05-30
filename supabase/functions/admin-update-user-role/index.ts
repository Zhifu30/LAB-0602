import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface UpdateUserRoleRequest {
  userId: string;
  newRole: string; // admin | manager | scientist | analyst | user
}

serve(async (req: Request) => {
  // Handle CORS preflight requests
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    console.log("Authorization header present:", !!authHeader);
    
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "缺少授权令牌" }), {
        status: 401,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    const { userId, newRole }: UpdateUserRoleRequest = await req.json();
    console.log("Request received - userId:", userId, "newRole:", newRole);

    if (!userId || !newRole) {
      return new Response(JSON.stringify({ error: "缺少必要参数 userId 或 newRole" }), {
        status: 400,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    const allowedRoles = ["admin", "manager", "scientist", "analyst", "user"];
    if (!allowedRoles.includes(newRole)) {
      return new Response(JSON.stringify({ error: "无效的角色类型" }), {
        status: 400,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    // Create a client to read the caller's auth user from the Authorization header
    const anonClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? "",
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: authUserData, error: authErr } = await anonClient.auth.getUser();
    if (authErr) {
      console.error("Auth error:", authErr);
      return new Response(JSON.stringify({ error: "认证失败: " + authErr.message }), {
        status: 401,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }
    
    if (!authUserData?.user) {
      console.error("No user data returned");
      return new Response(JSON.stringify({ error: "无法获取当前用户信息" }), {
        status: 401,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    const callerId = authUserData.user.id;

    // Service role client to bypass RLS for privileged checks/updates
    const adminClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    // Verify caller is admin
    const { data: callerProfile, error: profileErr } = await adminClient
      .from("profiles")
      .select("role_type")
      .eq("user_id", callerId)
      .single();

    if (profileErr) {
      console.error("Failed to fetch caller profile:", profileErr);
      return new Response(JSON.stringify({ error: "无法验证调用者权限" }), {
        status: 500,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    if (callerProfile?.role_type !== "admin") {
      return new Response(JSON.stringify({ error: "只有管理员可以修改用户角色" }), {
        status: 403,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    // Map role field: only admin or user for legacy role field
    const legacyRole = newRole === "admin" ? "admin" : "user";

    const { error: updateErr } = await adminClient
      .from("profiles")
      .update({ role_type: newRole, role: legacyRole, updated_at: new Date().toISOString() })
      .eq("user_id", userId);

    if (updateErr) {
      console.error("Failed to update user role:", updateErr);
      return new Response(JSON.stringify({ error: "更新角色失败" }), {
        status: 500,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    console.log(`Role of user ${userId} updated to ${newRole} by admin ${callerId}`);
    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  } catch (error: any) {
    console.error("Error in admin-update-user-role function:", error);
    return new Response(JSON.stringify({ error: error?.message || "未知错误" }), {
      status: 500,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  }
});
