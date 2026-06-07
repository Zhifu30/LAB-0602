import React, { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import GlassModal from '@/components/GlassModal';
import {
  defaultPlanFormData,
  FREQUENCY_LABELS,
  FREQUENCY_OPTIONS,
  MaintenancePlanFormData,
} from '@/types/maintenance';

interface MaintenancePlanFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  initialData?: Partial<MaintenancePlanFormData>;
  onSubmit: (data: MaintenancePlanFormData) => void | Promise<void>;
  submitLabel?: string;
}

const inputCls = 'bg-white/10 border-white/20 text-white placeholder:text-white/50';

export const MaintenancePlanFormDialog: React.FC<MaintenancePlanFormDialogProps> = ({
  open,
  onOpenChange,
  title,
  description,
  initialData,
  onSubmit,
  submitLabel = '保存',
}) => {
  const [formData, setFormData] = useState<MaintenancePlanFormData>(defaultPlanFormData());
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (open) setFormData({ ...defaultPlanFormData(), ...initialData });
  }, [open, initialData]);

  const patch = (partial: Partial<MaintenancePlanFormData>) =>
    setFormData((prev) => ({ ...prev, ...partial }));

  const handleSubmit = async () => {
    setSubmitting(true);
    try {
      await onSubmit(formData);
      onOpenChange(false);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <GlassModal
      open={open}
      onClose={() => onOpenChange(false)}
      title={title}
      description={description}
      footer={
        <>
          <Button variant="outline" className="bg-white/10 border-white/20 text-white hover:bg-white/20" onClick={() => onOpenChange(false)} disabled={submitting}>
            取消
          </Button>
          <Button onClick={handleSubmit} disabled={submitting}>
            {submitting ? '保存中...' : submitLabel}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="space-y-2">
          <Label className="text-white/80">计划标题 *</Label>
          <Input value={formData.title} onChange={(e) => patch({ title: e.target.value })} placeholder="输入维护计划标题" className={inputCls} />
        </div>
        <div className="space-y-2">
          <Label className="text-white/80">描述</Label>
          <Textarea value={formData.description} onChange={(e) => patch({ description: e.target.value })} placeholder="输入维护描述" rows={2} className={inputCls} />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label className="text-white/80">维护周期</Label>
            <Select value={formData.frequency} onValueChange={(v) => patch({ frequency: v as MaintenancePlanFormData['frequency'] })}>
              <SelectTrigger className={inputCls}><SelectValue /></SelectTrigger>
              <SelectContent>
                {FREQUENCY_OPTIONS.map((f) => (
                  <SelectItem key={f} value={f}>{FREQUENCY_LABELS[f]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label className="text-white/80">提前提醒天数</Label>
            <Input
              type="number"
              min={1}
              max={30}
              value={formData.reminder_days_before}
              onChange={(e) => patch({ reminder_days_before: parseInt(e.target.value) || 7 })}
              className={inputCls}
            />
          </div>
        </div>
      </div>
    </GlassModal>
  );
};

export default MaintenancePlanFormDialog;
