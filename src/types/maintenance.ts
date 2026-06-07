export type MaintenanceFrequency = 'daily' | 'weekly' | 'monthly' | 'quarterly' | 'yearly';

export interface MaintenanceSchedule {
  id: string;
  equipment_id: string;
  title: string;
  description: string | null;
  frequency: MaintenanceFrequency;
  next_due_date: string;
  reminder_days_before: number;
  assigned_user_id: string | null;
  assigned_name: string | null;
  assigned_email: string | null;
  last_completed_at: string | null;
  reminder_sent: boolean;
  is_active: boolean;
  created_at: string;
}

export interface MaintenanceScheduleFormData {
  title: string;
  description: string;
  frequency: MaintenanceFrequency;
  next_due_date: string;
  reminder_days_before: number;
  assigned_user_id: string;
}

export interface MaintenancePlanFormData {
  title: string;
  description: string;
  frequency: MaintenanceFrequency;
  reminder_days_before: number;
}

export const FREQUENCY_LABELS: Record<MaintenanceFrequency, string> = {
  daily: '每日',
  weekly: '每周',
  monthly: '每月',
  quarterly: '每季度',
  yearly: '每年',
};

export const FREQUENCY_OPTIONS: MaintenanceFrequency[] = [
  'daily', 'weekly', 'monthly', 'quarterly', 'yearly',
];

export const defaultScheduleFormData = (): MaintenanceScheduleFormData => ({
  title: '',
  description: '',
  frequency: 'monthly',
  next_due_date: '',
  reminder_days_before: 7,
  assigned_user_id: '',
});

export const defaultPlanFormData = (): MaintenancePlanFormData => ({
  title: '',
  description: '',
  frequency: 'monthly',
  reminder_days_before: 7,
});
