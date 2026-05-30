-- Update profiles table to support new role types
ALTER TYPE app_role ADD VALUE IF NOT EXISTS 'manager';
ALTER TYPE app_role ADD VALUE IF NOT EXISTS 'scientist';
ALTER TYPE app_role ADD VALUE IF NOT EXISTS 'analyst';

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
ALTER TABLE public.empower_projects ADD COLUMN team_id uuid REFERENCES public.teams(id);

-- Add trigger for teams updated_at
CREATE TRIGGER update_teams_updated_at
  BEFORE UPDATE ON public.teams
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();