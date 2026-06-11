import React, { useState, useEffect } from 'react';
import { Plus, Calendar, Bell, Check, Trash2, Edit, Link2, Loader2, Info } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import MaintenancePlanCard from '@/components/MaintenancePlanCard';
import MaintenanceScheduleFormDialog from '@/components/shared/MaintenanceScheduleFormDialog';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useMaintenanceSchedules } from '@/hooks/useMaintenanceSchedules';
import { MaintenanceScheduleFormData } from '@/types/maintenance';
import { differenceInCalendarDays } from 'date-fns';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

interface MaintenanceSchedule {
  id: string;
  equipment_id: string;
  title: string;
  description: string | null;
  frequency: string;
  next_due_date: string;
  reminder_days_before: number;
  assigned_name: string | null;
  assigned_email: string | null;
  assigned_user_id?: string | null;
  is_active: boolean;
  reminder_sent: boolean;
}

interface MaintenanceScheduleManagerProps {
  equipmentId: string;
  equipmentName: string;
  equipmentResponsible: string;
  equipmentResponsibleEmail?: string;
  equipmentType?: string;
  onScheduleChange?: () => void;
  readOnly?: boolean;
}

const MaintenanceScheduleManager: React.FC<MaintenanceScheduleManagerProps> = ({
  equipmentId, equipmentName, equipmentResponsible, equipmentResponsibleEmail,
  equipmentType, onScheduleChange, readOnly = false
}) => {
  const { isAdmin, profile } = useAuth();
  const { fetchByEquipment, createSchedule, updateSchedule, deactivateSchedule } = useMaintenanceSchedules();
  const [schedules, setSchedules] = useState<MaintenanceSchedule[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [editingSchedule, setEditingSchedule] = useState<MaintenanceSchedule | null>(null);
  const [users, setUsers] = useState<Array<{ user_id: string; username: string; email?: string }>>([]);
  const [scheduleEquipMap, setScheduleEquipMap] = useState<Record<string, { id: string; name: string }[]>>({});

  const [showLinkModal, setShowLinkModal] = useState(false);
  const [linkingSchedule, setLinkingSchedule] = useState<MaintenanceSchedule | null>(null);
  const [eligibleEquipment, setEligibleEquipment] = useState<Array<{ id: string; name: string; responsible: string; responsible_email: string | null }>>([]);
  const [linkEquipIds, setLinkEquipIds] = useState<Set<string>>(new Set());
  const [linkEquipDate, setLinkEquipDate] = useState('');
  const [loadingEligible, setLoadingEligible] = useState(false);
  const [isLinkingSubmit, setIsLinkingSubmit] = useState(false);

  useEffect(() => { fetchSchedules(); fetchUsers(); }, [equipmentId]);

  useEffect(() => {
    if (!showLinkModal || !equipmentType) return;
    const loadTargetDevices = async () => {
      setLoadingEligible(true);
      try {
        const { data } = await supabase
          .from('equipment').select('id, name, responsible, responsible_email, status, is_scrapped')
          .eq('type', equipmentType).neq('id', equipmentId);
        const activeDevices = (data || []).filter((e: any) => e.is_scrapped !== true && e.status !== 'scrapped');
        setEligibleEquipment(activeDevices);
        setLinkEquipIds(new Set(activeDevices.map(d => d.id)));
      } catch { toast.error('无法获取同类型设备列表'); }
      finally { setLoadingEligible(false); }
    };
    loadTargetDevices();
  }, [showLinkModal, equipmentType, equipmentId]);

  const fetchSchedules = async () => {
    try { const fetched = await fetchByEquipment(equipmentId); setSchedules(fetched); fetchRelatedEquipment(fetched); }
    catch { toast.error('获取维护计划失败'); }
    finally { setLoading(false); }
  };

  const fetchRelatedEquipment = async (currentSchedules: MaintenanceSchedule[]) => {
    if (currentSchedules.length === 0) { setScheduleEquipMap({}); return; }
    try {
      const titles = [...new Set(currentSchedules.map(s => s.title))];
      const { data } = await supabase
        .from('maintenance_schedules').select('equipment_id, title')
        .in('title', titles).eq('is_active', true).neq('equipment_id', equipmentId);
      if (!data?.length) { setScheduleEquipMap({}); return; }
      const eqIds = [...new Set(data.map(d => d.equipment_id))];
      let eqQuery = supabase.from('equipment').select('id, name, type, status, is_scrapped').in('id', eqIds);
      if (equipmentType) eqQuery = eqQuery.eq('type', equipmentType);
      const { data: eqData } = await eqQuery;
      const eqNameMap: Record<string, string> = {};
      (eqData || []).filter((e: any) => e.is_scrapped !== true && e.status !== 'scrapped')
        .forEach((e: any) => { eqNameMap[e.id] = e.name || e.id; });
      const map: Record<string, { id: string; name: string }[]> = {};
      for (const s of currentSchedules) {
        map[s.id] = data.filter(d => d.title === s.title && eqNameMap[d.equipment_id])
          .map(d => ({ id: d.equipment_id, name: eqNameMap[d.equipment_id] }));
      }
      setScheduleEquipMap(map);
    } catch { setScheduleEquipMap({}); }
  };

  const fetchUsers = async () => {
    const { data } = await supabase.from('profiles').select('user_id, username, email').order('username');
    setUsers(data || []);
  };

  const resolveAssignee = (form: MaintenanceScheduleFormData) => {
    const u = users.find(x => x.user_id === form.assigned_user_id);
    return { name: u?.username || null, email: u?.email || null };
  };

  const withDesc = (f: MaintenanceScheduleFormData) => ({ ...f, description: f.description?.trim() || `${f.title} - ${equipmentName}` });

  const handleAddSchedule = async (form: MaintenanceScheduleFormData) => {
    if (!form.title || !form.next_due_date) { toast.error('请填写标题和下次维护日期'); throw new Error('validation'); }
    await createSchedule(equipmentId, withDesc(form), resolveAssignee(form), profile?.user_id);
    toast.success('维护计划已成功添加'); fetchSchedules(); onScheduleChange?.();
  };

  const handleUpdateSchedule = async (form: MaintenanceScheduleFormData) => {
    if (!editingSchedule || !form.title || !form.next_due_date) { toast.error('请填写标题和下次维护日期'); throw new Error('validation'); }
    await updateSchedule(editingSchedule.id, withDesc(form), resolveAssignee(form));
    await supabase.from('maintenance_schedules').update({ reminder_sent: false }).eq('id', editingSchedule.id);
    toast.success('维护计划已成功更新'); setEditingSchedule(null); fetchSchedules(); onScheduleChange?.();
  };

  const handleDeleteSchedule = async (id: string) => {
    if (!window.confirm('确定要彻底删除该设备当前的维护计划吗？')) return;
    await deactivateSchedule(id); toast.success('维护计划已成功移除'); fetchSchedules(); onScheduleChange?.();
  };

  const handleLinkEquipmentSubmit = async () => {
    if (!linkingSchedule || !linkEquipDate) { toast.error('请选择有效的维护截止日期'); return; }
    if (linkEquipIds.size === 0) { toast.error('请至少勾选一台需要同步关联的目标设备'); return; }
    setIsLinkingSubmit(true);
    try {
      const ids = Array.from(linkEquipIds);
      const { data: existing } = await supabase
        .from('maintenance_schedules').select('equipment_id')
        .in('equipment_id', ids).eq('title', linkingSchedule.title).eq('is_active', true);
      const skipIds = new Set((existing || []).map(s => s.equipment_id));
      const payloads = eligibleEquipment
        .filter(eq => ids.includes(eq.id) && !skipIds.has(eq.id))
        .map(eq => ({
          equipment_id: eq.id, title: linkingSchedule.title, description: linkingSchedule.description,
          frequency: linkingSchedule.frequency, next_due_date: linkEquipDate,
          reminder_days_before: linkingSchedule.reminder_days_before,
          assigned_name: eq.responsible || null, assigned_email: eq.responsible_email || null, is_active: true,
        }));
      if (payloads.length === 0) { toast.info('选中的目标设备均已存在相同的激活计划，无需重复关联'); setShowLinkModal(false); return; }
      const { error } = await supabase.from('maintenance_schedules').insert(payloads);
      if (error) throw error;
      toast.success(`成功一键同步分发至 ${payloads.length} 台目标设备`);
      setShowLinkModal(false); fetchSchedules(); onScheduleChange?.();
    } catch { toast.error('批量关联同步失败，请检查数据库权限'); }
    finally { setIsLinkingSubmit(false); }
  };

  const handleCompleteSchedule = async (schedule: MaintenanceSchedule) => {
    try {
      const d = new Date(schedule.next_due_date); const next = new Date(d);
      switch (schedule.frequency) {
        case 'daily': next.setDate(d.getDate() + 1); break;
        case 'weekly': next.setDate(d.getDate() + 7); break;
        case 'monthly': next.setMonth(d.getMonth() + 1); break;
        case 'quarterly': next.setMonth(d.getMonth() + 3); break;
        case 'yearly': next.setFullYear(d.getFullYear() + 1); break;
      }
      await supabase.from('maintenance_schedules').update({
        next_due_date: next.toISOString().split('T')[0], last_completed_at: new Date().toISOString(), reminder_sent: false,
      }).eq('id', schedule.id);
      await supabase.from('maintenance_logs').insert({
        schedule_id: schedule.id, equipment_id: equipmentId,
        completed_by: profile?.user_id, completed_by_name: profile?.username || 'Unknown',
      });
      toast.success('维护登记已完成，下期截止日已自动顺延'); fetchSchedules(); onScheduleChange?.();
    } catch { toast.error('更正维护记录失败'); }
  };

  const handleSendReminder = async (schedule: MaintenanceSchedule) => {
    try {
      const recipients = [schedule.assigned_email, equipmentResponsibleEmail, 'zhifu.feng@brightfuture.com.hk'].filter(Boolean);
      await supabase.functions.invoke('send-equipment-notification', {
        body: { status: 'maintenance-batch-reminder', reporterName: profile?.username || 'System',
          adminEmail: [...new Set(recipients)].join(','), equipmentList: [{
            scheduleId: schedule.id, equipmentId, equipmentName, equipmentType: equipmentType || '未分类',
            maintenanceTitle: schedule.title, description: schedule.description || schedule.title,
            dueDate: schedule.next_due_date, frequency: schedule.frequency,
            assignedPerson: schedule.assigned_name || equipmentResponsible || '未指定',
          }] },
      });
      await supabase.from('maintenance_schedules').update({ reminder_sent: true }).eq('id', schedule.id);
      toast.success('催办提醒邮件已成功送达'); fetchSchedules();
    } catch { toast.error('发送通知失败'); }
  };

  const toggleSelectDevice = (id: string) => {
    const next = new Set(linkEquipIds);
    next.has(id) ? next.delete(id) : next.add(id);
    setLinkEquipIds(next);
  };

  const openEditModal = (s: MaintenanceSchedule) => { setEditingSchedule(s); setShowEditModal(true); };

  return (
    <Card className="mt-4 bg-card text-card-foreground border border-border shadow-sm rounded-xl overflow-hidden">
      <CardHeader className="flex flex-row items-center justify-between py-3 px-4 bg-muted/30 border-b border-border/60">
        <CardTitle className="text-sm font-semibold flex items-center gap-2">
          <div className="p-1.5 bg-primary/10 rounded-lg text-primary"><Calendar className="h-4 w-4" /></div>
          设备维护计划管理
        </CardTitle>
        {!readOnly && (
          <Button size="sm" onClick={() => setShowAddModal(true)} className="h-8 text-xs font-medium px-3 shadow-sm">
            <Plus className="h-4 w-4 mr-1" />添加新计划
          </Button>
        )}
      </CardHeader>
      <CardContent className="p-4">
        {loading ? (
          <div className="text-center py-8 text-muted-foreground text-xs flex items-center justify-center gap-2">
            <Loader2 className="h-4 w-4 animate-spin text-primary" />正在读取精密计划方案...
          </div>
        ) : schedules.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground text-xs bg-accent/30 rounded-xl border border-dashed border-border p-4">
            当前设备尚未关联任何周期维护计划
          </div>
        ) : (
          <div className="space-y-3">
            {schedules.map((schedule) => {
              const daysUntil = differenceInCalendarDays(new Date(schedule.next_due_date), new Date());
              const relEquip = scheduleEquipMap[schedule.id] || [];
              return (
                <MaintenancePlanCard
                  key={schedule.id} title={schedule.title} description={schedule.description}
                  frequency={schedule.frequency} nextDueDate={schedule.next_due_date}
                  assignedName={schedule.assigned_name || undefined}
                  reminderDaysBefore={schedule.reminder_days_before} daysUntilDue={daysUntil}
                  reminderSent={schedule.reminder_sent}
                  equipmentIds={relEquip.length > 0 ? relEquip.map(e => e.id) : undefined}
                  actions={!readOnly ? (
                    <div className="flex items-center gap-1.5">
                      <Button variant="outline" size="icon" className="h-7 w-7 border-border hover:bg-accent text-muted-foreground" onClick={() => { setLinkingSchedule(schedule); setLinkEquipDate(new Date().toISOString().split('T')[0]); setShowLinkModal(true); }} title="同步到其他设备"><Link2 className="h-3.5 w-3.5" /></Button>
                      <Button variant="outline" size="icon" className="h-7 w-7 border-border hover:bg-accent text-muted-foreground" onClick={() => handleSendReminder(schedule)} title="催办发送提醒"><Bell className="h-3.5 w-3.5" /></Button>
                      <Button variant="outline" size="icon" className="h-7 w-7 border-green-200 bg-green-50/40 hover:bg-green-100 text-green-600 hover:text-green-700" onClick={() => handleCompleteSchedule(schedule)} title="登记本次完成"><Check className="h-3.5 w-3.5" /></Button>
                      <Button variant="outline" size="icon" className="h-7 w-7 border-border hover:bg-accent text-muted-foreground" onClick={() => openEditModal(schedule)} title="编辑配置"><Edit className="h-3.5 w-3.5" /></Button>
                      {isAdmin() && <Button variant="destructive" size="icon" className="h-7 w-7" onClick={() => handleDeleteSchedule(schedule.id)} title="彻底删除"><Trash2 className="h-3.5 w-3.5" /></Button>}
                    </div>
                  ) : undefined}
                />
              );
            })}
          </div>
        )}
      </CardContent>

      <MaintenanceScheduleFormDialog open={showAddModal} onOpenChange={setShowAddModal} title="新建维护业务方案" users={users} onSubmit={handleAddSchedule} submitLabel="添加" />
      <MaintenanceScheduleFormDialog open={showEditModal} onOpenChange={(open) => { setShowEditModal(open); if (!open) setEditingSchedule(null); }} title="修改周期计划配置" users={users}
        initialData={editingSchedule ? { title: editingSchedule.title, description: editingSchedule.description || '', frequency: editingSchedule.frequency, next_due_date: editingSchedule.next_due_date, reminder_days_before: editingSchedule.reminder_days_before, assigned_user_id: editingSchedule.assigned_user_id || '' } : undefined}
        onSubmit={handleUpdateSchedule} submitLabel="应用保存" />

      <Dialog open={showLinkModal} onOpenChange={(open) => { if (!open) setShowLinkModal(false); }}>
        <DialogContent className="sm:max-w-[460px] p-5 gap-4">
          <DialogHeader>
            <DialogTitle className="text-base font-semibold flex items-center gap-1.5">
              <Link2 className="h-4 w-4 text-primary" /> 一键分发同步计划
            </DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground pt-1">
              正在将当前计划【{linkingSchedule?.title}】批量生成并指派至同类别的其他关联仪器。
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-1">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="link-date" className="text-xs font-medium text-foreground">新设备首次维护截止日期</Label>
              <Input id="link-date" type="date" value={linkEquipDate} onChange={(e) => setLinkEquipDate(e.target.value)} className="h-9 mt-1" />
            </div>
            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <Label className="text-xs font-medium text-muted-foreground">选择接收目标设备列表 ({equipmentType || '未分类'})</Label>
                {eligibleEquipment.length > 0 && (
                  <button type="button" className="text-[11px] text-primary hover:underline font-medium"
                    onClick={() => setLinkEquipIds(linkEquipIds.size === eligibleEquipment.length ? new Set() : new Set(eligibleEquipment.map(d => d.id)))}>
                    {linkEquipIds.size === eligibleEquipment.length ? '取消全选' : '全选所有'}
                  </button>
                )}
              </div>
              {loadingEligible ? (
                <div className="h-[160px] border rounded-lg bg-accent/20 flex items-center justify-center text-xs text-muted-foreground">
                  <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" /> 正在搜寻可用仪器设备...
                </div>
              ) : eligibleEquipment.length === 0 ? (
                <div className="h-[160px] border border-dashed rounded-lg bg-accent/5 flex flex-col items-center justify-center text-center p-4">
                  <Info className="h-4 w-4 text-muted-foreground mb-1" />
                  <span className="text-xs text-muted-foreground">系统未检索到其他同类型的活跃设备</span>
                </div>
              ) : (
                <div className="border rounded-lg bg-background overflow-hidden">
                  <ScrollArea className="h-[160px] p-1.5">
                    <div className="space-y-1">
                      {eligibleEquipment.map((eq) => (
                        <div key={eq.id} className={cn(
                          "flex items-center space-x-2.5 p-2 rounded-md hover:bg-accent/60 transition-colors cursor-pointer border border-transparent",
                          linkEquipIds.has(eq.id) && "bg-accent/40"
                        )} onClick={() => toggleSelectDevice(eq.id)}>
                          <Checkbox id={`eq-${eq.id}`} checked={linkEquipIds.has(eq.id)} onCheckedChange={() => toggleSelectDevice(eq.id)} onClick={(e) => e.stopPropagation()} />
                          <div className="flex-1 min-w-0 flex flex-col">
                            <label htmlFor={`eq-${eq.id}`} className="text-xs font-medium text-foreground cursor-pointer truncate">{eq.name || eq.id}</label>
                            <span className="text-[10px] text-muted-foreground truncate">ID: {eq.id} | 负责人: {eq.responsible || '未分配'}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </ScrollArea>
                </div>
              )}
            </div>
          </div>
          <DialogFooter className="mt-2">
            <Button variant="outline" size="sm" onClick={() => setShowLinkModal(false)} disabled={isLinkingSubmit}>取消</Button>
            <Button size="sm" onClick={handleLinkEquipmentSubmit} disabled={isLinkingSubmit || loadingEligible}>
              {isLinkingSubmit && <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" />}确认同步分发
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
};

export default MaintenanceScheduleManager;
