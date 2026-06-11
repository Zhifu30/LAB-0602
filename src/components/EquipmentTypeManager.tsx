import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { Plus, Trash2, Edit2, Save, X, Tags, ChevronRight, Wrench, Check, Link2, Unlink, User, Search, ChevronDown, ChevronUp, Calendar, Bell, Clock, FileText, Copy, RefreshCw, Upload, Link, Image as ImageIcon } from 'lucide-react';
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
import GlassModal from '@/components/GlassModal';
import MaintenanceScheduleFormDialog from '@/components/shared/MaintenanceScheduleFormDialog';
import MaintenancePlanFormDialog from '@/components/shared/MaintenancePlanFormDialog';
import EquipmentPickerDialog from '@/components/shared/EquipmentPickerDialog';
import HierarchicalResponsibleColumn from '@/components/HierarchicalResponsibleColumn';
import { MaintenancePlanFormData, MaintenanceScheduleFormData } from '@/types/maintenance';
import { supabase } from '@/integrations/supabase/client';
import { format, endOfMonth } from 'date-fns';
import {
  getEffectiveImageUrl, getImageRecommendations, getImageSourceType,
  uploadTypeSharedImage, syncTypeSharedImage, scanTypeImageUsage,
  cleanupOrphanImages, runImageSelfCheck, buildTypeImagePath
} from '@/utils/imageUtils';

// 获取当月月底日期
const getEndOfCurrentMonth = () => endOfMonth(new Date());

export interface EquipmentTypeConfig {
  id: string;
  name: string;
  maintenanceContent: string;
  equipmentIds: string[];
  sharedSopFiles?: { url: string; name: string }[] | null;
  sharedImageUrl?: string | null;
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
  role?: string | null;
  role_type?: string | null;
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

// Use equipment_templates table to persist type definitions.
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
  // 图片映射
  interface ImageMapping { imageUrl: string; equipmentIds: string[]; }
  const [imageMappings, setImageMappings] = useState<ImageMapping[]>([]);
  const [addedUrls, setAddedUrls] = useState<string[]>([]);
  const [showImageEquipModal, setShowImageEquipModal] = useState(false);
  const [editingImageIdx, setEditingImageIdx] = useState<number>(-1);
  const [imageEquipSelected, setImageEquipSelected] = useState<Set<string>>(new Set());
  const imageFileInputRef = useRef<HTMLInputElement>(null);
  const [imageUploading, setImageUploading] = useState(false);

  // 共享图片管理（Phase 4-5 新增）
  const [showSyncConfirm, setShowSyncConfirm] = useState(false);
  const [pendingSharedUrl, setPendingSharedUrl] = useState<string | null>(null);
  const [showCleanupDrawer, setShowCleanupDrawer] = useState(false);
  const [cleanupPreview, setCleanupPreview] = useState<{ deleted: string[]; freedBytes: number; errors: string[] } | null>(null);
  const [cleanupDryRunLoading, setCleanupDryRunLoading] = useState(false);
  const [selfCheckResults, setSelfCheckResults] = useState<any[] | null>(null);
  const [selfCheckRunning, setSelfCheckRunning] = useState(false);
  const [imageRecs, setImageRecs] = useState<any>(null);
  const [selectedRecUrl, setSelectedRecUrl] = useState<string | null>(null); // 推荐面板当前高亮项

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
    // 1. 从 equipment_templates 获取类型定义（主数据源）
    const { data: templateData, error: templateError } = await supabase
      .from('equipment_templates')
      .select('id, equipment_type, created_at, shared_sop_files, shared_image_url')
      .order('created_at', { ascending: true });

    if (templateError) throw templateError;

    // 2. 从 equipment 表获取实际使用的类型（作为补充）
    const { data: eqTypes, error: eqError } = await supabase
      .from('equipment')
      .select('type')
      .not('type', 'is', null)
      .neq('type', '')
      .order('type');

    if (eqError) throw eqError;

    const dbTypes: EquipmentTypeConfig[] = (templateData || []).map((row: any) => ({
      id: row.id,
      name: row.equipment_type,
      maintenanceContent: '',
      equipmentIds: [],
      sharedSopFiles: row.shared_sop_files || null,
      sharedImageUrl: row.shared_image_url || null,
    }));

    const templateNames = new Set(dbTypes.map(t => t.name));
    const eqDistinctNames = [...new Set((eqTypes || []).map((r: any) => r.type).filter(Boolean) as string[])];

    // 3. equipment 中有但 templates 中没有的类型：以临时条目展示（不自动创建模板，避免已删除类型被重新创建）
    const orphanNames = eqDistinctNames.filter(name => !templateNames.has(name));
    const orphanTypes: EquipmentTypeConfig[] = orphanNames.map((name, i) => ({
      id: `type_db_orphan_${i}`,
      name,
      maintenanceContent: '',
      equipmentIds: [],
    }));

    const allTypes = [...dbTypes, ...orphanTypes];

