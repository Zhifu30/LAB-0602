import React, { useState, useMemo, useEffect } from 'react';
import { User, Plus, Trash2, ChevronDown, ChevronUp, Image as ImageIcon, Link2, Check, X, Wrench } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { Equipment } from '@/types/equipment';

interface UserProfile {
  id: string;
  user_id: string;
  username: string;
  email: string | null;
  role?: string | null;
  role_type?: string | null;
}

interface MaintenanceResponsible {
  id: string;
  equipment_id: string;
  user_id: string;
  maintenance_level: 1 | 2 | 3;
  user?: UserProfile;
}

// 待分配责任人（尚未关联设备，仅保存在本地）
interface PendingResponsible {
  user_id: string;
  username: string;
  maintenance_level: 1 | 2 | 3;
}

interface ImageMapping { imageUrl: string; equipmentIds: string[]; }

interface PlanGroupInfo { title: string; description: string | null; frequency: string; equipmentIds: string[]; }

interface HierarchicalResponsibleProps {
  linkedEquipments: Equipment[];
  users: UserProfile[];
  equipmentType: string;
  onRefresh?: () => void;
  // 双向关联：图片 ↔ 责任人 ↔ 维护计划
  imageMappings?: ImageMapping[];
  planGroups?: PlanGroupInfo[];
  onEquipmentImageChange?: (equipmentId: string, imageUrl: string | null) => void;
  onEquipmentPlanLink?: (equipmentId: string) => void;
}

const levelLabels: Record<1 | 2 | 3, string> = {
  3: '三级（实际维护者）',
  2: '二级（监督者）',
  1: '一级（管理者）',
};

const levelColors: Record<1 | 2 | 3, string> = {
  3: 'bg-blue-500',
  2: 'bg-purple-500',
  1: 'bg-orange-500',
};

