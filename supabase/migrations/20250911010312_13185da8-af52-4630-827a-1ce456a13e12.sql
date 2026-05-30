-- Create permissions table for granular permission control
CREATE TABLE IF NOT EXISTS public.permissions (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  name text NOT NULL UNIQUE,
  description text NOT NULL,
  category text NOT NULL,
  created_at timestamp with time zone DEFAULT now()
);

-- Create role_permissions table to map permissions to roles
CREATE TABLE IF NOT EXISTS public.role_permissions (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  role_type text NOT NULL,
  permission_id uuid REFERENCES public.permissions(id) ON DELETE CASCADE,
  granted boolean DEFAULT false,
  created_at timestamp with time zone DEFAULT now(),
  UNIQUE(role_type, permission_id)
);

-- Insert default permissions based on the image reference
INSERT INTO public.permissions (name, description, category) VALUES
-- 高清活度表控件 (动力学模块)
('clipboard_operation', '功能：复制活度表的行或列到剪贴板', '高清活度表控件'),

-- 高清通用容器
('editor_selection', '权限：使用编辑菜单中的选项。该功能可切换 UVProbe 应用方式（仅限常规方式和增强方式）', '高清通用容器'),
('visit_report_generator', '权限：使用报告生成器模块。该功能可建立/保存/读取报告文件和报告模板，在此模块中对象可以任意布局', '高清通用容器'),
('modify_tools', '权限：使用工具菜单。该功能可插入其他应用软件到 UVProbe 的菜单指令中，插入程序到工具菜单', '高清通用容器'),

-- 高清数据打印控件 (光谱/动力学模块)
('clipboard_data_operation', '权限：复制数据到打印表的行或列到剪贴板', '高清数据打印控件'),

-- 高清动力学主表控件
('copy_table_operation', '复制主表的行或列到剪贴板', '高清动力学主表控件'),
('modify_table', '权限：进行输入缩组，输入系数/注释到主表，还包括切换"显示/不显示"表中的列的权限', '高清动力学主表控件'),

-- 高清动力学模块
('save_files', '权限：使用文件菜单中的保存功能。该功能可保存动力学文件、酶文件、方法文件和各种模板', '高清动力学模块'),
('editor_methods', '权限：在编辑菜单中使用方法功能。该功能可以建立/编辑测定方法', '高清动力学模块'),
('editor_settings', '权限：在绘图菜单中使用设置功能。该功能可设置显示数据位数、报告和曲线的链接设置、是否显示信息，数据集名称显示的格式，设置保存文本使其保存等', '高清动力学模块'),
('collect_data', '权限：执行测定', '高清动力学模块'),
('pool_blank', '权限：使用池空白功能', '高清动力学模块'),
('process_data', '权限：使用数据处理', '高清动力学模块'),
('print_report', '权限：使用文件菜单中的打印预览和打印功能。这些功能可进行使用曲线按各模板的报告模板打印', '高清动力学模块'),
('measure_extension', '权限：进行波长移动', '高清动力学模块'),
('peak_integration', '权限：建立峰积分表', '高清动力学模块'),
('peak_detection', '权限：使用操作菜单中的峰值检测功能', '高清动力学模块'),
('continuous_box', '权限：使用连功盒功能', '高清动力学模块'),
('activity_table', '权限：建立活度表', '高清动力学模块'),

-- System permissions
('edit_website', '权限：编辑网站页面和组件', '系统权限'),
('manage_users', '权限：管理用户账户和权限', '系统权限'),
('change_password', '权限：修改用户密码', '系统权限'),
('send_messages', '权限：发送系统消息和通知', '系统权限'),
('receive_messages', '权限：接收系统消息和通知', '系统权限'),
('view_audit_logs', '权限：查看系统审计日志', '系统权限'),
('manage_equipment', '权限：管理设备信息', '系统权限'),
('manage_parts', '权限：管理零件库存', '系统权限'),
('manage_projects', '权限：管理Empower项目', '系统权限'),
('approve_projects', '权限：审批项目申请', '系统权限');

-- Enable RLS on new tables
ALTER TABLE public.permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.role_permissions ENABLE ROW LEVEL SECURITY;

-- Create policies for permissions table
CREATE POLICY "Permissions are publicly readable" ON public.permissions
FOR SELECT USING (true);

CREATE POLICY "Only admins can modify permissions" ON public.permissions
FOR ALL USING (is_current_user_admin());

-- Create policies for role_permissions table
CREATE POLICY "Role permissions are publicly readable" ON public.role_permissions
FOR SELECT USING (true);

CREATE POLICY "Only admins can modify role permissions" ON public.role_permissions
FOR ALL USING (is_current_user_admin());

-- Insert default role permissions based on typical GLP hierarchy
INSERT INTO public.role_permissions (role_type, permission_id, granted) 
SELECT 'admin', id, true FROM public.permissions; -- Admin gets all permissions

-- Manager permissions
INSERT INTO public.role_permissions (role_type, permission_id, granted)
SELECT 'manager', id, true FROM public.permissions 
WHERE name IN ('approve_projects', 'manage_projects', 'view_audit_logs', 'send_messages', 'receive_messages', 'manage_users', 'change_password');

-- Scientist permissions  
INSERT INTO public.role_permissions (role_type, permission_id, granted)
SELECT 'scientist', id, true FROM public.permissions
WHERE name IN ('manage_projects', 'manage_equipment', 'collect_data', 'process_data', 'save_files', 'print_report', 'receive_messages', 'change_password');

-- Analyst permissions
INSERT INTO public.role_permissions (role_type, permission_id, granted)
SELECT 'analyst', id, true FROM public.permissions
WHERE name IN ('collect_data', 'process_data', 'save_files', 'print_report', 'manage_parts', 'receive_messages', 'change_password');

-- User permissions (basic)
INSERT INTO public.role_permissions (role_type, permission_id, granted)
SELECT 'user', id, true FROM public.permissions
WHERE name IN ('receive_messages', 'change_password');