-- Create table for fault reports
CREATE TABLE public.fault_reports (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  equipment_id TEXT NOT NULL REFERENCES public.equipment(id) ON DELETE CASCADE,
  reported_by UUID REFERENCES auth.users(id),
  reporter_name TEXT NOT NULL,
  reason TEXT NOT NULL,
  custom_reason TEXT,
  description TEXT,
  image_url TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  resolved_at TIMESTAMP WITH TIME ZONE,
  resolved_by UUID REFERENCES auth.users(id),
  resolution_notes TEXT
);

-- Enable RLS
ALTER TABLE public.fault_reports ENABLE ROW LEVEL SECURITY;

-- Create policies
CREATE POLICY "Anyone can view fault reports" 
ON public.fault_reports 
FOR SELECT 
USING (true);

CREATE POLICY "Authenticated users can create fault reports" 
ON public.fault_reports 
FOR INSERT 
WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "Admins and reporters can update fault reports" 
ON public.fault_reports 
FOR UPDATE 
USING (is_current_user_admin() OR reported_by = auth.uid());

-- Create table for scrap records
CREATE TABLE public.scrap_records (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  equipment_id TEXT NOT NULL REFERENCES public.equipment(id) ON DELETE CASCADE,
  scrapped_by UUID REFERENCES auth.users(id),
  scrapper_name TEXT NOT NULL,
  reason TEXT NOT NULL,
  admin_password TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  approved_by UUID REFERENCES auth.users(id),
  approval_notes TEXT
);

-- Enable RLS
ALTER TABLE public.scrap_records ENABLE ROW LEVEL SECURITY;

-- Create policies for scrap records
CREATE POLICY "Anyone can view scrap records" 
ON public.scrap_records 
FOR SELECT 
USING (true);

CREATE POLICY "Authenticated users can create scrap records" 
ON public.scrap_records 
FOR INSERT 
WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "Only admins can update scrap records" 
ON public.scrap_records 
FOR UPDATE 
USING (is_current_user_admin());

-- Create table for user registration requests
CREATE TABLE public.registration_requests (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  username TEXT NOT NULL,
  requested_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  status TEXT NOT NULL DEFAULT 'pending',
  approved_by UUID REFERENCES auth.users(id),
  approved_at TIMESTAMP WITH TIME ZONE,
  rejection_reason TEXT,
  CONSTRAINT valid_status CHECK (status IN ('pending', 'approved', 'rejected'))
);

-- Enable RLS
ALTER TABLE public.registration_requests ENABLE ROW LEVEL SECURITY;

-- Create policies for registration requests
CREATE POLICY "Only admins can view registration requests" 
ON public.registration_requests 
FOR SELECT 
USING (is_current_user_admin());

CREATE POLICY "Anyone can create registration requests" 
ON public.registration_requests 
FOR INSERT 
WITH CHECK (true);

CREATE POLICY "Only admins can update registration requests" 
ON public.registration_requests 
FOR UPDATE 
USING (is_current_user_admin());

-- Create function to get admin users
CREATE OR REPLACE FUNCTION public.get_admin_users()
RETURNS TABLE (user_id UUID, username TEXT, email TEXT)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p.user_id, p.username, u.email
  FROM public.profiles p
  JOIN auth.users u ON p.user_id = u.id
  WHERE p.role = 'admin';
$$;