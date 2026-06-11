import React, { useState, useEffect, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Calendar, Clock, User, Wrench, AlertTriangle, CheckCircle, RefreshCw, Mail, ChevronDown, ChevronUp, Users, Tags, Plus, Search, X } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { differenceInDays, isPast, isToday } from 'date-fns';
import { toast } from 'sonner';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import AddEquipmentToGroupModal from './AddEquipmentToGroupModal';
import MaintenanceScheduleCard from './MaintenanceScheduleCard';
import EquipmentDetailModal from './EquipmentDetailModal';
import { Equipment } from '@/types/equipment';
import { cn } from '@/lib/utils';
import { useProfiles } from '@/hooks/useProfiles';

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
  is_active: boolean;
  reminder_sent: boolean;
  equipment?: {
    id: string;
    name: string;
    responsible: string;
    responsible_email: string | null;
    type: string | null;
  };
}

interface GroupedSchedules {
  responsibleName: string;
  responsibleEmail: string | null;
  schedules: MaintenanceSchedule[];
}

interface TypeGroupedSchedules {
  typeName: string;
  schedules: MaintenanceSchedule[];
}

const frequencyLabels: Record<string, string> = {
  daily: '每日',
  weekly: '每周',
  monthly: '每月',
  quarterly: '每季度',
  yearly: '每年',
};

