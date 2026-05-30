-- Add new columns to profiles table for role management
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS role_type text DEFAULT 'user';

-- Create team management table
CREATE TABLE public.teams (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  scientist_id uuid REFERENCES auth.users(id),
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now()
);

-- Enable RLS on teams
ALTER TABLE public.teams ENABLE ROW LEVEL SECURITY;

-- Create policies for teams
CREATE POLICY "Teams are publicly readable" ON public.teams FOR SELECT USING (true);
CREATE POLICY "Only admins can modify teams" ON public.teams FOR ALL USING (is_current_user_admin());

-- Update empower_projects to reference teams
ALTER TABLE public.empower_projects ADD COLUMN IF NOT EXISTS team_id uuid REFERENCES public.teams(id);

-- Add trigger for teams updated_at
CREATE TRIGGER update_teams_updated_at
  BEFORE UPDATE ON public.teams
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Create permission management table for admin verification
CREATE TABLE public.admin_verifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_id uuid NOT NULL REFERENCES auth.users(id),
  verified_at timestamp with time zone DEFAULT now(),
  expires_at timestamp with time zone DEFAULT (now() + interval '1 hour')
);

-- Enable RLS on admin_verifications
ALTER TABLE public.admin_verifications ENABLE ROW LEVEL SECURITY;

-- Create policies for admin_verifications
CREATE POLICY "Only admins can manage verifications" ON public.admin_verifications FOR ALL USING (is_current_user_admin());