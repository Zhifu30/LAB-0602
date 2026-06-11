-- 设备类型共享图片 — 事务批量同步 RPC 函数
-- 在单个事务中：更新 equipment_templates.shared_image_url + 批量同步所有关联设备的 image_url

CREATE OR REPLACE FUNCTION sync_type_shared_image(
  p_type_name TEXT,
  p_shared_image_url TEXT
) RETURNS JSONB AS $$
DECLARE
  v_updated_count INT;
BEGIN
  -- 1. 更新类型模板的共享图片
  UPDATE equipment_templates
  SET shared_image_url = p_shared_image_url,
      updated_at = NOW()
  WHERE equipment_type = p_type_name
    AND model = '__TYPE__';

  -- 2. 批量更新所有非报废设备的 image_url
  --    排除已是该 URL 的设备，减少不必要的写入
  WITH updated AS (
    UPDATE equipment
    SET image_url = p_shared_image_url
    WHERE type = p_type_name
      AND status != 'scrapped'
      AND (image_url IS NULL OR image_url != p_shared_image_url)
    RETURNING id
  )
  SELECT COUNT(*) INTO v_updated_count FROM updated;

  RETURN jsonb_build_object(
    'success', true,
    'updated_count', v_updated_count,
    'type_name', p_type_name
  );
EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', SQLERRM,
      'type_name', p_type_name
    );
END;
$$ LANGUAGE plpgsql;
