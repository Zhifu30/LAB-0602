import React from 'react';
import { Calendar } from 'lucide-react';
import { format } from 'date-fns';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Calendar as CalendarComponent } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  FREQUENCY_LABELS,
  FREQUENCY_OPTIONS,
  MaintenanceScheduleFormData,
} from '@/types/maintenance';

interface UserOption {
  user_id: string;
  username: string;
  email?: string;
}

interface MaintenanceScheduleFormProps {
  data: MaintenanceScheduleFormData;
  onChange: (data: MaintenanceScheduleFormData) => void;
  users?: UserOption[];
  variant?: 'glass' | 'light';
  showAssignee?: boolean;
  showDate?: boolean;
  isTemplateLinked?: boolean; // ★ 模板锁：true 时锁定 title/desc/freq
}

const glassInput = 'bg-white/10 border-white/20 text-white placeholder:text-white/50';
const glassLabel = 'text-white/80';
const lightInput = '';
const lightLabel = '';

export const MaintenanceScheduleForm: React.FC<MaintenanceScheduleFormProps> = ({
  data,
  onChange,
  users = [],
  variant = 'glass',
  showAssignee = true,
  showDate = true,
  isTemplateLinked = false,
}) => {
  const isGlass = variant === 'glass';
  const inputCls = isGlass ? glassInput : lightInput;
  const labelCls = isGlass ? glassLabel : lightLabel;

  const patch = (partial: Partial<MaintenanceScheduleFormData>) =>
    onChange({ ...data, ...partial });

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label className={labelCls}>维护标题 *</Label>
        <Input
          value={data.title}
          onChange={(e) => patch({ title: e.target.value })}
          placeholder="例如: 月度保养、年度校正"
          className={inputCls}
          disabled={isTemplateLinked}
        />
        {isTemplateLinked && (
          <span className="text-[10px] text-amber-400 flex items-center gap-1 mt-0.5">
            🔗 继承自类型模板，不可在设备维度修改
          </span>
        )}
      </div>
      <div className="space-y-2">
        <Label className={labelCls}>维护内容</Label>
        <Textarea
          value={data.description}
          onChange={(e) => patch({ description: e.target.value })}
          placeholder="详细描述维护内容..."
          rows={3}
          className={inputCls}
          disabled={isTemplateLinked}
        />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label className={labelCls}>维护周期 *</Label>
          <Select value={data.frequency} onValueChange={(v) => patch({ frequency: v as MaintenanceScheduleFormData['frequency'] })} disabled={isTemplateLinked}>
            <SelectTrigger className={inputCls}><SelectValue /></SelectTrigger>
            <SelectContent>
              {FREQUENCY_OPTIONS.map((f) => (
                <SelectItem key={f} value={f}>{FREQUENCY_LABELS[f]}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        {showDate && (
          <div className="space-y-2">
            <Label className={labelCls}>下次维护日期 *</Label>
            {isGlass ? (
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className={`w-full justify-start text-left font-normal ${inputCls} hover:bg-white/20`}>
                    <Calendar className="mr-2 h-4 w-4" />
                    {data.next_due_date || '选择日期'}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0 z-[200]" align="start">
                  <CalendarComponent
                    mode="single"
                    selected={data.next_due_date ? new Date(data.next_due_date) : undefined}
                    onSelect={(date) => date && patch({ next_due_date: format(date, 'yyyy-MM-dd') })}
                    initialFocus
                    className="pointer-events-auto"
                  />
                </PopoverContent>
              </Popover>
            ) : (
              <Input
                type="date"
                value={data.next_due_date}
                onChange={(e) => patch({ next_due_date: e.target.value })}
                className={inputCls}
              />
            )}
          </div>
        )}
      </div>
      <div className={`grid gap-4 ${showAssignee ? 'grid-cols-2' : 'grid-cols-1'}`}>
        <div className="space-y-2">
          <Label className={labelCls}>提前提醒天数</Label>
          <Input
            type="number" min={1} max={90}
            value={data.reminder_days_before}
            onChange={(e) => patch({ reminder_days_before: parseInt(e.target.value) || 7 })}
            className={inputCls}
            disabled={isTemplateLinked}
          />
        </div>
        {showAssignee && users.length > 0 && (
          <div className="space-y-2">
            <Label className={labelCls}>指定维护人</Label>
            <Select
              value={data.assigned_user_id || '__none__'}
              onValueChange={(v) => patch({ assigned_user_id: v === '__none__' ? '' : v })}
            >
              <SelectTrigger className={inputCls}><SelectValue placeholder="选择维护人" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">不指定</SelectItem>
                {users.map((user) => (
                  <SelectItem key={user.user_id} value={user.user_id}>{user.username}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
      </div>
    </div>
  );
};

export default MaintenanceScheduleForm;
