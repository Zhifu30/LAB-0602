import React, { useState, useRef } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Part, PartTransaction } from '@/types/parts';
import { toast } from 'sonner';

interface PartTransactionModalProps {
  isOpen: boolean;
  onClose: () => void;
  onTransaction: (transaction: Omit<PartTransaction, 'id' | 'createdAt'>) => Promise<void>;
  partId: string | null;
  type: 'in' | 'out';
  parts: Part[];
}

const PartTransactionModal: React.FC<PartTransactionModalProps> = ({ 
  isOpen, 
  onClose, 
  onTransaction, 
  partId, 
  type, 
  parts 
}) => {
  const [formData, setFormData] = useState({
    quantity: 1,
    equipmentId: '',
    userId: '',
    userName: '',
    notes: ''
  });
  const [loading, setLoading] = useState(false);
  const [signature, setSignature] = useState('');
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isDrawing, setIsDrawing] = useState(false);

  const part = partId ? parts.find(p => p.id === partId) : null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!partId || !formData.userName) {
      toast.error('请填写必要信息');
      return;
    }

    if (type === 'out' && part && formData.quantity > part.remainingStock) {
      toast.error('出库数量不能超过剩余库存');
      return;
    }

    setLoading(true);
    try {
      await onTransaction({
        partId,
        type,
        quantity: formData.quantity,
        equipmentId: formData.equipmentId || undefined,
        userId: formData.userId || 'system',
        userName: formData.userName,
        signature: signature || undefined,
        notes: formData.notes || undefined,
        transactionDate: new Date().toISOString()
      });
      
      // 重置表单
      setFormData({
        quantity: 1,
        equipmentId: '',
        userId: '',
        userName: '',
        notes: ''
      });
      setSignature('');
      clearCanvas();
      
      onClose();
    } catch (error) {
      console.error('Failed to add transaction:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleChange = (field: string, value: string | number) => {
    setFormData(prev => ({
      ...prev,
      [field]: value
    }));
  };

  // 简单的手写签名功能
  const startDrawing = (e: React.MouseEvent<HTMLCanvasElement>) => {
    setIsDrawing(true);
    const canvas = canvasRef.current;
    if (canvas) {
      const rect = canvas.getBoundingClientRect();
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.beginPath();
        ctx.moveTo(e.clientX - rect.left, e.clientY - rect.top);
      }
    }
  };

  const draw = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!isDrawing) return;
    const canvas = canvasRef.current;
    if (canvas) {
      const rect = canvas.getBoundingClientRect();
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.lineTo(e.clientX - rect.left, e.clientY - rect.top);
        ctx.stroke();
      }
    }
  };

  const stopDrawing = () => {
    setIsDrawing(false);
    const canvas = canvasRef.current;
    if (canvas) {
      setSignature(canvas.toDataURL());
    }
  };

  const clearCanvas = () => {
    const canvas = canvasRef.current;
    if (canvas) {
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
      }
    }
    setSignature('');
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {type === 'in' ? '配件入库' : '配件出库'}
            {part && ` - ${part.name}`}
          </DialogTitle>
        </DialogHeader>
        
        {part && (
          <div className="bg-slate-50 p-4 rounded-lg mb-4">
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>配件名称: <span className="font-medium">{part.name}</span></div>
              <div>配件编号: <span className="font-medium">{part.id}</span></div>
              <div>当前库存: <span className="font-medium text-blue-600">{part.remainingStock}</span></div>
              <div>条形码: <span className="font-medium">{part.barcode}</span></div>
            </div>
          </div>
        )}
        
        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label htmlFor="quantity">{type === 'in' ? '入库' : '出库'}数量 *</Label>
              <Input
                id="quantity"
                type="number"
                value={formData.quantity}
                onChange={(e) => handleChange('quantity', parseInt(e.target.value) || 1)}
                min="1"
                max={type === 'out' ? part?.remainingStock : undefined}
                required
              />
            </div>

            <div>
              <Label htmlFor="userName">操作人员 *</Label>
              <Input
                id="userName"
                value={formData.userName}
                onChange={(e) => handleChange('userName', e.target.value)}
                placeholder="请输入操作人员姓名"
                required
              />
            </div>

            {type === 'out' && (
              <div>
                <Label htmlFor="equipmentId">关联设备</Label>
                <Input
                  id="equipmentId"
                  value={formData.equipmentId}
                  onChange={(e) => handleChange('equipmentId', e.target.value)}
                  placeholder="例如: QRE-001"
                />
              </div>
            )}

            <div>
              <Label htmlFor="userId">用户ID</Label>
              <Input
                id="userId"
                value={formData.userId}
                onChange={(e) => handleChange('userId', e.target.value)}
                placeholder="例如: 工号或用户ID"
              />
            </div>
          </div>

          <div>
            <Label htmlFor="notes">备注</Label>
            <Textarea
              id="notes"
              value={formData.notes}
              onChange={(e) => handleChange('notes', e.target.value)}
              placeholder="备注信息..."
              rows={3}
            />
          </div>

          {/* 手写签名 */}
          <div>
            <Label>操作人员签名</Label>
            <div className="border border-slate-300 rounded-lg p-4 bg-white">
              <canvas
                ref={canvasRef}
                width={400}
                height={150}
                className="border border-slate-200 cursor-crosshair w-full"
                onMouseDown={startDrawing}
                onMouseMove={draw}
                onMouseUp={stopDrawing}
                onMouseLeave={stopDrawing}
              />
              <div className="mt-2">
                <Button type="button" variant="outline" size="sm" onClick={clearCanvas}>
                  清除签名
                </Button>
              </div>
            </div>
          </div>

          <div className="flex justify-end gap-3">
            <Button type="button" variant="outline" onClick={onClose}>
              取消
            </Button>
            <Button type="submit" disabled={loading}>
              {loading ? '处理中...' : (type === 'in' ? '确认入库' : '确认出库')}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
};

export default PartTransactionModal;