import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { AlertTriangle } from 'lucide-react';
import { Equipment } from '@/types/equipment';

interface ScrapEquipmentModalProps {
  isOpen: boolean;
  onClose: () => void;
  equipment: Equipment | null;
  onConfirm: (password: string, reason: string) => void;
}

const ScrapEquipmentModal = ({ isOpen, onClose, equipment, onConfirm }: ScrapEquipmentModalProps) => {
  const [password, setPassword] = useState('');
  const [reason, setReason] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (password && reason) {
      onConfirm(password, reason);
      setPassword('');
      setReason('');
      onClose();
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-destructive">
            <AlertTriangle className="h-5 w-5" />
            设备报废确认
          </DialogTitle>
        </DialogHeader>
        
        <div className="space-y-4">
          <div className="p-4 bg-destructive/10 rounded-lg">
            <p className="text-sm text-destructive font-medium">
              警告：此操作将永久标记设备为报废状态
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              设备：{equipment?.name} ({equipment?.model})
            </p>
          </div>
          
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="scrap-password">管理员密码 *</Label>
              <Input
                id="scrap-password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="请输入管理员密码"
                required
              />
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="scrap-reason">报废原因 *</Label>
              <Textarea
                id="scrap-reason"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="请输入设备报废的具体原因..."
                rows={3}
                required
              />
            </div>
            
            <div className="flex gap-2 justify-end">
              <Button type="button" variant="outline" onClick={onClose}>
                取消
              </Button>
              <Button type="submit" variant="destructive">
                确认报废
              </Button>
            </div>
          </form>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default ScrapEquipmentModal;