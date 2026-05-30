-- 创建设备管理数据库表
CREATE TABLE public.equipment (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  model TEXT NOT NULL,
  manufacturer TEXT NOT NULL,
  type TEXT,
  status TEXT NOT NULL DEFAULT 'normal',
  location TEXT NOT NULL,
  responsible TEXT NOT NULL,
  maintenance_date DATE,
  image_url TEXT,
  sop_file_url TEXT,
  sop_file_name TEXT,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- 启用行级安全
ALTER TABLE public.equipment ENABLE ROW LEVEL SECURITY;

-- 创建公开访问策略（设备信息对所有人可见）
CREATE POLICY "Equipment is publicly readable" 
ON public.equipment 
FOR SELECT 
USING (true);

-- 创建插入策略（任何人都可以添加设备）
CREATE POLICY "Anyone can insert equipment" 
ON public.equipment 
FOR INSERT 
WITH CHECK (true);

-- 创建更新策略（任何人都可以更新设备）
CREATE POLICY "Anyone can update equipment" 
ON public.equipment 
FOR UPDATE 
USING (true);

-- 创建删除策略（任何人都可以删除设备）
CREATE POLICY "Anyone can delete equipment" 
ON public.equipment 
FOR DELETE 
USING (true);

-- 创建文件存储桶用于设备图片和SOP文件
INSERT INTO storage.buckets (id, name, public) 
VALUES ('equipment-images', 'equipment-images', true);

INSERT INTO storage.buckets (id, name, public) 
VALUES ('sop-files', 'sop-files', true);

-- 设备图片存储策略
CREATE POLICY "Equipment images are publicly accessible" 
ON storage.objects 
FOR SELECT 
USING (bucket_id = 'equipment-images');

CREATE POLICY "Anyone can upload equipment images" 
ON storage.objects 
FOR INSERT 
WITH CHECK (bucket_id = 'equipment-images');

CREATE POLICY "Anyone can update equipment images" 
ON storage.objects 
FOR UPDATE 
USING (bucket_id = 'equipment-images');

CREATE POLICY "Anyone can delete equipment images" 
ON storage.objects 
FOR DELETE 
USING (bucket_id = 'equipment-images');

-- SOP文件存储策略
CREATE POLICY "SOP files are publicly accessible" 
ON storage.objects 
FOR SELECT 
USING (bucket_id = 'sop-files');

CREATE POLICY "Anyone can upload SOP files" 
ON storage.objects 
FOR INSERT 
WITH CHECK (bucket_id = 'sop-files');

CREATE POLICY "Anyone can update SOP files" 
ON storage.objects 
FOR UPDATE 
USING (bucket_id = 'sop-files');

CREATE POLICY "Anyone can delete SOP files" 
ON storage.objects 
FOR DELETE 
USING (bucket_id = 'sop-files');

-- 创建更新时间戳的函数
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 创建自动更新时间戳的触发器
CREATE TRIGGER update_equipment_updated_at
BEFORE UPDATE ON public.equipment
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();