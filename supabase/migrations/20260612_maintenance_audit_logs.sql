-- v6: 维护模板审计日志表

CREATE TABLE IF NOT EXISTS maintenance_template_audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  equipment_type text NOT NULL,
  template_key text,
  action text NOT NULL,
  before_data jsonb,
  after_data jsonb,
  affected_equipment_count int DEFAULT 0,
  performed_by uuid,
  performed_by_name text,
  created_at timestamptz DEFAULT now()
);

-- 索引
CREATE INDEX IF NOT EXISTS idx_audit_equipment_type ON maintenance_template_audit_logs(equipment_type);
CREATE INDEX IF NOT EXISTS idx_audit_template_key ON maintenance_template_audit_logs(template_key);
CREATE INDEX IF NOT EXISTS idx_audit_action ON maintenance_template_audit_logs(action);
CREATE INDEX IF NOT EXISTS idx_audit_created_at ON maintenance_template_audit_logs(created_at);
