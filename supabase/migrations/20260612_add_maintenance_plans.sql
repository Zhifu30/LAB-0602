-- v5: 类型维护计划模板 — 统一模板驱动架构

-- 1. 添加 maintenance_plans JSONB 列
ALTER TABLE equipment_templates ADD COLUMN IF NOT EXISTS maintenance_plans JSONB DEFAULT '[]'::jsonb;

-- 2. maintenance_schedules 加 template_key 列
ALTER TABLE maintenance_schedules ADD COLUMN IF NOT EXISTS template_key text;
CREATE INDEX IF NOT EXISTS idx_ms_template_key ON maintenance_schedules(template_key);

-- 3. 唯一索引：防同设备同模板重复
CREATE UNIQUE INDEX IF NOT EXISTS uniq_ms_equipment_template_active
ON maintenance_schedules(equipment_id, template_key)
WHERE template_key IS NOT NULL AND is_active = true;

-- 4. RPC：原子级联更新
CREATE OR REPLACE FUNCTION sync_maintenance_plan_to_instances(
  p_type_name TEXT, p_plan_key TEXT, p_title TEXT,
  p_description TEXT, p_frequency TEXT, p_reminder_days INT
) RETURNS JSONB AS $$
DECLARE v_updated_count INT;
BEGIN
  UPDATE equipment_templates SET maintenance_plans = (
    SELECT jsonb_agg(CASE WHEN elem->>'key' = p_plan_key
      THEN jsonb_set(jsonb_set(jsonb_set(jsonb_set(elem,
        '{title}', to_jsonb(p_title)), '{description}', to_jsonb(p_description)),
        '{frequency}', to_jsonb(p_frequency)), '{reminder_days_before}', to_jsonb(p_reminder_days))
      ELSE elem END)
    FROM jsonb_array_elements(maintenance_plans) elem
  ) WHERE equipment_type = p_type_name;

  WITH updated AS (
    UPDATE maintenance_schedules SET title = p_title, description = p_description,
      frequency = p_frequency, reminder_days_before = p_reminder_days
    WHERE template_key = p_plan_key AND is_active = true RETURNING id
  ) SELECT COUNT(*) INTO v_updated_count FROM updated;
  RETURN jsonb_build_object('success', true, 'updated_count', v_updated_count);
END;
$$ LANGUAGE plpgsql;

-- 5. 自动归集（修复版：全字段匹配）
DO $$
DECLARE r record; v_key text;
BEGIN
  FOR r IN
    SELECT e.type, ms.title, ms.frequency, ms.description, ms.reminder_days_before, COUNT(*) cnt
    FROM maintenance_schedules ms JOIN equipment e ON ms.equipment_id = e.id
    WHERE e.type IS NOT NULL AND ms.is_active = true AND ms.template_key IS NULL
    GROUP BY e.type, ms.title, ms.frequency, ms.description, ms.reminder_days_before
    HAVING COUNT(*) >= 2
  LOOP
    v_key := 'mp_' || substring(gen_random_uuid()::text, 1, 8);
    UPDATE equipment_templates SET maintenance_plans = COALESCE(maintenance_plans, '[]'::jsonb) || jsonb_build_object(
      'key', v_key, 'title', r.title, 'description', r.description,
      'frequency', r.frequency, 'reminder_days_before', r.reminder_days_before)::jsonb
    WHERE equipment_type = r.type;
    UPDATE maintenance_schedules ms SET template_key = v_key
    FROM equipment e WHERE ms.equipment_id = e.id AND e.type = r.type
      AND ms.title = r.title AND ms.frequency = r.frequency
      AND COALESCE(ms.description, '') = COALESCE(r.description, '')
      AND COALESCE(ms.reminder_days_before, -1) = COALESCE(r.reminder_days_before, -1)
      AND ms.is_active = true AND ms.template_key IS NULL;
  END LOOP;
END $$;

-- 6. Resolved View
CREATE OR REPLACE VIEW resolved_maintenance_schedules AS
SELECT
  ms.id, ms.equipment_id, ms.template_key,
  e.name AS equipment_name, e.type AS equipment_type,
  e.responsible, e.responsible_email, e.image_url,
  ms.next_due_date, ms.assigned_name, ms.assigned_email, ms.assigned_user_id,
  ms.reminder_sent, ms.last_completed_at, ms.is_active,
  COALESCE(plan.elem->>'title', ms.title) AS title,
  COALESCE(plan.elem->>'description', ms.description) AS description,
  COALESCE(plan.elem->>'frequency', ms.frequency) AS frequency,
  COALESCE((plan.elem->>'reminder_days_before')::int, ms.reminder_days_before) AS reminder_days_before,
  CASE WHEN ms.template_key IS NULL THEN 'ad-hoc'
       WHEN plan.elem IS NULL THEN 'missing-template'
       ELSE 'template' END AS source
FROM maintenance_schedules ms
JOIN equipment e ON e.id = ms.equipment_id
LEFT JOIN equipment_templates et ON et.equipment_type = e.type
LEFT JOIN LATERAL (
  SELECT elem FROM jsonb_array_elements(COALESCE(et.maintenance_plans, '[]'::jsonb)) elem
  WHERE elem->>'key' = ms.template_key LIMIT 1
) plan ON ms.template_key IS NOT NULL
WHERE ms.is_active = true AND COALESCE(e.is_scrapped, false) = false AND e.status <> 'scrapped';
