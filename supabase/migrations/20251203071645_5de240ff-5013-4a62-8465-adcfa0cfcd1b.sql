-- Create maintenance schedules table for equipment
CREATE TABLE public.maintenance_schedules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  equipment_id text NOT NULL REFERENCES public.equipment(id) ON DELETE CASCADE,
  title text NOT NULL,
  description text,
  frequency text NOT NULL CHECK (frequency IN ('monthly', 'quarterly', 'yearly')),
  next_due_date date NOT NULL,
  reminder_days_before integer NOT NULL DEFAULT 7,
  assigned_user_id uuid REFERENCES auth.users(id),
  assigned_name text,
  assigned_email text,
  last_completed_at timestamp with time zone,
  reminder_sent boolean DEFAULT false,
  is_active boolean DEFAULT true,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.maintenance_schedules ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Maintenance schedules are publicly readable"
  ON public.maintenance_schedules FOR SELECT
  USING (true);

CREATE POLICY "Authenticated users can insert maintenance schedules"
  ON public.maintenance_schedules FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated users can update maintenance schedules"
  ON public.maintenance_schedules FOR UPDATE
  USING (auth.uid() IS NOT NULL);

CREATE POLICY "Only admins can delete maintenance schedules"
  ON public.maintenance_schedules FOR DELETE
  USING (is_current_user_admin());

-- Create trigger for updated_at
CREATE TRIGGER update_maintenance_schedules_updated_at
  BEFORE UPDATE ON public.maintenance_schedules
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Create maintenance completion logs table
CREATE TABLE public.maintenance_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  schedule_id uuid NOT NULL REFERENCES public.maintenance_schedules(id) ON DELETE CASCADE,
  equipment_id text NOT NULL REFERENCES public.equipment(id) ON DELETE CASCADE,
  completed_by uuid REFERENCES auth.users(id),
  completed_by_name text NOT NULL,
  completed_at timestamp with time zone DEFAULT now(),
  notes text,
  created_at timestamp with time zone DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.maintenance_logs ENABLE ROW LEVEL SECURITY;

-- RLS Policies for maintenance logs
CREATE POLICY "Maintenance logs are publicly readable"
  ON public.maintenance_logs FOR SELECT
  USING (true);

CREATE POLICY "Authenticated users can insert maintenance logs"
  ON public.maintenance_logs FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL);

-- Index for faster queries
CREATE INDEX idx_maintenance_schedules_equipment_id ON public.maintenance_schedules(equipment_id);
CREATE INDEX idx_maintenance_schedules_next_due_date ON public.maintenance_schedules(next_due_date);
CREATE INDEX idx_maintenance_logs_schedule_id ON public.maintenance_logs(schedule_id);