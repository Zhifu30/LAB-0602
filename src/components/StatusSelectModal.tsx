import React from 'react';
import { X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Equipment, statusLabels, statusIcons } from '@/types/equipment';

interface StatusSelectModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentStatus: Equipment['status'];
  onStatusChange: (status: Equipment['status']) => void;
  equipmentId: string;
}

const StatusSelectModal: React.FC<StatusSelectModalProps> = ({
  isOpen,
  onClose,
  currentStatus,
  onStatusChange,
  equipmentId
}) => {
  if (!isOpen) return null;

  const handleStatusSelect = (status: Equipment['status']) => {
    onStatusChange(status);
    onClose();
  };

  const getStatusColor = (status: Equipment['status']) => {
    const statusColorMap: Record<Equipment['status'], string> = {
      'available': '#22c55e',     // 绿色
      'in-use': '#3b82f6',       // 蓝色
      'calibration': '#f59e0b',   // 黄色
      'out-of-order': '#ef4444', // 红色
      'scrapped': '#92400e'      // 深褐色
    };
    return statusColorMap[status] || '#6b7280';
  };

  const statusOptions: Equipment['status'][] = ['available', 'in-use', 'calibration', 'out-of-order', 'scrapped'];

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl max-w-sm w-full shadow-2xl">
        <div className="flex justify-between items-center p-6 border-b bg-gradient-to-r from-blue-50 to-purple-50">
          <h2 className="text-lg font-bold text-gray-800">选择设备状态</h2>
          <Button variant="ghost" size="sm" onClick={onClose} className="text-gray-500 hover:text-gray-700">
            <X className="h-4 w-4" />
          </Button>
        </div>

        <div className="p-6 space-y-4">
          <div className="text-center mb-4">
            <p className="text-sm text-gray-600">设备编号: {equipmentId}</p>
          </div>

          <div className="space-y-3">
            {statusOptions.map((status) => {
              const isSelected = status === currentStatus;
              const statusColor = getStatusColor(status);
              
              return (
                <button
                  key={status}
                  onClick={() => handleStatusSelect(status)}
                  className={`w-full p-4 rounded-lg border-2 transition-all duration-200 hover:scale-105 ${
                    isSelected 
                      ? 'border-current shadow-lg' 
                      : 'border-gray-200 hover:border-gray-300'
                  }`}
                  style={{
                    backgroundColor: isSelected ? `${statusColor}15` : 'white',
                    borderColor: isSelected ? statusColor : undefined,
                    boxShadow: isSelected ? `0 4px 20px ${statusColor}30` : undefined
                  }}
                >
                  <div className="flex items-center justify-center gap-3">
                    <span 
                      className="text-2xl"
                      style={{ color: statusColor }}
                    >
                      {statusIcons[status]}
                    </span>
                    <span 
                      className="font-semibold text-lg"
                      style={{ color: isSelected ? statusColor : '#374151' }}
                    >
                      {statusLabels[status]}
                    </span>
                  </div>
                </button>
              );
            })}
          </div>

          <div className="mt-6 pt-4 border-t">
            <Button
              variant="outline"
              onClick={onClose}
              className="w-full"
            >
              取消
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default StatusSelectModal;