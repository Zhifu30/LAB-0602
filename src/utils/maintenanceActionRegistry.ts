/**
 * 维护计划按钮动作注册表 + 图标白名单 v6
 *
 * JSONB 只存按钮 key，真实图标/文案/权限/点击函数从此文件映射。
 */

import {
  Wrench, ShieldAlert, Search, CalendarCheck, Bell, Check, Edit, Trash2, Link2,
  RefreshCw, AlertTriangle, ExternalLink,
} from 'lucide-react';

// ── 图标白名单 ──
export const MAINTENANCE_ICON_MAP: Record<string, React.ComponentType<any>> = {
  wrench: Wrench, 'shield-alert': ShieldAlert, search: Search,
  'calendar-check': CalendarCheck, bell: Bell, check: Check,
  edit: Edit, trash: Trash2, link: Link2,
  'refresh-cw': RefreshCw, 'alert-triangle': AlertTriangle,
  'external-link': ExternalLink,
};

// ── 按钮动作定义 ──
export interface ActionDef {
  icon: React.ComponentType<any>;
  label: string;
  adminOnly?: boolean;
  variant?: 'default' | 'destructive' | 'outline' | 'ghost';
}

export const DEFAULT_ACTION_REGISTRY: Record<string, ActionDef> = {
  link:     { icon: Link2, label: '同步', variant: 'default' },
  remind:   { icon: Bell, label: '提醒', variant: 'default' },
  complete: { icon: Check, label: '完成', variant: 'default' },
  edit:     { icon: Edit, label: '编辑', variant: 'default' },
  delete:   { icon: Trash2, label: '删除', variant: 'destructive', adminOnly: true },
  sync:     { icon: RefreshCw, label: '同步', variant: 'default' },
};

// 填充色按钮样式（按功能统一颜色）
export const ACTION_COLORS: Record<string, string> = {
  link: 'bg-blue-500 hover:bg-blue-600 text-white',
  remind: 'bg-orange-500 hover:bg-orange-600 text-white',
  complete: 'bg-green-500 hover:bg-green-600 text-white',
  edit: 'bg-indigo-500 hover:bg-indigo-600 text-white',
  delete: 'bg-red-500 hover:bg-red-600 text-white',
  sync: 'bg-blue-500 hover:bg-blue-600 text-white',
};

export function getVisibleActions(
  plan: { actions?: { enabled?: string[]; hiddenIn?: string[] } },
  context: string
): string[] {
  return (plan.actions?.enabled || []).filter(
    action => !(plan.actions?.hiddenIn || []).includes(context)
  );
}

// ── 优先级颜色映射 ──
export const PRIORITY_COLORS: Record<string, string> = {
  high: '#ef4444', medium: '#f59e0b', low: '#22c55e',
};

// ── 变体边框映射 ──
export const VARIANT_BORDERS: Record<string, string> = {
  default: 'border-border', success: 'border-green-400/50',
  warning: 'border-amber-400/50', danger: 'border-red-400/50',
  info: 'border-blue-400/50',
};
