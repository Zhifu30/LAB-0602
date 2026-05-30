import React, { useState, useEffect } from 'react';
import { format } from 'date-fns';
import { zhCN } from 'date-fns/locale';
import { CalendarIcon, Check, X, Wrench, Calendar } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Calendar as CalendarComponent } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';
import { Equipment } from '@/types/equipment';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface BatchDateEditModalProps {
  isOpen: boolean;
  onClose: () => void;
  equipment: Equipment[];
  onUpdate: () => void;
}

const BatchDateEditModal: React.FC<BatchDateEditModalProps> = ({
  isOpen,
  onClose,
  equipment,
  onUpdate
}) => {
  const [selectedEquipmentIds, setSelectedEquipmentIds] = useState<Set<string>>(new Set());
  const [calibrationDate, setCalibrationDate] = useState<Date | undefined>();
  const [activeTab, setActiveTab] = useState('calibration');
  const [updating, setUpdating] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setSelectedEquipmentIds(new Set());
      setCalibrationDate(undefined);
    }
  }, [isOpen]);

  const toggleEquipment = (id: string) => {
    const newSet = new Set(selectedEquipmentIds);
    if (newSet.has(id)) {
      newSet.delete(id);
    } else {
      newSet.add(id);
    }
    setSelectedEquipmentIds(newSet);
  };

  const selectAll = () => {
    setSelectedEquipmentIds(new Set(equipment.map(eq => eq.id)));
  };

  const deselectAll = () => {
    setSelectedEquipmentIds(new Set());
  };

  const handleUpdateCalibrationDates = async () => {
    if (!calibrationDate || selectedEquipmentIds.size === 0) {
      toast.error('请选择设备和日期');
      return;
    }

    setUpdating(true);
    try {
      const dateStr = format(calibrationDate, 'yyyy-MM-dd');
      const ids = Array.from(selectedEquipmentIds);

      const { error } = await supabase
        .from('equipment')
        .update({ 
          next_calibration_date: dateStr,
          calibration_reminder_sent: false
        })
        .in('id', ids);

      if (error) throw error;

      toast.success(`成功更新 ${ids.length} 台设备的校正日期`);
      onUpdate();
      onClose();
    } catch (error) {
      console.error('Error updating calibration dates:', error);
      toast.error('更新校正日期失败');
    } finally {
      setUpdating(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[80vh]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Calendar className="h-5 w-5" />
            批量编辑日期
          </DialogTitle>
        </DialogHeader>

        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="grid w-full grid-cols-1">
            <TabsTrigger value="calibration" className="flex items-center gap-2">
              <CalendarIcon className="h-4 w-4" />
              校正日期
            </TabsTrigger>
          </TabsList>

          <TabsContent value="calibration" className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" onClick={selectAll}>
                  全选
                </Button>
                <Button variant="outline" size="sm" onClick={deselectAll}>
                  取消全选
                </Button>
                <Badge variant="secondary">
                  已选择 {selectedEquipmentIds.size} 台设备
                </Badge>
              </div>

              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className={cn(
                      "w-[200px] justify-start text-left font-normal",
                      !calibrationDate && "text-muted-foreground"
                    )}
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {calibrationDate ? format(calibrationDate, "yyyy-MM-dd") : "选择日期"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="end">
                  <CalendarComponent
                    mode="single"
                    selected={calibrationDate}
                    onSelect={setCalibrationDate}
                    initialFocus
                    className="p-3 pointer-events-auto"
                  />
                </PopoverContent>
              </Popover>
            </div>

            <ScrollArea className="h-[300px] border rounded-lg p-2">
              <div className="space-y-2">
                {equipment.filter(eq => eq.status !== 'scrapped').map((eq) => (
                  <div
                    key={eq.id}
                    className={cn(
                      "flex items-center justify-between p-3 rounded-lg border cursor-pointer transition-colors",
                      selectedEquipmentIds.has(eq.id) 
                        ? "bg-primary/10 border-primary" 
                        : "hover:bg-muted/50"
                    )}
                    onClick={() => toggleEquipment(eq.id)}
                  >
                    <div className="flex items-center gap-3">
                      <Checkbox
                        checked={selectedEquipmentIds.has(eq.id)}
                        onCheckedChange={() => toggleEquipment(eq.id)}
                      />
                      <div>
                        <div className="font-medium text-sm">{eq.name}</div>
                        <div className="text-xs text-muted-foreground">{eq.id} · {eq.model}</div>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-xs text-muted-foreground">当前校正日期</div>
                      <div className="text-sm font-medium">
                        {eq.nextCalibrationDate || '未设置'}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </ScrollArea>
          </TabsContent>
        </Tabs>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            取消
          </Button>
          <Button 
            onClick={handleUpdateCalibrationDates}
            disabled={updating || selectedEquipmentIds.size === 0 || !calibrationDate}
          >
            {updating ? '更新中...' : `更新 ${selectedEquipmentIds.size} 台设备`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default BatchDateEditModal;
