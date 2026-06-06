import React from 'react';
import { Calendar, Bell, User, Link2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';

const frequencyLabels: Record<string, string> = {
  daily: '每日', weekly: '每周', monthly: '每月', quarterly: '每季度', yearly: '每年'
};

export interface MaintenancePlanCardProps {
  title: string;
  description?: string | null;
  frequency: string;
  nextDueDate?: string;
  assignedName?: string;
  reminderDaysBefore?: number;
  daysUntilDue?: number;
  reminderSent?: boolean;
  equipmentIds?: string[];
  actions?: React.ReactNode;
  className?: string;
}

const MaintenancePlanCard: React.FC<MaintenancePlanCardProps> = ({
  title, description, frequency, nextDueDate, assignedName,
  reminderDaysBefore, daysUntilDue, reminderSent, equipmentIds, actions, className
}) => {
  const isOverdue = daysUntilDue !== undefined && daysUntilDue < 0;
  const freqLabel = frequencyLabels[frequency] || frequency;

  return (
    <div className={`p-2 rounded-lg bg-white/5 border border-white/10 hover:bg-white/10 transition-colors ${className || ''}`}>
      {/* 标题行 + 按钮 */}
      <div className="flex items-center gap-1.5 mb-0.5 flex-wrap">
        <span className="font-medium text-white text-xs">{title}</span>
        <Badge variant="outline" className="border-white/30 text-white/80 text-xs">{freqLabel}</Badge>
        {daysUntilDue !== undefined && (
          <Badge className={`text-xs ${isOverdue ? 'bg-red-500 text-white' : 'bg-white/20 text-white/80'}`}>
            {isOverdue ? `已过期 ${Math.abs(daysUntilDue)} 天` :
             daysUntilDue === 0 ? '今天到期' : `${daysUntilDue} 天后到期`}
          </Badge>
        )}
        {reminderSent && (
          <Badge variant="secondary" className="text-xs bg-white/20 text-white/80">已发送提醒</Badge>
        )}
        {actions && <span className="flex items-center gap-1 ml-auto">{actions}</span>}
      </div>

      {/* 描述 */}
      {description && (
        <p className="text-sm text-white font-bold mb-2 whitespace-pre-line">{description}</p>
      )}

      {/* 底部信息行 */}
      <div className="text-xs text-white/50 flex items-center gap-3 flex-wrap">
        {nextDueDate && (
          <span className="flex items-center gap-1">
            <div className="p-0.5 bg-blue-500 rounded"><Calendar className="h-2.5 w-2.5 text-white" /></div>
            下次: {nextDueDate}
          </span>
        )}
        {assignedName && (
          <span className="flex items-center gap-1">
            <div className="p-0.5 bg-purple-500 rounded"><User className="h-2.5 w-2.5 text-white" /></div>
            {assignedName}
          </span>
        )}
        {reminderDaysBefore !== undefined && (
          <span className="flex items-center gap-1">
            <div className="p-0.5 bg-orange-500 rounded"><Bell className="h-2.5 w-2.5 text-white" /></div>
            提前 {reminderDaysBefore} 天提醒
          </span>
        )}
        {equipmentIds && equipmentIds.length > 0 && (
          <span className="flex items-center gap-1">
            <div className="p-0.5 bg-green-500 rounded"><Link2 className="h-2.5 w-2.5 text-white" /></div>
            {equipmentIds.join('、')}
          </span>
        )}
      </div>
    </div>
  );
};

export default MaintenancePlanCard;
