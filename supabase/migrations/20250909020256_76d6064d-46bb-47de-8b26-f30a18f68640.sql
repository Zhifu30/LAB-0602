-- 创建empower管理表
CREATE TABLE public.empower_projects (
  id TEXT NOT NULL DEFAULT gen_random_uuid()::text PRIMARY KEY,
  project_name TEXT NOT NULL,
  abbreviation TEXT,
  team TEXT NOT NULL,
  owner_name TEXT NOT NULL,
  owner_number TEXT NOT NULL,
  leader_check TEXT DEFAULT 'pending',
  approved_project_name TEXT,
  manager_approve TEXT DEFAULT 'pending',
  new_project BOOLEAN DEFAULT true,
  notify_owner TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- 启用RLS
ALTER TABLE public.empower_projects ENABLE ROW LEVEL SECURITY;

-- 创建RLS策略
CREATE POLICY "Empower projects are publicly readable" 
ON public.empower_projects 
FOR SELECT 
USING (true);

CREATE POLICY "Anyone can insert empower projects" 
ON public.empower_projects 
FOR INSERT 
WITH CHECK (true);

CREATE POLICY "Anyone can update empower projects" 
ON public.empower_projects 
FOR UPDATE 
USING (true);

CREATE POLICY "Anyone can delete empower projects" 
ON public.empower_projects 
FOR DELETE 
USING (true);

-- 创建自动更新时间戳的触发器
CREATE TRIGGER update_empower_projects_updated_at
BEFORE UPDATE ON public.empower_projects
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();