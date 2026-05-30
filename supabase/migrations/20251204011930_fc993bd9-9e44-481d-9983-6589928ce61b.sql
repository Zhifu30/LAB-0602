-- Create email_settings table for storing email configuration
CREATE TABLE public.email_settings (
  id TEXT PRIMARY KEY DEFAULT 'default',
  smtp_host TEXT NOT NULL DEFAULT 'smtp.exmail.qq.com',
  smtp_port TEXT NOT NULL DEFAULT '465',
  smtp_user TEXT NOT NULL,
  smtp_password TEXT NOT NULL,
  from_email TEXT NOT NULL,
  from_name TEXT DEFAULT '实验室设备管理系统',
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_by UUID REFERENCES auth.users(id)
);

-- Enable RLS
ALTER TABLE public.email_settings ENABLE ROW LEVEL SECURITY;

-- Only admins can view email settings
CREATE POLICY "Admins can view email settings" 
ON public.email_settings 
FOR SELECT 
USING (
  EXISTS (
    SELECT 1 FROM public.profiles 
    WHERE user_id = auth.uid() AND role = 'admin'
  )
);

-- Only admins can insert email settings
CREATE POLICY "Admins can insert email settings" 
ON public.email_settings 
FOR INSERT 
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.profiles 
    WHERE user_id = auth.uid() AND role = 'admin'
  )
);

-- Only admins can update email settings
CREATE POLICY "Admins can update email settings" 
ON public.email_settings 
FOR UPDATE 
USING (
  EXISTS (
    SELECT 1 FROM public.profiles 
    WHERE user_id = auth.uid() AND role = 'admin'
  )
);