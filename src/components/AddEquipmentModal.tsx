import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Equipment } from '@/types/equipment';
import EquipmentForm from '@/components/shared/EquipmentForm';

interface AddEquipmentModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAdd: (equipment: Equipment) => void;
  existingIds: string[];
}

const emptyEquipment = (): Partial<Equipment> => ({
  id: '',
  name: '',
  model: '',
  manufacturer: '',
  status: 'available',
  location: '',
  maintenanceDate: '',
  description: '',
  responsible: '',
  responsible_email: '',
  type: undefined,
  imageUrl: '',
  sopFileUrl: '',
  sopFileName: '',
});

const AddEquipmentModal: React.FC<AddEquipmentModalProps> = ({ isOpen, onClose, onAdd, existingIds }) => {
  const [formData, setFormData] = useState<Partial<Equipment>>(emptyEquipment());
  const [errors, setErrors] = useState<Record<string, string>>({});

  const handleChange = (field: keyof Equipment, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
    if (errors[field]) setErrors((prev) => ({ ...prev, [field]: '' }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const newErrors: Record<string, string> = {};
    if (!formData.id?.trim()) newErrors.id = '仪器编号不能为空';
    if (formData.id && existingIds.includes(formData.id)) newErrors.id = '仪器编号已存在';
    if (!formData.name?.trim()) newErrors.name = '仪器名称不能为空';
    if (!formData.model?.trim()) newErrors.model = '型号不能为空';
    if (!formData.manufacturer?.trim()) newErrors.manufacturer = '厂商不能为空';
    if (!formData.location?.trim()) newErrors.location = '位置不能为空';
    if (!formData.maintenanceDate) newErrors.maintenanceDate = '维护日期不能为空';
    if (!formData.responsible?.trim()) newErrors.responsible = '负责人不能为空';
    setErrors(newErrors);
    if (Object.keys(newErrors).length === 0) {
      onAdd(formData as Equipment);
      setFormData(emptyEquipment());
      setErrors({});
      onClose();
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>添加新仪器</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit}>
          <EquipmentForm
            equipment={formData}
            onChange={handleChange}
            mode="create"
            variant="light"
            errors={errors}
            footer={
              <div className="flex justify-end gap-2 pt-4">
                <Button type="button" variant="outline" onClick={onClose}>取消</Button>
                <Button type="submit" className="bg-blue-600 hover:bg-blue-700">添加仪器</Button>
              </div>
            }
          />
        </form>
      </DialogContent>
    </Dialog>
  );
};

export default AddEquipmentModal;
