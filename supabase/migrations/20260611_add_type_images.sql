-- v3: 类型图片库 — 支持同一类型存储多张图片

-- 1. 添加 type_images JSONB 列
ALTER TABLE equipment_templates
ADD COLUMN IF NOT EXISTS type_images JSONB DEFAULT '[]'::jsonb;

-- 2. 自动迁移已有数据
UPDATE equipment_templates
SET type_images = jsonb_build_array(
  jsonb_build_object('url', shared_image_url, 'label', '默认', 'is_default', true)
)
WHERE shared_image_url IS NOT NULL
  AND shared_image_url != ''
  AND (type_images IS NULL OR type_images = '[]'::jsonb);

-- 3. 删除冗余 manufacturer 列
--    先重建唯一约束为 (equipment_type, model)
--    再删除 manufacturer 列
DO $$
BEGIN
  -- 删除旧约束
  ALTER TABLE equipment_templates DROP CONSTRAINT IF EXISTS equipment_templates_equipment_type_model_manufacturer_key;
  -- 重建为只依赖 (equipment_type, model)
  ALTER TABLE equipment_templates ADD CONSTRAINT equipment_templates_equipment_type_model_key UNIQUE (equipment_type, model);
  -- 删除 manufacturer 列
  ALTER TABLE equipment_templates DROP COLUMN IF EXISTS manufacturer;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'Migration partial, may already be applied: %', SQLERRM;
END $$;
