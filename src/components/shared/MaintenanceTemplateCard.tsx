/**
 * 维护计划统一卡片组件 v6
 *
 * 所有维护模板展示复用此组件。
 * 通过 mode 控制各场景样式，通过 actions 控制按钮。
 */

import React from 'react';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import {
  PRIORITY_COLORS, VARIANT_BORDERS, MAINTENANCE_ICON_MAP,
  DEFAULT_ACTION_REGISTRY, ActionDef,
} from '@/utils/maintenanceActionRegistry';
import { Button } from '@/components/ui/button';
import { getDaysUntilDue } from '@/utils/maintenanceDateUtils';

export type CardMode = 'detail' | 'dashboard' | 'template-panel' | 'calendar' | 'equipment-card';

interface MaintenanceTemplateCardProps {
  schedule: {
    title: string;
    description?: string | null;
    frequency: string;
    next_due_date?: string;
    reminder_days_before?: number;
    assigned_name?: string | null;
    source?: 'ad-hoc' | 'template' | 'missing-template';
    equipment?: { name?: string; id?: string };
    display?: { color?: string; icon?: string; priority?: string; variant?: string; badgeLabel?: string };
    actions?: { enabled?: string[] };
  };
  mode?: CardMode;
  enabledActions?: Array<{ key: string; def: ActionDef; onClick: () => void }>;
  className?: string;
}

const frequencyLabels: Record<string, string> = {
  daily: '每日', weekly: '每周', monthly: '每月', quarterly: '每季度', yearly: '每年'
};

const MODE_STYLES: Record<CardMode, string> = {
  detail: 'w-full rounded-xl p-4',
  dashboard: 'h-[380px] rounded-2xl p-4',
  'template-panel': 'w-full rounded-lg p-3',
  calendar: 'text-[11px] px-1.5 py-0.5 rounded',
  'equipment-card': 'text-xs rounded-md px-2 py-1',
};

export const MaintenanceTemplateCard: React.FC<MaintenanceTemplateCardProps> = ({
  schedule, mode = 'detail', enabledActions, className,
}) => {
  const color = schedule.display?.color || '#6b7280';
  const IconComp = schedule.display?.icon ? MAINTENANCE_ICON_MAP[schedule.display.icon] : null;
  const variant = schedule.display?.variant || 'default';
  const borderCls = VARIANT_BORDERS[variant] || VARIANT_BORDERS.default;
  const days = schedule.next_due_date ? getDaysUntilDue(schedule.next_due_date) : undefined;
  const isCompact = mode === 'calendar' || mode === 'equipment-card';

  if (isCompact) {
    return (
      <div className={cn(MODE_STYLES[mode], 'flex items-center gap-1.5 truncate', className)} style={{ borderLeft: `3px solid ${color}` }}>
        {IconComp && <IconComp className="h-3 w-3 flex-shrink-0" />}
        <span className="truncate font-medium">{schedule.title}</span>
        {days !== undefined && days < 0 && <Badge variant="destructive" className="text-[9px] px-1 py-0">超期</Badge>}
      </div>
    );
  }

  return (
    <div className={cn(MODE_STYLES[mode], 'border bg-card text-card-foreground shadow-sm flex flex-col gap-2', borderCls, className)}>
      {/* 头部 */}
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-2 min-w-0">
          {IconComp && <IconComp className="h-4 w-4 flex-shrink-0" style={{ color }} />}
          <div className="min-w-0">
            <h4 className="text-sm font-semibold truncate">{schedule.title}</h4>
            <div className="flex items-center gap-1.5 mt-0.5">
              <Badge variant="outline" className="text-[10px] py-0 px-1.5">{frequencyLabels[schedule.frequency] || schedule.frequency}</Badge>
              {schedule.display?.priority && (
                <Badge className="text-[10px] py-0 px-1.5" style={{ background: PRIORITY_COLORS[schedule.display.priority] + '20', color: PRIORITY_COLORS[schedule.display.priority] }}>
                  {schedule.display.badgeLabel || schedule.display.priority}
                </Badge>
              )}
            </div>
          </div>
        </div>
        {schedule.source && (
          <Badge variant="secondary" className={cn('text-[9px] shrink-0 ml-2',
            schedule.source === 'template' ? 'bg-green-500/10 text-green-600' :
            schedule.source === 'missing-template' ? 'bg-red-500/10 text-red-600' : ''
          )}>
            {schedule.source === 'template' ? '🔗 模板' : schedule.source === 'missing-template' ? '⚠️ 缺失' : 'Ad-Hoc'}
          </Badge>
        )}
      </div>

      {/* 描述 */}
      {schedule.description && mode !== 'template-panel' && (
        <p className="text-xs text-muted-foreground line-clamp-2">{schedule.description}</p>
      )}

      {/* 状态信息 */}
      {days !== undefined && (
        <div className="flex items-center gap-3 text-[11px] text-muted-foreground">
          <span className={cn(days < 0 ? 'text-red-500 font-medium' : days === 0 ? 'text-amber-500 font-medium' : '')}>
            下次: {schedule.next_due_date} ({days < 0 ? `超期${Math.abs(days)}天` : days === 0 ? '今天' : `${days}天后`})
          </span>
          {schedule.assigned_name && <span>负责人: {schedule.assigned_name}</span>}
        </div>
      )}

      {/* 操作按钮 */}
      {enabledActions && enabledActions.length > 0 && (
        <div className="flex items-center gap-1.5 mt-1 pt-2 border-t">
          {enabledActions.map(({ key, def, onClick }) => (
            <Button key={key} variant={def.variant || 'outline'} size="sm" className="h-7 text-[10px] px-2"
              onClick={onClick}>
              <def.icon className="h-3 w-3 mr-1" />{def.label}
            </Button>
          ))}
        </div>
      )}
    </div>
  );
};

export default MaintenanceTemplateCard;
