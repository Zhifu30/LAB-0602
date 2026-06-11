-- v3: 类型图片库 — 支持同一类型存储多张图片

-- 1. 添加 type_images JSONB 列（每个元素: { url, label, is_default }）
ALTER TABLE equipment_templates
ADD COLUMN IF NOT EXISTS type_images JSONB DEFAULT '[]'::jsonb;

-- 2. 自动迁移已有数据：将现有的 shared_image_url 转为 type_images 数组
UPDATE equipment_templates
SET type_images = jsonb_build_array(
  jsonb_build_object('url', shared_image_url, 'label', '默认', 'is_default', true)
)
WHERE shared_image_url IS NOT NULL
  AND shared_image_url != ''
  AND (type_images IS NULL OR type_images = '[]'::jsonb);
