-- Remove all existing permissions
DELETE FROM public.role_permissions;
DELETE FROM public.permissions;

-- Insert permissions based on actual website functionality
INSERT INTO public.permissions (name, description, category) VALUES
  -- 权限管理 (Permission Management)
  ('manage_permissions', '管理角色权限分配', '权限管理'),
  ('view_users', '查看用户列表', '权限管理'),
  ('edit_user_roles', '编辑用户角色', '权限管理'),
  ('change_passwords', '修改用户密码', '权限管理'),
  ('edit_usernames', '编辑用户名', '权限管理'),
  ('edit_website', '编辑网站(显示Lovable按钮)', '权限管理'),

  -- 仪器管理 (Equipment Management)
  ('view_equipment', '查看仪器列表', '仪器管理'),
  ('add_equipment', '添加新仪器', '仪器管理'),
  ('edit_equipment', '编辑仪器信息', '仪器管理'),
  ('delete_equipment', '删除仪器', '仪器管理'),
  ('scrap_equipment', '报废仪器', '仪器管理'),
  ('qr_scan_equipment', '扫描仪器二维码', '仪器管理'),
  ('change_equipment_status', '修改仪器状态', '仪器管理'),
  ('upload_sop_files', '上传SOP文件', '仪器管理'),
  ('calibration_management', '校正管理', '仪器管理'),

  -- 配件管理 (Parts Management)
  ('view_parts', '查看配件列表', '配件管理'),
  ('add_parts', '添加新配件', '配件管理'),
  ('edit_parts', '编辑配件信息', '配件管理'),
  ('delete_parts', '删除配件', '配件管理'),
  ('stock_in_parts', '配件入库', '配件管理'),
  ('stock_out_parts', '配件出库', '配件管理'),
  ('parts_transactions', '查看配件交易记录', '配件管理'),
  ('parts_qr_scan', '扫描配件二维码', '配件管理'),
  ('upload_purchase_files', '上传采购文件', '配件管理'),

  -- Empower项目管理 (Empower Project Management)
  ('view_empower_projects', '查看Empower项目', 'Empower管理'),
  ('add_empower_projects', '添加Empower项目', 'Empower管理'),
  ('edit_empower_projects', '编辑Empower项目', 'Empower管理'),
  ('delete_empower_projects', '删除Empower项目', 'Empower管理'),
  ('approve_empower_projects', '审批Empower项目', 'Empower管理'),
  ('leader_check', '组长审核', 'Empower管理'),
  ('manager_approve', '经理审批', 'Empower管理'),

  -- 团队管理 (Team Management)
  ('view_teams', '查看团队列表', '团队管理'),
  ('create_teams', '创建团队', '团队管理'),
  ('edit_teams', '编辑团队信息', '团队管理'),
  ('delete_teams', '删除团队', '团队管理'),

  -- 审计日志 (Audit Logs)
  ('view_audit_logs', '查看审计日志', '审计管理'),
  ('export_audit_logs', '导出审计日志', '审计管理');

-- Set default role permissions based on GLP hierarchy
-- 超级管理员 (admin) - 所有权限
INSERT INTO public.role_permissions (role_type, permission_id, granted)
SELECT 'admin', id, true FROM public.permissions;

-- 经理 (manager) - 管理权限，除了系统级权限管理
INSERT INTO public.role_permissions (role_type, permission_id, granted)
SELECT 'manager', id, true FROM public.permissions 
WHERE name IN (
  'view_users', 'edit_user_roles', 'change_passwords', 'edit_usernames',
  'view_equipment', 'add_equipment', 'edit_equipment', 'delete_equipment', 'scrap_equipment', 
  'qr_scan_equipment', 'change_equipment_status', 'upload_sop_files', 'calibration_management',
  'view_parts', 'add_parts', 'edit_parts', 'delete_parts', 'stock_in_parts', 'stock_out_parts', 
  'parts_transactions', 'parts_qr_scan', 'upload_purchase_files',
  'view_empower_projects', 'add_empower_projects', 'edit_empower_projects', 'delete_empower_projects', 
  'approve_empower_projects', 'manager_approve',
  'view_teams', 'create_teams', 'edit_teams', 'delete_teams',
  'view_audit_logs', 'export_audit_logs'
);

-- 科学家 (scientist) - 专业操作权限
INSERT INTO public.role_permissions (role_type, permission_id, granted)
SELECT 'scientist', id, true FROM public.permissions 
WHERE name IN (
  'view_equipment', 'add_equipment', 'edit_equipment', 'qr_scan_equipment', 'change_equipment_status', 
  'upload_sop_files', 'calibration_management',
  'view_parts', 'add_parts', 'edit_parts', 'stock_in_parts', 'stock_out_parts', 
  'parts_transactions', 'parts_qr_scan', 'upload_purchase_files',
  'view_empower_projects', 'add_empower_projects', 'edit_empower_projects', 'leader_check',
  'view_teams'
);

-- 分析员 (analyst) - 基本操作权限
INSERT INTO public.role_permissions (role_type, permission_id, granted)
SELECT 'analyst', id, true FROM public.permissions 
WHERE name IN (
  'view_equipment', 'edit_equipment', 'qr_scan_equipment', 'change_equipment_status', 'upload_sop_files',
  'view_parts', 'stock_in_parts', 'stock_out_parts', 'parts_transactions', 'parts_qr_scan',
  'view_empower_projects', 'add_empower_projects', 'edit_empower_projects',
  'view_teams'
);

-- 普通用户 (user) - 基础查看权限
INSERT INTO public.role_permissions (role_type, permission_id, granted)
SELECT 'user', id, true FROM public.permissions 
WHERE name IN (
  'view_equipment', 'qr_scan_equipment',
  'view_parts', 'parts_qr_scan',
  'view_empower_projects',
  'view_teams'
);

-- Add calibration_date field to equipment table and setup email notifications
ALTER TABLE public.equipment 
ADD COLUMN IF NOT EXISTS calibration_date date,
ADD COLUMN IF NOT EXISTS next_calibration_date date,
ADD COLUMN IF NOT EXISTS calibration_reminder_sent boolean DEFAULT false;

-- Add multiple SOP files support
ALTER TABLE public.equipment 
ADD COLUMN IF NOT EXISTS sop_files jsonb DEFAULT '[]'::jsonb;

-- Add multiple purchase files support for parts
ALTER TABLE public.parts 
ADD COLUMN IF NOT EXISTS purchase_files jsonb DEFAULT '[]'::jsonb;