export default function MaintenanceDashboard() {
  const [schedules, setSchedules] = useState<MaintenanceSchedule[]>([]);
  const [loading, setLoading] = useState(true);
  const [testingReminder, setTestingReminder] = useState(false);
  const [sendingGroupEmail, setSendingGroupEmail] = useState<string | null>(null);
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  const { getEmailMap } = useProfiles();
  const profileEmails = getEmailMap();
  const [groupByTab, setGroupByTab] = useState<'responsible' | 'type'>('responsible');
  const [addModalOpen, setAddModalOpen] = useState(false);
  const [addModalGroupType, setAddModalGroupType] = useState<'responsible' | 'type'>('responsible');
  const [addModalGroupName, setAddModalGroupName] = useState('');
  const [addModalGroupEmail, setAddModalGroupEmail] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedEquipment, setSelectedEquipment] = useState<Equipment | null>(null);
  const [showEquipmentModal, setShowEquipmentModal] = useState(false);

  const handleCardClick = async (equipmentId: string) => {
    try {
      const { data, error } = await supabase
        .from('equipment')
        .select('*')
        .eq('id', equipmentId)
        .single();

      if (error) throw error;

      if (data) {
        const equipment: Equipment = {
          id: data.id,
          name: data.name,
          type: data.type,
          model: data.model,
          manufacturer: data.manufacturer,
          status: data.status as Equipment['status'],
          location: data.location,
          maintenanceDate: data.maintenance_date,
          description: data.notes || '',
          nextCalibrationDate: data.next_calibration_date,
          responsible: data.responsible,
          notes: data.notes,
          imageUrl: data.image_url,
          sopFileUrl: data.sop_file_url,
          responsible_email: data.responsible_email,
        };
        setSelectedEquipment(equipment);
        setShowEquipmentModal(true);
      }
    } catch (error) {
      console.error('Error fetching equipment:', error);
      toast.error('获取设备信息失败');
    }
  };

  const handleUpdateEquipment = async (updatedEquipment: Equipment) => {
    try {
      const { error } = await supabase
        .from('equipment')
        .update({
          name: updatedEquipment.name,
          type: updatedEquipment.type,
          model: updatedEquipment.model,
          manufacturer: updatedEquipment.manufacturer,
          status: updatedEquipment.status,
          location: updatedEquipment.location,
          maintenance_date: updatedEquipment.maintenanceDate,
          next_calibration_date: updatedEquipment.nextCalibrationDate,
          responsible: updatedEquipment.responsible,
          notes: updatedEquipment.notes,
          image_url: updatedEquipment.imageUrl,
          sop_file_url: updatedEquipment.sopFileUrl,
          responsible_email: updatedEquipment.responsible_email,
        })
        .eq('id', updatedEquipment.id);

      if (error) throw error;

      toast.success('设备信息已更新');
      setSelectedEquipment(updatedEquipment);
      fetchSchedules();
    } catch (error) {
      console.error('Error updating equipment:', error);
      toast.error('更新设备信息失败');
    }
  };

  const handleDeleteEquipment = async (id: string) => {
    try {
      const { error } = await supabase.from('equipment').delete().eq('id', id);
      if (error) throw error;
      toast.success('设备已删除');
      setShowEquipmentModal(false);
      setSelectedEquipment(null);
      fetchSchedules();
    } catch (error) {
      console.error('Error deleting equipment:', error);
      toast.error('删除设备失败');
    }
  };

  const fetchSchedules = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('maintenance_schedules')
        .select('*, equipment:equipment_id(id, name, responsible, responsible_email, type, status, is_scrapped)')
        .eq('is_active', true)
        .order('next_due_date', { ascending: true });

      if (error) throw error;
      // 过滤掉已报废设备的维护计划 - 报废设备不参与任何管理活动
      const filtered = (data || []).filter((s: any) => {
        const eq = s.equipment;
        return eq?.status !== 'scrapped' && eq?.is_scrapped !== true;
      });
      setSchedules(filtered);

      const responsibleGroups = new Set(filtered.map(s => s.equipment?.responsible || '未指定负责人'));
      const typeGroups = new Set(filtered.map(s => s.equipment?.type || '未分类'));
      setExpandedGroups(new Set([...responsibleGroups, ...typeGroups]));
    } catch (error) {
      console.error('Error fetching schedules:', error);
      toast.error('获取维护计划失败');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSchedules();
  }, []);

  const filteredSchedules = useMemo(() => {
    if (!searchQuery.trim()) return schedules;

    const query = searchQuery.toLowerCase().trim();
    return schedules.filter(schedule => {
      const equipmentName = schedule.equipment?.name?.toLowerCase() || '';
      const equipmentId = schedule.equipment_id?.toLowerCase() || '';
      const responsible = schedule.equipment?.responsible?.toLowerCase() || '';
      const title = schedule.title?.toLowerCase() || '';
      const description = schedule.description?.toLowerCase() || '';
      const type = schedule.equipment?.type?.toLowerCase() || '';

      return equipmentName.includes(query) ||
             equipmentId.includes(query) ||
             responsible.includes(query) ||
             title.includes(query) ||
             description.includes(query) ||
             type.includes(query);
    });
  }, [schedules, searchQuery]);

  const groupedSchedules = useMemo((): GroupedSchedules[] => {
    const groups: Record<string, GroupedSchedules> = {};

    filteredSchedules.forEach(schedule => {
      const responsibleName = schedule.equipment?.responsible || '未指定负责人';
      const responsibleEmail = schedule.equipment?.responsible_email || profileEmails[responsibleName] || null;

      if (!groups[responsibleName]) {
        groups[responsibleName] = {
          responsibleName,
          responsibleEmail,
          schedules: []
        };
      }
      groups[responsibleName].schedules.push(schedule);
    });

    return Object.values(groups).sort((a, b) => a.responsibleName.localeCompare(b.responsibleName));
  }, [filteredSchedules, profileEmails]);

  const typeGroupedSchedules = useMemo((): TypeGroupedSchedules[] => {
    const groups: Record<string, TypeGroupedSchedules> = {};

    filteredSchedules.forEach(schedule => {
      const typeName = schedule.equipment?.type || '未分类';

      if (!groups[typeName]) {
        groups[typeName] = {
          typeName,
          schedules: []
        };
      }
      groups[typeName].schedules.push(schedule);
    });

    return Object.values(groups).sort((a, b) => a.typeName.localeCompare(b.typeName));
  }, [filteredSchedules]);

  const toggleGroup = (groupName: string) => {
    setExpandedGroups(prev => {
      const newSet = new Set(prev);
      if (newSet.has(groupName)) {
        newSet.delete(groupName);
      } else {
        newSet.add(groupName);
      }
      return newSet;
    });
  };

  const sendGroupEmail = async (group: GroupedSchedules) => {
    if (!group.responsibleEmail) {
      toast.error(`${group.responsibleName} 没有设置邮箱地址`);
      return;
    }

    setSendingGroupEmail(group.responsibleName);
    try {
      const equipmentList = group.schedules.map(s => ({
        scheduleId: s.id,
        equipmentId: s.equipment?.id || s.equipment_id || '-',
        equipmentName: s.equipment?.name || '未知设备',
        equipmentType: s.equipment?.type || '未分类',
        maintenanceTitle: s.title || '常规维护',
        description: s.description || `${s.title} - ${s.equipment?.name || s.equipment_id}`,
        dueDate: s.next_due_date || '-',
        frequency: s.frequency || '-',
        assignedPerson: s.assigned_name || s.equipment?.responsible || '未指定'
      }));

      const { error } = await supabase.functions.invoke('send-equipment-notification', {
        body: {
          status: 'maintenance-batch-reminder',
          adminEmail: group.responsibleEmail,
          equipmentList: equipmentList,
          reporterName: '系统手动触发'
        }
      });

      if (error) throw error;
      toast.success(`已向 ${group.responsibleName} (${group.responsibleEmail}) 发送维护提醒邮件`);
    } catch (error: any) {
      console.error('Error sending group email:', error);
      toast.error(`发送邮件失败: ${error.message}`);
    } finally {
      setSendingGroupEmail(null);
    }
  };

  const testReminderFunction = async () => {
    setTestingReminder(true);
    try {
      const { data, error } = await supabase.functions.invoke('send-maintenance-reminders', {
        body: {},
      });

      if (error) throw error;

      if (data.remindersSent?.length > 0) {
        toast.success(`成功发送 ${data.remindersSent.length} 条提醒`);
      } else if (data.errors?.length > 0) {
        toast.error(`发送失败: ${data.errors[0]}`);
      } else {
        toast.info(`检查了 ${data.totalChecked} 个计划，暂无需要发送的提醒`);
      }

      fetchSchedules();
    } catch (error: any) {
      console.error('Error testing reminder:', error);
      toast.error('测试提醒失败: ' + error.message);
    } finally {
      setTestingReminder(false);
    }
  };

  const getStatusBadge = (schedule: MaintenanceSchedule) => {
    const dueDate = new Date(schedule.next_due_date);
    const daysUntilDue = differenceInDays(dueDate, new Date());

    if (isPast(dueDate) && !isToday(dueDate)) {
      return <Badge variant="destructive" className="flex items-center gap-1"><AlertTriangle className="h-3 w-3" />已过期</Badge>;
    }
    if (isToday(dueDate)) {
      return <Badge className="bg-orange-500 flex items-center gap-1"><Clock className="h-3 w-3" />今日到期</Badge>;
    }
    if (daysUntilDue <= schedule.reminder_days_before) {
      return <Badge className="bg-yellow-500 flex items-center gap-1"><AlertTriangle className="h-3 w-3" />即将到期</Badge>;
    }
    return <Badge variant="secondary" className="flex items-center gap-1"><CheckCircle className="h-3 w-3" />正常</Badge>;
  };

  const getGroupStats = (schedules: MaintenanceSchedule[]) => {
    const overdue = schedules.filter(s => {
      const dueDate = new Date(s.next_due_date);
      return isPast(dueDate) && !isToday(dueDate);
    }).length;

    const dueToday = schedules.filter(s => isToday(new Date(s.next_due_date))).length;

    const upcoming = schedules.filter(s => {
      const dueDate = new Date(s.next_due_date);
      const daysUntilDue = differenceInDays(dueDate, new Date());
      return daysUntilDue > 0 && daysUntilDue <= 7;
    }).length;

    return { overdue, dueToday, upcoming };
  };

  const overdueCount = schedules.filter(s => {
    const dueDate = new Date(s.next_due_date);
    return isPast(dueDate) && !isToday(dueDate);
  }).length;

  const dueTodayCount = schedules.filter(s => isToday(new Date(s.next_due_date))).length;

  const upcomingCount = schedules.filter(s => {
    const dueDate = new Date(s.next_due_date);
    const daysUntilDue = differenceInDays(dueDate, new Date());
    return daysUntilDue > 0 && daysUntilDue <= 7;
  }).length;

  if (loading) {
    return (
      <Card>
        <CardContent className="p-6">
          <div className="flex items-center justify-center">
            <RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {/* 统计概览 */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
        <Card className="relative overflow-hidden shadow-sm min-h-[130px] bg-gradient-to-br from-white via-blue-50/30 to-blue-100/50">
          <div className="absolute -top-10 -right-10 w-36 h-36 rounded-full bg-gradient-to-br from-blue-200/60 to-blue-300/40 blur-sm" />
          <div className="absolute -top-4 -right-4 w-28 h-28 rounded-full bg-blue-100/70" />
          <div className="absolute top-4 right-4 w-14 h-14 rounded-full bg-gradient-to-br from-blue-400 to-blue-600 flex items-center justify-center shadow-lg shadow-blue-500/30">
            <Wrench className="h-7 w-7 text-white" strokeWidth={1.5} />
          </div>
          <CardContent className="p-4 pt-5">
            <p className="text-sm text-muted-foreground mb-1">维护计划</p>
            <p className="text-3xl font-bold text-foreground">{schedules.length}</p>
            <p className="text-xs text-blue-500 mt-2 flex items-center gap-1">
              <span>↗</span> 活跃计划
            </p>
          </CardContent>
        </Card>

        <Card className="relative overflow-hidden shadow-sm min-h-[130px] bg-gradient-to-br from-white via-green-50/30 to-green-100/50">
          <div className="absolute -top-10 -right-10 w-36 h-36 rounded-full bg-gradient-to-br from-green-200/60 to-green-300/40 blur-sm" />
          <div className="absolute -top-4 -right-4 w-28 h-28 rounded-full bg-green-100/70" />
          <div className="absolute top-4 right-4 w-14 h-14 rounded-full bg-gradient-to-br from-green-400 to-green-600 flex items-center justify-center shadow-lg shadow-green-500/30">
            <Users className="h-7 w-7 text-white" strokeWidth={1.5} />
          </div>
          <CardContent className="p-4 pt-5">
            <p className="text-sm text-muted-foreground mb-1">负责人</p>
            <p className="text-3xl font-bold text-foreground">{groupedSchedules.length}</p>
            <p className="text-xs text-green-500 mt-2 flex items-center gap-1">
              <span>↗</span> 已分配
            </p>
          </CardContent>
        </Card>

        <Card className={cn(
          "relative overflow-hidden shadow-sm min-h-[130px]",
          overdueCount > 0 ? "border-red-200 bg-gradient-to-br from-white via-red-50/40 to-red-100/60" : "border-red-100 bg-gradient-to-br from-white via-red-50/20 to-red-100/40"
        )}>
          <div className="absolute -top-10 -right-10 w-36 h-36 rounded-full bg-gradient-to-br from-red-200/60 to-red-300/40 blur-sm" />
          <div className="absolute -top-4 -right-4 w-28 h-28 rounded-full bg-red-100/70" />
          <div className={cn(
            "absolute top-4 right-4 w-14 h-14 rounded-full flex items-center justify-center shadow-lg shadow-red-500/30",
            overdueCount > 0 ? "bg-gradient-to-br from-red-400 to-red-600" : "bg-gradient-to-br from-red-300 to-red-500"
          )}>
            <AlertTriangle className="h-7 w-7 text-white" strokeWidth={1.5} />
          </div>
          <CardContent className="p-4 pt-5">
            <p className="text-sm text-muted-foreground mb-1">已过期</p>
            <p className={cn("text-3xl font-bold", overdueCount > 0 ? "text-red-500" : "text-foreground")}>{overdueCount}</p>
            <p className={cn("text-xs mt-2 flex items-center gap-1", overdueCount > 0 ? "text-red-500" : "text-muted-foreground")}>
              <span>{overdueCount > 0 ? "⚠" : "✓"}</span> {overdueCount > 0 ? "需要处理" : "无过期"}
            </p>
          </CardContent>
        </Card>

        <Card className={cn(
          "relative overflow-hidden shadow-sm min-h-[130px]",
          dueTodayCount > 0 ? "border-orange-200 bg-gradient-to-br from-white via-orange-50/40 to-orange-100/60" : "border-orange-100 bg-gradient-to-br from-white via-orange-50/20 to-orange-100/40"
        )}>
          <div className="absolute -top-10 -right-10 w-36 h-36 rounded-full bg-gradient-to-br from-orange-200/60 to-orange-300/40 blur-sm" />
          <div className="absolute -top-4 -right-4 w-28 h-28 rounded-full bg-orange-100/70" />
          <div className={cn(
            "absolute top-4 right-4 w-14 h-14 rounded-full flex items-center justify-center shadow-lg shadow-orange-500/30",
            dueTodayCount > 0 ? "bg-gradient-to-br from-orange-400 to-orange-600" : "bg-gradient-to-br from-orange-300 to-orange-500"
          )}>
            <Clock className="h-7 w-7 text-white" strokeWidth={1.5} />
          </div>
          <CardContent className="p-4 pt-5">
            <p className="text-sm text-muted-foreground mb-1">今日到期</p>
            <p className={cn("text-3xl font-bold", dueTodayCount > 0 ? "text-orange-500" : "text-foreground")}>{dueTodayCount}</p>
            <p className={cn("text-xs mt-2 flex items-center gap-1", dueTodayCount > 0 ? "text-orange-500" : "text-muted-foreground")}>
              <span>{dueTodayCount > 0 ? "⏰" : "✓"}</span> {dueTodayCount > 0 ? "请及时处理" : "暂无"}
            </p>
          </CardContent>
        </Card>

        <Card className={cn(
          "relative overflow-hidden shadow-sm min-h-[130px]",
          upcomingCount > 0 ? "border-amber-200 bg-gradient-to-br from-white via-amber-50/40 to-amber-100/60" : "border-amber-100 bg-gradient-to-br from-white via-amber-50/20 to-amber-100/40"
        )}>
          <div className="absolute -top-10 -right-10 w-36 h-36 rounded-full bg-gradient-to-br from-amber-200/60 to-amber-300/40 blur-sm" />
          <div className="absolute -top-4 -right-4 w-28 h-28 rounded-full bg-amber-100/70" />
          <div className={cn(
            "absolute top-4 right-4 w-14 h-14 rounded-full flex items-center justify-center shadow-lg shadow-amber-500/30",
            upcomingCount > 0 ? "bg-gradient-to-br from-amber-400 to-amber-600" : "bg-gradient-to-br from-amber-300 to-amber-500"
          )}>
            <Calendar className="h-7 w-7 text-white" strokeWidth={1.5} />
          </div>
          <CardContent className="p-4 pt-5">
            <p className="text-sm text-muted-foreground mb-1">7天内</p>
            <p className={cn("text-3xl font-bold", upcomingCount > 0 ? "text-amber-500" : "text-foreground")}>{upcomingCount}</p>
            <p className={cn("text-xs mt-2 flex items-center gap-1", upcomingCount > 0 ? "text-amber-500" : "text-muted-foreground")}>
              <span>{upcomingCount > 0 ? "📅" : "✓"}</span> {upcomingCount > 0 ? "计划中" : "暂无"}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* 搜索框 */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="搜索设备名称、ID、负责人、维护内容..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="pl-9 pr-9 h-9"
        />
        {searchQuery && (
          <Button
            variant="ghost"
            size="sm"
            className="absolute right-1 top-1/2 -translate-y-1/2 h-7 w-7 p-0"
            onClick={() => setSearchQuery('')}
          >
            <X className="h-4 w-4" />
          </Button>
        )}
      </div>

      {/* 分组切换标签 */}
      <Tabs value={groupByTab} onValueChange={(v) => setGroupByTab(v as 'responsible' | 'type')} className="w-full">
        <div className="flex flex-wrap justify-between items-center gap-2">
          <TabsList className="grid w-fit grid-cols-2 h-11 p-1 gap-1">
            <TabsTrigger
              value="responsible"
              className="flex items-center gap-2 text-sm px-3 data-[state=active]:bg-purple-500 data-[state=active]:text-white data-[state=active]:shadow-md transition-all"
            >
              <div className={`h-6 w-6 rounded flex items-center justify-center ${groupByTab === 'responsible' ? 'bg-white/20' : 'bg-purple-500'}`}>
                <Users className="h-3.5 w-3.5 text-white" strokeWidth={1.5} />
              </div>
              按负责人
            </TabsTrigger>
            <TabsTrigger
              value="type"
              className="flex items-center gap-2 text-sm px-3 data-[state=active]:bg-blue-500 data-[state=active]:text-white data-[state=active]:shadow-md transition-all"
            >
              <div className={`h-6 w-6 rounded flex items-center justify-center ${groupByTab === 'type' ? 'bg-white/20' : 'bg-blue-500'}`}>
                <Tags className="h-3.5 w-3.5 text-white" strokeWidth={1.5} />
              </div>
              按类型
            </TabsTrigger>
          </TabsList>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" className="h-9 px-3" onClick={fetchSchedules}>
              <div className="h-6 w-6 rounded bg-green-500 flex items-center justify-center mr-2">
                <RefreshCw className="h-3.5 w-3.5 text-white" strokeWidth={1.5} />
              </div>
              刷新
            </Button>
            <Button
              size="sm"
              className="h-9 px-3 bg-orange-500 hover:bg-orange-600"
              onClick={testReminderFunction}
              disabled={testingReminder}
            >
              <div className="h-6 w-6 rounded bg-white/20 flex items-center justify-center mr-2">
                {testingReminder ? (
                  <RefreshCw className="h-3.5 w-3.5 text-white animate-spin" strokeWidth={1.5} />
                ) : (
                  <Mail className="h-3.5 w-3.5 text-white" strokeWidth={1.5} />
                )}
              </div>
              发送提醒
            </Button>
          </div>
        </div>

        {/* 按负责人分组 */}
        <TabsContent value="responsible" className="mt-3">
          {groupedSchedules.length === 0 ? (
            <Card>
              <CardContent className="p-4 text-center text-muted-foreground text-sm">
                暂无维护计划，请在设备详情中添加维护计划
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-3">
              {groupedSchedules.map((group) => {
                const stats = getGroupStats(group.schedules);
                const isExpanded = expandedGroups.has(group.responsibleName);

                return (
                  <Card key={group.responsibleName} className="overflow-hidden shadow-sm">
                    <Collapsible open={isExpanded} onOpenChange={() => toggleGroup(group.responsibleName)}>
                      <CollapsibleTrigger asChild>
                        <CardHeader className="cursor-pointer hover:bg-muted/50 transition-colors py-3 px-4">
                          <div className="flex items-center justify-between flex-wrap gap-2">
                            <div className="flex items-center gap-2 flex-wrap">
                              <div className="h-8 w-8 rounded-lg bg-purple-500 flex items-center justify-center shadow">
                                <User className="h-4 w-4 text-white" strokeWidth={1.5} />
                              </div>
                              <div className="min-w-0">
                                <CardTitle className="text-sm font-semibold">{group.responsibleName}</CardTitle>
                                {group.responsibleEmail && (
                                  <p className="text-xs text-muted-foreground truncate">{group.responsibleEmail}</p>
                                )}
                              </div>
                              <Badge variant="outline" className="text-xs h-5">{group.schedules.length}</Badge>
                              {stats.overdue > 0 && (
                                <Badge variant="destructive" className="text-xs h-5">{stats.overdue} 过期</Badge>
                              )}
                              {stats.dueToday > 0 && (
                                <Badge className="bg-amber-500 text-xs h-5">{stats.dueToday} 今日</Badge>
                              )}
                              {stats.upcoming > 0 && (
                                <Badge className="bg-amber-400 text-xs h-5">{stats.upcoming} 即将</Badge>
                              )}
                            </div>
                            <div className="flex items-center gap-1.5">
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-7 w-7 p-0"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setAddModalGroupType('responsible');
                                  setAddModalGroupName(group.responsibleName);
                                  setAddModalGroupEmail(group.responsibleEmail);
                                  setAddModalOpen(true);
                                }}
                              >
                                <div className="h-6 w-6 rounded bg-green-500 flex items-center justify-center">
                                  <Plus className="h-3.5 w-3.5 text-white" strokeWidth={1.5} />
                                </div>
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-7 w-7 p-0"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  sendGroupEmail(group);
                                }}
                                disabled={sendingGroupEmail === group.responsibleName || !group.responsibleEmail}
                              >
                                <div className={`h-6 w-6 rounded flex items-center justify-center ${!group.responsibleEmail ? 'bg-gray-400' : 'bg-orange-500'}`}>
                                  {sendingGroupEmail === group.responsibleName ? (
                                    <RefreshCw className="h-3.5 w-3.5 text-white animate-spin" strokeWidth={1.5} />
                                  ) : (
                                    <Mail className="h-3.5 w-3.5 text-white" strokeWidth={1.5} />
                                  )}
                                </div>
                              </Button>
                              {isExpanded ? (
                                <ChevronUp className="h-4 w-4 text-muted-foreground" />
                              ) : (
                                <ChevronDown className="h-4 w-4 text-muted-foreground" />
                              )}
                            </div>
                          </div>
                        </CardHeader>
                      </CollapsibleTrigger>
                      <CollapsibleContent>
                        <CardContent className="pt-0 pb-3 px-3">
                          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                            {group.schedules.map((schedule) => (
                              <MaintenanceScheduleCard
                                key={schedule.id}
                                schedule={schedule}
                                onClick={() => handleCardClick(schedule.equipment_id)}
                              />
                            ))}
                          </div>
                        </CardContent>
                      </CollapsibleContent>
                    </Collapsible>
                  </Card>
                );
              })}
            </div>
          )}
        </TabsContent>

        {/* 按仪器类型分组 */}
        <TabsContent value="type" className="mt-3">
          {typeGroupedSchedules.length === 0 ? (
            <Card>
              <CardContent className="p-4 text-center text-muted-foreground text-sm">
                暂无维护计划，请在设备详情中添加维护计划
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-3">
              {typeGroupedSchedules.map((group) => {
                const stats = getGroupStats(group.schedules);
                const isExpanded = expandedGroups.has(group.typeName);

                return (
                  <Card key={group.typeName} className="overflow-hidden shadow-sm">
                    <Collapsible open={isExpanded} onOpenChange={() => toggleGroup(group.typeName)}>
                      <CollapsibleTrigger asChild>
                        <CardHeader className="cursor-pointer hover:bg-muted/50 transition-colors py-3 px-4">
                          <div className="flex items-center justify-between flex-wrap gap-2">
                            <div className="flex items-center gap-2 flex-wrap">
                              <div className="h-8 w-8 rounded-lg bg-blue-500 flex items-center justify-center shadow">
                                <Tags className="h-4 w-4 text-white" strokeWidth={1.5} />
                              </div>
                              <CardTitle className="text-sm font-semibold">{group.typeName}</CardTitle>
                              <Badge variant="outline" className="text-xs h-5">{group.schedules.length}</Badge>
                              {stats.overdue > 0 && (
                                <Badge variant="destructive" className="text-xs h-5">{stats.overdue} 过期</Badge>
                              )}
                              {stats.dueToday > 0 && (
                                <Badge className="bg-amber-500 text-xs h-5">{stats.dueToday} 今日</Badge>
                              )}
                              {stats.upcoming > 0 && (
                                <Badge className="bg-amber-400 text-xs h-5">{stats.upcoming} 即将</Badge>
                              )}
                            </div>
                            <div className="flex items-center gap-1.5">
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-7 w-7 p-0"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setAddModalGroupType('type');
                                  setAddModalGroupName(group.typeName);
                                  setAddModalGroupEmail(null);
                                  setAddModalOpen(true);
                                }}
                              >
                                <div className="h-6 w-6 rounded bg-green-500 flex items-center justify-center">
                                  <Plus className="h-3.5 w-3.5 text-white" strokeWidth={1.5} />
                                </div>
                              </Button>
                              {isExpanded ? (
                                <ChevronUp className="h-4 w-4 text-muted-foreground" />
                              ) : (
                                <ChevronDown className="h-4 w-4 text-muted-foreground" />
                              )}
                            </div>
                          </div>
                        </CardHeader>
                      </CollapsibleTrigger>
                      <CollapsibleContent>
                        <CardContent className="pt-0 pb-3 px-3">
                          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                            {group.schedules.map((schedule) => (
                              <MaintenanceScheduleCard
                                key={schedule.id}
                                schedule={schedule}
                                showResponsible
                                onClick={() => handleCardClick(schedule.equipment_id)}
                              />
                            ))}
                          </div>
                        </CardContent>
                      </CollapsibleContent>
                    </Collapsible>
                  </Card>
                );
              })}
            </div>
          )}
        </TabsContent>
      </Tabs>

      <AddEquipmentToGroupModal
        isOpen={addModalOpen}
        onClose={() => setAddModalOpen(false)}
        groupType={addModalGroupType}
        groupName={addModalGroupName}
        groupEmail={addModalGroupEmail}
        onSuccess={fetchSchedules}
      />

      {showEquipmentModal && selectedEquipment && (
        <EquipmentDetailModal
          equipment={selectedEquipment}
          onClose={() => {
            setShowEquipmentModal(false);
            setSelectedEquipment(null);
          }}
          onUpdate={handleUpdateEquipment}
          onDelete={handleDeleteEquipment}
        />
      )}
    </div>
  );
}
