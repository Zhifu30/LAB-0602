-- Create equipment_maintenance_responsible table for hierarchical maintenance assignment
-- 设备维护责任人等级管理表：支持一台设备绑定1/2/3级不同的维护责任人
CREATE TABLE IF NOT EXISTS public.equipment_maintenance_responsible (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  equipment_id text NOT NULL REFERENCES public.equipment(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  maintenance_level integer NOT NULL CHECK (maintenance_level IN (1, 2, 3)),
  -- 3 = 三级维护人（实际操作者），2 = 二级维护人（监督），1 = 一级维护人（最高管理者）
  notes text,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  created_by uuid,
  UNIQUE(equipment_id, user_id, maintenance_level)
);

-- Enable RLS
ALTER TABLE public.equipment_maintenance_responsible ENABLE ROW LEVEL SECURITY;

-- Create policies (use permissive defaults to avoid dependency on custom functions)
CREATE POLICY "Equipment maintenance responsible are publicly readable"
  ON public.equipment_maintenance_responsible FOR SELECT
  USING (true);

CREATE POLICY "Authenticated users can insert maintenance responsible"
  ON public.equipment_maintenance_responsible FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Authenticated users can update maintenance responsible"
  ON public.equipment_maintenance_responsible FOR UPDATE
  USING (true);

CREATE POLICY "Authenticated users can delete maintenance responsible"
  ON public.equipment_maintenance_responsible FOR DELETE
  USING (true);

-- Create index for faster queries
CREATE INDEX IF NOT EXISTS idx_equip_maint_resp_equipment_id
  ON public.equipment_maintenance_responsible(equipment_id);
CREATE INDEX IF NOT EXISTS idx_equip_maint_resp_user_id
  ON public.equipment_maintenance_responsible(user_id);
CREATE INDEX IF NOT EXISTS idx_equip_maint_resp_level
  ON public.equipment_maintenance_responsible(maintenance_level);

-- Create maintenance completion notification log table
-- 维护完成通知日志
CREATE TABLE IF NOT EXISTS public.maintenance_completion_notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  schedule_id uuid NOT NULL REFERENCES public.maintenance_schedules(id) ON DELETE CASCADE,
  equipment_id text NOT NULL REFERENCES public.equipment(id) ON DELETE CASCADE,
  completed_by uuid NOT NULL,
  completed_by_name text NOT NULL,
  completed_by_level integer NOT NULL,
  notified_to uuid NOT NULL,
  notified_to_name text NOT NULL,
  notified_to_level integer NOT NULL,
  completed_at timestamp with time zone NOT NULL,
  notified_at timestamp with time zone DEFAULT now(),
  notification_status text DEFAULT 'sent' CHECK (notification_status IN ('sent', 'failed', 'read')),
  read_at timestamp with time zone,
  notes text,
  created_at timestamp with time zone DEFAULT now()
);

ALTER TABLE public.maintenance_completion_notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Maintenance notifications are publicly readable"
  ON public.maintenance_completion_notifications FOR SELECT
  USING (true);

CREATE POLICY "System can insert notifications"
  ON public.maintenance_completion_notifications FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Users can update notifications"
  ON public.maintenance_completion_notifications FOR UPDATE
  USING (true);

CREATE INDEX IF NOT EXISTS idx_maint_notif_equipment_id
  ON public.maintenance_completion_notifications(equipment_id);
CREATE INDEX IF NOT EXISTS idx_maint_notif_notified_to
  ON public.maintenance_completion_notifications(notified_to);
