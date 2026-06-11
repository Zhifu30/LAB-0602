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

-- 3. 删除冗余 manufacturer 列 + model 列，简化为仅 equipment_type 唯一
DO $$
BEGIN
  ALTER TABLE equipment_templates DROP CONSTRAINT IF EXISTS equipment_templates_equipment_type_model_manufacturer_key;
  ALTER TABLE equipment_templates DROP CONSTRAINT IF EXISTS equipment_templates_equipment_type_model_key;
  ALTER TABLE equipment_templates DROP COLUMN IF EXISTS manufacturer;
  ALTER TABLE equipment_templates DROP COLUMN IF EXISTS model;
  ALTER TABLE equipment_templates ADD CONSTRAINT equipment_templates_equipment_type_key UNIQUE (equipment_type);
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'Migration partial: %', SQLERRM;
END $$;
