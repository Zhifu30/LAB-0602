import React, { useState, useEffect, useMemo } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Search, Plus, User, Tags  } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { addMonths, addDays, format } from 'date-fns';

interface Equipment {
  id: string;
  name: string;
  model: string | null;
  type: string | null;
  responsible: string | null;
}

interface AddEquipmentToGroupModalProps {
  isOpen: boolean;
  onClose: () => void;
  groupType: 'responsible' | 'type';
  groupName: string;
  groupEmail?: string | null;
  onSuccess: () => void;
}

export default function AddEquipmentToGroupModal({
  isOpen,
  onClose,
  groupType,
  groupName,
  groupEmail,
  onSuccess
}: AddEquipmentToGroupModalProps) {
  const [equipment, setEquipment] = useState<Equipment[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);
  const [createMaintenancePlan, setCreateMaintenancePlan] = useState(true);
  const [maintenanceFrequency, setMaintenanceFrequency] = useState<string>('monthly');
  const [maintenanceTitle, setMaintenanceTitle] = useState<string>('');
  const [maintenanceDescription, setMaintenanceDescription] = useState<string>('');

  // 获取所有设备
  const fetchEquipment = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('equipment')
        .select('id, name, model, type, responsible')
        .eq('is_scrapped', false)
        .order('name');

      if (error) throw error;
      setEquipment(data || []);
    } catch (error) {
      console.error('获取设备失败:', error);
      toast.error('获取设备列表失败');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      fetchEquipment();
      setSelectedIds(new Set());
      setSearchQuery('');
      setCreateMaintenancePlan(true);
      setMaintenanceFrequency('monthly');
      setMaintenanceTitle('');
      setMaintenanceDescription('');
    }
  }, [isOpen]);

  // 过滤设备：排除已经属于该分组的设备
  const availableEquipment = useMemo(() => {
    return equipment.filter(eq => {
      if (groupType === 'responsible') {
        return eq.responsible !== groupName;
      } else {
        return eq.type !== groupName;
      }
    });
  }, [equipment, groupType, groupName]);

  // 搜索过滤
  const filteredEquipment = useMemo(() => {
    if (!searchQuery.trim()) return availableEquipment;
    const query = searchQuery.toLowerCase();
    return availableEquipment.filter(eq =>
      eq.name.toLowerCase().includes(query) ||
      eq.id.toLowerCase().includes(query) ||
      (eq.model && eq.model.toLowerCase().includes(query))
    );
  }, [availableEquipment, searchQuery]);

  const toggleSelect = (id: string) => {
    setSelectedIds(prev => {
      const newSet = new Set(prev);
      if (newSet.has(id)) {
        newSet.delete(id);
      } else {
        newSet.add(id);
      }
      return newSet;
    });
  };

  const handleSelectAll = () => {
    if (selectedIds.size === filteredEquipment.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filteredEquipment.map(eq => eq.id)));
    }
  };

  const handleSave = async () => {
    if (selectedIds.size === 0) {
      toast.error('请选择要添加的设备');
      return;
    }

    setSaving(true);
    try {
      const ids = Array.from(selectedIds);
      const selectedEquipmentList = equipment.filter(eq => ids.includes(eq.id));
      
      if (groupType === 'responsible') {
        // 更新设备的负责人
        for (const id of ids) {
          await supabase
            .from('equipment')
            .update({ 
              responsible: groupName,
              responsible_email: groupEmail || null
            })
            .eq('id', id);
        }
        
        // 如果需要创建维护计划
        if (createMaintenancePlan) {
          const nextDueDate = getNextDueDate(maintenanceFrequency);
          for (const eq of selectedEquipmentList) {
            // 检查是否已有维护计划
            const { data: existing } = await supabase
              .from('maintenance_schedules')
              .select('id')
              .eq('equipment_id', eq.id)
              .eq('is_active', true)
              .limit(1);
            
            if (!existing || existing.length === 0) {
              const scheduleTitle = maintenanceTitle.trim() || '月度维护';
              const scheduleDescription = maintenanceDescription.trim() || `${eq.name} 的定期维护`;
              
              await supabase
                .from('maintenance_schedules')
                .insert({
                  equipment_id: eq.id,
                  title: scheduleTitle,
                  description: scheduleDescription,
                  frequency: maintenanceFrequency,
                  next_due_date: nextDueDate,
                  reminder_days_before: 7,
                  assigned_name: groupName,
                  assigned_email: groupEmail || null,
                  is_active: true
                });
            }
          }
        }
        
        toast.success(`已将 ${ids.length} 台设备分配给 ${groupName}${createMaintenancePlan ? '，并创建了维护计划' : ''}`);
      } else {
        // 更新设备的类型
        for (const id of ids) {
          await supabase
            .from('equipment')
            .update({ type: groupName })
            .eq('id', id);
        }
        
        // 同步更新 localStorage 中的类型配置
        const saved = localStorage.getItem('equipment-type-configs-v2');
        if (saved) {
          const types = JSON.parse(saved);
          const updatedTypes = types.map((t: any) => {
            if (t.name === groupName) {
              return { ...t, equipmentIds: [...new Set([...t.equipmentIds, ...ids])] };
            }
            return t;
          });
          localStorage.setItem('equipment-type-configs-v2', JSON.stringify(updatedTypes));
        }
        
        // 如果需要创建维护计划
        if (createMaintenancePlan) {
          const nextDueDate = getNextDueDate(maintenanceFrequency);
          for (const eq of selectedEquipmentList) {
            // 检查是否已有维护计划
            const { data: existing } = await supabase
              .from('maintenance_schedules')
              .select('id')
              .eq('equipment_id', eq.id)
              .eq('is_active', true)
              .limit(1);
            
            if (!existing || existing.length === 0) {
              const scheduleTitle = maintenanceTitle.trim() || '月度维护';
              const scheduleDescription = maintenanceDescription.trim() || `${eq.name} (${groupName}) 的定期维护`;
              
              await supabase
                .from('maintenance_schedules')
                .insert({
                  equipment_id: eq.id,
                  title: scheduleTitle,
                  description: scheduleDescription,
                  frequency: maintenanceFrequency,
                  next_due_date: nextDueDate,
                  reminder_days_before: 7,
                  assigned_name: eq.responsible || null,
                  assigned_email: null,
                  is_active: true
                });
            }
          }
        }
        
        toast.success(`已将 ${ids.length} 台设备分配到类型 ${groupName}${createMaintenancePlan ? '，并创建了维护计划' : ''}`);
      }

      onSuccess();
      onClose();
    } catch (error) {
      console.error('分配设备失败:', error);
      toast.error('分配设备失败');
    } finally {
      setSaving(false);
    }
  };
  
  const getNextDueDate = (frequency: string): string => {
    const now = new Date();
    switch (frequency) {
      case 'daily':
        return format(addDays(now, 1), 'yyyy-MM-dd');
      case 'weekly':
        return format(addDays(now, 7), 'yyyy-MM-dd');
      case 'monthly':
        return format(addMonths(now, 1), 'yyyy-MM-dd');
      case 'quarterly':
        return format(addMonths(now, 3), 'yyyy-MM-dd');
      case 'yearly':
        return format(addMonths(now, 12), 'yyyy-MM-dd');
      default:
        return format(addMonths(now, 1), 'yyyy-MM-dd');
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-lg max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {groupType === 'responsible' ? (
              <User className="h-5 w-5" />
            ) : (
              <Tags className="h-5 w-5" />
            )}
            添加设备到 {groupName}
          </DialogTitle>
          <DialogDescription>
            选择要分配给{groupType === 'responsible' ? '该负责人' : '该类型'}的设备
          </DialogDescription>
        </DialogHeader>

        {/* 搜索框 */}
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="搜索设备 (名称/ID/型号)"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-8"
          />
        </div>

        {/* 创建维护计划选项 */}
        <div className="space-y-3 border rounded-md p-3 bg-muted/30">
          <div className="flex items-center justify-between">
            <Label htmlFor="create-plan" className="text-sm font-medium">
              同时创建维护计划
            </Label>
            <Switch
              id="create-plan"
              checked={createMaintenancePlan}
              onCheckedChange={setCreateMaintenancePlan}
            />
          </div>
          {createMaintenancePlan && (
            <div className="space-y-3">
              <div className="space-y-1">
                <Label className="text-sm text-muted-foreground">维护内容 (标题)</Label>
                <Input
                  value={maintenanceTitle}
                  onChange={(e) => setMaintenanceTitle(e.target.value)}
                  placeholder="月度维护"
                  className="h-8 text-sm"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-sm text-muted-foreground">维护描述</Label>
                <Textarea
                  value={maintenanceDescription}
                  onChange={(e) => setMaintenanceDescription(e.target.value)}
                  placeholder="详细描述维护工作内容..."
                  className="text-sm min-h-[60px]"
                />
              </div>
              <div className="flex items-center gap-2">
                <Label className="text-sm text-muted-foreground whitespace-nowrap">维护周期:</Label>
                <Select value={maintenanceFrequency} onValueChange={setMaintenanceFrequency}>
                  <SelectTrigger className="w-32 h-8">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="daily">每日</SelectItem>
                    <SelectItem value="weekly">每周</SelectItem>
                    <SelectItem value="monthly">每月</SelectItem>
                    <SelectItem value="quarterly">每季度</SelectItem>
                    <SelectItem value="yearly">每年</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}
        </div>

        {/* 全选按钮 */}
        <div className="flex items-center justify-between">
          <Button
            variant="ghost"
            size="sm"
            onClick={handleSelectAll}
            disabled={filteredEquipment.length === 0}
          >
            {selectedIds.size === filteredEquipment.length && filteredEquipment.length > 0
              ? '取消全选'
              : '全选'}
          </Button>
          <Badge variant="secondary">
            已选 {selectedIds.size} / {filteredEquipment.length}
          </Badge>
        </div>

        {/* 设备列表 */}
        <ScrollArea className="flex-1 min-h-[200px] max-h-[300px] border rounded-md">
          {loading ? (
            <div className="p-4 text-center text-muted-foreground">加载中...</div>
          ) : filteredEquipment.length === 0 ? (
            <div className="p-4 text-center text-muted-foreground">
              {searchQuery ? '无匹配设备' : '暂无可添加的设备'}
            </div>
          ) : (
            <div className="p-2 space-y-1">
              {filteredEquipment.map(eq => (
                <div
                  key={eq.id}
                  className={`flex items-center gap-3 p-2 rounded-md cursor-pointer transition-colors ${
                    selectedIds.has(eq.id) 
                      ? 'bg-primary/10 border border-primary/30' 
                      : 'hover:bg-muted/50'
                  }`}
                  onClick={() => toggleSelect(eq.id)}
                >
                  <Checkbox
                    checked={selectedIds.has(eq.id)}
                    onCheckedChange={() => toggleSelect(eq.id)}
                  />
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-sm truncate">{eq.name}</div>
                    <div className="text-xs text-muted-foreground">
                      ID: {eq.id} | 型号: {eq.model || '-'}
                    </div>
                    <div className="text-xs text-muted-foreground flex gap-2 mt-0.5">
                      {groupType === 'type' && eq.responsible && (
                        <span>负责人: {eq.responsible}</span>
                      )}
                      {groupType === 'responsible' && eq.type && (
                        <span>类型: {eq.type}</span>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </ScrollArea>

        {/* 操作按钮 */}
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="outline" onClick={onClose}>
            取消
          </Button>
          <Button onClick={handleSave} disabled={saving || selectedIds.size === 0}>
            <Plus className="h-4 w-4 mr-1" />
            {saving ? '添加中...' : `添加 ${selectedIds.size} 台设备`}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
