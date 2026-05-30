import React, { useState } from 'react';
import { X, QrCode } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useEquipment } from '@/hooks/useEquipment';
import { EquipmentStatus, statusLabels } from '@/types/equipment';

interface QRScannerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onScan: (result: string) => void;
  allowStatusChange?: boolean;
}

const QRScannerModal: React.FC<QRScannerModalProps> = ({
  isOpen,
  onClose,
  onScan,
  allowStatusChange = true
}) => {
  const [manualInput, setManualInput] = useState('');
  const [foundEquipment, setFoundEquipment] = useState<any>(null);
  const [newStatus, setNewStatus] = useState<EquipmentStatus>('available');
  const { equipment, updateEquipment } = useEquipment();

  const handleSearch = () => {
    if (manualInput.trim()) {
      const found = equipment.find(eq => eq.id === manualInput.trim());
      if (found) {
        setFoundEquipment(found);
        setNewStatus(found.status);
      } else {
        onScan(manualInput.trim());
        setManualInput('');
      }
    }
  };

  const handleStatusUpdate = async () => {
    if (foundEquipment && newStatus !== foundEquipment.status) {
      await updateEquipment(foundEquipment.id, { ...foundEquipment, status: newStatus });
      setFoundEquipment({ ...foundEquipment, status: newStatus });
    }
  };

  const handleManualSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    handleSearch();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg max-w-md w-full">
        <div className="flex justify-between items-center p-6 border-b">
          <h2 className="text-xl font-semibold">二维码扫描</h2>
          <Button variant="ghost" size="sm" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        </div>

        <div className="p-6">
          <div className="text-center mb-6">
            <div className="mx-auto w-24 h-24 bg-gray-100 rounded-lg flex items-center justify-center mb-4">
              <QrCode className="h-12 w-12 text-gray-400" />
            </div>
            <p className="text-gray-600">
              在移动设备上，您可以使用摄像头扫描二维码。
              <br />
              在桌面设备上，请手动输入仪器编号。
            </p>
          </div>

          <form onSubmit={handleManualSubmit} className="space-y-4">
            <div>
              <Label htmlFor="equipmentId">仪器编号</Label>
              <Input
                id="equipmentId"
                value={manualInput}
                onChange={(e) => setManualInput(e.target.value)}
                placeholder="请输入仪器编号"
              />
            </div>
            
            {foundEquipment && (
              <div className="border rounded-lg p-4 bg-gray-50">
                <h3 className="font-semibold mb-2">找到设备: {foundEquipment.name}</h3>
                <p className="text-sm text-gray-600 mb-3">
                  型号: {foundEquipment.model} | 位置: {foundEquipment.location}
                </p>
                
                {allowStatusChange && (
                  <div className="space-y-3">
                    <div>
                      <Label htmlFor="status">设备状态</Label>
                      <Select value={newStatus} onValueChange={(value: EquipmentStatus) => setNewStatus(value)}>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {Object.entries(statusLabels).map(([key, label]) => (
                            <SelectItem key={key} value={key}>{label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    {newStatus !== foundEquipment.status && (
                      <Button 
                        type="button" 
                        onClick={handleStatusUpdate}
                        className="w-full bg-green-600 hover:bg-green-700"
                      >
                        更新状态
                      </Button>
                    )}
                  </div>
                )}
              </div>
            )}
            
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={onClose}>
                取消
              </Button>
              <Button type="submit" className="bg-blue-600 hover:bg-blue-700">
                查找仪器
              </Button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};

export default QRScannerModal;