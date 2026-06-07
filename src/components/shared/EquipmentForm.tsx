import React from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import ImageUploader from '@/components/ImageUploader';
import SOPUploader from '@/components/SOPUploader';
import MultipleFileUploader from '@/components/MultipleFileUploader';
import { useProfiles } from '@/hooks/useProfiles';
import {
  Equipment,
  EquipmentStatus,
  EquipmentType,
  equipmentTypeLabels,
  statusLabels,
} from '@/types/equipment';

export interface EquipmentTypeOption {
  id: string;
  name: string;
}

interface EquipmentFormProps {
  equipment: Partial<Equipment> & { id?: string };
  onChange: (field: keyof Equipment, value: string) => void;
  variant?: 'light' | 'glass';
  mode?: 'create' | 'edit';
  errors?: Record<string, string>;
  equipmentTypes?: EquipmentTypeOption[];
  showId?: boolean;
  idReadOnly?: boolean;
  footer?: React.ReactNode;
}

export const EquipmentForm: React.FC<EquipmentFormProps> = ({
  equipment,
  onChange,
  variant = 'light',
  mode = 'create',
  errors = {},
  equipmentTypes = [],
  showId = mode === 'create',
  idReadOnly = mode === 'edit',
  footer,
}) => {
  const { profiles: users, loading: loadingUsers } = useProfiles();
  const isGlass = variant === 'glass';
  const fieldWrap = isGlass ? 'bg-white/5 rounded-lg p-2' : '';
  const labelCls = isGlass ? 'text-xs text-white/80' : '';
  const inputCls = isGlass ? 'bg-white/10 border-white/20 text-white placeholder:text-white/50' : '';
  const popoverCls = isGlass ? 'z-[300] bg-popover' : '';

  const handleResponsibleChange = (value: string) => {
    if (mode === 'create') {
      const user = users.find((u) => u.user_id === value);
      if (user) {
        onChange('responsible', user.username);
        onChange('responsible_email', user.email || '');
      }
    } else {
      const user = users.find((u) => u.username === value);
      onChange('responsible', value);
      if (user?.email) onChange('responsible_email', user.email);
    }
  };

  const typeSelect = equipmentTypes.length > 0 ? (
    <Select value={equipment.type || ''} onValueChange={(v: string) => onChange('type', v)}>
      <SelectTrigger className={inputCls}><SelectValue placeholder="选择设备类型" /></SelectTrigger>
      <SelectContent className={popoverCls}>
        {equipmentTypes.map((t) => (
          <SelectItem key={t.id} value={t.name}>{t.name}</SelectItem>
        ))}
      </SelectContent>
    </Select>
  ) : (
    <Select value={equipment.type || ''} onValueChange={(v: EquipmentType) => onChange('type', v)}>
      <SelectTrigger className={inputCls}><SelectValue placeholder="选择设备类型" /></SelectTrigger>
      <SelectContent className={popoverCls}>
        {Object.entries(equipmentTypeLabels).map(([key, label]) => (
          <SelectItem key={key} value={key}>{label}</SelectItem>
        ))}
      </SelectContent>
    </Select>
  );

  return (
    <div className={isGlass ? 'space-y-6 bg-white/10 backdrop-blur-sm rounded-lg p-4 border border-white/20' : 'space-y-4'}>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {showId && (
          <div className={fieldWrap}>
            <Label htmlFor="eq-id" className={labelCls}>仪器编号 *</Label>
            <Input
              id="eq-id"
              value={equipment.id || ''}
              onChange={(e) => onChange('id', e.target.value)}
              placeholder="如: EQ001"
              readOnly={idReadOnly}
              className={`${inputCls} ${errors.id ? 'border-red-500' : ''}`}
            />
            {errors.id && <p className="text-red-500 text-sm mt-1">{errors.id}</p>}
          </div>
        )}
        <div className={fieldWrap}>
          <Label htmlFor="eq-name" className={labelCls}>仪器名称 *</Label>
          <Input id="eq-name" value={equipment.name || ''} onChange={(e) => onChange('name', e.target.value)} placeholder="如: 离心机" className={`${inputCls} ${errors.name ? 'border-red-500' : ''}`} />
          {errors.name && <p className="text-red-500 text-sm mt-1">{errors.name}</p>}
        </div>
        <div className={fieldWrap}>
          <Label className={labelCls}>设备类型</Label>
          {typeSelect}
        </div>
        <div className={fieldWrap}>
          <Label htmlFor="eq-model" className={labelCls}>型号 *</Label>
          <Input id="eq-model" value={equipment.model || ''} onChange={(e) => onChange('model', e.target.value)} placeholder="如: CF-16RX" className={`${inputCls} ${errors.model ? 'border-red-500' : ''}`} />
          {errors.model && <p className="text-red-500 text-sm mt-1">{errors.model}</p>}
        </div>
        <div className={fieldWrap}>
          <Label htmlFor="eq-manufacturer" className={labelCls}>厂商 *</Label>
          <Input id="eq-manufacturer" value={equipment.manufacturer || ''} onChange={(e) => onChange('manufacturer', e.target.value)} placeholder="如: 海尔生物" className={`${inputCls} ${errors.manufacturer ? 'border-red-500' : ''}`} />
          {errors.manufacturer && <p className="text-red-500 text-sm mt-1">{errors.manufacturer}</p>}
        </div>
        <div className={fieldWrap}>
          <Label className={labelCls}>状态</Label>
          <Select value={equipment.status || 'available'} onValueChange={(v: EquipmentStatus) => onChange('status', v)}>
            <SelectTrigger className={inputCls}><SelectValue /></SelectTrigger>
            <SelectContent className={popoverCls}>
              {Object.entries(statusLabels).map(([key, label]) => (
                <SelectItem key={key} value={key}>{label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className={fieldWrap}>
          <Label htmlFor="eq-location" className={labelCls}>位置 *</Label>
          <Input id="eq-location" value={equipment.location || ''} onChange={(e) => onChange('location', e.target.value)} placeholder="如: 实验室A-101" className={`${inputCls} ${errors.location ? 'border-red-500' : ''}`} />
          {errors.location && <p className="text-red-500 text-sm mt-1">{errors.location}</p>}
        </div>
        {mode === 'create' ? (
          <div className={fieldWrap}>
            <Label className={labelCls}>下次维护日期 *</Label>
            <Input type="date" value={equipment.maintenanceDate || ''} onChange={(e) => onChange('maintenanceDate', e.target.value)} className={`${inputCls} ${errors.maintenanceDate ? 'border-red-500' : ''}`} />
            {errors.maintenanceDate && <p className="text-red-500 text-sm mt-1">{errors.maintenanceDate}</p>}
          </div>
        ) : (
          <div className={fieldWrap}>
            <Label className={labelCls}>下次校正日期</Label>
            <Input type="date" value={equipment.nextCalibrationDate || ''} onChange={(e) => onChange('nextCalibrationDate', e.target.value)} className={inputCls} />
          </div>
        )}
        <div className={fieldWrap}>
          <Label className={labelCls}>负责人 *</Label>
          <Select
            value={mode === 'create' ? equipment.responsible || '' : equipment.responsible || ''}
            onValueChange={handleResponsibleChange}
            disabled={loadingUsers}
          >
            <SelectTrigger className={`${inputCls} ${errors.responsible ? 'border-red-500' : ''}`}>
              <SelectValue placeholder={loadingUsers ? '加载中...' : '选择负责人'} />
            </SelectTrigger>
            <SelectContent className={popoverCls}>
              {(mode === 'create' ? users.map((u) => ({ key: u.user_id, value: u.user_id, label: `${u.username}${u.email ? ` (${u.email})` : ''}` })) : users.map((u) => ({ key: u.user_id, value: u.username, label: u.username }))).map((u) => (
                <SelectItem key={u.key} value={u.value}>{u.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          {errors.responsible && <p className="text-red-500 text-sm mt-1">{errors.responsible}</p>}
        </div>
        {mode === 'edit' && (
          <div className={`md:col-span-2 ${fieldWrap}`}>
            <Label className={labelCls}>维护日期管理</Label>
            <p className="mt-1 text-xs text-white/60 bg-white/5 p-2 rounded">维护日期通过下方的"维护计划管理"进行设置和管理，支持自动周期性更新。</p>
          </div>
        )}
      </div>
      <div className={fieldWrap}>
        <Label className={labelCls}>描述</Label>
        <Textarea value={equipment.description || ''} onChange={(e) => onChange('description', e.target.value)} placeholder="仪器的详细描述..." rows={3} className={inputCls} />
      </div>
      <ImageUploader
        imageUrl={equipment.imageUrl}
        onImageChange={(url) => onChange('imageUrl', url)}
        equipmentModel={equipment.model}
        manufacturer={equipment.manufacturer}
      />
      {mode === 'create' ? (
        <SOPUploader
          sopFileUrl={equipment.sopFileUrl}
          sopFileName={equipment.sopFileName}
          onSOPChange={(fileUrl, fileName) => {
            onChange('sopFileUrl', fileUrl);
            onChange('sopFileName', fileName);
          }}
        />
      ) : (
        <MultipleFileUploader
          files={equipment.sopFiles ? JSON.parse(equipment.sopFiles) : []}
          onFilesChange={(files) => onChange('sopFiles', JSON.stringify(files))}
          bucketName="sop-files"
          label="SOP文件和附件"
          acceptedTypes=".pdf,.doc,.docx,.txt,.jpg,.jpeg,.png"
          maxFiles={10}
        />
      )}
      {footer}
    </div>
  );
};

export default EquipmentForm;
