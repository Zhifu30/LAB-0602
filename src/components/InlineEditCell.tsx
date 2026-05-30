import React, { useState, useRef, useEffect } from 'react';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Equipment, EquipmentStatus, EquipmentType, statusLabels, equipmentTypeLabels } from '@/types/equipment';
import { Separator } from '@/components/ui/separator';

interface InlineEditCellProps {
  value: string;
  field: keyof Equipment;
  equipmentId: string;
  onSave: (equipmentId: string, field: keyof Equipment, value: any) => void;
  isEditing: boolean;
  onStartEdit: () => void;
  onCancelEdit: () => void;
}

// 获取所有类型（从新的配置系统）
const getAllEquipmentTypes = () => {
  const saved = localStorage.getItem('equipment-type-configs');
  if (saved) {
    const configs = JSON.parse(saved);
    return configs.map((c: any) => ({ id: c.id, name: c.name }));
  }
  // 兼容旧格式
  const oldSaved = localStorage.getItem('equipment-custom-types');
  if (oldSaved) {
    return JSON.parse(oldSaved);
  }
  return [];
};

const InlineEditCell: React.FC<InlineEditCellProps> = ({
  value,
  field,
  equipmentId,
  onSave,
  isEditing,
  onStartEdit,
  onCancelEdit
}) => {
  const [editValue, setEditValue] = useState(value);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [isEditing]);

  useEffect(() => {
    setEditValue(value);
  }, [value]);

  const handleSave = () => {
    if (editValue !== value) {
      onSave(equipmentId, field, editValue);
    }
    onCancelEdit();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleSave();
    } else if (e.key === 'Escape') {
      setEditValue(value);
      onCancelEdit();
    }
  };

  // 状态字段使用 Select
  if (field === 'status') {
    if (!isEditing) {
      return <span onDoubleClick={onStartEdit}>{statusLabels[value as EquipmentStatus] || value}</span>;
    }
    return (
      <Select
        value={editValue}
        onValueChange={(val) => {
          setEditValue(val);
          onSave(equipmentId, field, val);
          onCancelEdit();
        }}
      >
        <SelectTrigger className="h-8 w-24">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {Object.entries(statusLabels).map(([key, label]) => (
            <SelectItem key={key} value={key}>
              {label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    );
  }

  // 负责人使用 Select（从 profiles 表获取）
  if (field === 'responsible') {
    const [users, setUsers] = React.useState<Array<{username: string; email?: string}>>([]);

    React.useEffect(() => {
      if (isEditing) {
        import('@/integrations/supabase/client').then(({ supabase }) => {
          supabase.from('profiles').select('username, email').order('username').then(({ data }) => {
            setUsers(data || []);
          });
        });
      }
    }, [isEditing]);

    if (!isEditing) {
      return (
        <span onDoubleClick={onStartEdit} className="cursor-text hover:bg-muted/50 px-1 py-0.5 rounded transition-colors">
          {value || '—'}
        </span>
      );
    }

    return (
      <Select
        value={editValue || ''}
        onValueChange={(val) => {
          setEditValue(val);
          onSave(equipmentId, field, val);
          onCancelEdit();
        }}
      >
        <SelectTrigger className="h-8 min-w-[120px]">
          <SelectValue placeholder="选择负责人" />
        </SelectTrigger>
        <SelectContent className="bg-background z-50 max-h-48">
          {users.map((user) => (
            <SelectItem key={user.username} value={user.username}>
              {user.username} {user.email ? `(${user.email})` : ''}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    );
  }

  // 设备类型使用 Select
  if (field === 'type') {
    // 获取所有类型
    const allTypes = getAllEquipmentTypes();
    
    // 获取显示值
    const getDisplayValue = (val: string) => {
      // 先检查自定义类型
      const customType = allTypes.find((ct: any) => ct.name === val);
      if (customType) {
        return customType.name;
      }
      // 再检查标准类型
      if (equipmentTypeLabels[val as EquipmentType]) {
        return equipmentTypeLabels[val as EquipmentType];
      }
      return val || '-';
    };

    if (!isEditing) {
      return (
        <span onDoubleClick={onStartEdit}>
          {getDisplayValue(value)}
        </span>
      );
    }
    
    return (
      <Select
        value={editValue || ''}
        onValueChange={(val) => {
          setEditValue(val);
          onSave(equipmentId, field, val);
          onCancelEdit();
        }}
      >
        <SelectTrigger className="h-8 w-36">
          <SelectValue placeholder="选择类型" />
        </SelectTrigger>
        <SelectContent className="bg-background z-50">
          {/* 用户自定义类型优先显示 */}
          {allTypes.map((ct: any) => (
            <SelectItem key={ct.id} value={ct.name}>
              {ct.name}
            </SelectItem>
          ))}
          {/* 如果有自定义类型，添加分隔线 */}
          {allTypes.length > 0 && <Separator className="my-1" />}
          {/* 标准类型 */}
          {Object.entries(equipmentTypeLabels).map(([key, label]) => (
            <SelectItem key={key} value={key}>
              {label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    );
  }

  // 日期字段使用 date input
  if (field.toLowerCase().includes('date')) {
    if (!isEditing) {
      return <span onDoubleClick={onStartEdit}>{value || '-'}</span>;
    }
    return (
      <Input
        ref={inputRef}
        type="date"
        value={editValue}
        onChange={(e) => setEditValue(e.target.value)}
        onBlur={handleSave}
        onKeyDown={handleKeyDown}
        className="h-8 w-36"
      />
    );
  }

  // 数字字段
  if (['purchasePrice', 'depreciationRate', 'currentValue', 'usageHours'].includes(field)) {
    if (!isEditing) {
      return <span onDoubleClick={onStartEdit}>{value || '-'}</span>;
    }
    return (
      <Input
        ref={inputRef}
        type="number"
        value={editValue}
        onChange={(e) => setEditValue(e.target.value)}
        onBlur={handleSave}
        onKeyDown={handleKeyDown}
        className="h-8 w-24"
      />
    );
  }

  // 默认文本字段
  if (!isEditing) {
    return (
      <span 
        onDoubleClick={onStartEdit}
        className="cursor-text hover:bg-muted/50 px-1 py-0.5 rounded transition-colors"
      >
        {value || '-'}
      </span>
    );
  }

  return (
    <Input
      ref={inputRef}
      type="text"
      value={editValue}
      onChange={(e) => setEditValue(e.target.value)}
      onBlur={handleSave}
      onKeyDown={handleKeyDown}
      className="h-8 min-w-[100px]"
    />
  );
};

export default InlineEditCell;