    // Sync associations from DB equipment.type field
    return allTypes.map(t => ({
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
      .from('equipment_templates')
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
  }, [isOpen]); // eslint-disable-line react-hooks/exhaustive-deps

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
        .select('id, user_id, username, email, role, role_type')
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

  const roleLevelLabels: Record<string, string> = {
    admin: '最高',
    manager: '一级',
    scientist: '二级',
    analyst: '三级',
    user: '普通'
  };

  const getResponsibleLevel = (roleType?: string | null) => {
    if (!roleType) return '普通负责人';
    return `${roleLevelLabels[roleType] ?? roleType}负责人`;
  };

  const formatUserLabel = (user: UserProfile) => {
    if (!user.role_type) return user.username;
    return `${user.username} (${getResponsibleLevel(user.role_type)})`;
  };

  // 活跃设备（排除报废）- 报废设备不参与任何管理活动
  // 同时检查 isScrapped 布尔字段和 status='scrapped'，兼容两种报废标记方式
  // 使用 equipKey 稳定依赖，避免 equipments 数组引用变化导致无限重渲染
  const equipKey = useMemo(() =>
    (equipments || []).map(eq => `${eq.id}:${eq.status}:${(eq as any).isScrapped ? 1 : 0}`).sort().join(','),
    [equipments]
  );
  const activeEquipments = useMemo(() => {
    return equipments.filter(eq =>
      (eq as any).isScrapped !== true && eq.status !== 'scrapped'
    );
  }, [equipKey]); // eslint-disable-line react-hooks/exhaustive-deps

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

  // 当类型变化时刷新
  useEffect(() => { refetchAllSchedules(); }, [selectedTypeId]); // eslint-disable-line react-hooks/exhaustive-deps

  // 图片映射：完全由当前类型的关联设备状态派生，加上手动临时添加的 URL
  // 报废设备不参与任何管理活动 - 图片映射中排除报废设备
  useEffect(() => {
    if (selectedTypeId) {
      // 1. 从关联设备中提取所有已存在的图片 URL（排除报废设备）
      const eqImagesMap = new Map<string, Set<string>>();
      linkedEquipments.forEach(eq => {
        // 双重检查：确保报废设备不会出现在图片映射中
        if ((eq as any).isScrapped === true || eq.status === 'scrapped') return;
        const url = eq.imageUrl?.trim();
        if (url) {
          if (!eqImagesMap.has(url)) eqImagesMap.set(url, new Set());
          eqImagesMap.get(url)!.add(eq.id);
        }
      });

      // 2. 合并手动添加的 URL（如果它们还没出现在设备中）
      const allUrls = Array.from(new Set([...Array.from(eqImagesMap.keys()), ...addedUrls]));
      
      const finalMappings: ImageMapping[] = allUrls.map(url => ({
        imageUrl: url,
        equipmentIds: Array.from(eqImagesMap.get(url) || [])
          .sort((a,b) => a.localeCompare(b,undefined,{numeric:true}))
      }));
      
      setImageMappings(finalMappings);
      // 只在类型切换时重置临时添加的URL列表
      if (addedUrls.length > 0) setAddedUrls([]);
    } else {
      setImageMappings([]);
      if (addedUrls.length > 0) setAddedUrls([]);
    }
  }, [selectedTypeId, addedUrls]);

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
        .from('equipment_templates')
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
      // 直接从数据库查找所有使用此类型的设备（避免 equipments prop 可能过时）
      const { data: dbEquipments } = await supabase
        .from('equipment')
        .select('id')
        .eq('type', typeToDelete.name);

      const allLinkedIds = (dbEquipments || []).map((eq: any) => eq.id);
      if (allLinkedIds.length > 0) {
        // 批量清除所有设备的 type 字段
        await supabase
          .from('equipment')
          .update({ type: null })
          .in('id', allLinkedIds);
      }

      // 从数据库删除类型定义（只有 ID 不是临时 orphan ID 时才执行）
      if (!id.startsWith('type_db_orphan_')) {
        try {
          await supabase
            .from('equipment_templates')
            .delete()
            .eq('id', id);
        } catch (e) {
          console.error('删除类型(数据库)失败:', e);
        }
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
    // 如果是临时 orphan 类型，创建新的模板条目；否则更新已有条目
    const isOrphanType = editingTypeId?.startsWith('type_db_orphan_') ?? false;
    try {
      if (editingTypeId && !isOrphanType) {
        const { error } = await supabase
          .from('equipment_templates')
          .update({ equipment_type: nextName } as any)
          .eq('id', editingTypeId);
        if (error) throw error;
      } else if (isOrphanType) {
        // 为 orphan 类型创建正式的模板条目
        const { error } = await supabase
          .from('equipment_templates')
          .insert({
            equipment_type: nextName,
            model: TYPE_SENTINEL,
            manufacturer: TYPE_SENTINEL
          } as any);
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

        // 如果类型已有共享图片，自动同步到待关联设备
        if (selectedType.sharedImageUrl) {
          updateData.image_url = selectedType.sharedImageUrl;
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
  const handleAddPlan = async (form: MaintenancePlanFormData) => {
    if (!form.title) { toast({ title: '错误', description: '请填写计划标题', variant: 'destructive' }); throw new Error('validation'); }
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const nextDueDate = format(getEndOfCurrentMonth(), 'yyyy-MM-dd');
      let createdCount = 0, skippedCount = 0;
      for (const eq of linkedEquipments) {
        const { data: existing } = await supabase.from('maintenance_schedules').select('id').eq('equipment_id', eq.id).eq('title', form.title).eq('is_active', true).limit(1);
        if (existing && existing.length > 0) { skippedCount++; continue; }
        const user = users.find(u => u.username === eq.responsible);
        const { error } = await supabase.from('maintenance_schedules').insert({
          equipment_id: eq.id, title: form.title, description: form.description || null,
          frequency: form.frequency, next_due_date: nextDueDate, reminder_days_before: form.reminder_days_before,
          assigned_name: eq.responsible || null, assigned_email: user?.email || eq.responsible_email || null,
          assigned_user_id: user?.user_id || null, is_active: true, created_by: session?.user?.id || null
        });
        if (!error) createdCount++;
      }
      await refetchAllSchedules(); onEquipmentRefresh?.();
      setPlanFormData({ title: '', description: '', frequency: 'monthly', reminder_days_before: 7 });
      toast({ title: '成功', description: `已创建 ${createdCount} 个计划${skippedCount > 0 ? `，跳过 ${skippedCount} 个已存在` : ''}` });
    } catch (err) {
      if ((err as Error).message !== 'validation') {
        console.error('添加失败:', err);
        toast({ title: '添加失败', description: '请重试', variant: 'destructive' });
      }
      throw err;
    }
  };

  const handleEditPlan = (plan: PlanGroup) => {
    setEditingPlan(plan);
    setPlanFormData({ title: plan.title, description: plan.description || '', frequency: plan.frequency, reminder_days_before: plan.reminder_days_before });
    setShowEditPlanModal(true);
  };

  const handleUpdatePlan = async (form: MaintenancePlanFormData) => {
    if (!editingPlan || !form.title) { toast({ title: '错误', description: '请填写计划标题', variant: 'destructive' }); throw new Error('validation'); }
    try {
      const ids = editingPlan.schedules.map(s => s.id);
      const { error } = await supabase.from('maintenance_schedules').update({
        title: form.title, description: form.description || null,
        frequency: form.frequency, reminder_days_before: form.reminder_days_before,
      }).in('id', ids);
      if (error) throw error;
      await refetchAllSchedules(); onEquipmentRefresh?.();
      setEditingPlan(null);
      toast({ title: '成功', description: `已更新 ${ids.length} 条计划` });
    } catch (err) {
      if ((err as Error).message !== 'validation') {
        console.error('更新失败:', err);
        toast({ title: '更新失败', description: '请重试', variant: 'destructive' });
      }
      throw err;
    }
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

  // 计划 ↔ 设备统一管理（关联+解除）
  const handleLinkPlanToEquipment = async () => {
    if (!linkingPlan) return;
    const selected = new Set(linkEquipmentIds);
    const original = new Set(linkingPlan.equipmentIds);
    const toAdd = [...selected].filter(id => !original.has(id));
    const toRemove = [...original].filter(id => !selected.has(id));
    if (toAdd.length === 0 && toRemove.length === 0) { setShowLinkEquipmentModal(false); return; }
    try {
      const { data: { session } } = await supabase.auth.getSession();
      let added = 0, removed = 0;
      // 新增关联
      for (const eid of toAdd) {
        const eq = linkedEquipments.find(e => e.id === eid); if (!eq) continue;
        const nd = format(linkDate || getEndOfCurrentMonth(), 'yyyy-MM-dd');
        const u = users.find(x => x.username === eq.responsible);
        const { error } = await supabase.from('maintenance_schedules').insert({
          equipment_id: eid, title: linkingPlan.title, description: linkingPlan.description,
          frequency: linkingPlan.frequency, next_due_date: nd, reminder_days_before: linkingPlan.reminder_days_before,
          assigned_name: eq.responsible || null, assigned_email: u?.email || eq.responsible_email || null,
          assigned_user_id: u?.user_id || null, is_active: true, created_by: session?.user?.id || null
        });
        if (!error) added++;
      }
      // 解除关联
      for (const eid of toRemove) {
        const ids = linkingPlan.schedules.filter(s => s.equipment_id === eid).map(s => s.id);
        if (ids.length > 0) {
          const { error } = await supabase.from('maintenance_schedules').update({ is_active: false }).in('id', ids);
          if (!error) removed++;
        }
      }
      await refetchAllSchedules(); onEquipmentRefresh?.();
      setShowLinkEquipmentModal(false); setLinkingPlan(null); setLinkEquipmentIds(new Set());
      const msgs = [];
      if (added > 0) msgs.push(`关联 ${added} 台`);
      if (removed > 0) msgs.push(`解除 ${removed} 台`);
      toast({ title: '已更新', description: msgs.join('，') || '无变更' });
    } catch (err) { console.error('操作失败:', err); toast({ title: '失败', description: '请重试', variant: 'destructive' }); }
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

  const handleAddSchedule = async (form: MaintenanceScheduleFormData) => {
    if (!selectedEquipmentId || !form.title || !form.next_due_date) {
      toast({ title: '错误', description: '请填写标题和下次维护日期', variant: 'destructive' });
      throw new Error('validation');
    }

    try {
      const { data: { session } } = await supabase.auth.getSession();
      const selectedUser = users.find(u => u.user_id === form.assigned_user_id);
      
      const { error } = await supabase
        .from('maintenance_schedules')
        .insert({
          equipment_id: selectedEquipmentId,
          title: form.title,
          description: form.description || null,
          frequency: form.frequency,
          next_due_date: form.next_due_date,
          reminder_days_before: form.reminder_days_before,
          assigned_user_id: form.assigned_user_id || null,
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
      resetScheduleForm();
      refetchAllSchedules();
      onEquipmentRefresh?.();
    } catch (error) {
      if ((error as Error).message !== 'validation') {
        console.error('添加维护计划失败:', error);
        toast({ title: '添加失败', description: '维护计划添加失败', variant: 'destructive' });
      }
      throw error;
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

  const handleUpdateSchedule = async (form: MaintenanceScheduleFormData) => {
    if (!editingSchedule || !form.title || !form.next_due_date) {
      toast({ title: '错误', description: '请填写标题和下次维护日期', variant: 'destructive' });
      throw new Error('validation');
    }

    try {
      const selectedUser = users.find(u => u.user_id === form.assigned_user_id);
      
      const { error } = await supabase
        .from('maintenance_schedules')
        .update({
          title: form.title,
          description: form.description || null,
          frequency: form.frequency,
          next_due_date: form.next_due_date,
          reminder_days_before: form.reminder_days_before,
          assigned_user_id: form.assigned_user_id || null,
          assigned_name: selectedUser?.username || null,
          assigned_email: selectedUser?.email || null,
          reminder_sent: false
        })
        .eq('id', editingSchedule.id);

      if (error) throw error;

      toast({ title: '成功', description: '维护计划已更新' });
      setEditingSchedule(null);
      resetScheduleForm();
      if (selectedEquipmentId) {
        refetchAllSchedules();
      }
      onEquipmentRefresh?.();
    } catch (error) {
      if ((error as Error).message !== 'validation') {
        console.error('更新维护计划失败:', error);
        toast({ title: '更新失败', description: '维护计划更新失败', variant: 'destructive' });
      }
      throw error;
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

  const logMaintenanceCompletionNotifications = async (
    scheduleId: string,
    equipmentId: string,
    completedById: string | null,
    completedByName: string
  ) => {
    if (!completedById) return;

    const { data: responsibles, error } = await supabase
      .from('equipment_maintenance_responsible')
      .select('user_id, maintenance_level')
      .eq('equipment_id', equipmentId);

    if (error) {
      console.warn('加载维护责任等级失败:', error);
      return;
    }

    if (!responsibles?.length) return;

    const completedByRecord = responsibles.find((record: any) => record.user_id === completedById);
    const completedByLevel = completedByRecord ? Number(completedByRecord.maintenance_level) : null;
    if (!completedByLevel) return;

    const notifications = responsibles
      .filter((record: any) => record.user_id !== completedById && Number(record.maintenance_level) < completedByLevel)
      .map((record: any) => ({
        schedule_id: scheduleId,
        equipment_id: equipmentId,
        completed_by: completedById,
        completed_by_name: completedByName,
        completed_by_level: completedByLevel,
        notified_to: record.user_id,
        notified_to_name: users.find((u) => u.user_id === record.user_id)?.username || '负责人',
        notified_to_level: Number(record.maintenance_level),
        completed_at: new Date().toISOString(),
        notification_status: 'sent'
      }));

    if (notifications.length === 0) return;

    const { error: notifyError } = await supabase
      .from('maintenance_completion_notifications')
      .insert(notifications);

    if (notifyError) {
      console.warn('记录维护完成通知失败:', notifyError);
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

      const equipmentId = selectedEquipmentId || schedule.equipment_id;
      const completedById = session?.user?.id ?? null;
      const completedByName = session?.user?.email?.split('@')[0] || 'Unknown';

      // Log the completion
      const { error: logError } = await supabase
        .from('maintenance_logs')
        .insert({
          schedule_id: schedule.id,
          equipment_id: equipmentId,
          completed_by: completedById,
          completed_by_name: completedByName
        });

      if (logError) throw logError;

      await logMaintenanceCompletionNotifications(schedule.id, equipmentId, completedById, completedByName);

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

  // 本地图片上传到 Supabase Storage
  const handleImageFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setImageUploading(true);
    try {
      // 上传到 Supabase Storage
      const fileName = `type_img_${Date.now()}_${file.name.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
      const { data: uploadData, error: uploadError } = await supabase.storage
        .from('equipment-images')
        .upload(fileName, file, {
          contentType: file.type,
          upsert: true
        });

      if (uploadError) throw uploadError;

      // 获取公共URL
      const { data: urlData } = supabase.storage
        .from('equipment-images')
        .getPublicUrl(uploadData.path);

      const publicUrl = urlData.publicUrl;
      setAddedUrls(prev => {
        if (prev.includes(publicUrl) || imageMappings.some(m => m.imageUrl === publicUrl)) {
          toast({ title: '提示', description: '该图片已在库中' });
          return prev;
        }
        return [...prev, publicUrl];
      });
      toast({ title: '上传成功', description: '图片已添加到共享库' });
    } catch (error: any) {
      console.error('图片上传失败:', error);
      toast({ title: '上传失败', description: error?.message || '无法上传图片', variant: 'destructive' });
    } finally {
      setImageUploading(false);
      // 清空文件选择器
      if (imageFileInputRef.current) imageFileInputRef.current.value = '';
    }
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

  // 稳定化传给 HierarchicalResponsibleColumn 的 props，避免每次渲染创建新引用导致无限循环
  const memoizedImageMappings = useMemo(
    () => imageMappings.map(m => ({ imageUrl: m.imageUrl, equipmentIds: m.equipmentIds })),
    [imageMappings]
  );
  const memoizedPlanGroups = useMemo(
    () => planGroups.map(p => ({ title: p.title, description: p.description, frequency: p.frequency, equipmentIds: p.equipmentIds })),
    [planGroups]
  );
  const handleEquipmentImageChange = useCallback(async (equipmentId: string, imageUrl: string | null) => {
    await supabase.from('equipment').update({ image_url: imageUrl }).eq('id', equipmentId);
    onEquipmentRefresh?.();
    window.dispatchEvent(new Event('equipment-updated'));
    toast({ title: imageUrl ? '图片已关联' : '图片已取消关联' });
  }, [onEquipmentRefresh, toast]);
  const handleEquipmentPlanLink = useCallback((equipmentId: string) => {
    setEquipmentLinkingId(equipmentId);
    setLinkDate(getEndOfCurrentMonth());
    const existingKeys = allSchedules.filter(s => s.equipment_id === equipmentId).map(s => `${s.title}|||${s.description||''}|||${s.frequency}`);
    const available = planGroups.filter(p => !existingKeys.includes(`${p.title}|||${p.description||''}|||${p.frequency}`)).map(p => `${p.title}|||${p.description||''}|||${p.frequency}`);
    setPlanLinkIds(new Set(available));
    setShowLinkPlanModal(true);
  }, [allSchedules, planGroups]);

  // ========== 共享图片管理（Phase 4-5 新增） ==========

  // 选中类型时，自动计算图片推荐
  useEffect(() => {
    if (selectedType && linkedEquipments.length > 0) {
      setImageRecs(getImageRecommendations(linkedEquipments));
    } else {
      setImageRecs(null);
    }
  }, [selectedType, linkedEquipments]);

  // 从关联设备中选择图片作为共享图片（先高亮，再弹窗）
  const handleSetSharedFromEquipment = async (url: string) => {
    if (!selectedType || !selectedTypeId) return;
    setSelectedRecUrl(url);       // 高亮当前选择
    setPendingSharedUrl(url);
    setShowSyncConfirm(true);
  };

  // 上传新共享图片
  const handleUploadSharedImage = async (file: File) => {
    if (!selectedType) return;
    try {
      setImageUploading(true);
      const publicUrl = await uploadTypeSharedImage(file, selectedType.name);
      setPendingSharedUrl(publicUrl);
      setShowSyncConfirm(true);
    } catch (err: any) {
      toast({ title: '上传失败', description: err?.message || '请重试', variant: 'destructive' });
    } finally {
      setImageUploading(false);
    }
  };

  // 确认同步（从弹窗触发）
  const handleConfirmSync = async () => {
    if (!selectedType || !pendingSharedUrl || !selectedTypeId) return;
    try {
      // 1. 写 shared_image_url
      const { error: tplErr } = await supabase
        .from('equipment_templates')
        .update({ shared_image_url: pendingSharedUrl })
        .eq('equipment_type', selectedType.name)
        .eq('model', TYPE_SENTINEL);

      if (tplErr) throw tplErr;

      // 2. 调用 RPC 同步所有关联设备 (Phase 3 RPC)
      try {
        const { data, error: rpcErr } = await supabase.rpc('sync_type_shared_image', {
          p_type_name: selectedType.name,
          p_shared_image_url: pendingSharedUrl,
        });
        if (rpcErr) {
          console.warn('RPC 不可用，使用前端批量更新回退:', rpcErr.message);
          // 回退：前端逐条更新
          await supabase.from('equipment')
            .update({ image_url: pendingSharedUrl })
            .eq('type', selectedType.name)
            .neq('status', 'scrapped');
          toast({ title: '已保存', description: '共享图片已设置（RPC 未部署，使用前端更新）' });
        } else {
          const result = data as any;
          toast({ title: '同步完成', description: `已更新 ${result?.updated_count ?? linkedEquipments.length} 台设备` });
        }
      } catch {
        // RPC 回退
        await supabase.from('equipment')
          .update({ image_url: pendingSharedUrl })
          .eq('type', selectedType.name)
          .neq('status', 'scrapped');
        toast({ title: '已保存', description: '共享图片已设置' });
      }

      setShowSyncConfirm(false);
      setPendingSharedUrl(null);
      setSelectedRecUrl(null);  // 同步成功后清除高亮
      onEquipmentRefresh?.();
      refetchAllSchedules();
    } catch (err: any) {
      toast({ title: '保存失败', description: err?.message || '请重试', variant: 'destructive' });
    }
  };

  // 清理冗余图片
  const handleCleanupDryRun = async () => {
    if (!selectedType) return;
    setCleanupDryRunLoading(true);
    try {
      const result = await cleanupOrphanImages(selectedType.name, true);
      setCleanupPreview(result);
      setShowCleanupDrawer(true);
    } catch (err: any) {
      toast({ title: '扫描失败', description: err?.message || '请重试', variant: 'destructive' });
    } finally {
      setCleanupDryRunLoading(false);
    }
  };

  const handleCleanupConfirm = async () => {
    if (!selectedType) return;
    try {
      const result = await cleanupOrphanImages(selectedType.name, false);
      toast({ title: '清理完成', description: `已删除 ${result.deleted.length} 个冗余文件` });
      setShowCleanupDrawer(false);
      setCleanupPreview(null);
    } catch (err: any) {
      toast({ title: '清理失败', description: err?.message || '请重试', variant: 'destructive' });
    }
  };

  // 运行自检
  const handleSelfCheck = async () => {
    if (!selectedType) return;
    setSelfCheckRunning(true);
    try {
      const results = await runImageSelfCheck(selectedType.name);
      setSelfCheckResults(results);
    } catch (err: any) {
      toast({ title: '自检失败', description: err?.message || '请重试', variant: 'destructive' });
    } finally {
      setSelfCheckRunning(false);
    }
  };

  // 生成共享图片预览（用于列 4）
  const sharedPreviewUrl = useMemo(() => {
    if (!selectedType) return null;
    return selectedType.sharedImageUrl || imageRecs?.topUrl || null;
  }, [selectedType, imageRecs]);

  return (
    <>
      <DialogPrimitive.Root open={isOpen} onOpenChange={onClose} modal={false}>
        <DialogPrimitive.Content
          onInteractOutside={(e) => e.preventDefault()}
          onPointerDownOutside={(e) => e.preventDefault()}
          className={cn(
          "fixed left-[50%] top-[50%] z-50 grid translate-x-[-50%] translate-y-[-50%] shadow-2xl duration-200",
          "w-[95vw] max-w-[1400px] max-h-[88vh] overflow-hidden flex flex-col border-0 rounded-xl p-6",
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
              设备类型 · 关联设备 · 维护计划 · 共享图片 · 负责人层级
            </p>
          </DialogHeader>

          <div className="flex-1 grid grid-cols-1 xl:grid-cols-[minmax(220px,260px)_minmax(260px,1.1fr)_minmax(280px,1.4fr)_minmax(240px,1.1fr)_minmax(240px,1.2fr)] gap-3 overflow-hidden relative">
            {/* 第一列：类型列表 */}
            <div className="flex flex-col space-y-3 overflow-hidden rounded-lg bg-white/10 backdrop-blur-sm border border-white/20 p-3 min-w-0">
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
                                {activeEquipments.filter(eq => eq.type === type.name).length}
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
                                                      {formatUserLabel(user)}
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
                                      <div className="font-medium text-xs text-white truncate">{eq.name}</div>
                                      <div className="mt-1 flex flex-wrap items-center gap-2">
                                        <Badge variant="secondary" className="text-[10px] h-5 px-2 py-0.5 bg-white/10 border-white/10 text-white/70">
                                          {eq.id}
                                        </Badge>
                                        {eq.responsible && (
                                          <Badge variant="secondary" className="text-[10px] h-5 px-2 py-0.5 bg-slate-800/70 text-sky-200 border border-sky-500/20">
                                            {eq.responsible}
                                          </Badge>
                                        )}
                                      </div>
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
                                <div className="mt-1 flex flex-wrap items-center gap-2">
                                  <Badge variant="secondary" className="text-[10px] h-5 px-2 py-0.5 bg-white/10 border-white/10 text-white/70">
                                    {eq.id}
                                  </Badge>
                                  {eq.responsible && (
                                    <Badge variant="secondary" className="text-[10px] h-5 px-2 py-0.5 bg-slate-800/70 text-sky-200 border border-sky-500/20">
                                      {eq.responsible}
                                    </Badge>
                                  )}
                                  {eq.imageUrl && (
                                    <Badge variant="secondary" className="text-[10px] h-5 px-2 py-0.5 bg-emerald-900/50 text-emerald-200 border border-emerald-500/20">
                                      有图片
                                    </Badge>
                                  )}
                                  {allSchedules.filter(s => s.equipment_id === eq.id).length > 0 && (
                                    <Badge variant="secondary" className="text-[10px] h-5 px-2 py-0.5 bg-blue-900/50 text-blue-200 border border-blue-500/20">
                                      {allSchedules.filter(s => s.equipment_id === eq.id).length}个计划
                                    </Badge>
                                  )}
                                </div>
                              </div>
                              <Popover>
                                <PopoverTrigger asChild>
                                  <Button
                                    size="sm"
                                    className={`h-6 w-6 p-0 shrink-0 border-0 ${eq.imageUrl ? 'bg-green-500 hover:bg-green-600' : 'bg-white/10 hover:bg-white/20'}`}
                                    onClick={(e) => e.stopPropagation()}
                                    title={eq.imageUrl ? '更换图片' : '关联图片'}>
                                    <ImageIcon className="h-3 w-3 text-white" />
                                  </Button>
                                </PopoverTrigger>
                                <PopoverContent
                                  className="!w-52 p-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-600 text-foreground shadow-lg z-50 rounded-xl"
                                  align="end"
                                  side="right"
                                  sideOffset={8}
                                  onClick={(e) => e.stopPropagation()}
                                >
                                  <div className="text-xs text-muted-foreground mb-1.5 px-1 font-medium">选择共享图片</div>
                                  <div className="max-h-56 overflow-y-auto space-y-1.5">
                                    {imageMappings.length === 0 && (
                                      <p className="text-xs text-muted-foreground text-center py-4">暂无图片</p>
                                    )}
                                    {imageMappings.map((mapping, mi) => (
                                      <button
                                        key={mi}
                                        className={`w-full flex items-center gap-2 p-1.5 rounded-md text-xs transition-colors ${mapping.imageUrl === eq.imageUrl ? 'bg-green-100 dark:bg-green-500/30 border border-green-400 ring-1 ring-green-400/30' : 'hover:bg-muted border border-transparent'}`}
                                        onClick={async () => {
                                          const newUrl = mapping.imageUrl === eq.imageUrl ? null : mapping.imageUrl;
                                          await supabase.from('equipment').update({ image_url: newUrl }).eq('id', eq.id);
                                          onEquipmentRefresh?.();
                                          toast({ title: newUrl ? '图片已关联' : '图片已取消关联' });
                                        }}
                                      >
                                        <div className="h-12 w-12 rounded-md bg-cover bg-center shrink-0 border" style={{ backgroundImage: `url(${mapping.imageUrl})` }} />
                                        <div className="flex-1 min-w-0 text-left">
                                          <span className="text-muted-foreground">{mapping.equipmentIds.length} 台设备</span>
                                        </div>
                                        {mapping.imageUrl === eq.imageUrl && <Check className="h-3.5 w-3.5 text-green-500 shrink-0" />}
                                      </button>
                                    ))}
                                    {eq.imageUrl && (
                                      <button
                                        className="w-full flex items-center gap-2 p-1.5 rounded-md text-xs hover:bg-red-100 dark:hover:bg-red-500/20 transition-colors text-red-500 border border-red-200 dark:border-red-500/20"
                                        onClick={async () => {
                                          await supabase.from('equipment').update({ image_url: null }).eq('id', eq.id);
                                          onEquipmentRefresh?.();
                                          toast({ title: '图片已取消关联' });
                                        }}
                                      >
                                        <X className="h-3.5 w-3.5" /> 取消关联
                                      </button>
                                    )}
                                  </div>
                                </PopoverContent>
                              </Popover>
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
                                      setLinkEquipmentIds(new Set(plan.equipmentIds)); setShowLinkEquipmentModal(true);
                                    }} title="管理设备关联"><Link2 className="h-3.5 w-3.5" /></Button>
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

            {/* 第四列：共享图片管理（重写） */}
            {selectedType && (
              <div className="flex flex-col overflow-hidden rounded-lg bg-white/10 backdrop-blur-sm border border-white/20">
                <div className="p-3 border-b border-white/20 bg-white/5">
                  <h3 className="font-semibold text-sm text-white drop-shadow flex items-center gap-1.5">
                    <ImageIcon className="h-4 w-4" />
                    共享图片
                  </h3>
                  <p className="text-xs text-white/60">{selectedType.name} · {linkedEquipments.length}台设备</p>
                </div>

                <ScrollArea className="flex-1 p-3">
                  <div className="space-y-3">

                    {/* 当前共享图片预览 */}
                    {selectedType.sharedImageUrl ? (
                      <>
                        <div className="rounded-lg overflow-hidden bg-white/5 border border-white/10">
                          <div className="h-28 bg-cover bg-center"
                            style={{ backgroundImage: `url(${selectedType.sharedImageUrl})` }} />
                          <div className="p-2 flex items-center justify-between">
                            <span className="text-[10px] text-white/50 font-mono truncate max-w-[140px]"
                              title={selectedType.sharedImageUrl}>{selectedType.sharedImageUrl.split('/').pop()}</span>
                            <Badge className="text-[9px] bg-green-500/20 text-green-300 border-green-500/30">
                              已设置共享
                            </Badge>
                          </div>
                        </div>

                        {/* 操作按钮组 */}
                        <div className="space-y-1.5">
                          <p className="text-[10px] text-white/50 uppercase tracking-wider">更换图片</p>
                          <div className="flex gap-1 flex-wrap">
                            <Button size="sm" className="h-6 text-[10px] bg-blue-500 hover:bg-blue-600 text-white border-0"
                              onClick={() => {
                                if (imageRecs?.topUrl) handleSetSharedFromEquipment(imageRecs.topUrl);
                              }}>
                              <Link2 className="h-3 w-3 mr-1" />从设备选
                            </Button>
                            <Button size="sm" className="h-6 text-[10px] bg-green-500 hover:bg-green-600 text-white border-0"
                              onClick={() => imageFileInputRef.current?.click()}
                              disabled={imageUploading}>
                              {imageUploading ? <RefreshCw className="h-3 w-3 mr-1 animate-spin" /> : <Upload className="h-3 w-3 mr-1" />}
                              上传新图
                            </Button>
                          </div>
                        </div>

                        {/* 同步到所有设备 */}
                        <Button size="sm" className="w-full h-7 text-xs bg-purple-500 hover:bg-purple-600 text-white border-0"
                          onClick={() => {
                            setPendingSharedUrl(selectedType.sharedImageUrl!);
                            setShowSyncConfirm(true);
                          }}>
                          <RefreshCw className="h-3.5 w-3.5 mr-1" />
                          同步到 {linkedEquipments.length} 台设备
                        </Button>

                        {/* 清理冗余 */}
                        <Button size="sm" variant="outline"
                          className="w-full h-7 text-xs bg-white/5 border-white/20 text-white/70 hover:bg-white/10"
                          onClick={handleCleanupDryRun} disabled={cleanupDryRunLoading}>
                          {cleanupDryRunLoading ? <RefreshCw className="h-3.5 w-3.5 mr-1 animate-spin" /> : <Trash2 className="h-3.5 w-3.5 mr-1" />}
                          清理冗余图片
                        </Button>
                      </>
                    ) : (
                      /* 尚未设置共享图片 — 智能推荐 */
                      <>
                        {imageRecs && imageRecs.urlBreakdown.length > 0 ? (
                          <>
                            <div className="rounded-lg bg-blue-500/10 border border-blue-500/20 p-2.5">
                              <p className="text-[10px] text-blue-300">
                                💡 该类型 {imageRecs.totalDevices} 台关联设备中使用了 {imageRecs.urlBreakdown.length} 张不同图片，选择一张设为共享图片
                              </p>
                            </div>

                            <div className="space-y-2">
                              <p className="text-[10px] text-white/50 uppercase tracking-wider">从关联设备中选</p>
                              {imageRecs.urlBreakdown.map((item: any, i: number) => {
                                const isSelected = selectedRecUrl === item.url;
                                return (
                                <button
                                  key={i}
                                  className={`w-full rounded-lg overflow-hidden transition-all text-left ${
                                    isSelected
                                      ? 'bg-blue-500/10 border border-blue-400 shadow-[0_0_12px_rgba(59,130,246,0.3)]'
                                      : 'bg-white/5 border border-white/10 hover:border-white/30'
                                  }`}
                                  onClick={() => handleSetSharedFromEquipment(item.url)}
                                >
                                  <div className="flex items-center gap-2 p-2.5">
                                    <div className="h-12 w-12 rounded bg-cover bg-center shrink-0 border border-white/10"
                                      style={{ backgroundImage: `url(${item.url})` }} />
                                    <div className="flex-1 min-w-0">
                                      <div className="flex items-center gap-1.5 mb-0.5">
                                        <p className="text-[11px] text-white font-medium truncate">{item.url.split('/').pop()}</p>
                                        {isSelected && <Check className="h-3.5 w-3.5 text-blue-400 shrink-0" />}
                                      </div>
                                      <p className="text-[10px] text-white/50">{item.count} 台设备 · {item.equipmentNames.slice(0, 3).join(', ')}{item.equipmentNames.length > 3 ? ` 等${item.equipmentNames.length}台` : ''}</p>
                                    </div>
                                    <div className="shrink-0 flex flex-col items-end gap-1">
                                      <Badge className={`text-[9px] shrink-0 ${item.count === imageRecs.topCount ? 'bg-blue-500/20 text-blue-300' : 'bg-white/10 text-white/50'}`}>
                                        {item.count === imageRecs.topCount ? '最多设备' : `${item.count}台`}
                                      </Badge>
                                    </div>
                                  </div>
                                  <div className={`px-2.5 py-1.5 border-t flex items-center justify-center ${
                                    isSelected
                                      ? 'bg-blue-500/20 border-blue-400/30'
                                      : 'bg-white/[0.02] border-white/5'
                                  }`}>
                                    {isSelected ? (
                                      <span className="text-[11px] text-blue-300 font-medium flex items-center gap-1">
                                        <Check className="h-3.5 w-3.5" /> 已选为共享图片 — 请确认同步
                                      </span>
                                    ) : (
                                      <span className="text-[11px] text-white/60 group-hover:text-white/90">
                                        选为共享图片 →
                                      </span>
                                    )}
                                  </div>
                                </button>
                              );})}
                            </div>
                          </>
                        ) : (
                          <div className="text-center py-8 text-white/20">
                            <ImageIcon className="h-8 w-8 mx-auto mb-2 opacity-20" />
                            <p className="text-[10px]">关联设备暂无图片</p>
                          </div>
                        )}

                        <Separator className="bg-white/10" />

                        {/* 上传新图片 */}
                        <div className="space-y-2">
                          <p className="text-[10px] text-white/50 uppercase tracking-wider">或上传新图片</p>
                          <Button size="sm" className="w-full h-7 text-xs bg-green-500 hover:bg-green-600 text-white border-0"
                            onClick={() => imageFileInputRef.current?.click()}
                            disabled={imageUploading}>
                            {imageUploading ? <RefreshCw className="h-3.5 w-3.5 mr-1 animate-spin" /> : <Upload className="h-3.5 w-3.5 mr-1" />}
                            上传共享图片
                          </Button>
                        </div>
                      </>
                    )}

                    {/* 隐藏的文件输入 */}
                    <input ref={imageFileInputRef} type="file" accept="image/*"
                      onChange={(e) => { const f = e.target.files?.[0]; if (f) handleUploadSharedImage(f); }}
                      className="hidden" />

                  </div>
                </ScrollArea>
              </div>
            )}

            {/* 第五列：维护负责人等级（新的分层级模式） */}
            {selectedType && (
              <HierarchicalResponsibleColumn
                linkedEquipments={linkedEquipments}
                users={users}
                equipmentType={selectedType.name}
                onRefresh={onEquipmentRefresh}
                imageMappings={memoizedImageMappings}
                planGroups={memoizedPlanGroups}
                onEquipmentImageChange={handleEquipmentImageChange}
                onEquipmentPlanLink={handleEquipmentPlanLink}
              />
            )}
          </div>
        <button onClick={onClose} className="absolute right-4 top-4 z-20 rounded-sm opacity-70 transition-opacity hover:opacity-100">
            <X className="h-4 w-4 text-white" />
          </button>
        </DialogPrimitive.Content>
      </DialogPrimitive.Root>

      <MaintenancePlanFormDialog
        open={showAddPlanModal}
        onOpenChange={setShowAddPlanModal}
        title="添加维护计划"
        description={`新计划将自动关联到${selectedType?.name}下所有设备`}
        onSubmit={handleAddPlan}
        submitLabel="添加"
      />

      <MaintenancePlanFormDialog
        open={showEditPlanModal}
        onOpenChange={(open) => { setShowEditPlanModal(open); if (!open) setEditingPlan(null); }}
        title="编辑维护计划"
        description={editingPlan ? `修改 "${editingPlan.title}"（影响 ${editingPlan.equipmentIds.length} 台设备）` : undefined}
        initialData={editingPlan ? {
          title: editingPlan.title,
          description: editingPlan.description || '',
          frequency: editingPlan.frequency,
          reminder_days_before: editingPlan.reminder_days_before,
        } : planFormData}
        onSubmit={handleUpdatePlan}
        submitLabel="保存"
      />

      <EquipmentPickerDialog
        open={showLinkEquipmentModal && !!linkingPlan}
        onOpenChange={(open) => { if (!open) { setShowLinkEquipmentModal(false); setLinkingPlan(null); setLinkEquipmentIds(new Set()); } }}
        variant="glass"
        title="管理设备关联"
        description={`"${linkingPlan?.title}" — 勾选=关联，取消勾选=解除关联`}
        items={linkedEquipments.map((eq) => {
          const isLinked = linkingPlan?.equipmentIds.includes(eq.id);
          const isSelected = linkEquipmentIds.has(eq.id);
          let badge: string | undefined;
          let badgeClassName: string | undefined;
          if (isLinked && !isSelected) { badge = '(将解除)'; badgeClassName = 'text-red-400'; }
          else if (!isLinked && isSelected) { badge = '(将关联)'; badgeClassName = 'text-green-400'; }
          else if (isLinked && isSelected) { badge = '(保持)'; badgeClassName = 'text-white/40'; }
          return { id: eq.id, name: eq.name, subtitle: eq.id, badge, badgeClassName };
        })}
        selectedIds={linkEquipmentIds}
        onSelectionChange={setLinkEquipmentIds}
        searchable={false}
        confirmLabel="应用更改"
        onConfirm={handleLinkPlanToEquipment}
        footerExtra={<p className="text-xs text-white/50 mt-2">已选中 {linkEquipmentIds.size} 台 · 当前关联 {linkingPlan?.equipmentIds.length || 0} 台</p>}
      />

      {/* 关联维护计划弹窗（设备→计划） */}
      <GlassModal open={showLinkPlanModal && !!equipmentLinkingId} onClose={() => { setShowLinkPlanModal(false); setEquipmentLinkingId(null); setPlanLinkIds(new Set()); }}
        title="关联维护计划" description={`为 ${linkedEquipments.find(eq => eq.id === equipmentLinkingId)?.name} 选择维护计划`}>
        <div className="space-y-2"><Label className="text-white/80">下次维护日期</Label><Popover><PopoverTrigger asChild><Button variant="outline" className="w-full justify-start text-left font-normal bg-white/10 border-white/20 text-white hover:bg-white/20"><Calendar className="mr-2 h-4 w-4" />{linkDate ? format(linkDate, 'yyyy-MM-dd') : '选择日期'}</Button></PopoverTrigger><PopoverContent className="w-auto p-0 z-[200]" align="start"><CalendarComponent mode="single" selected={linkDate} onSelect={setLinkDate} initialFocus className="pointer-events-auto" /></PopoverContent></Popover></div>
        <div className="space-y-2 mt-4">
          <Label className="text-white/80">选择计划</Label>
          <ScrollArea className="h-40 border border-white/20 rounded-md p-2">
            {planGroups.map((plan, idx) => { const key = `${plan.title}|||${plan.description||''}|||${plan.frequency}`; const already = plan.equipmentIds.includes(equipmentLinkingId!); return (
              <div key={idx} className={`flex items-center gap-2 p-1.5 rounded ${already ? 'opacity-50' : ''}`}>
                <Checkbox id={`lp-${idx}`} checked={planLinkIds.has(key)} disabled={already} onCheckedChange={c => { const s = new Set(planLinkIds); c ? s.add(key) : s.delete(key); setPlanLinkIds(s); }} />
                <Label htmlFor={`lp-${idx}`} className="text-sm flex-1 cursor-pointer text-white"><span className="font-medium">{plan.title}</span><span className="text-white/60 ml-2 text-xs">{frequencyLabels[plan.frequency]}</span>{already && <span className="text-green-400 ml-2 text-xs">(已关联)</span>}</Label>
              </div>
            );})}
          </ScrollArea>
        </div>
        <div className="flex flex-col-reverse sm:flex-row sm:justify-end sm:space-x-2 mt-6">
          <Button variant="outline" className="bg-white/10 border-white/20 text-white hover:bg-white/20" onClick={() => { setShowLinkPlanModal(false); setEquipmentLinkingId(null); setPlanLinkIds(new Set()); }}>取消</Button>
          <Button onClick={handleLinkEquipmentToPlans} disabled={planLinkIds.size === 0}>确认关联</Button>
        </div>
      </GlassModal>

      <MaintenanceScheduleFormDialog
        open={showAddScheduleModal}
        onOpenChange={setShowAddScheduleModal}
        title="添加维护计划"
        description={`为 ${selectedEquipment?.name} 添加新的维护计划`}
        users={users}
        initialData={{ next_due_date: format(getEndOfCurrentMonth(), 'yyyy-MM-dd') }}
        onSubmit={handleAddSchedule}
        submitLabel="添加"
      />

      <MaintenanceScheduleFormDialog
        open={showEditScheduleModal}
        onOpenChange={(open) => { setShowEditScheduleModal(open); if (!open) { setEditingSchedule(null); resetScheduleForm(); } }}
        title="编辑维护计划"
        description={editingSchedule ? `修改 ${editingSchedule.title} 的维护计划` : undefined}
        users={users}
        initialData={editingSchedule ? {
          title: editingSchedule.title,
          description: editingSchedule.description || '',
          frequency: editingSchedule.frequency,
          next_due_date: editingSchedule.next_due_date,
          reminder_days_before: editingSchedule.reminder_days_before,
          assigned_user_id: editingSchedule.assigned_user_id || '',
        } : undefined}
        onSubmit={handleUpdateSchedule}
        submitLabel="保存"
      />

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
      <EquipmentPickerDialog
        open={showImageEquipModal && editingImageIdx >= 0}
        onOpenChange={(open) => { if (!open) { setShowImageEquipModal(false); setEditingImageIdx(-1); } }}
        variant="glass"
        title="选择关联设备"
        description="勾选要关联到此图片的设备"
        items={linkedEquipments.map((eq) => ({ id: eq.id, name: eq.name, subtitle: eq.id }))}
        selectedIds={imageEquipSelected}
        onSelectionChange={setImageEquipSelected}
        searchable={false}
        confirmLabel={`确认 (${imageEquipSelected.size})`}
        onConfirm={async () => {
          const mapping = imageMappings[editingImageIdx];
          const imgUrl = mapping.imageUrl;
          const oldIds = new Set(mapping.equipmentIds);
          const newIds = imageEquipSelected;

          const toAdd = Array.from(newIds).filter(id => !oldIds.has(id));
          const toRemove = Array.from(oldIds).filter(id => !newIds.has(id));

          try {
            // 为新关联的设备设置此图片 URL
            if (toAdd.length > 0) {
              await supabase.from('equipment').update({ image_url: imgUrl }).in('id', toAdd);
            }
            // 为取消关联的设备清除图片 URL
            if (toRemove.length > 0) {
              await supabase.from('equipment').update({ image_url: null }).in('id', toRemove);
            }
            
            // 如果此图片 URL 已经有设备关联了，就不再保留在临时 addedUrls 中
            if (newIds.size > 0) {
              setAddedUrls(prev => prev.filter(u => u !== imgUrl));
            }

            toast({ title: '更新成功', description: `已更新图片关联关系` });
            onEquipmentRefresh?.();
            window.dispatchEvent(new Event('equipment-updated'));
          } catch (err) {
            console.error('更新图片关联失败:', err);
            toast({ title: '更新失败', description: '请重试', variant: 'destructive' });
          }

          setShowImageEquipModal(false);
          setEditingImageIdx(-1);
        }}
      />

      {/* === 共享图片同步确认弹窗 === */}
      <Dialog open={showSyncConfirm} onOpenChange={setShowSyncConfirm}>
        <DialogContent className="sm:max-w-md bg-slate-900 border-white/20 text-white">
          <DialogHeader>
            <DialogTitle className="text-white">确认同步图片？</DialogTitle>
            <DialogDescription className="text-white/60">
              新的共享图片将写入类型模板，并可选择同步更新所有关联设备
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            {/* 新旧图片对比 */}
            {pendingSharedUrl && (
              <div className="flex items-center justify-center gap-3">
                {selectedType?.sharedImageUrl && (
                  <div className="flex flex-col items-center gap-1">
                    <div className="h-20 w-32 rounded-lg bg-cover bg-center border border-white/20"
                      style={{ backgroundImage: `url(${selectedType.sharedImageUrl})` }} />
                    <span className="text-[9px] text-white/40">当前</span>
                  </div>
                )}
                {selectedType?.sharedImageUrl && <ChevronRight className="h-5 w-5 text-white/40" />}
                <div className="flex flex-col items-center gap-1">
                  <div className="h-20 w-32 rounded-lg bg-cover bg-center border border-blue-400"
                    style={{ backgroundImage: `url(${pendingSharedUrl})` }} />
                  <span className="text-[9px] text-blue-400">新图片</span>
                </div>
              </div>
            )}
            <div className="rounded-lg bg-amber-500/10 border border-amber-500/20 p-3">
              <p className="text-xs text-amber-300">
                ⚠️ 建议同步到所有 {linkedEquipments.length} 台关联设备，以确保设备图片与类型共享图片一致
              </p>
            </div>
          </div>
          <DialogFooter className="flex gap-2">
            <Button variant="outline" className="bg-white/10 border-white/20 text-white"
              onClick={() => { setShowSyncConfirm(false); setPendingSharedUrl(null); }}>
              取消
            </Button>
            <Button onClick={handleConfirmSync} className="bg-purple-500 hover:bg-purple-600">
              确认同步 ({linkedEquipments.length} 台设备)
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* === 清理冗余图片抽屉 === */}
      <Dialog open={showCleanupDrawer} onOpenChange={setShowCleanupDrawer}>
        <DialogContent className="sm:max-w-lg max-h-[80vh] overflow-auto bg-slate-900 border-white/20 text-white">
          <DialogHeader>
            <DialogTitle className="text-white flex items-center gap-2">
              <Trash2 className="h-5 w-5" />
              冗余图片清理
            </DialogTitle>
            <DialogDescription className="text-white/60">
              以下文件完全未被任何设备或类型引用，可以安全删除
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="rounded-lg border border-white/10 overflow-hidden">
              <div className="grid grid-cols-[2fr_1fr] gap-0 text-[10px] font-semibold text-white/70 bg-white/5 p-2 border-b border-white/10">
                <span>文件名</span>
                <span className="text-right">状态</span>
              </div>
              <div className="max-h-[200px] overflow-y-auto">
                {cleanupPreview?.deleted.length === 0 ? (
                  <p className="text-center text-xs text-white/40 py-8">🎉 没有冗余文件，所有图片均被引用</p>
                ) : (
                  cleanupPreview?.deleted.map((path, i) => (
                    <div key={i} className="grid grid-cols-[2fr_1fr] gap-0 text-[10px] p-2 border-b border-white/5 last:border-0 items-center">
                      <span className="text-white truncate">{path}</span>
                      <span className="text-right text-amber-400">无引用</span>
                    </div>
                  ))
                )}
              </div>
            </div>
            {cleanupPreview && cleanupPreview.deleted.length > 0 && (
              <p className="text-xs text-white/50">
                共计 {cleanupPreview.deleted.length} 个文件
              </p>
            )}
            {cleanupPreview && cleanupPreview.errors.length > 0 && (
              <div className="rounded-lg bg-red-500/10 border border-red-500/20 p-2">
                {cleanupPreview.errors.map((err, i) => (
                  <p key={i} className="text-[10px] text-red-400">{err}</p>
                ))}
              </div>
            )}
          </div>
          <DialogFooter className="flex gap-2">
            <Button variant="outline" className="bg-white/10 border-white/20 text-white"
              onClick={() => { setShowCleanupDrawer(false); setCleanupPreview(null); }}>
              取消
            </Button>
            {cleanupPreview && cleanupPreview.deleted.length > 0 && (
              <Button onClick={handleCleanupConfirm} className="bg-red-500 hover:bg-red-600 text-white">
                确认安全释放空间 ({cleanupPreview.deleted.length} 个文件)
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* === 图片健康度自检面板（开发模式） */}
      {import.meta.env.DEV && selectedType && (
        <div className="mt-4 rounded-lg bg-white/5 border border-white/10 p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-white flex items-center gap-2">
              🔧 图片健康度自检 — {selectedType.name}
            </h3>
            <Badge variant="outline" className="text-[10px] border-white/20 text-white/60">DEV</Badge>
          </div>
          {selfCheckResults ? (
            <div className="space-y-1.5">
              {selfCheckResults.map((item: any, i: number) => (
                <div key={i} className="flex items-center justify-between p-2 rounded bg-white/5">
                  <div className="flex items-center gap-2">
                    {item.pass
                      ? <Check className="h-3.5 w-3.5 text-green-400" />
                      : <X className="h-3.5 w-3.5 text-red-400" />}
                    <div>
                      <span className="text-xs text-white">{item.name}</span>
                      <span className="text-[10px] text-white/60 ml-2">{item.detail}</span>
                    </div>
                  </div>
                  {item.fix && (
                    <Button size="sm" className="h-6 text-[10px] px-2 bg-blue-500 hover:bg-blue-600"
                      onClick={item.fix}>一键修复</Button>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <p className="text-xs text-white/40 mb-3">点击下方按钮运行图片健康度自检</p>
          )}
          <Button size="sm" variant="outline" className="mt-3 h-7 text-xs bg-white/5 border-white/20 text-white/70"
            onClick={handleSelfCheck} disabled={selfCheckRunning}>
            {selfCheckRunning ? <RefreshCw className="h-3.5 w-3.5 mr-1 animate-spin" /> : null}
            {selfCheckResults ? '🔄 重新检测' : '🔍 运行自检'}
          </Button>
        </div>
      )}
    </>
  );
};

export default EquipmentTypeManager;
