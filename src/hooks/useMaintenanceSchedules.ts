import { useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import type { MaintenanceSchedule, MaintenanceScheduleFormData } from '@/types/maintenance';

export function useMaintenanceSchedules() {
  const fetchByEquipment = useCallback(async (equipmentId: string): Promise<MaintenanceSchedule[]> => {
    const { data, error } = await supabase
      .from('maintenance_schedules')
      .select('*')
      .eq('equipment_id', equipmentId)
      .eq('is_active', true)
      .order('next_due_date');
    if (error) throw error;
    return (data || []) as MaintenanceSchedule[];
  }, []);

  const createSchedule = useCallback(async (
    equipmentId: string,
    form: MaintenanceScheduleFormData,
    assignee?: { name: string | null; email: string | null },
    createdBy?: string,
  ) => {
    const { error } = await supabase.from('maintenance_schedules').insert({
      equipment_id: equipmentId,
      title: form.title.trim(),
      description: form.description.trim() || null,
      frequency: form.frequency,
      next_due_date: form.next_due_date,
      reminder_days_before: form.reminder_days_before,
      assigned_user_id: form.assigned_user_id || null,
      assigned_name: assignee?.name || null,
      assigned_email: assignee?.email || null,
      is_active: true,
      created_by: createdBy || null,
    });
    if (error) throw error;
  }, []);

  const updateSchedule = useCallback(async (
    scheduleId: string,
    form: MaintenanceScheduleFormData,
    assignee?: { name: string | null; email: string | null },
  ) => {
    const { error } = await supabase.from('maintenance_schedules').update({
      title: form.title.trim(),
      description: form.description.trim() || null,
      frequency: form.frequency,
      next_due_date: form.next_due_date,
      reminder_days_before: form.reminder_days_before,
      assigned_user_id: form.assigned_user_id || null,
      assigned_name: assignee?.name || null,
      assigned_email: assignee?.email || null,
    }).eq('id', scheduleId);
    if (error) throw error;
  }, []);

  const deactivateSchedule = useCallback(async (scheduleId: string) => {
    const { error } = await supabase
      .from('maintenance_schedules')
      .update({ is_active: false })
      .eq('id', scheduleId);
    if (error) throw error;
  }, []);

  const hasActiveSchedule = useCallback(async (equipmentId: string): Promise<boolean> => {
    const { data } = await supabase
      .from('maintenance_schedules')
      .select('id')
      .eq('equipment_id', equipmentId)
      .eq('is_active', true)
      .limit(1);
    return !!(data && data.length > 0);
  }, []);

  return {
    fetchByEquipment,
    createSchedule,
    updateSchedule,
    deactivateSchedule,
    hasActiveSchedule,
  };
}
