import { useState } from 'react';
import { RotateCcw, Loader2, CheckCircle, CalendarIcon } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { format, endOfMonth, addDays, isAfter } from 'date-fns';
import { cn } from '@/lib/utils';

interface MaintenanceResetModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function MaintenanceResetModal({ open, onOpenChange }: MaintenanceResetModalProps) {
  const [resetting, setResetting] = useState(false);
  const [resetResult, setResetResult] = useState<{ updated: number; reminded: number } | null>(null);
  const [selectedDate, setSelectedDate] = useState<Date>(endOfMonth(new Date()));
  const [calendarOpen, setCalendarOpen] = useState(false);

  const handleResetMaintenanceDates = async () => {
    setResetting(true);
    setResetResult(null);

    try {
      const today = new Date();
      const targetDate = selectedDate;
      const reminderDate = addDays(targetDate, -7);

      const { data: schedules, error: fetchError } = await supabase
        .from('maintenance_schedules')
        .select('*')
        .eq('is_active', true)
        .eq('frequency', 'monthly');

      if (fetchError) throw fetchError;

      if (!schedules || schedules.length === 0) {
        toast.info('没有找到需要重置的月度维护计划');
        setResetting(false);
        return;
      }

      let updatedCount = 0;
      let remindedCount = 0;

      // Batch fetch equipment info for better email content (name/type/responsible)
      const equipmentIds = Array.from(new Set((schedules || []).map((s: any) => s.equipment_id).filter(Boolean)));
      const equipmentMap = new Map<string, { name: string | null; type: string | null; responsible: string | null }>();
      if (equipmentIds.length > 0) {
        const { data: equipmentRows } = await supabase
          .from('equipment')
          .select('id, name, type, responsible')
          .in('id', equipmentIds);

        (equipmentRows || []).forEach((e: any) => {
          equipmentMap.set(e.id, {
            name: e.name ?? null,
            type: e.type ?? null,
            responsible: e.responsible ?? null,
          });
        });
      }

      for (const schedule of schedules) {
        const { error: updateError } = await supabase
          .from('maintenance_schedules')
          .update({
            next_due_date: format(targetDate, 'yyyy-MM-dd'),
            reminder_sent: false,
            updated_at: new Date().toISOString()
          })
          .eq('id', schedule.id);

        if (updateError) {
          console.error('Error updating schedule:', updateError);
          continue;
        }

        updatedCount++;

        if (isAfter(today, reminderDate) || format(today, 'yyyy-MM-dd') === format(reminderDate, 'yyyy-MM-dd')) {
          const recipients = [
            schedule.assigned_email,
            'zhifu.feng@brightfuture.com.hk'
          ].filter(Boolean);

          const eq = equipmentMap.get(schedule.equipment_id);
          const equipmentList = [
            {
              scheduleId: schedule.id,
              equipmentId: schedule.equipment_id,
              equipmentName: eq?.name || schedule.equipment_id,
              equipmentType: eq?.type || '未分类',
              maintenanceTitle: schedule.title,
              description: schedule.description?.trim() || `${schedule.title} - ${(eq?.name || schedule.equipment_id)}`,
              dueDate: format(targetDate, 'yyyy-MM-dd'),
              frequency: schedule.frequency,
              assignedPerson: schedule.assigned_name || eq?.responsible || '未指定',
            },
          ];

          for (const email of recipients) {
            try {
              await supabase.functions.invoke('send-equipment-notification', {
                body: {
                  status: 'maintenance-batch-reminder',
                  reporterName: '系统',
                  adminEmail: email,
                  equipmentList,
                }
              });
              remindedCount++;
            } catch (emailError) {
              console.error('Error sending reminder:', emailError);
            }
          }
        }
      }

      setResetResult({ updated: updatedCount, reminded: remindedCount });
      toast.success(`成功重置 ${updatedCount} 个维护计划，发送 ${remindedCount} 封提醒邮件`);
    } catch (error) {
      console.error('Error resetting maintenance dates:', error);
      toast.error('重置失败，请稍后重试');
    } finally {
      setResetting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <RotateCcw className="h-5 w-5" />
            一键重置维护日期
          </DialogTitle>
          <DialogDescription>
            将所有月度维护计划的下次维护日期重置到选定日期，并在到期前7天发送提醒邮件
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Date Picker */}
          <div className="space-y-2">
            <label className="text-sm font-medium">选择重置日期</label>
            <Popover open={calendarOpen} onOpenChange={setCalendarOpen}>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  className={cn(
                    "w-full justify-start text-left font-normal",
                    !selectedDate && "text-muted-foreground"
                  )}
                >
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {selectedDate ? format(selectedDate, 'yyyy-MM-dd') : '选择日期'}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0 z-[9999]" align="start">
                <Calendar
                  mode="single"
                  selected={selectedDate}
                  onSelect={(date) => {
                    if (date) {
                      setSelectedDate(date);
                      setCalendarOpen(false);
                    }
                  }}
                  initialFocus
                  className="p-3 pointer-events-auto"
                />
              </PopoverContent>
            </Popover>
          </div>

          <div className="text-sm text-muted-foreground bg-muted p-3 rounded-md">
            <p>此操作将：</p>
            <ul className="list-disc list-inside mt-1 space-y-1">
              <li>重置所有月度维护计划的到期日期为 <strong>{format(selectedDate, 'yyyy-MM-dd')}</strong></li>
              <li>如果距离到期日不足7天，立即发送提醒邮件</li>
              <li>重置提醒发送状态以便下次再次提醒</li>
            </ul>
          </div>

          {resetResult && (
            <div className="flex items-center gap-2 text-sm text-primary bg-primary/10 p-3 rounded-md">
              <CheckCircle className="h-4 w-4" />
              <span>已更新 {resetResult.updated} 个计划，发送 {resetResult.reminded} 封邮件</span>
            </div>
          )}

          <Button 
            onClick={handleResetMaintenanceDates}
            disabled={resetting || !selectedDate}
            className="w-full"
          >
            {resetting ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                正在处理...
              </>
            ) : (
              <>
                <RotateCcw className="h-4 w-4 mr-2" />
                执行重置
              </>
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}