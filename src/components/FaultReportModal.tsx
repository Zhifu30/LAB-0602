import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Camera, Upload } from 'lucide-react';
import ImageUploader from '@/components/ImageUploader';
import { Equipment } from '@/types/equipment';

interface FaultReportModalProps {
  isOpen: boolean;
  onClose: () => void;
  equipment: Equipment;
  onSubmit: (data: FaultReportData) => void;
}

export interface FaultReportData {
  reason: string;
  customReason?: string;
  description: string;
  imageUrl?: string;
}

const predefinedReasons = [
  '设备无法启动',
  '读数不准确',
  '噪音异常',
  '温度异常',
  '连接问题',
  '软件故障',
  '硬件损坏',
  '校准失败',
  '其他'
];

const FaultReportModal: React.FC<FaultReportModalProps> = ({
  isOpen,
  onClose,
  equipment,
  onSubmit
}) => {
  const [reason, setReason] = useState('');
  const [customReason, setCustomReason] = useState('');
  const [description, setDescription] = useState('');
  const [imageUrl, setImageUrl] = useState('');

  const handleSubmit = () => {
    if (!reason) return;

    const reportData: FaultReportData = {
      reason: reason === '其他' ? customReason : reason,
      customReason: reason === '其他' ? customReason : undefined,
      description,
      imageUrl: imageUrl || undefined
    };

    onSubmit(reportData);
    onClose();
    
    // Reset form
    setReason('');
    setCustomReason('');
    setDescription('');
    setImageUrl('');
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>故障报告 - {equipment.name}</DialogTitle>
        </DialogHeader>

        <div className="space-y-6">
          <div>
            <Label htmlFor="reason">故障原因</Label>
            <Select value={reason} onValueChange={setReason}>
              <SelectTrigger>
                <SelectValue placeholder="选择故障原因" />
              </SelectTrigger>
              <SelectContent>
                {predefinedReasons.map((reasonOption) => (
                  <SelectItem key={reasonOption} value={reasonOption}>
                    {reasonOption}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {reason === '其他' && (
            <div>
              <Label htmlFor="customReason">自定义原因</Label>
              <Textarea
                id="customReason"
                value={customReason}
                onChange={(e) => setCustomReason(e.target.value)}
                placeholder="请描述具体的故障原因"
                rows={2}
              />
            </div>
          )}

          <div>
            <Label htmlFor="description">详细描述</Label>
            <Textarea
              id="description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="请详细描述故障现象、发生时间等信息"
              rows={4}
            />
          </div>

          <div>
            <Label>故障照片</Label>
            <ImageUploader
              imageUrl={imageUrl}
              onImageChange={setImageUrl}
              equipmentModel={equipment.model}
              manufacturer={equipment.manufacturer}
            />
          </div>

          <div className="flex justify-end gap-3">
            <Button variant="outline" onClick={onClose}>
              取消
            </Button>
            <Button 
              onClick={handleSubmit}
              disabled={!reason || (reason === '其他' && !customReason.trim())}
            >
              提交故障报告
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default FaultReportModal;