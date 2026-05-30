import React, { useState, useEffect, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { IconContainer } from '@/components/ui/icon-container';
import { Calendar, Clock, User, Wrench, AlertTriangle, CheckCircle, RefreshCw, Mail, ChevronDown, ChevronUp, Users, Tags, Plus, Search, X } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { format, differenceInDays, isPast, isToday } from 'date-fns';
import { zhCN } from 'date-fns/locale';
import { toast } from 'sonner';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import AddEquipmentToGroupModal from './AddEquipmentToGroupModal';
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
  const [profileEmails, setProfileEmails] = useState<Record<string, string>>({});
  const [groupByTab, setGroupByTab] = useState<'responsible' | 'type'>('responsible');
  const [addModalOpen, setAddModalOpen] = useState(false);
  const [addModalGroupType, setAddModalGroupType] = useState<'responsible' | 'type'>('responsible');
  const [addModalGroupName, setAddModalGroupName] = useState('');
  const [addModalGroupEmail, setAddModalGroupEmail] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  const fetchSchedules = async () => {
    setLoading(true);
    try {
      // Fetch profiles to get email mapping by username
      const { data: profiles } = await supabase
        .from('profiles')
        .select('username, email');
      
      const emailMap: Record<string, string> = {};
      (profiles || []).forEach(p => {
        if (p.username && p.email) {
          emailMap[p.username] = p.email;
        }
      });
      setProfileEmails(emailMap);

      const { data, error } = await supabase
        .from('maintenance_schedules')
        .select('*, equipment:equipment_id(id, name, responsible, responsible_email, type)')
        .eq('is_active', true)
        .order('next_due_date', { ascending: true });

      if (error) throw error;
      setSchedules(data || []);
      
      // 默认展开所有分组（按负责人和按类型）
      const responsibleGroups = new Set((data || []).map(s => s.equipment?.responsible || '未指定负责人'));
      const typeGroups = new Set((data || []).map(s => s.equipment?.type || '未分类'));
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

  // 过滤后的计划列表
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

  // 按设备负责人分组
  const groupedSchedules = useMemo((): GroupedSchedules[] => {
    const groups: Record<string, GroupedSchedules> = {};
    
    filteredSchedules.forEach(schedule => {
      const responsibleName = schedule.equipment?.responsible || '未指定负责人';
      // 优先使用 equipment.responsible_email，如果为空则从 profiles 表查找
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
    
    // 按负责人名称排序
    return Object.values(groups).sort((a, b) => a.responsibleName.localeCompare(b.responsibleName));
  }, [filteredSchedules, profileEmails]);

  // 按设备类型分组
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
    
    // 按类型名称排序
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

  // 给某个负责人发送合并邮件 - 与系统自动发送使用完全相同的请求格式
  // 唯一区别是触发方式（手动 vs 定时任务），邮件内容完全一致
  const sendGroupEmail = async (group: GroupedSchedules) => {
    if (!group.responsibleEmail) {
      toast.error(`${group.responsibleName} 没有设置邮箱地址`);
      return;
    }

    setSendingGroupEmail(group.responsibleName);
    try {
      // 构建设备维护信息表格 - 与 EmailSettingsPage 预览和 send-maintenance-reminders 完全一致
      // 字段映射必须与前端预览 (generatePreviewHtmlForSchedules) 保持同步
      const equipmentList = group.schedules.map(s => ({
        scheduleId: s.id,
        // 使用 equipment?.id 而不是 equipment_id，与预览逻辑一致
        equipmentId: s.equipment?.id || s.equipment_id || '-',
        equipmentName: s.equipment?.name || '未知设备',
        equipmentType: s.equipment?.type || '未分类',
        maintenanceTitle: s.title || '常规维护',
        // 描述字段：优先使用 schedule.description，否则生成默认值
        description: s.description || `${s.title} - ${s.equipment?.name || s.equipment_id}`,
        dueDate: s.next_due_date || '-',
        frequency: s.frequency || '-',
        assignedPerson: s.assigned_name || s.equipment?.responsible || '未指定'
      }));

      // 请求体与 send-maintenance-reminders 完全一致
      // 只包含必要字段：status, adminEmail, equipmentList, reporterName
      const { error } = await supabase.functions.invoke('send-equipment-notification', {
        body: {
          status: 'maintenance-batch-reminder',
          adminEmail: group.responsibleEmail,
          equipmentList: equipmentList,
          reporterName: '系统手动触发' // 仅此字段不同，用于区分触发来源
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

      console.log('Reminder test result:', data);
      
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
      {/* 统计概览 - 更紧凑 */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        <Card className="shadow-sm">
          <CardContent className="p-3">
            <div className="flex items-center gap-3">
              <IconContainer variant="primary" size="sm">
                <Wrench />
              </IconContainer>
              <div>
                <p className="text-xs text-muted-foreground">维护计划</p>
                <p className="text-xl font-bold">{schedules.length}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="shadow-sm">
          <CardContent className="p-3">
            <div className="flex items-center gap-3">
              <IconContainer variant="primary" size="sm">
                <Users />
              </IconContainer>
              <div>
                <p className="text-xs text-muted-foreground">负责人</p>
                <p className="text-xl font-bold">{groupedSchedules.length}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className={cn("shadow-sm", overdueCount > 0 && "border-destructive/50 bg-destructive/5")}>
          <CardContent className="p-3">
            <div className="flex items-center gap-3">
              <IconContainer variant={overdueCount > 0 ? "danger" : "muted"} size="sm">
                <AlertTriangle />
              </IconContainer>
              <div>
                <p className="text-xs text-muted-foreground">已过期</p>
                <p className={cn("text-xl font-bold", overdueCount > 0 && "text-destructive")}>{overdueCount}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className={cn("shadow-sm", dueTodayCount > 0 && "border-amber-500/50 bg-amber-500/5")}>
          <CardContent className="p-3">
            <div className="flex items-center gap-3">
              <IconContainer variant={dueTodayCount > 0 ? "warning" : "muted"} size="sm">
                <Clock />
              </IconContainer>
              <div>
                <p className="text-xs text-muted-foreground">今日到期</p>
                <p className={cn("text-xl font-bold", dueTodayCount > 0 && "text-amber-600")}>{dueTodayCount}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className={cn("shadow-sm", upcomingCount > 0 && "border-amber-400/50 bg-amber-400/5")}>
          <CardContent className="p-3">
            <div className="flex items-center gap-3">
              <IconContainer variant={upcomingCount > 0 ? "warning" : "muted"} size="sm">
                <Calendar />
              </IconContainer>
              <div>
                <p className="text-xs text-muted-foreground">7天内</p>
                <p className={cn("text-xl font-bold", upcomingCount > 0 && "text-amber-500")}>{upcomingCount}</p>
              </div>
            </div>
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
          <TabsList className="grid w-fit grid-cols-2 h-9">
            <TabsTrigger value="responsible" className="flex items-center gap-1.5 text-sm px-3">
              <Users className="h-3.5 w-3.5" />
              按负责人
            </TabsTrigger>
            <TabsTrigger value="type" className="flex items-center gap-1.5 text-sm px-3">
              <Tags className="h-3.5 w-3.5" />
              按类型
            </TabsTrigger>
          </TabsList>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" className="h-8" onClick={fetchSchedules}>
              <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
              刷新
            </Button>
            <Button 
              size="sm"
              className="h-8"
              onClick={testReminderFunction}
              disabled={testingReminder}
            >
              {testingReminder ? (
                <RefreshCw className="h-3.5 w-3.5 mr-1.5 animate-spin" />
              ) : (
                <Mail className="h-3.5 w-3.5 mr-1.5" />
              )}
              发送提醒
            </Button>
          </div>
        </div>

        {/* 按负责人分组内容 */}
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
                              <IconContainer variant="primary" size="sm">
                                <User />
                              </IconContainer>
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
                                className="h-7 px-2"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setAddModalGroupType('responsible');
                                  setAddModalGroupName(group.responsibleName);
                                  setAddModalGroupEmail(group.responsibleEmail);
                                  setAddModalOpen(true);
                                }}
                              >
                                <Plus className="h-3.5 w-3.5" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-7 px-2"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  sendGroupEmail(group);
                                }}
                                disabled={sendingGroupEmail === group.responsibleName || !group.responsibleEmail}
                              >
                                {sendingGroupEmail === group.responsibleName ? (
                                  <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                                ) : (
                                  <Mail className="h-3.5 w-3.5" />
                                )}
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
                          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-2">
                            {group.schedules.map((schedule) => (
                              <ScheduleCard key={schedule.id} schedule={schedule} getStatusBadge={getStatusBadge} />
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

        {/* 按仪器类型分组内容 */}
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
                              <IconContainer variant="primary" size="sm">
                                <Tags />
                              </IconContainer>
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
                                className="h-7 px-2"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setAddModalGroupType('type');
                                  setAddModalGroupName(group.typeName);
                                  setAddModalGroupEmail(null);
                                  setAddModalOpen(true);
                                }}
                              >
                                <Plus className="h-3.5 w-3.5" />
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
                          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-2">
                            {group.schedules.map((schedule) => (
                              <ScheduleCard key={schedule.id} schedule={schedule} getStatusBadge={getStatusBadge} showResponsible />
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

      {/* 添加设备到分组弹窗 */}
      <AddEquipmentToGroupModal
        isOpen={addModalOpen}
        onClose={() => setAddModalOpen(false)}
        groupType={addModalGroupType}
        groupName={addModalGroupName}
        groupEmail={addModalGroupEmail}
        onSuccess={fetchSchedules}
      />
    </div>
  );
}

// 单独的计划卡片组件
interface ScheduleCardProps {
  schedule: MaintenanceSchedule;
  getStatusBadge: (schedule: MaintenanceSchedule) => React.ReactNode;
  showResponsible?: boolean;
}

function ScheduleCard({ schedule, getStatusBadge, showResponsible = false }: ScheduleCardProps) {
  return (
    <Card className="hover:shadow-md transition-shadow border-l-2 border-l-primary/30 shadow-sm">
      <CardHeader className="p-3 pb-1.5">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <CardTitle className="text-sm font-medium line-clamp-1">{schedule.title}</CardTitle>
            <p className="text-xs font-medium text-foreground/80 line-clamp-1 mt-0.5">
              {schedule.equipment?.name || schedule.equipment_id}
            </p>
            <p className="text-[10px] text-muted-foreground font-mono">
              {schedule.equipment?.id || schedule.equipment_id}
            </p>
          </div>
          <div className="shrink-0">
            {getStatusBadge(schedule)}
          </div>
        </div>
      </CardHeader>
      <CardContent className="p-3 pt-0 space-y-1">
        <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
          <span className="flex items-center gap-1">
            <Calendar className="h-3 w-3" />
            {format(new Date(schedule.next_due_date), 'MM/dd', { locale: zhCN })}
          </span>
          <span className="flex items-center gap-1">
            <Clock className="h-3 w-3" />
            {frequencyLabels[schedule.frequency] || schedule.frequency}
          </span>
          {showResponsible && schedule.equipment?.responsible && (
            <span className="flex items-center gap-1">
              <User className="h-3 w-3" />
              {schedule.equipment.responsible}
            </span>
          )}
          {schedule.assigned_name && (
            <span className="flex items-center gap-1">
              <Wrench className="h-3 w-3" />
              {schedule.assigned_name}
            </span>
          )}
        </div>
        {schedule.description && (
          <p className="text-xs text-muted-foreground line-clamp-1 pt-0.5">
            {schedule.description}
          </p>
        )}
      </CardContent>
    </Card>
  );
}

