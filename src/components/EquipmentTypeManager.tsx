import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { Plus, Trash2, Edit2, Save, X, Tags, ChevronRight, Wrench, Check, Link2, Unlink, User, Search, ChevronDown, ChevronUp, Calendar, Bell, Clock, FileText, Copy } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar as CalendarComponent } from '@/components/ui/calendar';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/useAuth';
import { Equipment } from '@/types/equipment';
import { supabase } from '@/integrations/supabase/client';
import { format, endOfMonth } from 'date-fns';

// 获取当月月底日期
const getEndOfCurrentMonth = () => endOfMonth(new Date());

export interface EquipmentTypeConfig {
  id: string;
  name: string;
  maintenanceContent: string;
  equipmentIds: string[];
  sharedImageUrl?: string | null;
  sharedSopFiles?: { url: string; name: string }[] | null;
}

// 维护计划模板接口
interface MaintenanceTemplate {
  id: string;
  title: string;
  description: string;
  frequency: 'daily' | 'weekly' | 'monthly' | 'quarterly' | 'yearly';
  reminder_days_before: number;
}

interface UserProfile {
  id: string;
  user_id: string;
  username: string;
  email: string | null;
}

interface MaintenanceSchedule {
  id: string;
  equipment_id: string;
  title: string;
  description: string | null;
  frequency: 'daily' | 'weekly' | 'monthly' | 'quarterly' | 'yearly';
  next_due_date: string;
  reminder_days_before: number;
  assigned_user_id: string | null;
  assigned_name: string | null;
  assigned_email: string | null;
  last_completed_at: string | null;
  reminder_sent: boolean;
  is_active: boolean;
  created_at: string;
}

interface EquipmentTypeManagerProps {
  isOpen: boolean;
  onClose: () => void;
  onTypesUpdate?: () => void;
  equipments?: Equipment[];
  onEquipmentRefresh?: () => void;
}

const frequencyLabels: Record<string, string> = {
  daily: '每日',
  weekly: '每周',
  monthly: '每月',
  quarterly: '每季度',
  yearly: '每年'
};

// localStorage key for equipment types - 持久化存储
const STORAGE_KEY = 'equipment-type-configs-v2';

// Use an existing DB table (equipment_types) to persist type definitions.
// Rows with model/manufacturer = '__TYPE__' are reserved for type definitions.
const TYPE_SENTINEL = '__TYPE__';

