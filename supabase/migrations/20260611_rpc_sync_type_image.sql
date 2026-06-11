-- 设备类型共享图片 — 事务批量同步 RPC 函数 (v2)
-- 支持两种模式：全量同步 + 按设备 ID 列表选择性同步

-- 模式 1：全量同步
CREATE OR REPLACE FUNCTION sync_type_shared_image(
  p_type_name TEXT,
  p_shared_image_url TEXT
) RETURNS JSONB AS $$
DECLARE
  v_updated_count INT;
BEGIN
  UPDATE equipment_templates
  SET shared_image_url = p_shared_image_url, updated_at = NOW()
  WHERE equipment_type = p_type_name AND model = '__TYPE__';

  WITH updated AS (
    UPDATE equipment
    SET image_url = p_shared_image_url
    WHERE type = p_type_name
      AND status != 'scrapped'
      AND (image_url IS NULL OR image_url != p_shared_image_url)
    RETURNING id
  )
  SELECT COUNT(*) INTO v_updated_count FROM updated;

  RETURN jsonb_build_object('success', true, 'updated_count', v_updated_count, 'type_name', p_type_name);
EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'error', SQLERRM, 'type_name', p_type_name);
END;
$$ LANGUAGE plpgsql;

-- 模式 2：选择性同步（v2 新增）
CREATE OR REPLACE FUNCTION sync_type_shared_image_to_devices(
  p_type_name TEXT,
  p_shared_image_url TEXT,
  p_equipment_ids TEXT[]
) RETURNS JSONB AS $$
DECLARE
  v_updated_count INT;
BEGIN
  UPDATE equipment_templates
  SET shared_image_url = p_shared_image_url, updated_at = NOW()
  WHERE equipment_type = p_type_name AND model = '__TYPE__';

  WITH updated AS (
    UPDATE equipment
    SET image_url = p_shared_image_url
    WHERE id = ANY(p_equipment_ids)
      AND status != 'scrapped'
      AND (image_url IS NULL OR image_url != p_shared_image_url)
    RETURNING id
  )
  SELECT COUNT(*) INTO v_updated_count FROM updated;

  RETURN jsonb_build_object('success', true, 'updated_count', v_updated_count, 'type_name', p_type_name);
EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'error', SQLERRM, 'type_name', p_type_name);
END;
$$ LANGUAGE plpgsql;
