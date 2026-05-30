import React, { useState, useEffect } from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Calendar, Check, X } from 'lucide-react';
import { Equipment } from '@/types/equipment';

interface QuickCalibrationDateEditorProps {
  equipment: Equipment;
  onUpdate: (date: string) => void;
}

const QuickCalibrationDateEditor: React.FC<QuickCalibrationDateEditorProps> = ({
  equipment,
  onUpdate
}) => {
  const [isEditing, setIsEditing] = useState(false);
  const [date, setDate] = useState(equipment.nextCalibrationDate || '');

  // 当设备数据变化时同步更新本地状态
  useEffect(() => {
    setDate(equipment.nextCalibrationDate || '');
  }, [equipment.nextCalibrationDate]);

  const handleSave = async () => {
    try {
      await onUpdate(date);
      setIsEditing(false);
    } catch (error) {
      console.error('Error saving calibration date:', error);
    }
  };

  const handleCancel = () => {
    setDate(equipment.nextCalibrationDate || '');
    setIsEditing(false);
  };

  // 计算日期紧急程度
  const getDateUrgencyStyles = (dateStr: string | null | undefined) => {
    if (!dateStr) return 'border-muted-foreground/30 bg-muted/50';
    const today = new Date();
    const targetDate = new Date(dateStr);
    const daysUntil = Math.ceil((targetDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
    
    if (daysUntil < 0) return 'border-red-500 bg-red-50 text-red-700';
    if (daysUntil <= 7) return 'border-orange-500 bg-orange-50 text-orange-700';
    if (daysUntil <= 30) return 'border-yellow-500 bg-yellow-50 text-yellow-700';
    return 'border-green-500 bg-green-50 text-green-700';
  };

  if (isEditing) {
    return (
      <div className="flex items-center gap-2 p-2 border rounded-lg bg-muted/50">
        <Calendar className="h-4 w-4 text-muted-foreground" />
        <Input
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          className="flex-1 h-8"
        />
        <Button size="sm" variant="ghost" onClick={handleSave} className="text-green-600 hover:text-green-700">
          <Check className="h-4 w-4" />
        </Button>
        <Button size="sm" variant="ghost" onClick={handleCancel} className="text-red-600 hover:text-red-700">
          <X className="h-4 w-4" />
        </Button>
      </div>
    );
  }

  return (
    <Button
      variant="outline"
      size="sm"
      onClick={() => setIsEditing(true)}
      className={`flex items-center gap-2 ${getDateUrgencyStyles(equipment.nextCalibrationDate)}`}
    >
      <Calendar className="h-4 w-4" />
      <span className="text-sm">
        {equipment.nextCalibrationDate ? `校正: ${equipment.nextCalibrationDate}` : '设置校正日期'}
      </span>
    </Button>
  );
};

export default QuickCalibrationDateEditor;