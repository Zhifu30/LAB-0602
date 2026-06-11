# Supabase 数据库迁移部署指南

## 概述
项目已升级为**分层级维护责任人系统**（1/2/3三级）。需要在 Supabase 中创建两个新表来支持此功能。

---

## 方式一：通过 Supabase SQL 编辑器（推荐）

### 步骤 1：登录 Supabase
访问: https://app.supabase.com/project/uvylubaxpkmzymdggoyf/sql/new

### 步骤 2：复制并执行以下 SQL

```sql
-- ============================================================
-- 1. 创建设备维护责任人等级管理表
-- ============================================================
CREATE TABLE IF NOT EXISTS public.equipment_maintenance_responsible (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  equipment_id text NOT NULL REFERENCES public.equipment(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  maintenance_level integer NOT NULL CHECK (maintenance_level IN (1, 2, 3)),
  -- 1 = 一级维护人（管理者）, 2 = 二级维护人（监督者），3 = 三级维护人（实际操作者）
  notes text,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  created_by uuid REFERENCES auth.users(id),
  UNIQUE(equipment_id, user_id, maintenance_level)
);

-- 启用 RLS
ALTER TABLE public.equipment_maintenance_responsible ENABLE ROW LEVEL SECURITY;

-- RLS 策略
CREATE POLICY "Equipment maintenance responsible are publicly readable"
  ON public.equipment_maintenance_responsible FOR SELECT
  USING (true);

CREATE POLICY "Authenticated users can insert maintenance responsible"
  ON public.equipment_maintenance_responsible FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated users can update maintenance responsible"
  ON public.equipment_maintenance_responsible FOR UPDATE
  USING (auth.uid() IS NOT NULL);

CREATE POLICY "Only admins can delete maintenance responsible"
  ON public.equipment_maintenance_responsible FOR DELETE
  USING (is_current_user_admin());

-- 创建触发器更新 updated_at
CREATE TRIGGER update_equipment_maintenance_responsible_updated_at
  BEFORE UPDATE ON public.equipment_maintenance_responsible
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- 创建索引
CREATE INDEX idx_equipment_maintenance_responsible_equipment_id 
  ON public.equipment_maintenance_responsible(equipment_id);
CREATE INDEX idx_equipment_maintenance_responsible_user_id 
  ON public.equipment_maintenance_responsible(user_id);
CREATE INDEX idx_equipment_maintenance_responsible_level 
  ON public.equipment_maintenance_responsible(maintenance_level);

-- ============================================================
-- 2. 创建维护完成通知日志表
-- ============================================================
CREATE TABLE IF NOT EXISTS public.maintenance_completion_notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  schedule_id uuid NOT NULL REFERENCES public.maintenance_schedules(id) ON DELETE CASCADE,
  equipment_id text NOT NULL REFERENCES public.equipment(id) ON DELETE CASCADE,
  completed_by uuid NOT NULL REFERENCES auth.users(id),
  completed_by_name text NOT NULL,
  completed_by_level integer NOT NULL, -- 完成者的维护等级
  notified_to uuid NOT NULL REFERENCES auth.users(id),
  notified_to_name text NOT NULL,
  notified_to_level integer NOT NULL, -- 被通知者的维护等级
  completed_at timestamp with time zone NOT NULL,
  notified_at timestamp with time zone DEFAULT now(),
  notification_status text DEFAULT 'sent' CHECK (notification_status IN ('sent', 'failed', 'read')),
  read_at timestamp with time zone,
  notes text,
  created_at timestamp with time zone DEFAULT now()
);

-- 启用 RLS
ALTER TABLE public.maintenance_completion_notifications ENABLE ROW LEVEL SECURITY;

-- RLS 策略
CREATE POLICY "Maintenance completion notifications are readable by assigned users"
  ON public.maintenance_completion_notifications FOR SELECT
  USING (
    auth.uid() = notified_to OR 
    auth.uid() = completed_by OR
    is_current_user_admin()
  );

CREATE POLICY "System can insert notifications"
  ON public.maintenance_completion_notifications FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "Users can update their own notifications"
  ON public.maintenance_completion_notifications FOR UPDATE
  USING (auth.uid() = notified_to OR is_current_user_admin());

-- 创建索引
CREATE INDEX idx_maintenance_completion_notifications_equipment_id 
  ON public.maintenance_completion_notifications(equipment_id);
CREATE INDEX idx_maintenance_completion_notifications_notified_to 
  ON public.maintenance_completion_notifications(notified_to);
CREATE INDEX idx_maintenance_completion_notifications_completed_by 
  ON public.maintenance_completion_notifications(completed_by);
```

### 步骤 3：验证迁移成功
在 SQL 编辑器中执行查询验证两个表是否创建成功：
```sql
SELECT table_name FROM information_schema.tables 
WHERE table_schema = 'public' 
AND table_name IN ('equipment_maintenance_responsible', 'maintenance_completion_notifications');
```

应该返回两条记录。

---

## 数据表说明

### 1. `equipment_maintenance_responsible` 表
存储设备的分层级维护责任人分配关系。

