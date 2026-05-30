import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface UpdateEmailRequest {
  userId: string
  email: string
}

Deno.serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false
        }
      }
    )

    const { userId, email }: UpdateEmailRequest = await req.json()

    console.log('Updating email for user:', userId)

    // Validate inputs
    if (!userId || !email) {
      return new Response(
        JSON.stringify({ error: '用户ID和邮箱地址不能为空' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
      )
    }

    // Update email in Supabase Auth
    const { data: authData, error: authError } = await supabaseClient.auth.admin.updateUserById(
      userId,
      { email }
    )

    if (authError) {
      console.error('Auth error:', authError)
      return new Response(
        JSON.stringify({ error: authError.message }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
      )
    }

    // Also update email in profiles table
    const { error: profileError } = await supabaseClient
      .from('profiles')
      .update({ email })
      .eq('user_id', userId)

    if (profileError) {
      console.error('Profile update error:', profileError)
      // Don't fail the request if profile update fails, just log it
      console.warn('Failed to update profile email, but auth email was updated')
    }

    console.log('Email updated successfully')

    return new Response(
      JSON.stringify({ 
        success: true,
        user: authData.user
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
    )
  } catch (error: any) {
    console.error('Error in admin-update-user-email function:', error)
    return new Response(
      JSON.stringify({ error: error?.message || 'Unknown error' }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    )
  }
})