export const HierarchicalResponsibleColumn: React.FC<HierarchicalResponsibleProps> = ({
  linkedEquipments,
  users,
  equipmentType,
  onRefresh,
  imageMappings = [],
  planGroups = [],
  onEquipmentImageChange,
  onEquipmentPlanLink,
}) => {
  const [responsibles, setResponsibles] = useState<MaintenanceResponsible[]>([]);
  const [expandedLevels, setExpandedLevels] = useState<Set<number>>(new Set([3]));
  const [loading, setLoading] = useState(false);
  const [batchUser, setBatchUser] = useState<string>('');
  const [batchSaving, setBatchSaving] = useState(false);
  const [dbError, setDbError] = useState(false); // 数据库表不存在等错误
  const { toast } = useToast();

  // 设备选择器状态
  const [equipPickerOpen, setEquipPickerOpen] = useState(false);
  const [equipPickerUser, setEquipPickerUser] = useState<{ username: string; user_id: string; level: 1 | 2 | 3 } | null>(null);
  const [equipPickerSelected, setEquipPickerSelected] = useState<Set<string>>(new Set());

  // 待分配责任人（本地状态，尚未在数据库创建设备关联记录）
  const [pendingResponsibles, setPendingResponsibles] = useState<PendingResponsible[]>([]);

  // 从数据库加载分层负责人
  useEffect(() => {
    const loadResponsibles = async () => {
      try {
        setLoading(true);
        const equipmentIds = linkedEquipments.map(eq => eq.id);
        if (equipmentIds.length === 0) {
          setResponsibles([]);
          return;
        }

        const { data, error } = await supabase
          .from('equipment_maintenance_responsible')
          .select('*')
          .in('equipment_id', equipmentIds);

        if (error) {
          console.error('加载分层负责人失败:', error);
          // 406/401 通常意味着表不存在或迁移未执行
          if (error.code === 'PGRST116' || error.code === '406' || error.code === '401') {
            setDbError(true);
          }
          return;
        }

        setDbError(false);
        setResponsibles(data || []);
      } catch (err) {
        console.error('加载分层负责人异常:', err);
      } finally {
        setLoading(false);
      }
    };

    loadResponsibles();
  }, [linkedEquipments]);

  // 获取某人在某等级下已关联的设备ID集合
  const getPersonEquipmentIds = (userId: string, level: number): Set<string> => {
    return new Set(
      responsibles
        .filter(r => r.user_id === userId && r.maintenance_level === level)
        .map(r => r.equipment_id)
    );
  };

  // 按等级分组 — 使用 username 作为 Map key（修复 UUID 显示问题）
  const groupedByLevel = useMemo(() => {
    const groups: Record<number, Map<string, { user: UserProfile; equipment: (Equipment | null)[]; responsibleIds: string[] }>> = {
      1: new Map(),
      2: new Map(),
      3: new Map(),
    };

    const level3Assigned = new Set(
      responsibles
        .filter((resp) => resp.maintenance_level === 3)
        .map((resp) => resp.equipment_id)
    );

    // 旧字段兼容：equipment.responsible 未在 maintenance_responsible 表中时自动回退为三级
    const fallbackResponsibles = linkedEquipments
      .filter((eq) => eq.responsible && !level3Assigned.has(eq.id))
      .map((eq) => {
        const matchedUser = users.find((u) => u.username === eq.responsible);
        const fallbackUser = matchedUser ?? {
          id: `legacy-${eq.id}`,
          user_id: `legacy:${eq.responsible}`,
          username: eq.responsible,
          email: eq.responsible_email || null,
          role: null,
          role_type: null,
        };
        return {
          id: `legacy-${eq.id}`,
          equipment_id: eq.id,
          user_id: fallbackUser.user_id,
          maintenance_level: 3 as const,
          user: fallbackUser,
        } as MaintenanceResponsible;
      });

    const allResponsibles = [...responsibles, ...fallbackResponsibles];

    // 建立 user_id → username 的快速查找
    const userIdToUsername = new Map<string, string>();
    users.forEach(u => userIdToUsername.set(u.user_id, u.username));

    // 处理数据库记录
    allResponsibles.forEach(resp => {
      const user = users.find(u => u.user_id === resp.user_id) || (resp as any).user || null;
      const equipment = linkedEquipments.find(eq => eq.id === resp.equipment_id) || null;

      if (!user) return; // 找不到用户信息则跳过

      const level = resp.maintenance_level as 1 | 2 | 3;
      const key = user.username; // 使用 username 而非 user_id (UUID)

      if (!groups[level].has(key)) {
        groups[level].set(key, { user, equipment: [], responsibleIds: [] });
      }

      const entry = groups[level].get(key)!;
      if (equipment) {
        entry.equipment.push(equipment);
      }
      entry.responsibleIds.push(resp.id);
    });

    // 处理待分配责任人（本地状态，0台设备）
    pendingResponsibles.forEach(pending => {
      const user = users.find(u => u.user_id === pending.user_id);
      if (!user) return;

      const level = pending.maintenance_level;
      const key = user.username;

      if (!groups[level].has(key)) {
        groups[level].set(key, { user, equipment: [], responsibleIds: [] });
      }
      // 待分配人员不添加设备，保持 equipment 列表不变（可能为空）
    });

    return groups;
  }, [responsibles, linkedEquipments, users, pendingResponsibles]);

  // 打开设备选择器
  const openEquipPicker = (username: string, userId: string, level: 1 | 2 | 3) => {
    setEquipPickerUser({ username, user_id: userId, level });
    setEquipPickerSelected(getPersonEquipmentIds(userId, level));
    setEquipPickerOpen(true);
  };

  // 保存设备选择
  const handleSaveEquipPicker = async () => {
    if (!equipPickerUser) return;

    const { user_id, level } = equipPickerUser;
    const currentIds = getPersonEquipmentIds(user_id, level);
    const toAdd = Array.from(equipPickerSelected).filter(id => !currentIds.has(id));
    const toRemove = Array.from(currentIds).filter(id => !equipPickerSelected.has(id));

    try {
      // 新增关联
      if (toAdd.length > 0) {
        const rows = toAdd.map(equipmentId => ({
          equipment_id: equipmentId,
          user_id: user_id,
          maintenance_level: level,
        }));
        const { error } = await supabase.from('equipment_maintenance_responsible').insert(rows);
        if (error) throw error;
      }

      // 移除关联
      if (toRemove.length > 0) {
        const idsToDelete = responsibles
          .filter(r => r.user_id === user_id && r.maintenance_level === level && toRemove.includes(r.equipment_id))
          .map(r => r.id);
        if (idsToDelete.length > 0) {
          const { error } = await supabase.from('equipment_maintenance_responsible').delete().in('id', idsToDelete);
          if (error) throw error;
        }
      }

      // 从待分配列表中移除（如果之前是 pending 的）
      setPendingResponsibles(prev => prev.filter(p => !(p.user_id === user_id && p.maintenance_level === level)));

      // 刷新
      const equipmentIds = linkedEquipments.map(eq => eq.id);
      if (equipmentIds.length > 0) {
        const { data } = await supabase
          .from('equipment_maintenance_responsible')
          .select('*')
          .in('equipment_id', equipmentIds);
        setResponsibles(data || []);
      } else {
        setResponsibles([]);
      }

      const added = toAdd.length;
      const removed = toRemove.length;
      const msgs: string[] = [];
      if (added > 0) msgs.push(`关联 ${added} 台`);
      if (removed > 0) msgs.push(`解除 ${removed} 台`);
      toast({ title: '已更新', description: msgs.join('，') || '无变更' });

      onRefresh?.();
    } catch (err: any) {
      console.error('更新设备关联失败:', err);
      const hint = (err?.code === '401' || err?.code === 'PGRST116')
        ? '数据库表可能未创建，请在 Supabase SQL 编辑器中执行迁移脚本'
        : (err.message || '请重试');
      toast({ title: '更新失败', description: hint, variant: 'destructive' });
    }

    setEquipPickerOpen(false);
    setEquipPickerUser(null);
    setEquipPickerSelected(new Set());
  };

  // 仅添加负责人到待分配列表（不创建设备关联）
  const handleAddPersonOnly = (username: string, level: 1 | 2 | 3) => {
    const user = users.find(u => u.username === username);
    if (!user) {
      toast({ title: '错误', description: '用户不存在' });
      return;
    }

    // 检查是否已在数据库中存在
    const alreadyInDb = responsibles.some(r => r.user_id === user.user_id && r.maintenance_level === level);
    // 检查是否已在待分配列表中
    const alreadyPending = pendingResponsibles.some(
      p => p.user_id === user.user_id && p.maintenance_level === level
    );

    if (alreadyInDb || alreadyPending) {
      toast({ title: '提示', description: '该负责人已添加至此等级' });
      return;
    }

    setPendingResponsibles(prev => [...prev, {
      user_id: user.user_id,
      username: user.username,
      maintenance_level: level,
    }]);
    setBatchUser('');
    toast({ title: '已添加', description: `${username} 已添加至待分配列表，请使用设备选择器关联设备` });
  };

  // 批量添加负责人（为所有设备创建关联）
  const handleBatchAddResponsible = async (username: string, level: 1 | 2 | 3) => {
    const user = users.find(u => u.username === username);
    if (!user) {
      toast({ title: '错误', description: '用户不存在' });
      return;
    }

    const equipmentIds = linkedEquipments.map(eq => eq.id);
    if (equipmentIds.length === 0) {
      // 没有设备时自动降级为仅添加人员
      handleAddPersonOnly(username, level);
      return;
    }

    setBatchSaving(true);
    try {
      const newRows = equipmentIds
        .filter((equipmentId) => !responsibles.some(
          r => r.equipment_id === equipmentId && r.user_id === user.user_id && r.maintenance_level === level
        ))
        .map((equipmentId) => ({ equipment_id: equipmentId, user_id: user.user_id, maintenance_level: level }));

      if (newRows.length === 0) {
        toast({ title: '提示', description: '所有设备已经分配了该负责人' });
        return;
      }

      const { error, data } = await supabase
        .from('equipment_maintenance_responsible')
        .insert(newRows);

      if (error) {
        toast({ title: '批量分配失败', description: error.message, variant: 'destructive' });
        return;
      }

      if (data) {
        setResponsibles((prev) => [...prev, ...(data as MaintenanceResponsible[])]);
      }

      // 从待分配列表中移除
      setPendingResponsibles(prev => prev.filter(p => !(p.user_id === user.user_id && p.maintenance_level === level)));

      toast({ title: '批量分配成功', description: `已为 ${newRows.length} 台设备添加 ${levelLabels[level]} 负责人` });
      setBatchUser('');
    } catch (err: any) {
      toast({ title: '错误', description: err.message });
    } finally {
      setBatchSaving(false);
    }
  };

  // 删除单个负责人关联
  const handleRemoveResponsible = async (responsibleId: string) => {
    try {
      const { error } = await supabase
        .from('equipment_maintenance_responsible')
        .delete()
        .eq('id', responsibleId);

      if (error) {
        toast({ title: '删除失败', description: error.message });
        return;
      }

      setResponsibles((prev) => prev.filter((item) => item.id !== responsibleId));
      toast({ title: '删除成功' });
      onRefresh?.();
    } catch (err: any) {
      toast({ title: '错误', description: err.message });
    }
  };

  // 删除整个待分配人员
  const handleRemovePendingPerson = (username: string, level: 1 | 2 | 3) => {
    setPendingResponsibles(prev =>
      prev.filter(p => !(p.username === username && p.maintenance_level === level))
    );
    toast({ title: '已移除', description: `${username} 已从待分配列表移除` });
  };

  return (
    <div className="flex flex-col overflow-hidden rounded-lg bg-white/10 backdrop-blur-sm border border-white/20 min-w-0">
      <div className="p-3 border-b border-white/20 bg-white/5 shrink-0">
        <h3 className="font-semibold text-sm text-white drop-shadow flex items-center gap-1.5">
          <User className="h-4 w-4" />
          维护负责人等级
        </h3>
        <p className="text-xs text-white/60">{equipmentType} · {linkedEquipments.length}台设备</p>
      </div>

      {/* 数据库未就绪提示 — 禁用所有操作 */}
      {dbError && (
        <div className="mx-3 mt-2 p-3 rounded-lg bg-amber-500/20 border border-amber-500/40 text-amber-200 text-[10px] leading-relaxed">
          <p className="font-semibold mb-1 text-xs">⚠️ 数据库表未创建 — 维护负责人功能暂不可用</p>
          <p className="mb-2">需要在 Supabase SQL 编辑器中执行以下 SQL：</p>
          <code className="block p-1.5 bg-black/30 rounded text-[9px] text-amber-100 break-all whitespace-pre-wrap">
            {`CREATE TABLE IF NOT EXISTS public.equipment_maintenance_responsible (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  equipment_id text NOT NULL REFERENCES public.equipment(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  maintenance_level integer NOT NULL CHECK (maintenance_level IN (1, 2, 3)),
  created_at timestamp with time zone DEFAULT now(),
  UNIQUE(equipment_id, user_id, maintenance_level)
);`}
          </code>
        </div>
      )}

      {/* 数据库未就绪时禁用交互 */}
      {dbError && (
        <div className="flex-1 flex items-center justify-center p-4 text-white/40">
          <p className="text-xs text-center">执行迁移后刷新页面即可使用</p>
        </div>
      )}

      {!dbError && (
      <ScrollArea className="flex-1 p-3">
        <div className="space-y-4">
          {linkedEquipments.length === 0 && pendingResponsibles.length === 0 ? (
            <div className="text-center py-12 text-white/20">
              <User className="h-10 w-10 mx-auto mb-2 opacity-20" />
              <p className="text-[10px]">暂无关联设备</p>
            </div>
          ) : (
            <>
              {/* 三个等级：3级、2级、1级 */}
              {([3, 2, 1] as const).map((level) => {
                const isExpanded = expandedLevels.has(level);
                const levelData = groupedByLevel[level];
                const hasAssignments = levelData.size > 0;

                return (
                  <div key={level} className="rounded-lg bg-white/5 border border-white/10 overflow-hidden">
                    {/* 等级标题 */}
                    <Collapsible
                      open={isExpanded}
                      onOpenChange={(open) => {
                        setExpandedLevels((prev) => {
                          const next = new Set(prev);
                          if (open) next.add(level);
                          else next.delete(level);
                          return next;
                        });
                      }}
                    >
                      <CollapsibleTrigger asChild>
                        <div className="flex items-center justify-between p-3 cursor-pointer hover:bg-white/10 transition-colors">
                          <div className="flex items-center gap-2">
                            <div className={`h-6 w-6 rounded-full flex items-center justify-center shrink-0 ${levelColors[level]}`}>
                              <User className="h-3 w-3 text-white" />
                            </div>
                            <div>
                              <p className="text-xs font-semibold text-white">{levelLabels[level]}</p>
                              <p className="text-[10px] text-white/40">{levelData.size}个负责人</p>
                            </div>
                          </div>
                          {isExpanded ? (
                            <ChevronUp className="h-4 w-4 text-white/40" />
                          ) : (
                            <ChevronDown className="h-4 w-4 text-white/40" />
                          )}
                        </div>
                      </CollapsibleTrigger>

                      <CollapsibleContent className="border-t border-white/10 p-2">
                        {hasAssignments ? (
                          <div className="space-y-2">
                            {Array.from(levelData.entries()).map(([displayName, entry]) => {
                              const user = entry.user;
                              const equipmentList = entry.equipment.filter(Boolean) as Equipment[];
                              const isPending = pendingResponsibles.some(
                                p => p.user_id === user.user_id && p.maintenance_level === level
                              );
                              const hasOnlyPending = equipmentList.length === 0;

                              return (
                                <div key={`${displayName}-${level}`} className={`rounded p-2 space-y-1 ${isPending ? 'bg-amber-500/10 border border-amber-500/30' : 'bg-white/5'}`}>
                                  {/* 人员头部：名字 + 设备数 + 操作按钮 */}
                                  <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-1.5 min-w-0">
                                      <p className="text-xs font-medium text-white truncate">{displayName}</p>
                                      {isPending && (
                                        <Badge className="text-[8px] h-4 bg-amber-500/30 text-amber-300 border-amber-500/30">待分配</Badge>
                                      )}
                                    </div>
                                    <div className="flex items-center gap-1 shrink-0">
                                      <Badge className="text-[8px] h-4 bg-white/10 text-white/70">{equipmentList.length}台</Badge>
                                      {/* 设备选择器按钮 */}
                                      <Button
                                        size="sm"
                                        className="h-5 w-5 p-0 bg-teal-500/60 hover:bg-teal-500 text-white border-0"
                                        title="管理负责设备"
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          openEquipPicker(displayName, user.user_id, level);
                                        }}
                                      >
                                        <Wrench className="h-2.5 w-2.5" />
                                      </Button>
                                    </div>
                                  </div>

                                  {/* 设备列表 */}
                                  {hasOnlyPending ? (
                                    <p className="text-[10px] text-white/30 italic py-1">暂无关联设备，点击 <Wrench className="h-2.5 w-2.5 inline text-teal-400" /> 选择设备</p>
                                  ) : (
                                    <div className="space-y-0.5">
                                      {equipmentList.map((eq) => (
                                        <div
                                          key={`${eq.id}-${level}-${user.user_id}`}
                                          className="flex items-center justify-between p-1 rounded bg-white/5 text-xs group"
                                        >
                                          <span className="text-white/80 truncate flex-1 min-w-0">{eq.name}</span>
                                          <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                                            {/* 图片关联按钮 */}
                                            <Popover>
                                              <PopoverTrigger asChild>
                                                <Button
                                                  size="sm"
                                                  className={`h-5 w-5 p-0 border-0 shrink-0 ${eq.imageUrl ? 'bg-green-500 hover:bg-green-600' : 'bg-white/10 hover:bg-white/20'}`}
                                                  onClick={(e) => e.stopPropagation()}
                                                  title={eq.imageUrl ? '更换图片' : '关联图片'}
                                                >
                                                  <ImageIcon className="h-2.5 w-2.5 text-white" />
                                                </Button>
                                              </PopoverTrigger>
                                              <PopoverContent
                                                className="!w-48 p-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-600 text-foreground shadow-lg z-50 rounded-xl"
                                                align="end"
                                                side="left"
                                                sideOffset={8}
                                                onClick={(e) => e.stopPropagation()}
                                              >
                                                <div className="text-xs text-muted-foreground mb-1.5 px-1 font-medium">选择共享图片</div>
                                                <div className="max-h-48 overflow-y-auto space-y-1.5">
                                                  {imageMappings.length === 0 && (
                                                    <p className="text-xs text-muted-foreground text-center py-3">暂无共享图片</p>
                                                  )}
                                                  {imageMappings.map((mapping, mi) => (
                                                    <button
                                                      key={mi}
                                                      className={`w-full flex items-center gap-2 p-1.5 rounded-md text-xs transition-colors ${mapping.imageUrl === eq.imageUrl ? 'bg-green-100 dark:bg-green-500/30 border border-green-400 ring-1 ring-green-400/30' : 'hover:bg-muted border border-transparent'}`}
                                                      onClick={async () => {
                                                        const newUrl = mapping.imageUrl === eq.imageUrl ? null : mapping.imageUrl;
                                                        if (onEquipmentImageChange) {
                                                          onEquipmentImageChange(eq.id, newUrl);
                                                        } else {
                                                          await supabase.from('equipment').update({ image_url: newUrl }).eq('id', eq.id);
                                                          onRefresh?.();
                                                        }
                                                      }}
                                                    >
                                                      <div className="h-10 w-10 rounded-md bg-cover bg-center shrink-0 border" style={{ backgroundImage: `url(${mapping.imageUrl})` }} />
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
                                                        if (onEquipmentImageChange) {
                                                          onEquipmentImageChange(eq.id, null);
                                                        } else {
                                                          await supabase.from('equipment').update({ image_url: null }).eq('id', eq.id);
                                                          onRefresh?.();
                                                        }
                                                      }}
                                                    >
                                                      <X className="h-3.5 w-3.5" /> 取消关联
                                                    </button>
                                                  )}
                                                </div>
                                              </PopoverContent>
                                            </Popover>

                                            {/* 维护计划关联按钮 */}
                                            <Button
                                              size="sm"
                                              className="h-5 w-5 p-0 bg-blue-500 hover:bg-blue-600 text-white border-0 shrink-0"
                                              onClick={(e) => {
                                                e.stopPropagation();
                                                onEquipmentPlanLink?.(eq.id);
                                              }}
                                              title="关联维护计划"
                                            >
                                              <Link2 className="h-2.5 w-2.5" />
                                            </Button>

                                            {/* 删除负责人按钮 */}
                                            <Button
                                              size="sm"
                                              className="h-5 w-5 p-0 bg-red-500/30 hover:bg-red-500/60 border-0 shrink-0"
                                              onClick={() => {
                                                const resp = responsibles.find(
                                                  r => r.equipment_id === eq.id && r.user_id === user.user_id && r.maintenance_level === level
                                                );
                                                if (resp) handleRemoveResponsible(resp.id);
                                              }}
                                              title="移除此设备的负责人"
                                            >
                                              <Trash2 className="h-2.5 w-2.5" />
                                            </Button>
                                          </div>
                                        </div>
                                      ))}
                                    </div>
                                  )}

                                  {/* 待分配人员：显示移除按钮 */}
                                  {isPending && hasOnlyPending && (
                                    <div className="pt-1 border-t border-white/10">
                                      <Button
                                        size="sm"
                                        variant="ghost"
                                        className="h-6 text-[10px] text-red-400 hover:text-red-300 hover:bg-red-500/10 w-full"
                                        onClick={() => handleRemovePendingPerson(displayName, level)}
                                      >
                                        <Trash2 className="h-2.5 w-2.5 mr-1" />
                                        移除此负责人
                                      </Button>
                                    </div>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        ) : (
                          <p className="text-xs text-white/40 text-center py-2">暂无分配</p>
                        )}

                        {/* 添加负责人区域 */}
                        <div className="pt-2 border-t border-white/10 mt-2">
                          <div className="space-y-2">
                            <Select
                              value={batchUser}
                              onValueChange={(username) => setBatchUser(username)}
                            >
                              <SelectTrigger className="h-7 text-xs bg-white/10 border-white/20 text-white">
                                <SelectValue placeholder={`选择 ${levelLabels[level]} 负责人`} />
                              </SelectTrigger>
                              <SelectContent>
                                {users.map((u) => (
                                  <SelectItem key={u.user_id} value={u.username}>
                                    {u.username}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            <div className="flex gap-1.5">
                              <Button
                                size="sm"
                                className="flex-1 h-7 text-xs bg-blue-500/30 hover:bg-blue-500/50 text-white border-0"
                                disabled={!batchUser || batchSaving}
                                onClick={() => handleBatchAddResponsible(batchUser, level)}
                              >
                                <Plus className="h-3 w-3 mr-1" />
                                批量添加
                              </Button>
                              <Button
                                size="sm"
                                className="h-7 text-xs bg-teal-500/40 hover:bg-teal-500/60 text-white border-0 shrink-0"
                                disabled={!batchUser || batchSaving}
                                onClick={() => handleAddPersonOnly(batchUser, level)}
                                title="仅添加到列表，稍后选择设备"
                              >
                                <User className="h-3 w-3" />
                              </Button>
                            </div>
                          </div>
                        </div>
                      </CollapsibleContent>
                    </Collapsible>
                  </div>
                );
              })}
            </>
          )}
        </div>
      </ScrollArea>
      )}

      {/* 设备选择器弹窗 */}
      {equipPickerOpen && equipPickerUser && (
        <div className="fixed inset-0 z-[300] flex items-center justify-center bg-black/60" onClick={() => { setEquipPickerOpen(false); setEquipPickerUser(null); setEquipPickerSelected(new Set()); }}>
          <div className="bg-slate-900 border border-white/20 rounded-xl p-4 w-[380px] max-h-[70vh] flex flex-col shadow-2xl backdrop-blur-xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-3">
              <div>
                <h3 className="text-sm font-semibold text-white">选择负责设备</h3>
                <p className="text-xs text-white/60">{equipPickerUser.username} · {levelLabels[equipPickerUser.level]}</p>
              </div>
              <Button
                size="sm"
                variant="ghost"
                className="h-7 w-7 p-0 text-white/60 hover:text-white"
                onClick={() => { setEquipPickerOpen(false); setEquipPickerUser(null); setEquipPickerSelected(new Set()); }}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>

            <ScrollArea className="flex-1 max-h-[50vh]">
              <div className="space-y-1 pr-2">
                {linkedEquipments.length === 0 ? (
                  <p className="text-xs text-white/40 text-center py-6">当前类型暂无关联设备</p>
                ) : (
                  linkedEquipments.map(eq => {
                    const checked = equipPickerSelected.has(eq.id);
                    return (
                      <div
                        key={eq.id}
                        className={`flex items-center gap-2 p-2 rounded-md cursor-pointer transition-colors ${checked ? 'bg-teal-500/20 border border-teal-500/30' : 'hover:bg-white/10 border border-transparent'}`}
                        onClick={() => {
                          const next = new Set(equipPickerSelected);
                          if (checked) next.delete(eq.id);
                          else next.add(eq.id);
                          setEquipPickerSelected(next);
                        }}
                      >
                        <Checkbox
                          checked={checked}
                          onCheckedChange={() => {
                            const next = new Set(equipPickerSelected);
                            if (checked) next.delete(eq.id);
                            else next.add(eq.id);
                            setEquipPickerSelected(next);
                          }}
                          onClick={(e) => e.stopPropagation()}
                        />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm text-white truncate">{eq.name}</p>
                          <p className="text-[10px] text-white/50">{eq.id}</p>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </ScrollArea>

            <div className="flex gap-2 pt-3 mt-2 border-t border-white/10">
              <Button
                variant="outline"
                size="sm"
                className="flex-1 bg-white/10 border-white/20 text-white hover:bg-white/20"
                onClick={() => { setEquipPickerOpen(false); setEquipPickerUser(null); setEquipPickerSelected(new Set()); }}
              >
                取消
              </Button>
              <Button
                size="sm"
                className="flex-1 bg-teal-500 hover:bg-teal-600 text-white"
                onClick={handleSaveEquipPicker}
              >
                确认 ({equipPickerSelected.size})
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default HierarchicalResponsibleColumn;
