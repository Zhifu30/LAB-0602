import React, { useState, useEffect } from 'react';
import { X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Equipment, EquipmentStatus, statusLabels, EquipmentType, equipmentTypeLabels } from '@/types/equipment';
import ImageUploader from '@/components/ImageUploader';
import SOPUploader from '@/components/SOPUploader';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface AddEquipmentModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAdd: (equipment: Equipment) => void;
  existingIds: string[];
}

interface UserProfile {
  user_id: string;
  username: string;
  email?: string;
}

const AddEquipmentModal: React.FC<AddEquipmentModalProps> = ({ isOpen, onClose, onAdd, existingIds }) => {
  const [formData, setFormData] = useState({
    id: '', name: '', model: '', manufacturer: '', status: 'available' as EquipmentStatus,
    location: '', maintenanceDate: '', description: '', responsible: '', responsible_email: '',
    type: undefined as EquipmentType | undefined, imageUrl: '', sopFileUrl: '', sopFileName: ''
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(true);

  useEffect(() => { if (isOpen) fetchUsers(); }, [isOpen]);

  const fetchUsers = async () => {
    try {
      const { data, error } = await supabase.from('profiles').select('user_id, username, email').order('username');
      if (error) throw error;
      setUsers(data || []);
    } catch (error) { console.error('Error fetching users:', error); toast.error('获取用户列表失败'); }
    finally { setLoadingUsers(false); }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const newErrors: Record<string, string> = {};
    if (!formData.id.trim()) newErrors.id = '仪器编号不能为空';
    if (existingIds.includes(formData.id)) newErrors.id = '仪器编号已存在';
    if (!formData.name.trim()) newErrors.name = '仪器名称不能为空';
    if (!formData.model.trim()) newErrors.model = '型号不能为空';
    if (!formData.manufacturer.trim()) newErrors.manufacturer = '厂商不能为空';
    if (!formData.location.trim()) newErrors.location = '位置不能为空';
    if (!formData.maintenanceDate) newErrors.maintenanceDate = '维护日期不能为空';
    if (!formData.responsible.trim()) newErrors.responsible = '负责人不能为空';
    setErrors(newErrors);
    if (Object.keys(newErrors).length === 0) {
      onAdd(formData as Equipment);
      setFormData({ id: '', name: '', model: '', manufacturer: '', status: 'available', location: '', maintenanceDate: '', description: '', responsible: '', responsible_email: '', type: undefined, imageUrl: '', sopFileUrl: '', sopFileName: '' });
      setErrors({});
    }
  };

  const handleChange = (field: keyof Equipment, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    if (errors[field]) setErrors(prev => ({ ...prev, [field]: '' }));
  };

  const handleResponsibleChange = (userId: string) => {
    const selectedUser = users.find(u => u.user_id === userId);
    if (selectedUser) {
      setFormData(prev => ({ ...prev, responsible: selectedUser.username, responsible_email: selectedUser.email || '' }));
      if (errors.responsible) setErrors(prev => ({ ...prev, responsible: '' }));
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg max-w-2xl w-full max-h-screen overflow-y-auto">
        <div className="flex justify-between items-center p-6 border-b">
          <h2 className="text-xl font-semibold">添加新仪器</h2>
          <Button variant="ghost" size="sm" onClick={onClose}><X className="h-4 w-4" /></Button>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div><Label htmlFor="id">仪器编号 *</Label><Input id="id" value={formData.id} onChange={(e) => handleChange('id', e.target.value)} placeholder="如: EQ001" className={errors.id ? 'border-red-500' : ''} />{errors.id && <p className="text-red-500 text-sm mt-1">{errors.id}</p>}</div>
            <div><Label htmlFor="name">仪器名称 *</Label><Input id="name" value={formData.name} onChange={(e) => handleChange('name', e.target.value)} placeholder="如: 离心机" className={errors.name ? 'border-red-500' : ''} />{errors.name && <p className="text-red-500 text-sm mt-1">{errors.name}</p>}</div>
            <div><Label htmlFor="type">设备类型</Label><Select value={formData.type || ''} onValueChange={(value: EquipmentType) => handleChange('type', value)}><SelectTrigger><SelectValue placeholder="选择设备类型" /></SelectTrigger><SelectContent>{Object.entries(equipmentTypeLabels).map(([key, label]) => (<SelectItem key={key} value={key}>{label}</SelectItem>))}</SelectContent></Select></div>
            <div><Label htmlFor="model">型号 *</Label><Input id="model" value={formData.model} onChange={(e) => handleChange('model', e.target.value)} placeholder="如: CF-16RX" className={errors.model ? 'border-red-500' : ''} />{errors.model && <p className="text-red-500 text-sm mt-1">{errors.model}</p>}</div>
            <div><Label htmlFor="manufacturer">厂商 *</Label><Input id="manufacturer" value={formData.manufacturer} onChange={(e) => handleChange('manufacturer', e.target.value)} placeholder="如: 海尔生物" className={errors.manufacturer ? 'border-red-500' : ''} />{errors.manufacturer && <p className="text-red-500 text-sm mt-1">{errors.manufacturer}</p>}</div>
            <div><Label htmlFor="status">状态</Label><Select value={formData.status} onValueChange={(value: EquipmentStatus) => handleChange('status', value)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{Object.entries(statusLabels).map(([key, label]) => (<SelectItem key={key} value={key}>{label}</SelectItem>))}</SelectContent></Select></div>
            <div><Label htmlFor="location">位置 *</Label><Input id="location" value={formData.location} onChange={(e) => handleChange('location', e.target.value)} placeholder="如: 实验室A-101" className={errors.location ? 'border-red-500' : ''} />{errors.location && <p className="text-red-500 text-sm mt-1">{errors.location}</p>}</div>
            <div><Label htmlFor="maintenanceDate">下次维护日期 *</Label><Input id="maintenanceDate" type="date" value={formData.maintenanceDate} onChange={(e) => handleChange('maintenanceDate', e.target.value)} className={errors.maintenanceDate ? 'border-red-500' : ''} />{errors.maintenanceDate && <p className="text-red-500 text-sm mt-1">{errors.maintenanceDate}</p>}</div>
            <div><Label htmlFor="responsible">负责人 *</Label><Select value={formData.responsible} onValueChange={handleResponsibleChange} disabled={loadingUsers}><SelectTrigger className={errors.responsible ? 'border-red-500' : ''}><SelectValue placeholder={loadingUsers ? '加载中...' : '选择负责人'} /></SelectTrigger><SelectContent>{users.map((user) => (<SelectItem key={user.user_id} value={user.user_id}>{user.username} {user.email ? `(${user.email})` : ''}</SelectItem>))}</SelectContent></Select>{errors.responsible && <p className="text-red-500 text-sm mt-1">{errors.responsible}</p>}</div>
          </div>
          <div><Label htmlFor="description">描述</Label><Textarea id="description" value={formData.description} onChange={(e) => handleChange('description', e.target.value)} placeholder="仪器的详细描述..." rows={3} /></div>
          <ImageUploader imageUrl={formData.imageUrl} onImageChange={(imageUrl) => handleChange('imageUrl', imageUrl)} equipmentModel={formData.model} manufacturer={formData.manufacturer} />
          <SOPUploader sopFileUrl={formData.sopFileUrl} sopFileName={formData.sopFileName} onSOPChange={(fileUrl, fileName) => { handleChange('sopFileUrl', fileUrl); handleChange('sopFileName', fileName); }} />
          <div className="flex justify-end gap-2 pt-4">
            <Button type="button" variant="outline" onClick={onClose}>取消</Button>
            <Button type="submit" className="bg-blue-600 hover:bg-blue-700">添加仪器</Button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default AddEquipmentModal;
