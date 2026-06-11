/**
 * 设备类型维护计划 — 核心工具库 (v3 模板驱动版)
 *
 * 对标 imageUtils.ts 的 type_images 画廊模式。
 * 所有对 equipment_templates.maintenance_plans JSONB 的增删改查及同步均在此声明。
 */

import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export interface MaintenancePlan {
  key: string;
  title: string;
  description: string;
  frequency: 'daily' | 'weekly' | 'monthly' | 'quarterly' | 'yearly';
  reminder_days_before: number;
}

// ============================================================
// ① 读取
// ============================================================

export async function getTypeMaintenancePlans(typeName: string): Promise<MaintenancePlan[]> {
  try {
    const { data } = await supabase
      .from('equipment_templates')
      .select('maintenance_plans')
      .eq('equipment_type', typeName)
      .eq('model', '__TYPE__')
      .maybeSingle();
    return (data?.maintenance_plans as MaintenancePlan[]) || [];
  } catch (err) {
    console.error('获取类型维护模板失败:', err);
    return [];
  }
}

// ============================================================
// ② 新增/编辑（RPC 级联原子更新）
// ============================================================

export async function saveOrUpdateTypePlanRPC(
  typeName: string,
  plan: Omit<MaintenancePlan, 'key'> & { key?: string }
): Promise<boolean> {
  const isEdit = !!plan.key;
  const targetKey = plan.key || `mp_${Math.random().toString(36).substring(2, 10)}`;

  try {
    if (!isEdit) {
      const currentPlans = await getTypeMaintenancePlans(typeName);
      const newPlan: MaintenancePlan = { ...plan, key: targetKey };
      const { error } = await supabase
        .from('equipment_templates')
        .update({ maintenance_plans: [...currentPlans, newPlan] } as any)
        .eq('equipment_type', typeName).eq('model', '__TYPE__');
      if (error) throw error;
      await syncPlanInstances(typeName, targetKey);
    } else {
      const { data, error } = await supabase.rpc('sync_maintenance_plan_to_instances', {
        p_type_name: typeName,
        p_plan_key: targetKey,
        p_title: plan.title,
        p_description: plan.description,
        p_frequency: plan.frequency,
        p_reminder_days: plan.reminder_days_before,
      });
      if (error) throw error;
      console.log('RPC 级联同步成功:', data);
    }
    toast.success(isEdit ? '模板已同步到所有设备实例' : '新维护模板已创建');
    return true;
  } catch (err) {
    console.error('模板变更失败:', err);
    toast.error('同步失败，请检查 RPC 函数是否已部署');
    return false;
  }
}

// ============================================================
// ③ 删除
// ============================================================

export async function deleteTypeMaintenancePlan(typeName: string, key: string): Promise<void> {
  try {
    const currentPlans = await getTypeMaintenancePlans(typeName);
    const filtered = currentPlans.filter(p => p.key !== key);
    const { error: tplErr } = await supabase
      .from('equipment_templates')
      .update({ maintenance_plans: filtered } as any)
      .eq('equipment_type', typeName).eq('model', '__TYPE__');
    if (tplErr) throw tplErr;
    await supabase.from('maintenance_schedules').update({ is_active: false }).eq('template_key', key);
    toast.success('模板及关联实例已卸载');
  } catch (err) {
    console.error('删除模板失败:', err);
    toast.error('卸载模板失败');
  }
}

// ============================================================
// ④ 批量同步：为新设备生成模板实例
// ============================================================

export async function syncPlanInstances(typeName: string, specificPlanKey?: string): Promise<void> {
  try {
    const plans = await getTypeMaintenancePlans(typeName);
    const targetPlans = specificPlanKey ? plans.filter(p => p.key === specificPlanKey) : plans;
    if (targetPlans.length === 0) return;

    const { data: devices } = await supabase
      .from('equipment').select('id, name, responsible, responsible_email, status, is_scrapped')
      .eq('type', typeName);
    const activeDevices = (devices || []).filter((e: any) => e.is_scrapped !== true && e.status !== 'scrapped');
    if (activeDevices.length === 0) return;

    const payloads: any[] = [];
    for (const plan of targetPlans) {
      const { data: exist } = await supabase
        .from('maintenance_schedules').select('equipment_id')
        .eq('template_key', plan.key).eq('is_active', true);
      const existIds = new Set((exist || []).map(s => s.equipment_id));
      activeDevices.forEach(dev => {
        if (!existIds.has(dev.id)) {
          payloads.push({
            equipment_id: dev.id, template_key: plan.key,
            title: plan.title, description: plan.description || `${plan.title} - 继承自类型模板`,
            frequency: plan.frequency, next_due_date: new Date().toISOString().split('T')[0],
            reminder_days_before: plan.reminder_days_before,
            assigned_name: dev.responsible || null, assigned_email: dev.responsible_email || null, is_active: true,
          });
        }
      });
    }
    if (payloads.length > 0) {
      const { error } = await supabase.from('maintenance_schedules').insert(payloads);
      if (error) throw error;
      console.log(`已为类型设备补齐 ${payloads.length} 项实例`);
    }
  } catch (err) {
    console.error('自动对齐计划实例失败:', err);
  }
}
