import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { Plus, Trash2, Edit2, Save, X, Tags, ChevronRight, Wrench, Check, Link2, Unlink, User, Search, ChevronDown, ChevronUp, Calendar, Bell, Clock, FileText, Copy, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { cn } from '@/lib/utils';
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
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/useAuth';
import { Equipment } from '@/types/equipment';
import EquipmentDetailModal from '@/components/EquipmentDetailModal';
import MaintenancePlanCard from '@/components/MaintenancePlanCard';
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

// 去重后的维护计划分组（按 title+description+frequency 去重）
interface PlanGroup {
  title: string;
  description: string | null;
  frequency: 'daily' | 'weekly' | 'monthly' | 'quarterly' | 'yearly';
  reminder_days_before: number;
  equipmentIds: string[];
  schedules: MaintenanceSchedule[];
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
  
  // 设备详情弹窗
  const [showEquipmentDetail, setShowEquipmentDetail] = useState(false);
  const [detailEquipment, setDetailEquipment] = useState<Equipment | null>(null);
  const [detailModalKey, setDetailModalKey] = useState(0);

  // 第三列：所有维护计划（统一使用数据库 maintenance_schedules 作为数据源）
  const [selectedEquipmentId, setSelectedEquipmentId] = useState<string | null>(null);
  const [equipmentSchedules, setEquipmentSchedules] = useState<MaintenanceSchedule[]>([]);
  const [allSchedules, setAllSchedules] = useState<MaintenanceSchedule[]>([]);
  const [planGroups, setPlanGroups] = useState<PlanGroup[]>([]);
  const [schedulesLoading, setSchedulesLoading] = useState(false);
  const [showAddScheduleModal, setShowAddScheduleModal] = useState(false);
  const [showEditScheduleModal, setShowEditScheduleModal] = useState(false);
  const [editingSchedule, setEditingSchedule] = useState<MaintenanceSchedule | null>(null);
  const [scheduleFormData, setScheduleFormData] = useState({
    title: '',
    description: '',
    frequency: 'monthly' as 'daily' | 'weekly' | 'monthly' | 'quarterly' | 'yearly',
    next_due_date: '',
    reminder_days_before: 7,
    assigned_user_id: ''
  });

  // 双向关联模态
  const [showLinkEquipmentModal, setShowLinkEquipmentModal] = useState(false);
  const [linkingPlan, setLinkingPlan] = useState<PlanGroup | null>(null);
  const [linkEquipmentIds, setLinkEquipmentIds] = useState<Set<string>>(new Set());
  const [linkDate, setLinkDate] = useState<Date | undefined>(getEndOfCurrentMonth());
  const [showLinkPlanModal, setShowLinkPlanModal] = useState(false);
  const [equipmentLinkingId, setEquipmentLinkingId] = useState<string | null>(null);
  const [planLinkIds, setPlanLinkIds] = useState<Set<string>>(new Set());
  // 取消关联
  const [showUnlinkModal, setShowUnlinkModal] = useState(false);
  const [unlinkingPlan, setUnlinkingPlan] = useState<PlanGroup | null>(null);
  const [unlinkEquipmentIds, setUnlinkEquipmentIds] = useState<Set<string>>(new Set());

  // 添加/编辑计划的表单
  const [showAddPlanModal, setShowAddPlanModal] = useState(false);
  const [showEditPlanModal, setShowEditPlanModal] = useState(false);
  const [editingPlan, setEditingPlan] = useState<PlanGroup | null>(null);
  const [planFormData, setPlanFormData] = useState({
    title: '',
    description: '',
    frequency: 'monthly' as 'daily' | 'weekly' | 'monthly' | 'quarterly' | 'yearly',
    reminder_days_before: 7,
  });

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

  // 去重：按 title+description+frequency 分组
  const groupSchedulesIntoPlans = useCallback((schedules: MaintenanceSchedule[]): PlanGroup[] => {
    const map = new Map<string, { title: string; description: string | null; frequency: string; reminder_days_before: number; equipmentIds: Set<string>; schedules: MaintenanceSchedule[] }>();
    for (const s of schedules) {
      const key = `${s.title.trim()}|||${(s.description || '').trim()}|||${s.frequency}`;
      if (!map.has(key)) {
        map.set(key, { title: s.title, description: s.description, frequency: s.frequency, reminder_days_before: s.reminder_days_before, equipmentIds: new Set(), schedules: [] });
      }
      const g = map.get(key)!;
      g.equipmentIds.add(s.equipment_id);
      g.schedules.push(s);
    }
    return Array.from(map.values()).map(g => ({
      title: g.title, description: g.description, frequency: g.frequency as PlanGroup['frequency'],
      reminder_days_before: g.reminder_days_before, equipmentIds: Array.from(g.equipmentIds), schedules: g.schedules,
    }));
  }, []);

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

  // 获取当前选中的类型
  const selectedType = useMemo(() => 
    types.find(t => t.id === selectedTypeId), 
    [types, selectedTypeId]
  );

  // 活跃设备（排除报废）- 报废设备不参与任何管理活动
  // 同时检查 isScrapped 布尔字段和 status='scrapped'，兼容两种报废标记方式
  const activeEquipments = useMemo(() => {
    return equipments.filter(eq =>
      (eq as any).isScrapped !== true && eq.status !== 'scrapped'
    );
  }, [equipments]);

  // 获取关联到当前类型的设备列表 - 使用数据库 type 字段作为唯一真实来源，排除报废设备
  const linkedEquipments = useMemo(() => {
    if (!selectedType) return [];
    // 只使用数据库中的 type 字段来判断关联关系，且必须是非报废设备，按ID排序
    return activeEquipments.filter(eq => eq.type === selectedType.name).sort((a, b) => a.id.localeCompare(b.id, undefined, { numeric: true }));
  }, [selectedType, activeEquipments]);

  // 获取选中的设备详情
  const selectedEquipment = useMemo(() => {
    return activeEquipments.find(eq => eq.id === selectedEquipmentId);
  }, [activeEquipments, selectedEquipmentId]);

  // 获取未关联的设备列表 - 只查看数据库中 type 为空或不属于任何已定义类型的设备，排除报废
  const unlinkedEquipments = useMemo(() => {
    if (!selectedType) return activeEquipments;
    const allTypeNames = types.map(t => t.name);
    return activeEquipments.filter(eq =>
      !eq.type || !allTypeNames.includes(eq.type)
    );
  }, [selectedType, types, activeEquipments]);

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

  // 统一获取当前类型下所有关联设备的所有维护计划
  const refetchAllSchedules = useCallback(async () => {
    if (!selectedTypeId || linkedEquipments.length === 0) { setAllSchedules([]); setPlanGroups([]); return; }
    setSchedulesLoading(true);
    try {
      const ids = linkedEquipments.map(eq => eq.id);
      const { data, error } = await supabase.from('maintenance_schedules').select('*').in('equipment_id', ids).eq('is_active', true).order('next_due_date');
      if (error) throw error;
      const schedules = (data || []) as MaintenanceSchedule[];
      setAllSchedules(schedules);
      setPlanGroups(groupSchedulesIntoPlans(schedules));
    } catch (err) { console.error('获取维护计划失败:', err); setAllSchedules([]); setPlanGroups([]); }
    finally { setSchedulesLoading(false); }
  }, [selectedTypeId, linkedEquipments, groupSchedulesIntoPlans]);

  // 当类型或关联设备变化时刷新
  useEffect(() => { refetchAllSchedules(); }, [refetchAllSchedules]);

  // 从 allSchedules 派生当前选中设备的计划
  const derivedEquipmentSchedules = useMemo(() => {
    if (!selectedEquipmentId) return [];
    return allSchedules.filter(s => s.equipment_id === selectedEquipmentId);
  }, [allSchedules, selectedEquipmentId]);

  // 同步派生设备计划
  useEffect(() => { setEquipmentSchedules(derivedEquipmentSchedules); }, [derivedEquipmentSchedules]);

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
  const handleSelectLinkedEquipment = (eq: Equipment) => {
    setDetailEquipment(eq);
    setDetailModalKey(k => k + 1);
    setShowEquipmentDetail(true);
  };

  const handleDetailUpdate = async (e: Equipment) => {
    const updateData: Record<string, any> = { name: e.name, model: e.model, manufacturer: e.manufacturer, status: e.status, location: e.location, maintenance_date: e.maintenanceDate, next_calibration_date: e.nextCalibrationDate, responsible: e.responsible, notes: e.notes, image_url: e.imageUrl, sop_file_url: e.sopFileUrl, responsible_email: e.responsible_email };
    if ((e as any).type !== undefined) updateData.type = (e as any).type;
    await supabase.from('equipment').update(updateData).eq('id', e.id);
    setShowEquipmentDetail(false); setDetailEquipment(null);
    onEquipmentRefresh?.();
    refetchAllSchedules();
  };

  const handleDetailDelete = async (id: string) => {
    await supabase.from('equipment').delete().eq('id', id);
    setShowEquipmentDetail(false); setDetailEquipment(null);
    onEquipmentRefresh?.();
    refetchAllSchedules();
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
        const baseDescription = maintenanceDescription.trim();

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

  // ========== 维护计划管理功能 ==========
  // ========== 计划操作 ==========
  const handleAddPlan = async () => {
    if (!planFormData.title) { toast({ title: '错误', description: '请填写计划标题', variant: 'destructive' }); return; }
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const nextDueDate = format(getEndOfCurrentMonth(), 'yyyy-MM-dd');
      let createdCount = 0, skippedCount = 0;
      for (const eq of linkedEquipments) {
        // 检查是否已存在相同标题的活跃计划
        const { data: existing } = await supabase.from('maintenance_schedules').select('id').eq('equipment_id', eq.id).eq('title', planFormData.title).eq('is_active', true).limit(1);
        if (existing && existing.length > 0) { skippedCount++; continue; }
        const user = users.find(u => u.username === eq.responsible);
        const { error } = await supabase.from('maintenance_schedules').insert({
          equipment_id: eq.id, title: planFormData.title, description: planFormData.description || null,
          frequency: planFormData.frequency, next_due_date: nextDueDate, reminder_days_before: planFormData.reminder_days_before,
          assigned_name: eq.responsible || null, assigned_email: user?.email || eq.responsible_email || null,
          assigned_user_id: user?.user_id || null, is_active: true, created_by: session?.user?.id || null
        });
        if (!error) createdCount++;
      }
      await refetchAllSchedules(); onEquipmentRefresh?.();
      setShowAddPlanModal(false); setPlanFormData({ title: '', description: '', frequency: 'monthly', reminder_days_before: 7 });
      toast({ title: '成功', description: `已创建 ${createdCount} 个计划${skippedCount > 0 ? `，跳过 ${skippedCount} 个已存在` : ''}` });
    } catch (err) { console.error('添加失败:', err); toast({ title: '添加失败', description: '请重试', variant: 'destructive' }); }
  };

  const handleEditPlan = (plan: PlanGroup) => {
    setEditingPlan(plan);
    setPlanFormData({ title: plan.title, description: plan.description || '', frequency: plan.frequency, reminder_days_before: plan.reminder_days_before });
    setShowEditPlanModal(true);
  };

  const handleUpdatePlan = async () => {
    if (!editingPlan || !planFormData.title) { toast({ title: '错误', description: '请填写计划标题', variant: 'destructive' }); return; }
    try {
      const ids = editingPlan.schedules.map(s => s.id);
      const { error } = await supabase.from('maintenance_schedules').update({
        title: planFormData.title, description: planFormData.description || null,
        frequency: planFormData.frequency, reminder_days_before: planFormData.reminder_days_before,
      }).in('id', ids);
      if (error) throw error;
      await refetchAllSchedules(); onEquipmentRefresh?.();
      setShowEditPlanModal(false); setEditingPlan(null);
      toast({ title: '成功', description: `已更新 ${ids.length} 条计划` });
    } catch (err) { console.error('更新失败:', err); toast({ title: '更新失败', description: '请重试', variant: 'destructive' }); }
  };

  const handleDeletePlan = async (plan: PlanGroup) => {
    if (!window.confirm(`确定要删除计划"${plan.title}"吗？这将移除 ${plan.equipmentIds.length} 台设备的关联。`)) return;
    try {
      const ids = plan.schedules.map(s => s.id);
      const { error } = await supabase.from('maintenance_schedules').update({ is_active: false }).in('id', ids);
      if (error) throw error;
      await refetchAllSchedules(); onEquipmentRefresh?.();
      toast({ title: '已删除', description: `已删除"${plan.title}"` });
    } catch (err) { console.error('删除失败:', err); toast({ title: '删除失败', description: '请重试', variant: 'destructive' }); }
  };

  // 计划 → 设备
  const handleLinkPlanToEquipment = async () => {
    if (!linkingPlan || !linkDate || linkEquipmentIds.size === 0) return;
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const nd = format(linkDate, 'yyyy-MM-dd'); let n = 0;
      for (const eid of Array.from(linkEquipmentIds)) {
        const eq = linkedEquipments.find(e => e.id === eid); if (!eq) continue;
        const u = users.find(x => x.username === eq.responsible);
        const { error } = await supabase.from('maintenance_schedules').insert({
          equipment_id: eid, title: linkingPlan.title, description: linkingPlan.description,
          frequency: linkingPlan.frequency, next_due_date: nd, reminder_days_before: linkingPlan.reminder_days_before,
          assigned_name: eq.responsible || null, assigned_email: u?.email || eq.responsible_email || null,
          assigned_user_id: u?.user_id || null, is_active: true, created_by: session?.user?.id || null
        });
        if (!error) n++;
      }
      await refetchAllSchedules(); onEquipmentRefresh?.();
      setShowLinkEquipmentModal(false); setLinkingPlan(null); setLinkEquipmentIds(new Set());
      toast({ title: '关联成功', description: `已关联 ${n} 台设备` });
    } catch (err) { console.error('关联失败:', err); toast({ title: '失败', description: '请重试', variant: 'destructive' }); }
  };

  // 设备 → 计划
  const handleLinkEquipmentToPlans = async () => {
    if (!equipmentLinkingId || !linkDate || planLinkIds.size === 0) return;
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const eq = linkedEquipments.find(e => e.id === equipmentLinkingId); if (!eq) return;
      const nd = format(linkDate, 'yyyy-MM-dd'); const u = users.find(x => x.username === eq.responsible); let n = 0;
      for (const pk of Array.from(planLinkIds)) {
        const [title, desc, freq] = pk.split('|||');
        const { error } = await supabase.from('maintenance_schedules').insert({
          equipment_id: equipmentLinkingId, title, description: desc || null, frequency: freq,
          next_due_date: nd, reminder_days_before: 7,
          assigned_name: eq.responsible || null, assigned_email: u?.email || eq.responsible_email || null,
          assigned_user_id: u?.user_id || null, is_active: true, created_by: session?.user?.id || null
        });
        if (!error) n++;
      }
      await refetchAllSchedules(); onEquipmentRefresh?.();
      setShowLinkPlanModal(false); setEquipmentLinkingId(null); setPlanLinkIds(new Set());
      toast({ title: '关联成功', description: `已关联 ${n} 个计划` });
    } catch (err) { console.error('关联失败:', err); toast({ title: '失败', description: '请重试', variant: 'destructive' }); }
  };

  // 取消计划关联
  const handleUnlinkPlanEquipment = async () => {
    if (!unlinkingPlan || unlinkEquipmentIds.size === 0) return;
    try {
      const ids = unlinkingPlan.schedules.filter(s => unlinkEquipmentIds.has(s.equipment_id)).map(s => s.id);
      if (ids.length === 0) return;
      await supabase.from('maintenance_schedules').update({ is_active: false }).in('id', ids);
      await refetchAllSchedules(); onEquipmentRefresh?.();
      setShowUnlinkModal(false); setUnlinkingPlan(null); setUnlinkEquipmentIds(new Set());
      toast({ title: '已取消关联', description: `已移除 ${ids.length} 台设备` });
    } catch (err) { console.error('取消关联失败:', err); toast({ title: '失败', description: '请重试', variant: 'destructive' }); }
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
      refetchAllSchedules();
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
        refetchAllSchedules();
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
        refetchAllSchedules();
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
        refetchAllSchedules();
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
        <Label className="text-white/80">模板标题 *</Label>
        <Input ref={tplTitleRef} placeholder="输入维护模板标题" className="bg-white/10 border-white/20 text-white placeholder:text-white/50" />
      </div>
      <div className="space-y-2">
        <Label className="text-white/80">描述</Label>
        <Textarea ref={tplDescRef as any} placeholder="输入维护描述" rows={2} className="bg-white/10 border-white/20 text-white placeholder:text-white/50" />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label className="text-white/80">维护周期</Label>
          <Select defaultValue="monthly" onValueChange={(v: any) => { tplFreqRef.current = v; }}>
            <SelectTrigger className="bg-white/10 border-white/20 text-white">
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
          <Label className="text-white/80">提前提醒天数</Label>
          <Input
            type="number"
            min={1}
            max={30}
            value={templateFormData.reminder_days_before}
            onBlur={(e) => { tplRemindRef.current = parseInt(e.target.value) || 7; }}
            className="bg-white/10 border-white/20 text-white"
          />
        </div>
      </div>
      <DialogFooter>
        <Button variant="outline" className="bg-white/10 border-white/20 text-white hover:bg-white/20" onClick={() => {
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
        <Label className="text-white/80">维护标题 *</Label>
        <Input
          value={scheduleFormData.title}
          onChange={(e) => setScheduleFormData(prev => ({ ...prev, title: e.target.value }))}
          placeholder="输入维护标题"
          className="bg-white/10 border-white/20 text-white placeholder:text-white/50"
        />
      </div>
      <div className="space-y-2">
        <Label className="text-white/80">描述</Label>
        <Textarea
          value={scheduleFormData.description}
          onChange={(e) => setScheduleFormData(prev => ({ ...prev, description: e.target.value }))}
          placeholder="输入维护描述"
          rows={2}
          className="bg-white/10 border-white/20 text-white placeholder:text-white/50"
        />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label className="text-white/80">维护周期</Label>
          <Select
            value={scheduleFormData.frequency}
            onValueChange={(value) => setScheduleFormData(prev => ({ ...prev, frequency: value as typeof prev.frequency }))}
          >
            <SelectTrigger className="bg-white/10 border-white/20 text-white">
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
          <Label className="text-white/80">下次维护日期 *</Label>
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" className="w-full justify-start text-left font-normal bg-white/10 border-white/20 text-white hover:bg-white/20">
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
          <Label className="text-white/80">提前提醒天数</Label>
          <Input
            type="number"
            min={1}
            max={30}
            value={scheduleFormData.reminder_days_before}
            onChange={(e) => setScheduleFormData(prev => ({
              ...prev,
              reminder_days_before: parseInt(e.target.value) || 7
            }))}
            className="bg-white/10 border-white/20 text-white"
          />
        </div>
        <div className="space-y-2">
          <Label className="text-white/80">负责人</Label>
          <Select
            value={scheduleFormData.assigned_user_id || '__none__'}
            onValueChange={(value) => setScheduleFormData(prev => ({
              ...prev,
              assigned_user_id: value === '__none__' ? '' : value
            }))}
          >
            <SelectTrigger className="bg-white/10 border-white/20 text-white">
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
        <Button variant="outline" className="bg-white/10 border-white/20 text-white hover:bg-white/20" onClick={() => {
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
      <DialogPrimitive.Root open={isOpen} onOpenChange={onClose} modal={false}>
        <DialogPrimitive.Content
          onInteractOutside={(e) => e.preventDefault()}
          onPointerDownOutside={(e) => e.preventDefault()}
          className={cn(
          "fixed left-[50%] top-[50%] z-50 grid translate-x-[-50%] translate-y-[-50%] shadow-2xl duration-200",
          "w-[90vw] max-w-[1200px] max-h-[88vh] overflow-hidden flex flex-col border-0 rounded-xl p-6",
          "data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95"
        )} style={{
            backgroundImage: selectedType?.sharedImageUrl ? `url(${selectedType.sharedImageUrl})` : linkedEquipments[0]?.imageUrl ? `url(${linkedEquipments[0].imageUrl})` : undefined,
            backgroundSize: 'cover', backgroundPosition: 'center',
          }}>
            <div className="absolute inset-0 bg-gradient-to-b from-black/80 via-black/50 to-black/80 pointer-events-none rounded-lg" />
          <DialogHeader className="relative -mt-1">
            <h2 className="flex items-center gap-2 text-white drop-shadow mb-0.5 text-lg font-semibold leading-none tracking-tight">
              <Tags className="h-5 w-5" />
              设备类型管理
            </h2>
            <p className="text-sm text-white/70 drop-shadow">
              三列布局：设备类型 → 关联设备 → 维护计划模板与管理
            </p>
          </DialogHeader>

          <div className="flex-1 grid grid-cols-[280px_minmax(200px,1fr)_minmax(180px,1fr)] gap-3 overflow-hidden relative">
            {/* 第一列：类型列表 */}
            <div className="flex flex-col space-y-3 overflow-hidden rounded-lg bg-white/10 backdrop-blur-sm border border-white/20 p-3">
              <h3 className="font-semibold text-sm flex items-center gap-2 text-white drop-shadow">
                <Tags className="h-4 w-4" />
                设备类型
              </h3>
              
              {/* 添加新类型 */}
              <div className="flex gap-2">
                <Input
                  ref={newTypeInputRef}
                  placeholder="新类型名称"
                  className="flex-1 h-8 text-sm bg-white/10 border-white/20 text-white placeholder:text-white/50"
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
                    <p className="text-xs text-white/60 py-4 text-center">
                      暂无类型，请添加
                    </p>
                  ) : (
                    types.map(type => (
                      <div
                        key={type.id}
                        className={`flex items-center justify-between p-2 rounded-lg cursor-pointer transition-colors ${
                          selectedTypeId === type.id 
                            ? 'bg-white/20 border border-white/30 text-white' 
                            : 'bg-white/5 border border-white/10 hover:bg-white/15 text-white'
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
                            <div className="p-1.5 rounded-full shadow-lg border border-white/20 hover:scale-110 transition-all duration-200 backdrop-blur-md cursor-pointer"
                              style={{ backgroundColor: '#22c55ecc' }} onClick={handleSaveEdit}>
                              <Save className="h-3.5 w-3.5 text-white" />
                            </div>
                            <div className="p-1.5 rounded-full shadow-lg border border-white/20 hover:scale-110 transition-all duration-200 backdrop-blur-md cursor-pointer"
                              style={{ backgroundColor: '#f59e0bcc' }} onClick={handleCancelEdit}>
                              <X className="h-3.5 w-3.5 text-white" />
                            </div>
                          </div>
                        ) : (
                          <>
                            <div className="flex items-center gap-1.5 flex-1 min-w-0">
                              <span className="font-medium text-xs text-white truncate">{type.name}</span>
                              <Badge variant="secondary" className="text-xs shrink-0 h-5">
                                {equipments.filter(eq => eq.type === type.name).length}
                              </Badge>
                            </div>
                            <div className="flex items-center gap-1.5" onClick={e => e.stopPropagation()}>
                              <div className="p-1.5 rounded-full shadow-lg border border-white/20 hover:scale-110 transition-all duration-200 backdrop-blur-md cursor-pointer"
                                style={{ backgroundColor: '#3b82f6cc' }}
                                onClick={() => handleStartEdit(type)}>
                                <Edit2 className="h-3.5 w-3.5 text-white" />
                              </div>
                              <div className="p-1.5 rounded-full shadow-lg border border-white/20 hover:scale-110 transition-all duration-200 backdrop-blur-md cursor-pointer"
                                style={{ backgroundColor: '#ef4444cc' }}
                                onClick={() => handleDeleteType(type.id)}>
                                <Trash2 className="h-3.5 w-3.5 text-white" />
                              </div>
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
            <div className="flex flex-col overflow-hidden rounded-lg bg-white/10 backdrop-blur-sm border border-white/20">
              {selectedType ? (
                <>
                  <div className="p-3 border-b border-white/20 bg-white/5">
                    <div className="flex items-center justify-between">
                      <h3 className="font-semibold text-sm text-white drop-shadow">{selectedType.name} - 关联设备</h3>
                      <Button
                        size="sm"
                        className={`h-7 text-xs text-white border-0 ${isLinkingMode ? 'bg-green-500 hover:bg-green-600' : 'bg-blue-500 hover:bg-blue-600'}`}
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
                          <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-white/60" />
                          <Input
                            placeholder="搜索设备..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="pl-7 h-8 text-xs bg-white/10 border-white/20 text-white placeholder:text-white/50"
                          />
                        </div>

                        {/* 已关联设备 */}
                        <div>
                          <h4 className="font-medium text-xs text-white flex items-center gap-1.5 mb-2">
                            <Check className="h-3.5 w-3.5 text-green-500" />
                            已关联 ({linkedEquipments.length})
                          </h4>
                          {linkedEquipments.length === 0 ? (
                            <p className="text-xs text-white/60 py-2">暂无关联设备</p>
                          ) : (
                            <div className="space-y-1">
                              {linkedEquipments.map(eq => (
                                <div
                                  key={eq.id}
                                  className="flex items-center justify-between p-2 bg-white/10 border border-white/20 rounded-md"
                                >
                                  <div className="flex-1 min-w-0">
                                    <span className="font-medium text-xs text-white">{eq.name}</span>
                                    <span className="text-xs text-white/60 ml-2">{eq.id}</span>
                                  </div>
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    className="h-6 text-xs text-red-400 hover:text-red-300"
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

                        <Separator className="bg-white/20" />

                        {/* 可关联设备 */}
                        <Collapsible open={!unlinkedCollapsed} onOpenChange={(open) => setUnlinkedCollapsed(!open)}>
                          <CollapsibleTrigger asChild>
                            <div className="flex items-center justify-between cursor-pointer py-1 hover:bg-white/10 rounded px-1">
                              <h4 className="font-medium text-xs text-white flex items-center gap-1.5">
                                <Link2 className="h-3.5 w-3.5 text-white/60" />
                                可关联 ({filteredUnlinkedEquipments.length})
                              </h4>
                              <div className="flex items-center gap-2">
                                {filteredUnlinkedEquipments.length > 0 && (
                                  <>
                                    <Button
                                      size="sm"
                                      variant="ghost"
                                      className="h-6 text-xs text-white hover:bg-white/10"
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
                                            className="h-6 text-xs bg-green-500 hover:bg-green-600 text-white border-0"
                                            onClick={(e) => e.stopPropagation()}
                                          >
                                            关联 ({batchSelectedIds.size})
                                          </Button>
                                        </PopoverTrigger>
                                        <PopoverContent
                                          className="w-80 max-h-[70vh] overflow-hidden z-50 flex flex-col bg-black/40 backdrop-blur-md border-white/20 text-white"
                                          align="start"
                                          side="bottom"
                                          sideOffset={5}
                                          avoidCollisions={true}
                                          collisionPadding={20}
                                          onClick={(e) => e.stopPropagation()}
                                        >
                                          {/* 固定头部：标题 + 顶部确定按钮 */}
                                          <div className="flex items-center justify-between border-b pb-2 mb-2 shrink-0">
                                            <h4 className="font-medium text-sm text-white">批量关联设置</h4>
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
                                              <Label className="text-xs text-white/80">统一责任人</Label>
                                              <Select value={batchResponsible || '__keep_original__'} onValueChange={setBatchResponsible}>
                                                <SelectTrigger className="h-8 text-xs bg-white/10 border-white/20 text-white">
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
                                              <Label className="text-xs text-white/80">创建维护计划</Label>
                                              <Switch
                                                checked={createMaintenancePlan}
                                                onCheckedChange={setCreateMaintenancePlan}
                                              />
                                            </div>
                                            
                                            {createMaintenancePlan && (
                                              <>
                                                <div className="space-y-2">
                                                  <Label className="text-xs text-white/80">维护内容 (标题)</Label>
                                                  <Input
                                                    value={maintenanceTitle}
                                                    onChange={(e) => setMaintenanceTitle(e.target.value)}
                                                    placeholder={`${selectedType?.name || '设备'} 维护`}
                                                    className="h-8 text-xs bg-white/10 border-white/20 text-white placeholder:text-white/50"
                                                  />
                                                </div>
                                                <div className="space-y-2">
                                                  <Label className="text-xs text-white/80">维护描述</Label>
                                                  <Textarea
                                                    value={maintenanceDescription}
                                                    onChange={(e) => setMaintenanceDescription(e.target.value)}
                                                    placeholder="详细描述维护工作内容..."
                                                    className="text-xs min-h-[50px] max-h-[80px] bg-white/10 border-white/20 text-white placeholder:text-white/50"
                                                  />
                                                </div>
                                                <div className="space-y-2">
                                                  <Label className="text-xs text-white/80">维护周期</Label>
                                                  <Select value={maintenanceFrequency} onValueChange={setMaintenanceFrequency}>
                                                    <SelectTrigger className="h-8 text-xs bg-white/10 border-white/20 text-white">
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
                                                  <Label className="text-xs text-white/80">下次维护日期</Label>
                                                  <Popover>
                                                    <PopoverTrigger asChild>
                                                      <Button variant="outline" className="w-full h-8 text-xs justify-start bg-white/10 border-white/20 text-white hover:bg-white/20">
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
                                                  <Label className="text-xs text-white/80">提前提醒天数</Label>
                                                  <Select
                                                    value={String(maintenanceReminderDays)}
                                                    onValueChange={(v) => setMaintenanceReminderDays(parseInt(v))}
                                                  >
                                                    <SelectTrigger className="h-8 text-xs bg-white/10 border-white/20 text-white">
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
                                          <div className="flex gap-2 pt-3 mt-2 border-t border-white/20 shrink-0">
                                            <Button
                                              variant="outline"
                                              size="sm"
                                              className="flex-1 bg-white/10 border-white/20 text-white hover:bg-white/20"
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
                                  <ChevronDown className="h-4 w-4 text-white/60" />
                                ) : (
                                  <ChevronUp className="h-4 w-4 text-white/60" />
                                )}
                              </div>
                            </div>
                          </CollapsibleTrigger>
                          <CollapsibleContent>
                            {filteredUnlinkedEquipments.length === 0 ? (
                              <p className="text-xs text-white/60 py-2 mt-2">
                                {searchQuery ? '无匹配设备' : '所有设备已关联'}
                              </p>
                            ) : (
                              <div className="space-y-1 mt-2">
                                {filteredUnlinkedEquipments.map(eq => (
                                  <div
                                    key={eq.id}
                                    className={`flex items-center gap-2 p-2 border rounded-md cursor-pointer transition-colors ${
                                      batchSelectedIds.has(eq.id)
                                        ? 'bg-white/20 border-white/40'
                                        : 'bg-white/5 border-white/20 hover:bg-white/10'
                                    }`}
                                    onClick={() => handleToggleBatchSelect(eq.id)}
                                  >
                                    <Checkbox 
                                      checked={batchSelectedIds.has(eq.id)}
                                      onCheckedChange={() => handleToggleBatchSelect(eq.id)}
                                      onClick={(e) => e.stopPropagation()}
                                    />
                                    <div className="flex-1 min-w-0">
                                      <span className="font-medium text-xs text-white">{eq.name}</span>
                                      <span className="text-xs text-white/60 ml-2">{eq.id}</span>
                                      {eq.responsible && (
                                        <span className="text-xs text-blue-400 ml-2">· {eq.responsible}</span>
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
                            <Link2 className="h-8 w-8 mx-auto mb-2 text-white/60/30" />
                            <p className="text-sm text-white/60 mb-2">暂无关联设备</p>
                            <Button size="sm" onClick={() => setIsLinkingMode(true)} className="bg-blue-500 hover:bg-blue-600 text-white border-0">
                              <Link2 className="h-4 w-4 mr-1.5" />
                              去关联设备
                            </Button>
                          </div>
                        ) : (
                          linkedEquipments.map(eq => (
                            <div
                              key={eq.id}
                              className="flex items-center gap-2 p-2.5 rounded-md cursor-pointer transition-colors bg-white/5 border border-white/10 hover:bg-white/15 text-white"
                              onClick={() => handleSelectLinkedEquipment(eq)}
                            >
                              <Check className="h-3.5 w-3.5 text-green-500 shrink-0" />
                              <div className="flex-1 min-w-0">
                                <div className="font-medium text-sm text-white truncate">{eq.name}</div>
                                <div className="text-xs text-white/60">
                                  {eq.id} {eq.responsible && `· ${eq.responsible}`}
                                  {allSchedules.filter(s => s.equipment_id === eq.id).length > 0 && (
                                    <span className="text-blue-400 ml-1">· {allSchedules.filter(s => s.equipment_id === eq.id).length}个计划</span>
                                  )}
                                </div>
                              </div>
                              <Button
                                size="sm"
                                className="h-6 text-xs bg-blue-500 hover:bg-blue-600 text-white border-0 shrink-0"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setEquipmentLinkingId(eq.id);
                                  setLinkDate(getEndOfCurrentMonth());
                                  const existingKeys = allSchedules.filter(s => s.equipment_id === eq.id).map(s => `${s.title}|||${s.description||''}|||${s.frequency}`);
                                  const available = planGroups.filter(p => !existingKeys.includes(`${p.title}|||${p.description||''}|||${p.frequency}`)).map(p => `${p.title}|||${p.description||''}|||${p.frequency}`);
                                  setPlanLinkIds(new Set(available));
                                  setShowLinkPlanModal(true);
                                }}
                              >
                                <Link2 className="h-3 w-3 mr-0.5" />
                                计划
                              </Button>
                              <ChevronRight className={`h-4 w-4 text-white/60 transition-transform shrink-0 ${
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
                <div className="flex-1 flex items-center justify-center text-white/60">
                  <div className="text-center">
                    <Tags className="h-8 w-8 mx-auto mb-2 opacity-30" />
                    <p className="text-sm text-white/60">选择左侧类型</p>
                    <p className="text-xs mt-1">查看关联设备</p>
                  </div>
                </div>
              )}
            </div>

            {/* 第三列：所有维护计划 */}
            <div className="flex flex-col overflow-hidden rounded-lg bg-white/10 backdrop-blur-sm border border-white/20">
              {selectedType ? (
                <>
                  <div className="p-3 border-b border-white/20 bg-white/5">
                    <div className="flex items-center justify-between">
                      <div>
                        <h3 className="font-semibold text-sm flex items-center gap-1.5 text-white drop-shadow">
                          <FileText className="h-4 w-4" />
                          所有维护计划
                        </h3>
                        <p className="text-xs text-white/60">{selectedType.name} 类型 · {linkedEquipments.length}台设备</p>
                      </div>
                      <Button
                        size="sm"
                        className="h-7 text-xs bg-green-500 hover:bg-green-600 text-white border-0"
                        onClick={(e) => {
                          e.stopPropagation();
                          setPlanFormData({ title: 'Monthly Maintenance', description: '', frequency: 'monthly', reminder_days_before: 7 });
                          setShowAddPlanModal(true);
                        }}
                      >
                        <Plus className="h-3.5 w-3.5 mr-1" />
                        添加计划
                      </Button>
                    </div>
                  </div>

                  <ScrollArea className="flex-1 p-3">
                    <div className="space-y-3">
                      {/* 维护计划列表 — 从所有关联设备中提取去重计划 */}
                      {schedulesLoading ? (
                        <div className="text-center py-6">
                          <RefreshCw className="h-6 w-6 mx-auto mb-2 animate-spin text-white/40" />
                          <p className="text-xs text-white/60">加载中...</p>
                        </div>
                      ) : planGroups.length > 0 ? (
                        <div className="space-y-2">
                          {planGroups.map((plan, idx) => {
                            const dates = plan.schedules.map(s => s.next_due_date).sort();
                            const earliestDate = dates[0] || '';
                            const daysUntil = earliestDate ? Math.ceil((new Date(earliestDate).getTime() - Date.now()) / 86400000) : undefined;
                            const names = plan.schedules.map(s => s.assigned_name).filter(Boolean);
                            const uniqueNames = [...new Set(names)];
                            const assignee = uniqueNames.length === 1 ? uniqueNames[0] : (uniqueNames.length > 1 ? `${uniqueNames[0]} 等` : '');
                            const sortedEids = [...plan.equipmentIds].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
                            return (
                            <MaintenancePlanCard
                              key={`${plan.title}-${plan.frequency}-${idx}`}
                              title={plan.title}
                              description={plan.description}
                              frequency={plan.frequency}
                              nextDueDate={earliestDate || undefined}
                              assignedName={assignee || undefined}
                              reminderDaysBefore={plan.reminder_days_before}
                              daysUntilDue={daysUntil}
                              equipmentIds={sortedEids.map(eid => { const eq = activeEquipments.find(e => e.id === eid); return eq ? eq.id : eid; })}
                              actions={
                                <>
                                  <Button size="sm" className="h-7 w-7 p-0 bg-blue-500 hover:bg-blue-600 text-white"
                                    onClick={(e) => { e.stopPropagation();
                                      setLinkingPlan(plan); setLinkDate(getEndOfCurrentMonth());
                                      const unlinked = linkedEquipments.filter(eq => !plan.equipmentIds.includes(eq.id)).map(eq => eq.id);
                                      setLinkEquipmentIds(new Set(unlinked)); setShowLinkEquipmentModal(true);
                                    }} title="关联设备"><Link2 className="h-3.5 w-3.5" /></Button>
                                  {plan.equipmentIds.length > 1 && (
                                    <Button size="sm" className="h-7 w-7 p-0 bg-amber-500 hover:bg-amber-600 text-white"
                                      onClick={(e) => { e.stopPropagation();
                                        setUnlinkingPlan(plan); setUnlinkEquipmentIds(new Set()); setShowUnlinkModal(true);
                                      }} title="取消关联"><Unlink className="h-3.5 w-3.5" /></Button>
                                  )}
                                  {plan.schedules.length === 1 && (
                                    <>
                                      <Button size="sm" className="h-7 w-7 p-0 bg-orange-500 hover:bg-orange-600 text-white"
                                        onClick={async () => {
                                          const s = plan.schedules[0];
                                          try {
                                            const recipients = [s.assigned_email, 'zhifu.feng@brightfuture.com.hk'].filter(Boolean);
                                            await supabase.functions.invoke('send-equipment-notification', { body: { scheduleId: s.id, equipmentId: s.equipment_id, equipmentName: '', status: 'maintenance-reminder', recipients, scheduleTitle: s.title, nextDueDate: s.next_due_date } });
                                            toast({ title: '已发送', description: '提醒已发送' });
                                          } catch { toast({ title: '发送失败', variant: 'destructive' as const }); }
                                        }} title="发送提醒"><Bell className="h-3.5 w-3.5" /></Button>
                                      <Button size="sm" className="h-7 w-7 p-0 bg-green-500 hover:bg-green-600 text-white"
                                        onClick={() => handleCompleteSchedule(plan.schedules[0])} title="完成"><Check className="h-3.5 w-3.5" /></Button>
                                    </>
                                  )}
                                  <Button size="sm" className="h-7 w-7 p-0 bg-blue-500 hover:bg-blue-600 text-white"
                                    onClick={(e) => { e.stopPropagation(); handleEditPlan(plan); }} title="编辑计划"><Edit2 className="h-3.5 w-3.5" /></Button>
                                  <Button size="sm" className="h-7 w-7 p-0 bg-red-500 hover:bg-red-600 text-white"
                                    onClick={() => handleDeletePlan(plan)} title="删除计划"><Trash2 className="h-3.5 w-3.5" /></Button>
                                </>
                              }
                            />
                          );})}
                        </div>
                      ) : null}

                      {planGroups.length === 0 && !schedulesLoading ? (
                        <div className="text-center py-6">
                          <FileText className="h-8 w-8 mx-auto mb-2 text-white/30" />
                          <p className="text-sm text-white/60 mb-2">暂无维护计划</p>
                          <p className="text-xs text-white/60 mb-3">添加维护计划后可关联到设备</p>
                          <Button
                            size="sm"
                            className="bg-green-500 hover:bg-green-600 text-white border-0"
                            onClick={(e) => {
                              e.stopPropagation();
                              setPlanFormData({ title: 'Monthly Maintenance', description: '', frequency: 'monthly', reminder_days_before: 7 });
                              setShowAddPlanModal(true);
                            }}
                          >
                            <Plus className="h-4 w-4 mr-1.5" />
                            创建第一个计划
                          </Button>
                        </div>
                      ) : null}

                    </div>
                  </ScrollArea>
                </>
              ) : (
                <div className="flex-1 flex items-center justify-center text-white/60">
                  <div className="text-center">
                    <Wrench className="h-8 w-8 mx-auto mb-2 opacity-30" />
                    <p className="text-sm">选择设备类型</p>
                    <p className="text-xs mt-1">管理维护计划与设备关联</p>
                  </div>
                </div>
              )}
            </div>
          </div>
        <button onClick={onClose} className="absolute right-4 top-4 z-20 rounded-sm opacity-70 transition-opacity hover:opacity-100">
            <X className="h-4 w-4 text-white" />
          </button>
        </DialogPrimitive.Content>
      </DialogPrimitive.Root>

      {/* 添加维护计划弹窗 */}
      {showAddPlanModal && (
        <>
          <div className="fixed inset-0 z-50 bg-black/20 backdrop-blur-sm pointer-events-none" />
          <div className="fixed left-[50%] top-[50%] z-50 translate-x-[-50%] translate-y-[-50%] w-full max-w-lg bg-black/40 backdrop-blur-md border border-white/20 text-white rounded-lg p-6 shadow-lg">
            <button className="absolute right-4 top-4 text-white/60 hover:text-white" onClick={() => setShowAddPlanModal(false)}><X className="h-4 w-4" /></button>
            <DialogHeader>
              <h2 className="text-lg font-semibold leading-none tracking-tight">添加维护计划</h2>
              <p className="text-sm text-white/60">新计划将自动关联到{selectedType?.name}下所有设备</p>
            </DialogHeader>
            <div className="space-y-4 mt-2">
              <div className="space-y-2"><Label className="text-white/80">计划标题 *</Label><Input value={planFormData.title} onChange={e => setPlanFormData(p => ({...p, title: e.target.value}))} placeholder="输入维护计划标题" className="bg-white/10 border-white/20 text-white placeholder:text-white/50" /></div>
              <div className="space-y-2"><Label className="text-white/80">描述</Label><Textarea value={planFormData.description} onChange={e => setPlanFormData(p => ({...p, description: e.target.value}))} placeholder="输入维护描述" rows={2} className="bg-white/10 border-white/20 text-white placeholder:text-white/50" /></div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2"><Label className="text-white/80">维护周期</Label><Select value={planFormData.frequency} onValueChange={v => setPlanFormData(p => ({...p, frequency: v as any}))}><SelectTrigger className="bg-white/10 border-white/20 text-white"><SelectValue /></SelectTrigger><SelectContent>{Object.entries(frequencyLabels).map(([v,l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}</SelectContent></Select></div>
                <div className="space-y-2"><Label className="text-white/80">提前提醒天数</Label><Input type="number" min={1} max={30} value={planFormData.reminder_days_before} onChange={e => setPlanFormData(p => ({...p, reminder_days_before: parseInt(e.target.value)||7}))} className="bg-white/10 border-white/20 text-white" /></div>
              </div>
              <DialogFooter>
                <Button variant="outline" className="bg-white/10 border-white/20 text-white hover:bg-white/20" onClick={() => setShowAddPlanModal(false)}>取消</Button>
                <Button onClick={handleAddPlan}>添加</Button>
              </DialogFooter>
            </div>
          </div>
        </>
      )}

      {/* 编辑维护计划弹窗 */}
      {showEditPlanModal && editingPlan && (
        <>
          <div className="fixed inset-0 z-50 bg-black/20 backdrop-blur-sm pointer-events-none" />
          <div className="fixed left-[50%] top-[50%] z-50 translate-x-[-50%] translate-y-[-50%] w-full max-w-lg bg-black/40 backdrop-blur-md border border-white/20 text-white rounded-lg p-6 shadow-lg">
            <button className="absolute right-4 top-4 text-white/60 hover:text-white" onClick={() => { setShowEditPlanModal(false); setEditingPlan(null); }}><X className="h-4 w-4" /></button>
            <DialogHeader>
              <h2 className="text-lg font-semibold leading-none tracking-tight">编辑维护计划</h2>
              <p className="text-sm text-white/60">修改 "{editingPlan?.title}"（影响 {editingPlan?.equipmentIds.length} 台设备）</p>
            </DialogHeader>
            <div className="space-y-4 mt-2">
              <div className="space-y-2"><Label className="text-white/80">计划标题 *</Label><Input value={planFormData.title} onChange={e => setPlanFormData(p => ({...p, title: e.target.value}))} placeholder="输入维护计划标题" className="bg-white/10 border-white/20 text-white placeholder:text-white/50" /></div>
              <div className="space-y-2"><Label className="text-white/80">描述</Label><Textarea value={planFormData.description} onChange={e => setPlanFormData(p => ({...p, description: e.target.value}))} placeholder="输入维护描述" rows={2} className="bg-white/10 border-white/20 text-white placeholder:text-white/50" /></div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2"><Label className="text-white/80">维护周期</Label><Select value={planFormData.frequency} onValueChange={v => setPlanFormData(p => ({...p, frequency: v as any}))}><SelectTrigger className="bg-white/10 border-white/20 text-white"><SelectValue /></SelectTrigger><SelectContent>{Object.entries(frequencyLabels).map(([v,l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}</SelectContent></Select></div>
                <div className="space-y-2"><Label className="text-white/80">提前提醒天数</Label><Input type="number" min={1} max={30} value={planFormData.reminder_days_before} onChange={e => setPlanFormData(p => ({...p, reminder_days_before: parseInt(e.target.value)||7}))} className="bg-white/10 border-white/20 text-white" /></div>
              </div>
              <DialogFooter>
                <Button variant="outline" className="bg-white/10 border-white/20 text-white hover:bg-white/20" onClick={() => { setShowEditPlanModal(false); setEditingPlan(null); }}>取消</Button>
                <Button onClick={handleUpdatePlan}>保存</Button>
              </DialogFooter>
            </div>
          </div>
        </>
      )}

      {/* 关联设备弹窗（计划→设备） */}
      {showLinkEquipmentModal && linkingPlan && (
        <>
          <div className="fixed inset-0 z-50 bg-black/20 backdrop-blur-sm pointer-events-none" />
          <div className="fixed left-[50%] top-[50%] z-50 translate-x-[-50%] translate-y-[-50%] w-full max-w-lg bg-black/40 backdrop-blur-md border border-white/20 text-white rounded-lg p-6 shadow-lg max-h-[90vh] overflow-y-auto">
            <button className="absolute right-4 top-4 text-white/60 hover:text-white" onClick={() => { setShowLinkEquipmentModal(false); setLinkingPlan(null); setLinkEquipmentIds(new Set()); }}><X className="h-4 w-4" /></button>
            <DialogHeader>
              <h2 className="text-lg font-semibold leading-none tracking-tight">关联设备到计划</h2>
              <p className="text-sm text-white/60">将 "{linkingPlan.title}" 关联到更多设备</p>
            </DialogHeader>
            <div className="space-y-4 mt-2">
              <div className="space-y-2"><Label className="text-white/80">下次维护日期</Label><Popover><PopoverTrigger asChild><Button variant="outline" className="w-full justify-start text-left font-normal bg-white/10 border-white/20 text-white hover:bg-white/20"><Calendar className="mr-2 h-4 w-4" />{linkDate ? format(linkDate, 'yyyy-MM-dd') : '选择日期'}</Button></PopoverTrigger><PopoverContent className="w-auto p-0 z-[200]" align="start"><CalendarComponent mode="single" selected={linkDate} onSelect={setLinkDate} initialFocus className="pointer-events-auto" /></PopoverContent></Popover></div>
              <div className="space-y-2">
                <Label className="text-white/80">选择设备</Label>
                <p className="text-xs text-white/60">已关联 {linkingPlan.equipmentIds.length} 台，可选 {linkedEquipments.filter(eq => !linkingPlan.equipmentIds.includes(eq.id)).length} 台</p>
                <ScrollArea className="h-40 border border-white/20 rounded-md p-2">
                  <div className="space-y-1">
                    {linkedEquipments.map(eq => {
                      const already = linkingPlan.equipmentIds.includes(eq.id);
                      return (
                        <div key={eq.id} className={`flex items-center gap-2 p-1.5 rounded hover:bg-white/10 ${already ? 'opacity-50' : ''}`}>
                          <Checkbox id={`le-${eq.id}`} checked={linkEquipmentIds.has(eq.id)} disabled={already} onCheckedChange={c => { const s = new Set(linkEquipmentIds); c ? s.add(eq.id) : s.delete(eq.id); setLinkEquipmentIds(s); }} />
                          <Label htmlFor={`le-${eq.id}`} className="text-sm flex-1 cursor-pointer text-white"><span className="font-medium">{eq.name}</span><span className="text-white/60 ml-2 text-xs">{eq.id}</span>{already && <span className="text-green-400 ml-2 text-xs">(已关联)</span>}</Label>
                        </div>
                      );
                    })}
                  </div>
                </ScrollArea>
              </div>
              <DialogFooter>
                <Button variant="outline" className="bg-white/10 border-white/20 text-white hover:bg-white/20" onClick={() => { setShowLinkEquipmentModal(false); setLinkingPlan(null); setLinkEquipmentIds(new Set()); }}>取消</Button>
                <Button onClick={handleLinkPlanToEquipment} disabled={linkEquipmentIds.size === 0}>确认关联</Button>
              </DialogFooter>
            </div>
          </div>
        </>
      )}

      {/* 取消关联弹窗 */}
      {showUnlinkModal && unlinkingPlan && (
        <>
          <div className="fixed inset-0 z-50 bg-black/20 backdrop-blur-sm pointer-events-none" />
          <div className="fixed left-[50%] top-[50%] z-50 translate-x-[-50%] translate-y-[-50%] w-full max-w-md bg-black/40 backdrop-blur-md border border-white/20 text-white rounded-lg p-6 shadow-lg max-h-[80vh] overflow-y-auto">
            <button className="absolute right-4 top-4 text-white/60 hover:text-white" onClick={() => { setShowUnlinkModal(false); setUnlinkingPlan(null); }}><X className="h-4 w-4" /></button>
            <DialogHeader><h2 className="text-lg font-semibold">取消关联</h2><p className="text-sm text-white/60">从 "{unlinkingPlan.title}" 中移除设备</p></DialogHeader>
            <div className="space-y-2 mt-4">
              <ScrollArea className="h-40 border border-white/20 rounded-md p-2">
                <div className="space-y-1">
                  {unlinkingPlan.equipmentIds.map(eid => {
                    const eq = linkedEquipments.find(e => e.id === eid);
                    return (
                      <div key={eid} className="flex items-center gap-2 p-1.5 rounded hover:bg-white/10">
                        <Checkbox id={`unlink-${eid}`} checked={unlinkEquipmentIds.has(eid)} onCheckedChange={c => { const s = new Set(unlinkEquipmentIds); c ? s.add(eid) : s.delete(eid); setUnlinkEquipmentIds(s); }} />
                        <Label htmlFor={`unlink-${eid}`} className="text-sm flex-1 cursor-pointer text-white"><span className="font-medium">{eq?.name || eid}</span><span className="text-white/60 ml-2 text-xs">{eid}</span></Label>
                      </div>
                    );
                  })}
                </div>
              </ScrollArea>
            </div>
            <DialogFooter className="mt-4">
              <Button variant="outline" className="bg-white/10 border-white/20 text-white hover:bg-white/20" onClick={() => { setShowUnlinkModal(false); setUnlinkingPlan(null); }}>取消</Button>
              <Button className="bg-red-500 hover:bg-red-600 text-white border-0" onClick={handleUnlinkPlanEquipment} disabled={unlinkEquipmentIds.size === 0}>确认移除</Button>
            </DialogFooter>
          </div>
        </>
      )}

      {/* 关联维护计划弹窗（设备→计划） */}
      {showLinkPlanModal && equipmentLinkingId && (
        <>
          <div className="fixed inset-0 z-50 bg-black/20 backdrop-blur-sm pointer-events-none" />
          <div className="fixed left-[50%] top-[50%] z-50 translate-x-[-50%] translate-y-[-50%] w-full max-w-lg bg-black/40 backdrop-blur-md border border-white/20 text-white rounded-lg p-6 shadow-lg max-h-[90vh] overflow-y-auto">
            <button className="absolute right-4 top-4 text-white/60 hover:text-white" onClick={() => { setShowLinkPlanModal(false); setEquipmentLinkingId(null); setPlanLinkIds(new Set()); }}><X className="h-4 w-4" /></button>
            <DialogHeader>
              <h2 className="text-lg font-semibold leading-none tracking-tight">关联维护计划</h2>
              <p className="text-sm text-white/60">为 {linkedEquipments.find(eq => eq.id === equipmentLinkingId)?.name} 选择维护计划</p>
            </DialogHeader>
            <div className="space-y-4 mt-2">
              <div className="space-y-2"><Label className="text-white/80">下次维护日期</Label><Popover><PopoverTrigger asChild><Button variant="outline" className="w-full justify-start text-left font-normal bg-white/10 border-white/20 text-white hover:bg-white/20"><Calendar className="mr-2 h-4 w-4" />{linkDate ? format(linkDate, 'yyyy-MM-dd') : '选择日期'}</Button></PopoverTrigger><PopoverContent className="w-auto p-0 z-[200]" align="start"><CalendarComponent mode="single" selected={linkDate} onSelect={setLinkDate} initialFocus className="pointer-events-auto" /></PopoverContent></Popover></div>
              <div className="space-y-2">
                <Label className="text-white/80">选择计划</Label>
                <ScrollArea className="h-40 border border-white/20 rounded-md p-2">
                  <div className="space-y-1">
                    {planGroups.map((plan, idx) => {
                      const key = `${plan.title}|||${plan.description||''}|||${plan.frequency}`;
                      const already = plan.equipmentIds.includes(equipmentLinkingId);
                      return (
                        <div key={idx} className={`flex items-center gap-2 p-1.5 rounded ${already ? 'opacity-50' : ''}`}>
                          <Checkbox id={`lp-${idx}`} checked={planLinkIds.has(key)} disabled={already} onCheckedChange={c => { const s = new Set(planLinkIds); c ? s.add(key) : s.delete(key); setPlanLinkIds(s); }} />
                          <Label htmlFor={`lp-${idx}`} className="text-sm flex-1 cursor-pointer text-white"><span className="font-medium">{plan.title}</span><span className="text-white/60 ml-2 text-xs">{frequencyLabels[plan.frequency]}</span>{already && <span className="text-green-400 ml-2 text-xs">(已关联)</span>}</Label>
                        </div>
                      );
                    })}
                  </div>
                </ScrollArea>
              </div>
              <DialogFooter>
                <Button variant="outline" className="bg-white/10 border-white/20 text-white hover:bg-white/20" onClick={() => { setShowLinkPlanModal(false); setEquipmentLinkingId(null); setPlanLinkIds(new Set()); }}>取消</Button>
                <Button onClick={handleLinkEquipmentToPlans} disabled={planLinkIds.size === 0}>确认关联</Button>
              </DialogFooter>
            </div>
          </div>
        </>
      )}

      {/* 添加维护计划弹窗 */}
      {showAddScheduleModal && (
        <>
          <div className="fixed inset-0 z-50 bg-black/20 backdrop-blur-sm pointer-events-none" />
          <div className="fixed left-[50%] top-[50%] z-50 translate-x-[-50%] translate-y-[-50%] w-full max-w-lg bg-black/40 backdrop-blur-md border border-white/20 text-white rounded-lg p-6 shadow-lg">
            <button className="absolute right-4 top-4 text-white/60 hover:text-white" onClick={() => setShowAddScheduleModal(false)}><X className="h-4 w-4" /></button>
            <DialogHeader>
              <h2 className="text-lg font-semibold leading-none tracking-tight">添加维护计划</h2>
              <p className="text-sm text-white/60">为 {selectedEquipment?.name} 添加新的维护计划</p>
            </DialogHeader>
            <ScheduleFormContent onSubmit={handleAddSchedule} submitLabel="添加" />
          </div>
        </>
      )}

      {/* 编辑维护计划弹窗 */}
      {showEditScheduleModal && editingSchedule && (
        <>
          <div className="fixed inset-0 z-50 bg-black/20 backdrop-blur-sm pointer-events-none" />
          <div className="fixed left-[50%] top-[50%] z-50 translate-x-[-50%] translate-y-[-50%] w-full max-w-lg bg-black/40 backdrop-blur-md border border-white/20 text-white rounded-lg p-6 shadow-lg" key={editingSchedule.id}>
            <button className="absolute right-4 top-4 text-white/60 hover:text-white" onClick={() => { setShowEditScheduleModal(false); setEditingSchedule(null); resetScheduleForm(); }}><X className="h-4 w-4" /></button>
            <DialogHeader>
              <h2 className="text-lg font-semibold leading-none tracking-tight">编辑维护计划</h2>
              <p className="text-sm text-white/60">修改 {editingSchedule.title} 的维护计划</p>
            </DialogHeader>
            <ScheduleFormContent onSubmit={handleUpdateSchedule} submitLabel="保存" />
          </div>
        </>
      )}

      {/* 设备详情弹窗 — key 确保每次打开都是全新实例 */}
      {showEquipmentDetail && detailEquipment && (
        <EquipmentDetailModal
          key={detailModalKey}
          equipment={detailEquipment}
          onClose={() => { setShowEquipmentDetail(false); setDetailEquipment(null); refetchAllSchedules(); }}
          onUpdate={handleDetailUpdate}
          onDelete={handleDetailDelete}
        />
      )}
    </>
  );
};

export default EquipmentTypeManager;
