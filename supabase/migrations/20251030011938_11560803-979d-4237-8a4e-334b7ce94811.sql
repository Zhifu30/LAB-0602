-- 1. Add notes column to profiles table for user remarks
ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS notes text;

-- 2. Create equipment templates table for shared SOPs and images
CREATE TABLE IF NOT EXISTS public.equipment_templates (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  equipment_type text NOT NULL,
  model text NOT NULL,
  manufacturer text NOT NULL,
  shared_image_url text,
  shared_sop_files jsonb DEFAULT '[]'::jsonb,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE(equipment_type, model, manufacturer)
);

-- Enable RLS on equipment_templates
ALTER TABLE public.equipment_templates ENABLE ROW LEVEL SECURITY;

-- Create policy for public read
CREATE POLICY "Equipment templates are publicly readable"
ON public.equipment_templates
FOR SELECT
USING (true);

-- Create policy for authenticated users to manage templates
CREATE POLICY "Authenticated users can manage equipment templates"
ON public.equipment_templates
FOR ALL
USING (auth.uid() IS NOT NULL)
WITH CHECK (auth.uid() IS NOT NULL);

-- Add trigger for updated_at on equipment_templates
CREATE TRIGGER update_equipment_templates_updated_at
BEFORE UPDATE ON public.equipment_templates
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- 3. Add responsible_email to equipment table for email notifications
ALTER TABLE public.equipment
ADD COLUMN IF NOT EXISTS responsible_email text;

-- 4. Create maintenance and calibration reminder logs table
CREATE TABLE IF NOT EXISTS public.reminder_logs (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  equipment_id text NOT NULL,
  reminder_type text NOT NULL, -- 'maintenance' or 'calibration'
  sent_at timestamp with time zone NOT NULL DEFAULT now(),
  recipient_email text NOT NULL,
  status text NOT NULL DEFAULT 'sent' -- 'sent', 'failed'
);

-- Enable RLS on reminder_logs
ALTER TABLE public.reminder_logs ENABLE ROW LEVEL SECURITY;

-- Create policy for authenticated users to view reminder logs
CREATE POLICY "Authenticated users can view reminder logs"
ON public.reminder_logs
FOR SELECT
USING (auth.uid() IS NOT NULL);

-- Create policy for system to insert reminder logs
CREATE POLICY "System can insert reminder logs"
ON public.reminder_logs
FOR INSERT
WITH CHECK (auth.uid() IS NOT NULL);