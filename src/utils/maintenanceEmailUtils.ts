/**
 * 维护计划 — 统一邮件数据构建工具
 */

export interface EquipmentListEntry {
  scheduleId: string;
  equipmentId: string;
  equipmentName: string;
  equipmentType: string;
  maintenanceTitle: string;
  description: string;
  dueDate: string;
  frequency: string;
  assignedPerson: string;
}

export function buildMaintenanceEmailList(
  schedules: Array<{
    id: string;
    equipment_id: string;
    equipment?: { name?: string; type?: string };
    title?: string;
    description?: string | null;
    next_due_date?: string;
    frequency?: string;
    assigned_name?: string | null;
  }>
): EquipmentListEntry[] {
  return schedules.map(s => ({
    scheduleId: s.id,
    equipmentId: s.equipment_id,
    equipmentName: s.equipment?.name || s.equipment_id,
    equipmentType: s.equipment?.type || '未分类',
    maintenanceTitle: s.title || '',
    description: s.description || s.title || '',
    dueDate: s.next_due_date || '',
    frequency: s.frequency || '',
    assignedPerson: s.assigned_name || '未指定',
  }));
}
