import React, { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import GlassModal from '@/components/GlassModal';
import MaintenanceScheduleForm from './MaintenanceScheduleForm';
import {
  defaultScheduleFormData,
  MaintenanceScheduleFormData,
} from '@/types/maintenance';

interface UserOption {
  user_id: string;
  username: string;
  email?: string;
}

interface MaintenanceScheduleFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  initialData?: Partial<MaintenanceScheduleFormData>;
  users?: UserOption[];
  onSubmit: (data: MaintenanceScheduleFormData) => void | Promise<void>;
  submitLabel?: string;
  variant?: 'glass' | 'light';
  showAssignee?: boolean;
  showDate?: boolean;
  useGlassModal?: boolean;
}

export const MaintenanceScheduleFormDialog: React.FC<MaintenanceScheduleFormDialogProps> = ({
  open,
  onOpenChange,
  title,
  description,
  initialData,
  users = [],
  onSubmit,
  submitLabel = '保存',
  variant = 'glass',
  showAssignee = true,
  showDate = true,
  useGlassModal = false,
}) => {
  const [formData, setFormData] = useState<MaintenanceScheduleFormData>(defaultScheduleFormData());
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (open) {
      setFormData({ ...defaultScheduleFormData(), ...initialData });
    }
  }, [open, initialData]);

  const handleSubmit = async () => {
    setSubmitting(true);
    try {
      await onSubmit(formData);
      onOpenChange(false);
    } finally {
      setSubmitting(false);
    }
  };

  const form = (
    <MaintenanceScheduleForm
      data={formData}
      onChange={setFormData}
      users={users}
      variant={variant}
      showAssignee={showAssignee}
      showDate={showDate}
    />
  );

  const footer = (
    <>
      <Button
        variant="outline"
        className={variant === 'glass' ? 'bg-white/10 border-white/20 text-white hover:bg-white/20' : ''}
        onClick={() => onOpenChange(false)}
        disabled={submitting}
      >
        取消
      </Button>
      <Button onClick={handleSubmit} disabled={submitting}>
        {submitting ? '保存中...' : submitLabel}
      </Button>
    </>
  );

  if (useGlassModal) {
    return (
      <GlassModal open={open} onClose={() => onOpenChange(false)} title={title} description={description} footer={footer}>
        {form}
      </GlassModal>
    );
  }

  const dialogCls = variant === 'glass'
    ? 'bg-black/40 backdrop-blur-md border-white/20 text-white !z-[9999] max-w-md'
    : 'max-w-md';
  const overlayCls = variant === 'glass' ? 'bg-black/20 backdrop-blur-sm' : undefined;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent overlayClassName={overlayCls} className={dialogCls}>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description && <p className="text-sm text-white/60">{description}</p>}
        </DialogHeader>
        {form}
        <DialogFooter>{footer}</DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default MaintenanceScheduleFormDialog;