const EquipmentTypeManager: React.FC<EquipmentTypeManagerProps> = ({
  isOpen,
  onClose,
  onTypesUpdate,
  equipments = [],
  onEquipmentRefresh
}) => {
  const { toast } = useToast();
  const { user, loading: authLoading } = useAuth();
  const [types, setTypes] = useState<EquipmentTypeConfig[]>([]);
  const [newTypeName, setNewTypeName] = useState('');
  const newTypeInputRef = useRef<HTMLInputElement>(null);
  const [selectedTypeId, setSelectedTypeId] = useState<string | null>(null);
  const [editingTypeId, setEditingTypeId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [isLinkingMode, setIsLinkingMode] = useState(false);
  const [batchSelectedIds, setBatchSelectedIds] = useState<Set<string>>(new Set());
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [unlinkedCollapsed, setUnlinkedCollapsed] = useState(false);
  const [createMaintenancePlan, setCreateMaintenancePlan] = useState(true);
  const [maintenanceFrequency, setMaintenanceFrequency] = useState<string>('monthly');
  const [maintenanceDate, setMaintenanceDate] = useState<Date | undefined>(getEndOfCurrentMonth());
  const [maintenanceTitle, setMaintenanceTitle] = useState<string>('');
  const [maintenanceDescription, setMaintenanceDescription] = useState<string>('');
  const [maintenanceReminderDays, setMaintenanceReminderDays] = useState<number>(7);
  const [showBatchSettings, setShowBatchSettings] = useState(false);
  const [batchResponsible, setBatchResponsible] = useState<string>('');
  
  // 第三列：维护计划模板和设备维护管理
  const [maintenanceTemplates, setMaintenanceTemplates] = useState<MaintenanceTemplate[]>([]);
  const [selectedEquipmentId, setSelectedEquipmentId] = useState<string | null>(null);
  const [equipmentSchedules, setEquipmentSchedules] = useState<MaintenanceSchedule[]>([]);
  const [showAddTemplateModal, setShowAddTemplateModal] = useState(false);
  const [showEditTemplateModal, setShowEditTemplateModal] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<MaintenanceTemplate | null>(null);
  const [showAddScheduleModal, setShowAddScheduleModal] = useState(false);
  const [showEditScheduleModal, setShowEditScheduleModal] = useState(false);
  const [editingSchedule, setEditingSchedule] = useState<MaintenanceSchedule | null>(null);
  const [templateFormData, setTemplateFormData] = useState({
    title: '',
    description: '',
    frequency: 'monthly' as 'daily' | 'weekly' | 'monthly' | 'quarterly' | 'yearly',
    reminder_days_before: 7
  });
  const [scheduleFormData, setScheduleFormData] = useState({
    title: '',
    description: '',
    frequency: 'monthly' as 'daily' | 'weekly' | 'monthly' | 'quarterly' | 'yearly',
    next_due_date: '',
    reminder_days_before: 7,
    assigned_user_id: ''
  });
  
  // 批量应用模板的目标设备
  const [showApplyTemplateModal, setShowApplyTemplateModal] = useState(false);
  const [applyingTemplate, setApplyingTemplate] = useState<MaintenanceTemplate | null>(null);
  const [applyTemplateDate, setApplyTemplateDate] = useState<Date | undefined>(getEndOfCurrentMonth());
  const [applyMode, setApplyMode] = useState<'all' | 'selected'>('all');
  const [templateSelectedIds, setTemplateSelectedIds] = useState<Set<string>>(new Set());

  // 保存类型到localStorage - 立即同步
  const saveTypes = useCallback((newTypes: EquipmentTypeConfig[]) => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(newTypes));
    // 同时更新旧的格式以保持兼容性
    localStorage.setItem('equipment-custom-types', JSON.stringify(
      newTypes.map(t => ({ id: t.id, name: t.name }))
    ));
    setTypes(newTypes);
    console.log('Saved equipment types:', newTypes.map(t => t.name));
    onTypesUpdate?.();
  }, [onTypesUpdate]);

  const getAuthedUser = useCallback(async () => {
    if (user) return user;
    // Dev bypass: 如果没有 Supabase 会话，返回一个模拟用户（允许本地开发使用）
    try {
      const { data } = await supabase.auth.getUser();
      if (data?.user) return data.user;
    } catch {}
    // 返回模拟用户对象，让类型管理在本地也能工作
    return { id: 'dev-user', email: 'dev@localhost' } as any;
  }, [user]);

  const fetchTypesFromDb = useCallback(async (): Promise<EquipmentTypeConfig[]> => {
    const { data, error } = await supabase
      .from('equipment_types')
      .select('id, equipment_type, created_at, shared_image_url, shared_sop_files')
      .order('created_at', { ascending: true });

    if (error) throw error;

    const dbTypes: EquipmentTypeConfig[] = (data || []).map((row: any) => ({
      id: row.id,
      name: row.equipment_type,
      maintenanceContent: '',
      equipmentIds: [],
      sharedImageUrl: row.shared_image_url || null,
      sharedSopFiles: row.shared_sop_files || null,
    }));

    // Sync associations from DB equipment.type field
    return dbTypes.map(t => ({
      ...t,
      equipmentIds: equipments.filter(eq => eq.type === t.name).map(eq => eq.id)
    }));
  }, [equipments]);

  const migrateLocalTypesToDbIfNeeded = useCallback(async () => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (!saved) return;

    let savedTypes: EquipmentTypeConfig[] = [];
    try {
      savedTypes = JSON.parse(saved);
    } catch {
      return;
    }

    const valid = (savedTypes || []).filter(t => t && t.name && String(t.name).trim());
    if (valid.length === 0) return;

    // Best-effort upsert into DB so types survive across browsers/devices.
    const rows = valid.map(t => ({
      equipment_type: String(t.name).trim(),
      model: TYPE_SENTINEL,
      manufacturer: TYPE_SENTINEL
    }));

    const { error } = await supabase
      .from('equipment_types')
      .upsert(rows as any, {
        onConflict: 'equipment_type,model,manufacturer',
        ignoreDuplicates: true
      });

    if (error) throw error;
  }, [getAuthedUser]);

  // 打开弹窗时：从数据库加载类型（并在需要时把旧 localStorage 数据迁移进数据库）
  useEffect(() => {
    if (isOpen) {
      let cancelled = false;

      const load = async () => {
        try {
          const dbTypes = await fetchTypesFromDb();
          if (cancelled) return;
          if (dbTypes.length === 0) {
            await migrateLocalTypesToDbIfNeeded();
            const retry = await fetchTypesFromDb();
            if (!cancelled) saveTypes(retry);
          } else {
            saveTypes(dbTypes);
          }
        } catch (e) {
          console.error('Failed to load equipment types from DB:', e);
          if (!cancelled) setTypes([]);
        }
      };

      load();
      
      // 加载用户列表
      fetchUsers();
      // 默认维护日期为当月月底
      setMaintenanceDate(getEndOfCurrentMonth());

      return () => {
        cancelled = true;
      };
    }
  }, [isOpen, fetchTypesFromDb, migrateLocalTypesToDbIfNeeded, saveTypes, toast]);

  // 当选中类型变化时，加载该类型的模板
  useEffect(() => {
    if (selectedTypeId) {
      const savedTemplates = localStorage.getItem(`${STORAGE_KEY}-templates-${selectedTypeId}`);
      if (savedTemplates) {
        try {
          setMaintenanceTemplates(JSON.parse(savedTemplates));
        } catch (e) {
          console.error('Failed to parse saved templates:', e);
          setMaintenanceTemplates([]);
        }
      } else {
        setMaintenanceTemplates([]);
      }
    }
  }, [selectedTypeId]);

  // 获取用户列表
  const fetchUsers = async () => {
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('id, user_id, username, email')
        .order('username');
      if (error) throw error;
      setUsers(data || []);
    } catch (error) {
      console.error('获取用户列表失败:', error);
    }
  };

  // 获取选中设备的维护计划
  const fetchEquipmentSchedules = useCallback(async (equipmentId: string) => {
    try {
      const { data, error } = await supabase
        .from('maintenance_schedules')
        .select('*')
        .eq('equipment_id', equipmentId)
        .eq('is_active', true)
        .order('next_due_date');
      
      if (error) throw error;
      setEquipmentSchedules((data || []) as MaintenanceSchedule[]);
    } catch (error) {
      console.error('获取维护计划失败:', error);
    }
  }, []);

  // 当选中设备变化时加载维护计划
  useEffect(() => {
    if (selectedEquipmentId) {
      fetchEquipmentSchedules(selectedEquipmentId);
    } else {
      setEquipmentSchedules([]);
    }
  }, [selectedEquipmentId, fetchEquipmentSchedules]);

  // 保存模板到localStorage
  const saveTemplates = useCallback((templates: MaintenanceTemplate[]) => {
    if (selectedTypeId) {
      localStorage.setItem(`${STORAGE_KEY}-templates-${selectedTypeId}`, JSON.stringify(templates));
      setMaintenanceTemplates(templates);
    }
  }, [selectedTypeId]);

  // 获取当前选中的类型
  const selectedType = useMemo(() => 
    types.find(t => t.id === selectedTypeId), 
    [types, selectedTypeId]
  );

  // 获取关联到当前类型的设备列表 - 使用数据库 type 字段作为唯一真实来源
  const linkedEquipments = useMemo(() => {
    if (!selectedType) return [];
    // 只使用数据库中的 type 字段来判断关联关系
    return equipments.filter(eq => eq.type === selectedType.name);
  }, [selectedType, equipments]);

  // 获取选中的设备详情
  const selectedEquipment = useMemo(() => {
    return equipments.find(eq => eq.id === selectedEquipmentId);
  }, [equipments, selectedEquipmentId]);

  // 获取未关联的设备列表 - 只查看数据库中 type 为空或不属于任何已定义类型的设备
  const unlinkedEquipments = useMemo(() => {
    if (!selectedType) return equipments;
    const allTypeNames = types.map(t => t.name);
    return equipments.filter(eq => 
      !eq.type || !allTypeNames.includes(eq.type)
    );
  }, [selectedType, types, equipments]);

  // 过滤后的未关联设备（支持搜索）
  const filteredUnlinkedEquipments = useMemo(() => {
    if (!searchQuery.trim()) return unlinkedEquipments;
    const query = searchQuery.toLowerCase();
    return unlinkedEquipments.filter(eq => 
      eq.name.toLowerCase().includes(query) ||
      eq.id.toLowerCase().includes(query) ||
      (eq.model && eq.model.toLowerCase().includes(query)) ||
      (eq.responsible && eq.responsible.toLowerCase().includes(query))
    );
  }, [unlinkedEquipments, searchQuery]);

  const handleAddType = async () => {
    const name = newTypeInputRef.current?.value?.trim() || '';
    if (!name) return;

    if (types.some(t => t.name === name)) {
      toast({ title: '错误', description: '该类型已存在', variant: 'destructive' });
      return;
    }

    try {
      const { data, error } = await supabase
        .from('equipment_types')
        .insert({ equipment_type: name } as any)
        .select('id')
        .single();

      if (error) throw error;

      const dbTypes = await fetchTypesFromDb();
      saveTypes(dbTypes);

      if (newTypeInputRef.current) newTypeInputRef.current.value = '';
      setSelectedTypeId(data?.id ?? null);
      setIsLinkingMode(false);

      toast({ title: '成功', description: `已添加类型 "${name}"` });
    } catch (error: any) {
      toast({ title: '添加失败', description: error?.message || '无法写入数据库', variant: 'destructive' });
    }
  };

  const handleDeleteType = async (id: string) => {
    const typeToDelete = types.find(t => t.id === id);
    if (typeToDelete) {
      // 解除所有设备关联
      const linkedIds = equipments.filter(eq => eq.type === typeToDelete.name).map(eq => eq.id);
      if (linkedIds.length > 0) {
        await updateEquipmentTypes(linkedIds, null);
      }

      // 从数据库删除类型定义
      try {
        await supabase
          .from('equipment_types')
          .delete()
          .eq('id', id);
      } catch (e) {
        console.error('删除类型(数据库)失败:', e);
      }

      // 删除该类型的模板
      localStorage.removeItem(`${STORAGE_KEY}-templates-${id}`);
    }
    const newTypes = types.filter(t => t.id !== id);
    saveTypes(newTypes);
    if (selectedTypeId === id) {
      setSelectedTypeId(null);
      setSelectedEquipmentId(null);
      setMaintenanceTemplates([]);
    }
    toast({
      title: '已删除',
      description: '类型已删除',
    });
  };

  const handleStartEdit = (type: EquipmentTypeConfig) => {
    setEditingTypeId(type.id);
    setEditName(type.name);
  };

  const handleSaveEdit = async () => {
    if (!editName.trim()) return;
    
    const oldType = types.find(t => t.id === editingTypeId);
    const nextName = editName.trim();

    // 更新类型名称到数据库（类型定义表）
    try {
      if (editingTypeId) {
        const { error } = await supabase
          .from('equipment_types')
          .update({ equipment_type: nextName } as any)
          .eq('id', editingTypeId);
        if (error) throw error;
      }
    } catch (error: any) {
      console.error('更新类型名称失败(数据库):', error);
      toast({
        title: '保存失败',
        description: error?.message || '无法写入数据库',
        variant: 'destructive'
      });
      return;
    }

    const newTypes = types.map(t => 
      t.id === editingTypeId 
        ? { ...t, name: nextName }
        : t
    );
    saveTypes(newTypes);
    
    // 更新所有关联设备的类型名称
    if (oldType) {
      const linkedIds = equipments.filter(eq => eq.type === oldType.name).map(eq => eq.id);
      if (linkedIds.length > 0) {
        await updateEquipmentTypes(linkedIds, nextName);
      }
    }
    
    setEditingTypeId(null);
    toast({
      title: '已保存',
      description: '类型已更新',
    });
  };

  const handleCancelEdit = () => {
    setEditingTypeId(null);
    setEditName('');
  };

  const handleSelectType = (type: EquipmentTypeConfig) => {
    setSelectedTypeId(type.id);
    setIsLinkingMode(false);
    setBatchSelectedIds(new Set());
    setSelectedEquipmentId(null);
  };

  // 选择关联设备（第二列点击）
  const handleSelectLinkedEquipment = (equipmentId: string) => {
    setSelectedEquipmentId(equipmentId);
  };

  // 更新设备的类型字段
  const updateEquipmentTypes = async (equipmentIds: string[], typeName: string | null) => {
    try {
      for (const id of equipmentIds) {
        await supabase
          .from('equipment')
          .update({ type: typeName })
          .eq('id', id);
      }
      onEquipmentRefresh?.();
    } catch (error) {
      console.error('更新设备类型失败:', error);
    }
  };

  // 切换批量选择
  const handleToggleBatchSelect = (equipmentId: string) => {
    const newSet = new Set(batchSelectedIds);
    if (newSet.has(equipmentId)) {
      newSet.delete(equipmentId);
    } else {
      newSet.add(equipmentId);
    }
    setBatchSelectedIds(newSet);
  };

  // 批量关联设备
  const handleBatchLink = async () => {
    if (!selectedType || batchSelectedIds.size === 0) return;

    const idsToLink = Array.from(batchSelectedIds);
    const linkedEquipmentList = equipments.filter(eq => idsToLink.includes(eq.id));

    try {
      const { data: { session } } = await supabase.auth.getSession();
      
      // 获取批量设置的责任人信息（排除特殊值）
      const shouldUpdateResponsible = batchResponsible && batchResponsible !== '__keep_original__';
      const batchUser = shouldUpdateResponsible ? users.find(u => u.username === batchResponsible) : null;
      
      // 批量更新数据库中的 type 字段和责任人
      for (const equipmentId of idsToLink) {
        const updateData: Record<string, unknown> = { 
          type: selectedType.name
        };
        
        // 如果设置了批量责任人（非保持原有），则更新责任人
        if (shouldUpdateResponsible) {
          updateData.responsible = batchResponsible;
          updateData.responsible_email = batchUser?.email || null;
        }
        
        await supabase
          .from('equipment')
          .update(updateData)
          .eq('id', equipmentId);
      }

      // 如果需要创建维护计划
      if (createMaintenancePlan && maintenanceDate) {
        const nextDueDate = format(maintenanceDate, 'yyyy-MM-dd');
        const scheduleTitle = maintenanceTitle.trim() || `${selectedType.name} 维护`;
        // 确保维护描述一定有值 - 优先使用用户输入的，否则自动生成
        const baseDescription = maintenanceDescription.trim();
        
        // 同时创建维护模板（如果不存在相同标题的模板）
        const existingTemplate = maintenanceTemplates.find(t => t.title === scheduleTitle);
        if (!existingTemplate) {
          const newTemplate: MaintenanceTemplate = {
            id: `template-${Date.now()}`,
            title: scheduleTitle,
            description: baseDescription || `${selectedType.name} 设备定期维护`,
            frequency: maintenanceFrequency as 'daily' | 'weekly' | 'monthly' | 'quarterly' | 'yearly',
            reminder_days_before: maintenanceReminderDays
          };
          saveTemplates([...maintenanceTemplates, newTemplate]);
        }
        
        for (const eq of linkedEquipmentList) {
          // 确定责任人：优先使用批量设置的责任人（非保持原有），其次是设备原有的责任人
          const assignedName = shouldUpdateResponsible ? batchResponsible : (eq.responsible || null);
          const assignedEmail = shouldUpdateResponsible ? (batchUser?.email || null) : (eq.responsible_email || null);
          const assignedUser = users.find(u => u.username === assignedName);
          
          // 确保每个设备的维护内容都有值 - 使用基础描述或设备特定描述
          const equipmentDescription = baseDescription || `${scheduleTitle} - ${eq.name}`;
          
          // 检查是否已有相同标题的维护计划（而不是任意维护计划）
          const { data: existingWithTitle } = await supabase
            .from('maintenance_schedules')
            .select('id, description')
            .eq('equipment_id', eq.id)
            .eq('title', scheduleTitle)
            .eq('is_active', true)
            .limit(1);
          
          if (!existingWithTitle || existingWithTitle.length === 0) {
            // 该设备没有相同标题的维护计划，创建新计划
            const { error: insertError } = await supabase
              .from('maintenance_schedules')
              .insert({
                equipment_id: eq.id,
                title: scheduleTitle,
                description: equipmentDescription,
                frequency: maintenanceFrequency,
                next_due_date: nextDueDate,
                reminder_days_before: maintenanceReminderDays,
                assigned_name: assignedName,
                assigned_email: assignedEmail,
                assigned_user_id: assignedUser?.user_id || null,
                is_active: true,
                created_by: session?.user?.id || null
              });
            
            if (insertError) {
              console.error(`创建维护计划失败 (${eq.id}):`, insertError);
            } else {
              console.log(`成功创建维护计划: ${scheduleTitle} for ${eq.id}`);
            }
          } else if (existingWithTitle[0]) {
            // 已有同标题计划：更新描述（保留旧计划，用新描述覆盖）
            await supabase
              .from('maintenance_schedules')
              .update({ description: equipmentDescription })
              .eq('id', existingWithTitle[0].id);
          }
        }
      }

      // 更新 localStorage 中的 equipmentIds（保持同步，但数据库为真实来源）
      const currentDbLinkedIds = equipments.filter(eq => eq.type === selectedType.name).map(eq => eq.id);
      const allLinkedIds = [...new Set([...currentDbLinkedIds, ...idsToLink])];
      
      const newTypes = types.map(t => 
        t.id === selectedTypeId 
          ? { ...t, equipmentIds: allLinkedIds }
          : t
      );
      saveTypes(newTypes);
      setBatchSelectedIds(new Set());
      setShowBatchSettings(false);
      setBatchResponsible('');
      
      // 刷新设备数据
      await onEquipmentRefresh?.();
      
      toast({
        title: '批量关联成功',
        description: `已关联 ${idsToLink.length} 台设备${createMaintenancePlan ? '，并创建了维护计划和模板' : ''}`,
      });
    } catch (error) {
      console.error('批量关联失败:', error);
      toast({
        title: '关联失败',
        description: '部分设备关联失败',
        variant: 'destructive'
      });
    }
  };

  // 解除关联单个设备
  const handleUnlinkEquipment = async (equipmentId: string) => {
    if (!selectedType) return;

    try {
      // 更新数据库
      await supabase
        .from('equipment')
        .update({ type: null })
        .eq('id', equipmentId);

      // 更新 localStorage（保持同步）
      const currentDbLinkedIds = equipments.filter(eq => eq.type === selectedType.name && eq.id !== equipmentId).map(eq => eq.id);
      
      const newTypes = types.map(t => 
        t.id === selectedTypeId 
          ? { ...t, equipmentIds: currentDbLinkedIds }
          : t
      );
      saveTypes(newTypes);
      
      // 如果解除的是当前选中的设备，清除选择
      if (selectedEquipmentId === equipmentId) {
        setSelectedEquipmentId(null);
      }
      
      // 刷新设备数据
      await onEquipmentRefresh?.();
      
      toast({
        title: '已解除关联',
        description: '设备已从该类型中移除',
      });
    } catch (error) {
      console.error('解除关联失败:', error);
      toast({
        title: '解除关联失败',
        description: '操作失败，请重试',
        variant: 'destructive'
      });
    }
  };

  // 全选/取消全选未关联设备（使用过滤后的列表）
  const handleSelectAllUnlinked = () => {
    const targetEquipments = searchQuery ? filteredUnlinkedEquipments : unlinkedEquipments;
    if (batchSelectedIds.size === targetEquipments.length && targetEquipments.length > 0) {
      setBatchSelectedIds(new Set());
    } else {
      setBatchSelectedIds(new Set(targetEquipments.map(eq => eq.id)));
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleAddType();
    }
  };

  // ========== 维护模板管理功能 ==========
  const resetTemplateForm = () => {
    setTemplateFormData({ title: '', description: '', frequency: 'monthly', reminder_days_before: 7 });
    clearTemplateForm();
    tplFreqRef.current = 'monthly';
    tplRemindRef.current = 7;
  };

  const handleAddTemplate = () => {
    if (!templateFormData.title) {
      toast({
        title: '错误',
        description: '请填写模板标题',
        variant: 'destructive'
      });
      return;
    }

    const form = readTemplateForm();
    if (!form.title) { toast({ title: '错误', description: '请填写模板标题', variant: 'destructive' }); return; }

    const newTemplate: MaintenanceTemplate = {
      id: `template-${Date.now()}`,
      ...form,
    };

    saveTemplates([...maintenanceTemplates, newTemplate]);
    setShowAddTemplateModal(false);
    resetTemplateForm();
    clearTemplateForm();
    
    toast({ title: '成功', description: '维护模板已添加' });
  };

  const handleEditTemplate = (template: MaintenanceTemplate) => {
    setEditingTemplate(template);
    // 通过 DOM 设置非受控输入的值
    setTimeout(() => {
      if (tplTitleRef.current) tplTitleRef.current.value = template.title;
      if (tplDescRef.current) tplDescRef.current.value = template.description || '';
    }, 50);
    tplFreqRef.current = template.frequency;
    tplRemindRef.current = template.reminder_days_before;
    setShowEditTemplateModal(true);
  };

  const handleUpdateTemplate = () => {
    const form = readTemplateForm();
    if (!editingTemplate || !form.title) {
      toast({ title: '错误', description: '请填写模板标题', variant: 'destructive' });
      return;
    }

    const updatedTemplates = maintenanceTemplates.map(t =>
      t.id === editingTemplate.id ? { ...t, ...form } : t
    );
    saveTemplates(updatedTemplates);
    setShowEditTemplateModal(false); setEditingTemplate(null); resetTemplateForm(); clearTemplateForm();
    
    toast({ title: '成功', description: '维护模板已更新' });
  };

  const handleDeleteTemplate = (templateId: string) => {
    if (!window.confirm('确定要删除这个维护模板吗？')) return;
    
    const updatedTemplates = maintenanceTemplates.filter(t => t.id !== templateId);
    saveTemplates(updatedTemplates);
    
    toast({ title: '成功', description: '维护模板已删除' });
  };

  // 应用模板到关联设备
  const handleApplyTemplate = async () => {
    if (!applyingTemplate || !selectedType || !applyTemplateDate) return;

    try {
      const { data: { session } } = await supabase.auth.getSession();
      const nextDueDate = format(applyTemplateDate, 'yyyy-MM-dd');
      
      let targetEquipments: Equipment[];
      if (applyMode === 'all') {
        targetEquipments = linkedEquipments;
      } else {
        targetEquipments = linkedEquipments.filter(eq => templateSelectedIds.has(eq.id));
      }

      if (targetEquipments.length === 0) {
        toast({
          title: '请选择设备',
          description: '请至少选择一台设备来应用模板',
          variant: 'destructive'
        });
        return;
      }

      let createdCount = 0;
      let skippedCount = 0;

      for (const eq of targetEquipments as Equipment[]) {
        // 检查是否已有相同标题的维护计划
        const { data: existing } = await supabase
          .from('maintenance_schedules')
          .select('id')
          .eq('equipment_id', eq.id)
          .eq('title', applyingTemplate.title)
          .eq('is_active', true)
          .limit(1);

        if (existing && existing.length > 0) {
          skippedCount++;
          continue;
        }

        const user = users.find(u => u.username === eq.responsible);
        
        // 确保维护内容一定包含在内 - 使用模板描述，如果没有则使用设备名称生成
        const scheduleDescription = applyingTemplate.description && applyingTemplate.description.trim() 
          ? applyingTemplate.description 
          : `${applyingTemplate.title} - ${eq.name}`;
        
        const { error } = await supabase
          .from('maintenance_schedules')
          .insert({
            equipment_id: eq.id,
            title: applyingTemplate.title,
            description: scheduleDescription,
            frequency: applyingTemplate.frequency,
            next_due_date: nextDueDate,
            reminder_days_before: applyingTemplate.reminder_days_before,
            assigned_name: eq.responsible || null,
            assigned_email: user?.email || eq.responsible_email || null,
            assigned_user_id: user?.user_id || null,
            is_active: true,
            created_by: session?.user?.id || null
          });

        if (!error) {
          createdCount++;
        }
      }

      // 刷新当前选中设备的维护计划
      if (selectedEquipmentId) {
        await fetchEquipmentSchedules(selectedEquipmentId);
      }
      onEquipmentRefresh?.();

      const messages = [];
      if (createdCount > 0) messages.push(`创建 ${createdCount} 个维护计划`);
      if (skippedCount > 0) messages.push(`跳过 ${skippedCount} 个已存在的计划`);

      toast({
        title: '应用完成',
        description: messages.join('，') || '无变更',
      });

      setShowApplyTemplateModal(false);
      setApplyingTemplate(null);
      setApplyTemplateDate(getEndOfCurrentMonth());
    } catch (error) {
      console.error('应用模板失败:', error);
      toast({
        title: '应用失败',
        description: '部分维护计划创建失败',
        variant: 'destructive'
      });
    }
  };

  // ========== 维护计划管理功能 ==========
  const resetScheduleForm = () => {
    setScheduleFormData({
      title: '',
      description: '',
      frequency: 'monthly',
      next_due_date: format(getEndOfCurrentMonth(), 'yyyy-MM-dd'),
      reminder_days_before: 7,
      assigned_user_id: ''
    });
  };

  const handleAddSchedule = async () => {
    if (!selectedEquipmentId || !scheduleFormData.title || !scheduleFormData.next_due_date) {
      toast({
        title: '错误',
        description: '请填写标题和下次维护日期',
        variant: 'destructive'
      });
      return;
    }

    try {
      const { data: { session } } = await supabase.auth.getSession();
      const selectedUser = users.find(u => u.user_id === scheduleFormData.assigned_user_id);
      
      const { error } = await supabase
        .from('maintenance_schedules')
        .insert({
          equipment_id: selectedEquipmentId,
          title: scheduleFormData.title,
          description: scheduleFormData.description || null,
          frequency: scheduleFormData.frequency,
          next_due_date: scheduleFormData.next_due_date,
          reminder_days_before: scheduleFormData.reminder_days_before,
          assigned_user_id: scheduleFormData.assigned_user_id || null,
          assigned_name: selectedUser?.username || null,
          assigned_email: selectedUser?.email || null,
          created_by: session?.user?.id || null,
          is_active: true
        });

      if (error) {
        if (error.code === '42501') {
          toast({
            title: '权限不足',
            description: '请先登录后再操作',
            variant: 'destructive'
          });
          return;
        }
        throw error;
      }

      toast({ title: '成功', description: '维护计划已添加' });
      setShowAddScheduleModal(false);
      resetScheduleForm();
      fetchEquipmentSchedules(selectedEquipmentId);
      onEquipmentRefresh?.();
    } catch (error) {
      console.error('添加维护计划失败:', error);
      toast({
        title: '添加失败',
        description: '维护计划添加失败',
        variant: 'destructive'
      });
    }
  };

  const handleEditSchedule = (schedule: MaintenanceSchedule) => {
    setEditingSchedule(schedule);
    setScheduleFormData({
      title: schedule.title,
      description: schedule.description || '',
      frequency: schedule.frequency,
      next_due_date: schedule.next_due_date,
      reminder_days_before: schedule.reminder_days_before,
      assigned_user_id: schedule.assigned_user_id || ''
    });
    setShowEditScheduleModal(true);
  };

  const handleUpdateSchedule = async () => {
    if (!editingSchedule || !scheduleFormData.title || !scheduleFormData.next_due_date) {
      toast({
        title: '错误',
        description: '请填写标题和下次维护日期',
        variant: 'destructive'
      });
      return;
    }

    try {
      const selectedUser = users.find(u => u.user_id === scheduleFormData.assigned_user_id);
      
      const { error } = await supabase
        .from('maintenance_schedules')
        .update({
          title: scheduleFormData.title,
          description: scheduleFormData.description || null,
          frequency: scheduleFormData.frequency,
          next_due_date: scheduleFormData.next_due_date,
          reminder_days_before: scheduleFormData.reminder_days_before,
          assigned_user_id: scheduleFormData.assigned_user_id || null,
          assigned_name: selectedUser?.username || null,
          assigned_email: selectedUser?.email || null,
          reminder_sent: false
        })
        .eq('id', editingSchedule.id);

      if (error) throw error;

      toast({ title: '成功', description: '维护计划已更新' });
      setShowEditScheduleModal(false);
      setEditingSchedule(null);
      resetScheduleForm();
      if (selectedEquipmentId) {
        fetchEquipmentSchedules(selectedEquipmentId);
      }
      onEquipmentRefresh?.();
    } catch (error) {
      console.error('更新维护计划失败:', error);
      toast({
        title: '更新失败',
        description: '维护计划更新失败',
        variant: 'destructive'
      });
    }
  };

  const handleDeleteSchedule = async (scheduleId: string) => {
    if (!window.confirm('确定要删除这个维护计划吗？')) return;

    try {
      const { error } = await supabase
        .from('maintenance_schedules')
        .update({ is_active: false })
        .eq('id', scheduleId);

      if (error) throw error;

      toast({ title: '成功', description: '维护计划已删除' });
      if (selectedEquipmentId) {
        fetchEquipmentSchedules(selectedEquipmentId);
      }
      onEquipmentRefresh?.();
    } catch (error) {
      console.error('删除维护计划失败:', error);
      toast({
        title: '删除失败',
        description: '维护计划删除失败',
        variant: 'destructive'
      });
    }
  };

  const handleCompleteSchedule = async (schedule: MaintenanceSchedule) => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      
      // Calculate next due date based on frequency
      const currentDate = new Date(schedule.next_due_date);
      const nextDate = new Date(currentDate);
      
      switch (schedule.frequency) {
        case 'daily':
          nextDate.setDate(nextDate.getDate() + 1);
          break;
        case 'weekly':
          nextDate.setDate(nextDate.getDate() + 7);
          break;
        case 'monthly':
          nextDate.setMonth(nextDate.getMonth() + 1);
          break;
        case 'quarterly':
          nextDate.setMonth(nextDate.getMonth() + 3);
          break;
        case 'yearly':
          nextDate.setFullYear(nextDate.getFullYear() + 1);
          break;
      }

      // Update schedule with next due date
      const { error: scheduleError } = await supabase
        .from('maintenance_schedules')
        .update({
          next_due_date: nextDate.toISOString().split('T')[0],
          last_completed_at: new Date().toISOString(),
          reminder_sent: false
        })
        .eq('id', schedule.id);

      if (scheduleError) throw scheduleError;

      // Log the completion
      await supabase
        .from('maintenance_logs')
        .insert({
          schedule_id: schedule.id,
          equipment_id: selectedEquipmentId,
          completed_by: session?.user?.id,
          completed_by_name: session?.user?.email?.split('@')[0] || 'Unknown'
        });

      toast({ title: '成功', description: '维护已完成，下次维护日期已更新' });
      if (selectedEquipmentId) {
        fetchEquipmentSchedules(selectedEquipmentId);
      }
      onEquipmentRefresh?.();
    } catch (error) {
      console.error('完成维护失败:', error);
      toast({
        title: '操作失败',
        description: '完成维护失败',
        variant: 'destructive'
      });
    }
  };

  // 模板表单组件
  const tplTitleRef = useRef<HTMLInputElement>(null);
  const tplDescRef = useRef<HTMLTextAreaElement>(null);
  const tplFreqRef = useRef('monthly');
  const tplRemindRef = useRef(7);

  const readTemplateForm = () => ({
    title: tplTitleRef.current?.value || '',
    description: tplDescRef.current?.value || '',
    frequency: tplFreqRef.current,
    reminder_days_before: tplRemindRef.current,
  });

  const clearTemplateForm = () => {
    if (tplTitleRef.current) tplTitleRef.current.value = '';
    if (tplDescRef.current) tplDescRef.current.value = '';
  };

  const TemplateFormContent = ({ onSubmit, submitLabel }: { onSubmit: () => void; submitLabel: string }) => (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label>模板标题 *</Label>
        <Input ref={tplTitleRef} placeholder="输入维护模板标题" />
      </div>
      <div className="space-y-2">
        <Label>描述</Label>
        <Textarea ref={tplDescRef as any} placeholder="输入维护描述" rows={2} />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>维护周期</Label>
          <Select defaultValue="monthly" onValueChange={(v: any) => { tplFreqRef.current = v; }}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {Object.entries(frequencyLabels).map(([value, label]) => (
                <SelectItem key={value} value={value}>{label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label>提前提醒天数</Label>
          <Input
            type="number"
            min={1}
            max={30}
            value={templateFormData.reminder_days_before}
            onBlur={(e) => { tplRemindRef.current = parseInt(e.target.value) || 7; }}
          />
        </div>
      </div>
      <DialogFooter>
        <Button variant="outline" onClick={() => {
          setShowAddTemplateModal(false);
          setShowEditTemplateModal(false);
          setEditingTemplate(null);
          resetTemplateForm();
        }}>
          取消
        </Button>
        <Button onClick={onSubmit}>{submitLabel}</Button>
      </DialogFooter>
    </div>
  );

  // 维护计划表单组件
  const ScheduleFormContent = ({ onSubmit, submitLabel }: { onSubmit: () => void; submitLabel: string }) => (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label>维护标题 *</Label>
        <Input
          value={scheduleFormData.title}
          onChange={(e) => setScheduleFormData(prev => ({ ...prev, title: e.target.value }))}
          placeholder="输入维护标题"
        />
      </div>
      <div className="space-y-2">
        <Label>描述</Label>
        <Textarea
          value={scheduleFormData.description}
          onChange={(e) => setScheduleFormData(prev => ({ ...prev, description: e.target.value }))}
          placeholder="输入维护描述"
          rows={2}
        />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>维护周期</Label>
          <Select
            value={scheduleFormData.frequency}
            onValueChange={(value) => setScheduleFormData(prev => ({ ...prev, frequency: value as typeof prev.frequency }))}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {Object.entries(frequencyLabels).map(([value, label]) => (
                <SelectItem key={value} value={value}>{label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label>下次维护日期 *</Label>
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" className="w-full justify-start text-left font-normal">
                <Calendar className="mr-2 h-4 w-4" />
                {scheduleFormData.next_due_date || '选择日期'}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0 z-[200]" align="start">
              <CalendarComponent
                mode="single"
                selected={scheduleFormData.next_due_date ? new Date(scheduleFormData.next_due_date) : undefined}
                onSelect={(date) => date && setScheduleFormData(prev => ({ 
                  ...prev, 
                  next_due_date: format(date, 'yyyy-MM-dd') 
                }))}
                initialFocus
                className="pointer-events-auto"
              />
            </PopoverContent>
          </Popover>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>提前提醒天数</Label>
          <Input
            type="number"
            min={1}
            max={30}
            value={scheduleFormData.reminder_days_before}
            onChange={(e) => setScheduleFormData(prev => ({ 
              ...prev, 
              reminder_days_before: parseInt(e.target.value) || 7 
            }))}
          />
        </div>
        <div className="space-y-2">
          <Label>负责人</Label>
          <Select
            value={scheduleFormData.assigned_user_id || '__none__'}
            onValueChange={(value) => setScheduleFormData(prev => ({ 
              ...prev, 
              assigned_user_id: value === '__none__' ? '' : value 
            }))}
          >
            <SelectTrigger>
              <SelectValue placeholder="选择负责人" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__none__">不指定</SelectItem>
              {users.map(user => (
                <SelectItem key={user.user_id} value={user.user_id}>
                  {user.username}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
      <DialogFooter>
        <Button variant="outline" onClick={() => {
          setShowAddScheduleModal(false);
          setShowEditScheduleModal(false);
          setEditingSchedule(null);
          resetScheduleForm();
        }}>
          取消
        </Button>
        <Button onClick={onSubmit}>{submitLabel}</Button>
      </DialogFooter>
    </div>
  );

  return (
    <>
      <Dialog open={isOpen} onOpenChange={onClose}>
        <DialogContent className="max-w-6xl max-h-[85vh] overflow-hidden flex flex-col" style={{
            backgroundImage: selectedType?.sharedImageUrl ? `url(${selectedType.sharedImageUrl})` : linkedEquipments[0]?.imageUrl ? `url(${linkedEquipments[0].imageUrl})` : undefined,
            backgroundSize: 'cover', backgroundPosition: 'center', backgroundRepeat: 'no-repeat',
          }}>
            {/* 暗色玻璃遮罩 */}
            <div className="absolute inset-0 bg-black/30 backdrop-blur-sm pointer-events-none" />
          <DialogHeader className="relative z-10">
            <DialogTitle className="flex items-center gap-2 text-white">
              <Tags className="h-5 w-5" />
              设备类型管理
            </DialogTitle>
            <DialogDescription className="text-white/70">
              三列布局：设备类型 → 关联设备 → 维护计划模板与管理
            </DialogDescription>
          </DialogHeader>

          <div className="flex-1 grid grid-cols-[240px_1fr_1fr] gap-4 overflow-hidden relative z-10">
            {/* 第一列：类型列表 */}
            <div className="flex flex-col space-y-3 overflow-hidden border border-white/20 rounded-lg bg-black/20 backdrop-blur-md p-3 relative z-10">
              <h3 className="font-semibold text-sm flex items-center gap-2">
                <Tags className="h-4 w-4" />
                设备类型
              </h3>
              
              {/* 添加新类型 */}
              <div className="flex gap-2">
                <Input
                  ref={newTypeInputRef}
                  placeholder="新类型名称"
                  className="flex-1 h-8 text-sm"
                  onKeyDown={handleKeyDown}
                />
                <Button onClick={handleAddType} size="sm" className="h-8 px-2">
                  <Plus className="h-4 w-4" />
                </Button>
              </div>

              {/* 类型列表 */}
              <ScrollArea className="flex-1">
                <div className="space-y-1 pr-2">
                  {types.length === 0 ? (
                    <p className="text-xs text-muted-foreground py-4 text-center">
                      暂无类型，请添加
                    </p>
                  ) : (
                    types.map(type => (
                      <div
                        key={type.id}
                        className={`flex items-center justify-between p-2 rounded-lg cursor-pointer transition-colors ${
                          selectedTypeId === type.id 
                            ? 'bg-primary/10 border border-primary/30' 
                            : 'bg-background border hover:bg-muted/50'
                        }`}
                        onClick={() => handleSelectType(type)}
                      >
                        {editingTypeId === type.id ? (
                          <div className="flex items-center gap-1 flex-1" onClick={e => e.stopPropagation()}>
                            <Input
                              value={editName}
                              onChange={(e) => setEditName(e.target.value)}
                              className="flex-1 h-6 text-xs"
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') handleSaveEdit();
                                if (e.key === 'Escape') handleCancelEdit();
                              }}
                              autoFocus
                            />
                            <Button size="icon" variant="ghost" className="h-6 w-6" onClick={handleSaveEdit}>
                              <Save className="h-3 w-3" />
                            </Button>
                            <Button size="icon" variant="ghost" className="h-6 w-6" onClick={handleCancelEdit}>
                              <X className="h-3 w-3" />
                            </Button>
                          </div>
                        ) : (
                          <>
                            <div className="flex items-center gap-1.5 flex-1 min-w-0">
                              <span className="font-medium text-xs truncate">{type.name}</span>
                              <Badge variant="secondary" className="text-xs shrink-0 h-5">
                                {equipments.filter(eq => eq.type === type.name).length}
                              </Badge>
                            </div>
                            <div className="flex items-center gap-0.5" onClick={e => e.stopPropagation()}>
                              <Button
                                size="icon"
                                variant="ghost"
                                className="h-6 w-6"
                                onClick={() => handleStartEdit(type)}
                              >
                                <Edit2 className="h-3 w-3" />
                              </Button>
                              <Button
                                size="icon"
                                variant="ghost"
                                className="h-6 w-6 text-destructive hover:text-destructive"
                                onClick={() => handleDeleteType(type.id)}
                              >
                                <Trash2 className="h-3 w-3" />
                              </Button>
                            </div>
                          </>
                        )}
                      </div>
                    ))
                  )}
                </div>
              </ScrollArea>
            </div>

            {/* 第二列：关联设备列表 */}
            <div className="flex flex-col overflow-hidden border border-white/20 rounded-lg bg-black/20 backdrop-blur-md relative z-10">
              {selectedType ? (
                <>
                  <div className="p-3 border-b bg-background">
                    <div className="flex items-center justify-between">
                      <h3 className="font-semibold text-sm">{selectedType.name} - 关联设备</h3>
                      <Button
                        variant={isLinkingMode ? "default" : "outline"}
                        size="sm"
                        className="h-7 text-xs"
                        onClick={() => setIsLinkingMode(!isLinkingMode)}
                      >
                        <Link2 className="h-3.5 w-3.5 mr-1" />
                        {isLinkingMode ? '完成' : '关联'}
                      </Button>
                    </div>
                  </div>

                  <ScrollArea className="flex-1 p-3">
                    {isLinkingMode ? (
                      /* 设备关联模式 */
                      <div className="space-y-3">
                        {/* 搜索框 */}
                        <div className="relative">
                          <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                          <Input
                            placeholder="搜索设备..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="pl-7 h-8 text-xs"
                          />
                        </div>

                        {/* 已关联设备 */}
                        <div>
                          <h4 className="font-medium text-xs flex items-center gap-1.5 mb-2">
                            <Check className="h-3.5 w-3.5 text-green-500" />
                            已关联 ({linkedEquipments.length})
                          </h4>
                          {linkedEquipments.length === 0 ? (
                            <p className="text-xs text-muted-foreground py-2">暂无关联设备</p>
                          ) : (
                            <div className="space-y-1">
                              {linkedEquipments.map(eq => (
                                <div
                                  key={eq.id}
                                  className="flex items-center justify-between p-2 bg-primary/5 border border-primary/20 rounded-md"
                                >
                                  <div className="flex-1 min-w-0">
                                    <span className="font-medium text-xs">{eq.name}</span>
                                    <span className="text-xs text-muted-foreground ml-2">{eq.id}</span>
                                  </div>
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    className="h-6 text-xs text-destructive hover:text-destructive"
                                    onClick={() => handleUnlinkEquipment(eq.id)}
                                  >
                                    <Unlink className="h-3 w-3 mr-1" />
                                    解除
                                  </Button>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>

                        <Separator />

                        {/* 可关联设备 */}
                        <Collapsible open={!unlinkedCollapsed} onOpenChange={(open) => setUnlinkedCollapsed(!open)}>
                          <CollapsibleTrigger asChild>
                            <div className="flex items-center justify-between cursor-pointer py-1 hover:bg-muted/50 rounded px-1">
                              <h4 className="font-medium text-xs flex items-center gap-1.5">
                                <Link2 className="h-3.5 w-3.5 text-muted-foreground" />
                                可关联 ({filteredUnlinkedEquipments.length})
                              </h4>
                              <div className="flex items-center gap-2">
                                {filteredUnlinkedEquipments.length > 0 && (
                                  <>
                                    <Button
                                      size="sm"
                                      variant="ghost"
                                      className="h-6 text-xs"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        handleSelectAllUnlinked();
                                      }}
                                    >
                                      {batchSelectedIds.size === filteredUnlinkedEquipments.length ? '取消' : '全选'}
                                    </Button>
                                    {batchSelectedIds.size > 0 && (
                                      <Popover open={showBatchSettings} onOpenChange={setShowBatchSettings}>
                                        <PopoverTrigger asChild>
                                          <Button
                                            size="sm"
                                            className="h-6 text-xs"
                                            onClick={(e) => e.stopPropagation()}
                                          >
                                            关联 ({batchSelectedIds.size})
                                          </Button>
                                        </PopoverTrigger>
                                        <PopoverContent 
                                          className="w-80 max-h-[70vh] overflow-hidden z-50 flex flex-col" 
                                          align="start" 
                                          side="bottom"
                                          sideOffset={5}
                                          avoidCollisions={true}
                                          collisionPadding={20}
                                          onClick={(e) => e.stopPropagation()}
                                        >
                                          {/* 固定头部：标题 + 顶部确定按钮 */}
                                          <div className="flex items-center justify-between border-b pb-2 mb-2 shrink-0">
                                            <h4 className="font-medium text-sm">批量关联设置</h4>
                                            <Button
                                              size="sm"
                                              className="h-7 text-xs"
                                              onClick={handleBatchLink}
                                            >
                                              确定关联
                                            </Button>
                                          </div>
                                          
                                          {/* 可滚动内容区 */}
                                          <div className="flex-1 min-h-0 overflow-y-auto space-y-3 pr-1">
                                            <div className="space-y-2">
                                              <Label className="text-xs">统一责任人</Label>
                                              <Select value={batchResponsible || '__keep_original__'} onValueChange={setBatchResponsible}>
                                                <SelectTrigger className="h-8 text-xs">
                                                  <SelectValue placeholder="保持原有" />
                                                </SelectTrigger>
                                                <SelectContent className="z-[100]">
                                                  <SelectItem value="__keep_original__">保持原有责任人</SelectItem>
                                                  {users.map(user => (
                                                    <SelectItem key={user.id} value={user.username}>
                                                      {user.username}
                                                    </SelectItem>
                                                  ))}
                                                </SelectContent>
                                              </Select>
                                            </div>
                                            
                                            <div className="flex items-center justify-between">
                                              <Label className="text-xs">创建维护计划</Label>
                                              <Switch
                                                checked={createMaintenancePlan}
                                                onCheckedChange={setCreateMaintenancePlan}
                                              />
                                            </div>
                                            
                                            {createMaintenancePlan && (
                                              <>
                                                <div className="space-y-2">
                                                  <Label className="text-xs">维护内容 (标题)</Label>
                                                  <Input
                                                    value={maintenanceTitle}
                                                    onChange={(e) => setMaintenanceTitle(e.target.value)}
                                                    placeholder={`${selectedType?.name || '设备'} 维护`}
                                                    className="h-8 text-xs"
                                                  />
                                                </div>
                                                <div className="space-y-2">
                                                  <Label className="text-xs">维护描述</Label>
                                                  <Textarea
                                                    value={maintenanceDescription}
                                                    onChange={(e) => setMaintenanceDescription(e.target.value)}
                                                    placeholder="详细描述维护工作内容..."
                                                    className="text-xs min-h-[50px] max-h-[80px]"
                                                  />
                                                </div>
                                                <div className="space-y-2">
                                                  <Label className="text-xs">维护周期</Label>
                                                  <Select value={maintenanceFrequency} onValueChange={setMaintenanceFrequency}>
                                                    <SelectTrigger className="h-8 text-xs">
                                                      <SelectValue />
                                                    </SelectTrigger>
                                                    <SelectContent className="z-[100]">
                                                      {Object.entries(frequencyLabels).map(([value, label]) => (
                                                        <SelectItem key={value} value={value}>{label}</SelectItem>
                                                      ))}
                                                    </SelectContent>
                                                  </Select>
                                                </div>
                                                <div className="space-y-2">
                                                  <Label className="text-xs">首次维护日期</Label>
                                                  <Popover>
                                                    <PopoverTrigger asChild>
                                                      <Button variant="outline" className="w-full h-8 text-xs justify-start">
                                                        <Calendar className="mr-2 h-3.5 w-3.5" />
                                                        {maintenanceDate ? format(maintenanceDate, 'yyyy-MM-dd') : '选择日期'}
                                                      </Button>
                                                    </PopoverTrigger>
                                                    <PopoverContent className="w-auto p-0 z-[150]" align="start" side="top">
                                                      <CalendarComponent
                                                        mode="single"
                                                        selected={maintenanceDate}
                                                        onSelect={setMaintenanceDate}
                                                        initialFocus
                                                        className="pointer-events-auto"
                                                      />
                                                    </PopoverContent>
                                                  </Popover>
                                                </div>
                                                <div className="space-y-2">
                                                  <Label className="text-xs">提前提醒天数</Label>
                                                  <Select 
                                                    value={String(maintenanceReminderDays)} 
                                                    onValueChange={(v) => setMaintenanceReminderDays(parseInt(v))}
                                                  >
                                                    <SelectTrigger className="h-8 text-xs">
                                                      <SelectValue />
                                                    </SelectTrigger>
                                                    <SelectContent className="z-[100]">
                                                      <SelectItem value="0">当天提醒</SelectItem>
                                                      <SelectItem value="1">提前 1 天</SelectItem>
                                                      <SelectItem value="2">提前 2 天</SelectItem>
                                                      <SelectItem value="3">提前 3 天</SelectItem>
                                                      <SelectItem value="5">提前 5 天</SelectItem>
                                                      <SelectItem value="7">提前 7 天</SelectItem>
                                                      <SelectItem value="14">提前 14 天</SelectItem>
                                                    </SelectContent>
                                                  </Select>
                                                </div>
                                              </>
                                            )}
                                          </div>
                                          
                                          {/* 固定底部：取消 + 确定关联 */}
                                          <div className="flex gap-2 pt-3 mt-2 border-t shrink-0">
                                            <Button
                                              variant="outline"
                                              size="sm"
                                              className="flex-1"
                                              onClick={() => setShowBatchSettings(false)}
                                            >
                                              取消
                                            </Button>
                                            <Button
                                              size="sm"
                                              className="flex-1"
                                              onClick={handleBatchLink}
                                            >
                                              确定关联
                                            </Button>
                                          </div>
                                        </PopoverContent>
                                      </Popover>
                                    )}
                                  </>
                                )}
                                {unlinkedCollapsed ? (
                                  <ChevronDown className="h-4 w-4 text-muted-foreground" />
                                ) : (
                                  <ChevronUp className="h-4 w-4 text-muted-foreground" />
                                )}
                              </div>
                            </div>
                          </CollapsibleTrigger>
                          <CollapsibleContent>
                            {filteredUnlinkedEquipments.length === 0 ? (
                              <p className="text-xs text-muted-foreground py-2 mt-2">
                                {searchQuery ? '无匹配设备' : '所有设备已关联'}
                              </p>
                            ) : (
                              <div className="space-y-1 mt-2">
                                {filteredUnlinkedEquipments.map(eq => (
                                  <div
                                    key={eq.id}
                                    className={`flex items-center gap-2 p-2 border rounded-md cursor-pointer transition-colors ${
                                      batchSelectedIds.has(eq.id) 
                                        ? 'bg-primary/10 border-primary/30' 
                                        : 'bg-background hover:bg-muted/50'
                                    }`}
                                    onClick={() => handleToggleBatchSelect(eq.id)}
                                  >
                                    <Checkbox 
                                      checked={batchSelectedIds.has(eq.id)}
                                      onCheckedChange={() => handleToggleBatchSelect(eq.id)}
                                      onClick={(e) => e.stopPropagation()}
                                    />
                                    <div className="flex-1 min-w-0">
                                      <span className="font-medium text-xs">{eq.name}</span>
                                      <span className="text-xs text-muted-foreground ml-2">{eq.id}</span>
                                      {eq.responsible && (
                                        <span className="text-xs text-primary ml-2">· {eq.responsible}</span>
                                      )}
                                    </div>
                                  </div>
                                ))}
                              </div>
                            )}
                          </CollapsibleContent>
                        </Collapsible>
                      </div>
                    ) : (
                      /* 查看模式：显示关联设备列表，点击选择查看维护计划 */
                      <div className="space-y-1">
                        {linkedEquipments.length === 0 ? (
                          <div className="text-center py-8">
                            <Link2 className="h-8 w-8 mx-auto mb-2 text-muted-foreground/30" />
                            <p className="text-sm text-muted-foreground mb-2">暂无关联设备</p>
                            <Button variant="outline" size="sm" onClick={() => setIsLinkingMode(true)}>
                              <Link2 className="h-4 w-4 mr-1.5" />
                              去关联设备
                            </Button>
                          </div>
                        ) : (
                          linkedEquipments.map(eq => (
                            <div
                              key={eq.id}
                              className={`flex items-center gap-2 p-2.5 rounded-md cursor-pointer transition-colors ${
                                selectedEquipmentId === eq.id 
                                  ? 'bg-primary/10 border border-primary/30' 
                                  : 'bg-background border hover:bg-muted/50'
                              }`}
                              onClick={() => handleSelectLinkedEquipment(eq.id)}
                            >
                              <Check className="h-3.5 w-3.5 text-green-500 shrink-0" />
                              <div className="flex-1 min-w-0">
                                <div className="font-medium text-sm truncate">{eq.name}</div>
                                <div className="text-xs text-muted-foreground">
                                  {eq.id} {eq.responsible && `· ${eq.responsible}`}
                                </div>
                              </div>
                              <ChevronRight className={`h-4 w-4 text-muted-foreground transition-transform ${
                                selectedEquipmentId === eq.id ? 'rotate-90' : ''
                              }`} />
                            </div>
                          ))
                        )}
                      </div>
                    )}
                  </ScrollArea>
                </>
              ) : (
                <div className="flex-1 flex items-center justify-center text-muted-foreground">
                  <div className="text-center">
                    <Tags className="h-8 w-8 mx-auto mb-2 opacity-30" />
                    <p className="text-sm">选择左侧类型</p>
                    <p className="text-xs mt-1">查看关联设备</p>
                  </div>
                </div>
              )}
            </div>

            {/* 第三列：维护计划模板与设备维护管理 */}
            <div className="flex flex-col overflow-hidden border border-white/20 rounded-lg bg-black/20 backdrop-blur-md relative z-10">
              {selectedType ? (
                <>
                  <div className="p-3 border-b bg-background">
                    <div className="flex items-center justify-between">
                      <div>
                        <h3 className="font-semibold text-sm flex items-center gap-1.5">
                          <FileText className="h-4 w-4" />
                          维护计划模板
                        </h3>
                        <p className="text-xs text-muted-foreground">为 {selectedType.name} 创建模板，批量应用到设备</p>
                      </div>
                      <Button
                        size="sm"
                        className="h-7 text-xs"
                        onClick={() => {
                          resetTemplateForm();
                          setShowAddTemplateModal(true);
                        }}
                      >
                        <Plus className="h-3.5 w-3.5 mr-1" />
                        添加模板
                      </Button>
                    </div>
                  </div>

                  <ScrollArea className="flex-1 p-3">
                    <div className="space-y-3">
                      {/* 维护模板列表 */}
                      {maintenanceTemplates.length > 0 && (
                        <div className="space-y-2">
                          {maintenanceTemplates.map(template => (
                            <Card key={template.id} className="bg-background">
                              <CardHeader className="p-3 pb-2">
                                <div className="flex items-start justify-between">
                                  <div className="flex-1 min-w-0">
                                    <CardTitle className="text-sm font-medium truncate flex items-center gap-1.5">
                                      <FileText className="h-3.5 w-3.5 text-primary" />
                                      {template.title}
                                    </CardTitle>
                                    {template.description && (
                                      <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">
                                        {template.description}
                                      </p>
                                    )}
                                  </div>
                                  <Badge variant="secondary" className="text-xs shrink-0 ml-2">
                                    {frequencyLabels[template.frequency]}
                                  </Badge>
                                </div>
                              </CardHeader>
                              <CardContent className="p-3 pt-0">
                                <div className="flex items-center gap-1">
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    className="h-7 text-xs flex-1"
                                    onClick={() => {
                                      setApplyingTemplate(template);
                                      setApplyTemplateDate(getEndOfCurrentMonth());
                                      setApplyMode('all');
                                      setTemplateSelectedIds(new Set());
                                      setShowApplyTemplateModal(true);
                                    }}
                                  >
                                    <Copy className="h-3 w-3 mr-1" />
                                    应用到设备
                                  </Button>
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    className="h-7 w-7 p-0"
                                    onClick={() => handleEditTemplate(template)}
                                  >
                                    <Edit2 className="h-3 w-3" />
                                  </Button>
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    className="h-7 w-7 p-0 text-destructive hover:text-destructive"
                                    onClick={() => handleDeleteTemplate(template.id)}
                                  >
                                    <Trash2 className="h-3 w-3" />
                                  </Button>
                                </div>
                              </CardContent>
                            </Card>
                          ))}
                        </div>
                      )}

                      {maintenanceTemplates.length === 0 && !selectedEquipmentId && (
                        <div className="text-center py-6">
                          <FileText className="h-8 w-8 mx-auto mb-2 text-muted-foreground/30" />
                          <p className="text-sm text-muted-foreground mb-2">暂无维护模板</p>
                          <p className="text-xs text-muted-foreground mb-3">创建模板后可批量应用到关联设备</p>
                          <Button 
                            variant="outline" 
                            size="sm"
                            onClick={() => {
                              resetTemplateForm();
                              setShowAddTemplateModal(true);
                            }}
                          >
                            <Plus className="h-4 w-4 mr-1.5" />
                            创建第一个模板
                          </Button>
                        </div>
                      )}

                      {/* 选中设备的维护计划 */}
                      {selectedEquipment && selectedEquipmentId && (
                        <>
                          <Separator className="my-3" />
                          <div className="space-y-2">
                            <div className="flex items-center justify-between">
                              <div>
                                <h4 className="font-medium text-sm">{selectedEquipment.name} 的维护计划</h4>
                                <p className="text-xs text-muted-foreground">{selectedEquipment.id}</p>
                              </div>
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-7 text-xs"
                                onClick={() => {
                                  resetScheduleForm();
                                  setShowAddScheduleModal(true);
                                }}
                              >
                                <Plus className="h-3.5 w-3.5 mr-1" />
                                添加
                              </Button>
                            </div>

                            {equipmentSchedules.length === 0 ? (
                              <div className="text-center py-4">
                                <Calendar className="h-6 w-6 mx-auto mb-2 text-muted-foreground/30" />
                                <p className="text-xs text-muted-foreground">暂无维护计划</p>
                              </div>
                            ) : (
                              <div className="space-y-2">
                                {equipmentSchedules.map(schedule => {
                                  const dueDate = new Date(schedule.next_due_date);
                                  const today = new Date();
                                  const isOverdue = dueDate < today;
                                  const daysUntil = Math.ceil((dueDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
                                  
                                  return (
                                    <Card key={schedule.id} className={isOverdue ? 'border-destructive/50 bg-destructive/5' : 'bg-background'}>
                                      <CardHeader className="p-2.5 pb-1.5">
                                        <div className="flex items-start justify-between">
                                          <div className="flex-1 min-w-0">
                                            <CardTitle className="text-xs font-medium truncate">
                                              {schedule.title}
                                            </CardTitle>
                                            {schedule.description && (
                                              <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">
                                                {schedule.description}
                                              </p>
                                            )}
                                          </div>
                                          <Badge variant={isOverdue ? "destructive" : "secondary"} className="text-xs shrink-0 ml-2 h-5">
                                            {frequencyLabels[schedule.frequency]}
                                          </Badge>
                                        </div>
                                      </CardHeader>
                                      <CardContent className="p-2.5 pt-0 space-y-1.5">
                                        <div className="flex items-center gap-3 text-xs">
                                          <div className="flex items-center gap-1">
                                            <Calendar className="h-3 w-3 text-muted-foreground" />
                                            <span className={isOverdue ? 'text-destructive font-medium' : ''}>
                                              {schedule.next_due_date}
                                            </span>
                                            {isOverdue && <span className="text-destructive">(已逾期)</span>}
                                            {!isOverdue && daysUntil <= schedule.reminder_days_before && (
                                              <span className="text-orange-500">(剩余{daysUntil}天)</span>
                                            )}
                                          </div>
                                          {schedule.assigned_name && (
                                            <div className="flex items-center gap-1">
                                              <User className="h-3 w-3 text-muted-foreground" />
                                              <span>{schedule.assigned_name}</span>
                                            </div>
                                          )}
                                        </div>
                                        <div className="flex items-center gap-1">
                                          <Button
                                            size="sm"
                                            variant="outline"
                                            className="h-6 text-xs flex-1"
                                            onClick={() => handleCompleteSchedule(schedule)}
                                          >
                                            <Check className="h-3 w-3 mr-1" />
                                            完成
                                          </Button>
                                          <Button
                                            size="sm"
                                            variant="ghost"
                                            className="h-6 w-6 p-0"
                                            onClick={() => handleEditSchedule(schedule)}
                                          >
                                            <Edit2 className="h-3 w-3" />
                                          </Button>
                                          <Button
                                            size="sm"
                                            variant="ghost"
                                            className="h-6 w-6 p-0 text-destructive hover:text-destructive"
                                            onClick={() => handleDeleteSchedule(schedule.id)}
                                          >
                                            <Trash2 className="h-3 w-3" />
                                          </Button>
                                        </div>
                                      </CardContent>
                                    </Card>
                                  );
                                })}
                              </div>
                            )}
                          </div>
                        </>
                      )}
                    </div>
                  </ScrollArea>
                </>
              ) : (
                <div className="flex-1 flex items-center justify-center text-muted-foreground">
                  <div className="text-center">
                    <Wrench className="h-8 w-8 mx-auto mb-2 opacity-30" />
                    <p className="text-sm">选择设备类型</p>
                    <p className="text-xs mt-1">管理维护计划模板</p>
                  </div>
                </div>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* 添加维护模板弹窗 */}
      <Dialog open={showAddTemplateModal} onOpenChange={setShowAddTemplateModal}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>添加维护模板</DialogTitle>
            <DialogDescription>
              为 {selectedType?.name} 类型创建维护计划模板
            </DialogDescription>
          </DialogHeader>
          <TemplateFormContent onSubmit={handleAddTemplate} submitLabel="添加" />
        </DialogContent>
      </Dialog>

      {/* 编辑维护模板弹窗 */}
      <Dialog open={showEditTemplateModal} onOpenChange={setShowEditTemplateModal}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>编辑维护模板</DialogTitle>
            <DialogDescription>
              修改 {editingTemplate?.title} 模板
            </DialogDescription>
          </DialogHeader>
          <TemplateFormContent onSubmit={handleUpdateTemplate} submitLabel="保存" />
        </DialogContent>
      </Dialog>

      {/* 应用模板弹窗 */}
      <Dialog open={showApplyTemplateModal} onOpenChange={setShowApplyTemplateModal}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>应用维护模板</DialogTitle>
            <DialogDescription>
              将 "{applyingTemplate?.title}" 模板应用到关联设备
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>首次维护日期</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className="w-full justify-start text-left font-normal">
                    <Calendar className="mr-2 h-4 w-4" />
                    {applyTemplateDate ? format(applyTemplateDate, 'yyyy-MM-dd') : '选择日期'}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0 z-[200]" align="start">
                  <CalendarComponent
                    mode="single"
                    selected={applyTemplateDate}
                    onSelect={setApplyTemplateDate}
                    initialFocus
                    className="pointer-events-auto"
                  />
                </PopoverContent>
              </Popover>
            </div>
            
            <div className="space-y-2">
              <Label>应用范围</Label>
              <div className="flex flex-col gap-2">
                <div className="flex items-center gap-2">
                  <input
                    type="radio"
                    id="apply-all"
                    checked={applyMode === 'all'}
                    onChange={() => setApplyMode('all')}
                    className="h-4 w-4"
                  />
                  <Label htmlFor="apply-all" className="text-sm font-normal">
                    所有关联设备 ({linkedEquipments.length}台)
                  </Label>
                </div>
                <div className="flex items-center gap-2">
                  <input
                    type="radio"
                    id="apply-selected"
                    checked={applyMode === 'selected'}
                    onChange={() => setApplyMode('selected')}
                    className="h-4 w-4"
                  />
                  <Label htmlFor="apply-selected" className="text-sm font-normal">
                    选择特定设备
                  </Label>
                </div>
              </div>
            </div>

            {applyMode === 'selected' && (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label>选择设备</Label>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 text-xs"
                    onClick={() => {
                      if (templateSelectedIds.size === linkedEquipments.length) {
                        setTemplateSelectedIds(new Set());
                      } else {
                        setTemplateSelectedIds(new Set(linkedEquipments.map(eq => eq.id)));
                      }
                    }}
                  >
                    {templateSelectedIds.size === linkedEquipments.length ? '取消全选' : '全选'}
                  </Button>
                </div>
                <ScrollArea className="h-40 border rounded-md p-2">
                  <div className="space-y-1">
                    {linkedEquipments.map(eq => (
                      <div key={eq.id} className="flex items-center gap-2 p-1.5 rounded hover:bg-muted/50">
                        <Checkbox
                          id={`template-eq-${eq.id}`}
                          checked={templateSelectedIds.has(eq.id)}
                          onCheckedChange={(checked) => {
                            const newSet = new Set(templateSelectedIds);
                            if (checked) {
                              newSet.add(eq.id);
                            } else {
                              newSet.delete(eq.id);
                            }
                            setTemplateSelectedIds(newSet);
                          }}
                        />
                        <Label htmlFor={`template-eq-${eq.id}`} className="text-sm font-normal flex-1 cursor-pointer">
                          <span className="font-medium">{eq.name}</span>
                          <span className="text-muted-foreground ml-2 text-xs">{eq.id}</span>
                        </Label>
                      </div>
                    ))}
                  </div>
                </ScrollArea>
                {applyMode === 'selected' && (
                  <p className="text-xs text-muted-foreground">
                    已选择 {templateSelectedIds.size} 台设备
                  </p>
                )}
              </div>
            )}

            <DialogFooter>
              <Button variant="outline" onClick={() => {
                setShowApplyTemplateModal(false);
                setApplyingTemplate(null);
                setTemplateSelectedIds(new Set());
              }}>
                取消
              </Button>
              <Button onClick={handleApplyTemplate}>
                确认应用
              </Button>
            </DialogFooter>
          </div>
        </DialogContent>
      </Dialog>

      {/* 添加维护计划弹窗 */}
      <Dialog open={showAddScheduleModal} onOpenChange={setShowAddScheduleModal}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>添加维护计划</DialogTitle>
            <DialogDescription>
              为 {selectedEquipment?.name} 添加新的维护计划
            </DialogDescription>
          </DialogHeader>
          <ScheduleFormContent onSubmit={handleAddSchedule} submitLabel="添加" />
        </DialogContent>
      </Dialog>

      {/* 编辑维护计划弹窗 */}
      <Dialog open={showEditScheduleModal} onOpenChange={setShowEditScheduleModal}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>编辑维护计划</DialogTitle>
            <DialogDescription>
              修改 {editingSchedule?.title} 的维护计划
            </DialogDescription>
          </DialogHeader>
          <ScheduleFormContent onSubmit={handleUpdateSchedule} submitLabel="保存" />
        </DialogContent>
      </Dialog>
    </>
  );
};

export default EquipmentTypeManager;