**字段说明：**
| 字段 | 类型 | 说明 |
|------|------|------|
| id | UUID | 主键 |
| equipment_id | TEXT | 关联的设备 ID（外键 → equipment.id） |
| user_id | UUID | 负责人 user_id（外键 → auth.users.id） |
| maintenance_level | INTEGER | 维护等级：1=一级管理者，2=二级监督者，3=三级操作者 |
| notes | TEXT | 备注 |
| created_at | TIMESTAMPTZ | 创建时间 |
| updated_at | TIMESTAMPTZ | 更新时间 |
| created_by | UUID | 创建者 user_id |

**约束：**
- (equipment_id, user_id, maintenance_level) 组合唯一
- 当设备被删除时自动级联删除相关记录
- 维护等级只能是 1、2、3

### 2. `maintenance_completion_notifications` 表
记录维护完成后的通知日志。当三级维护人完成维护时，系统自动为二级和一级维护人生成通知记录。

**字段说明：**
| 字段 | 类型 | 说明 |
|------|------|------|
| id | UUID | 主键 |
| schedule_id | UUID | 关联的维护计划 ID |
| equipment_id | TEXT | 设备 ID |
| completed_by | UUID | 完成人 user_id |
| completed_by_name | TEXT | 完成人名称 |
| completed_by_level | INTEGER | 完成人的维护等级 |
| notified_to | UUID | 被通知人 user_id |
| notified_to_name | TEXT | 被通知人名称 |
| notified_to_level | INTEGER | 被通知人的维护等级 |
| completed_at | TIMESTAMPTZ | 维护完成时间 |
| notified_at | TIMESTAMPTZ | 通知时间 |
| notification_status | TEXT | 通知状态（sent/failed/read） |
| read_at | TIMESTAMPTZ | 被读取时间 |
| notes | TEXT | 备注 |
| created_at | TIMESTAMPTZ | 记录创建时间 |

---

## 前端更新说明

### 新组件：HierarchicalResponsibleColumn
位置：`src/components/HierarchicalResponsibleColumn.tsx`

**功能：**
- 按维护等级（1/2/3）显示负责人
- 支持为每个设备的每个等级添加/删除负责人
- 支持批量为所有设备添加某等级的负责人
- 实时从 `equipment_maintenance_responsible` 表读取数据

**使用位置：**
在 `src/components/EquipmentTypeManager.tsx` 的第五列（"维护负责人等级"）

### UI 工作流
1. **查看负责人分配**：点击三个等级的可折叠区域，查看该等级已分配的负责人和关联的设备
2. **添加负责人**：点击"为所有设备添加[等级]负责人"按钮，从下拉列表选择用户
3. **删除负责人**：鼠标悬停在负责人条目上，点击垃圾桶图标删除

---

## 业务流程说明

### 维护流程
1. **设备分配**：在"维护负责人等级"列中，为每台设备分配 1/2/3 级负责人
2. **三级维护**：三级负责人执行实际维护工作，标记维护完成
3. **自动通知**：系统自动在 `maintenance_completion_notifications` 表中创建记录，通知二级和一级负责人
4. **监督和管理**：二级负责人审核三级的工作记录，一级负责人进行最终审批

### 等级说明
- **一级（Level 1）**：最高管理者，负责整体监管和审批
- **二级（Level 2）**：监督者，审核三级工作，向一级汇报
- **三级（Level 3）**：实际操作者，执行维护任务

---

## 后续开发任务

1. **维护完成时自动通知**
   - 在 MaintenanceScheduleCard 或维护完成逻辑中，调用函数向相应的二级/一级负责人发送通知

2. **通知UI展示**
   - 创建通知中心显示 `maintenance_completion_notifications` 中的记录

3. **维护记录复制**
   - 实现三级完成的维护记录自动复制到二级的个人记录中

4. **权限管理**
   - 确保用户只能查看/修改他们有权限的维护任务

---

## 常见问题

**Q: 可以为同一设备的同一等级分配多个负责人吗？**
A: 可以。表结构允许 (equipment_id, user_id, maintenance_level) 的组合唯一，意味着同一设备的同一等级可以有多个不同的用户。

**Q: 如何修改已分配的负责人？**
A: 目前的流程是：删除旧的分配记录 → 添加新的分配记录。UI 中可以看到删除按钮。

**Q: 旧的 equipment.responsible 字段会被废弃吗？**
A: 暂时保留向后兼容性。未来可以完全迁移到新系统后再删除。

---

## 验证清单

- [ ] SQL 执行成功，两个表已创建
- [ ] 在 Supabase 表编辑器中可以看到 equipment_maintenance_responsible 表
- [ ] 在 Supabase 表编辑器中可以看到 maintenance_completion_notifications 表
- [ ] 网站重新加载后，EquipmentTypeManager 的第五列显示"维护负责人等级"
- [ ] 可以展开三个等级（一级、二级、三级）
- [ ] 可以为设备添加负责人
- [ ] 可以删除负责人分配

---

## 支持
若有问题，请查看迁移文件：`supabase/migrations/20260607_add_equipment_maintenance_hierarchy.sql`
