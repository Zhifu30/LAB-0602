/**
 * 维护计划 — 统一日期计算工具
 */

import { differenceInCalendarDays, isToday, isPast } from 'date-fns';

export type DueStatus = 'overdue' | 'today' | 'upcoming' | 'normal';

export function getDaysUntilDue(date: string): number {
  return differenceInCalendarDays(new Date(date), new Date());
}

export function getDueStatus(date: string, reminderDays: number = 7): DueStatus {
  const days = getDaysUntilDue(date);
  if (days < 0) return 'overdue';
  if (isToday(new Date(date))) return 'today';
  if (days <= reminderDays) return 'upcoming';
  return 'normal';
}

export function calculateNextDueDate(current: string, frequency: string): string {
  const d = new Date(current);
  switch (frequency) {
    case 'daily': d.setDate(d.getDate() + 1); break;
    case 'weekly': d.setDate(d.getDate() + 7); break;
    case 'monthly': d.setMonth(d.getMonth() + 1); break;
    case 'quarterly': d.setMonth(d.getMonth() + 3); break;
    case 'yearly': d.setFullYear(d.getFullYear() + 1); break;
    default: d.setMonth(d.getMonth() + 1);
  }
  return d.toISOString().split('T')[0];
}

export function isOverdue(date: string): boolean {
  return isPast(new Date(date)) && !isToday(new Date(date));
}
