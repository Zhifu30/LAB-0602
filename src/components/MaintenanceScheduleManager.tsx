import React, { useState, useEffect } from 'react';
import { Plus, Calendar, Bell, Check, Trash2, Edit, Clock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { toast } from 'sonner';

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

interface MaintenanceScheduleManagerProps {
  equipmentId: string;
  equipmentName: string;
  equipmentResponsible: string;
  equipmentResponsibleEmail?: string;
  onScheduleChange?: () => void;
  readOnly?: boolean;
}

const frequencyLabels: Record<string, string> = {
  daily: '每日',
  weekly: '每周',
  monthly: '每月',
  quarterly: '每季度',
  yearly: '每年'
};

const MaintenanceScheduleManager: React.FC<MaintenanceScheduleManagerProps> = ({
  equipmentId,
  equipmentName,
  equipmentResponsible,
  equipmentResponsibleEmail,
  onScheduleChange,
  readOnly = false
}) => {
  const { isAdmin, profile } = useAuth();
  const [schedules, setSchedules] = useState<MaintenanceSchedule[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [editingSchedule, setEditingSchedule] = useState<MaintenanceSchedule | null>(null);
  const [users, setUsers] = useState<Array<{user_id: string; username: string; email?: string}>>([]);

  const [formData, setFormData] = useState({
    title: '',
    description: '',
    frequency: 'monthly' as 'daily' | 'weekly' | 'monthly' | 'quarterly' | 'yearly',
    next_due_date: '',
    reminder_days_before: 7,
    assigned_user_id: ''
  });

  useEffect(() => {
    fetchSchedules();
    fetchUsers();
  }, [equipmentId]);

  const fetchSchedules = async () => {
    try {
      const { data, error } = await supabase
        .from('maintenance_schedules')
        .select('*')
        .eq('equipment_id', equipmentId)
        .eq('is_active', true)
        .order('next_due_date');

      if (error) throw error;
      setSchedules((data || []) as MaintenanceSchedule[]);
    } catch (error) {
      console.error('Error fetching maintenance schedules:', error);
      toast.error('获取维护计划失败');
    } finally {
      setLoading(false);
    }
  };

  const fetchUsers = async () => {
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('user_id, username, email')
        .order('username');

      if (error) throw error;
      setUsers(data || []);
    } catch (error) {
      console.error('Error fetching users:', error);
    }
  };

  const handleAddSchedule = async () => {
    if (!formData.title || !formData.next_due_date) {
      toast.error('请填写标题和下次维护日期');
      return;
    }

    try {
      const selectedUser = users.find(u => u.user_id === formData.assigned_user_id);
      const scheduleDescription = formData.description?.trim() || `${formData.title} - ${equipmentName}`;

      const { error } = await supabase
        .from('maintenance_schedules')
        .insert({
          equipment_id: equipmentId,
          title: formData.title,
          description: scheduleDescription,
          frequency: formData.frequency,
          next_due_date: formData.next_due_date,
          reminder_days_before: formData.reminder_days_before,
          assigned_user_id: formData.assigned_user_id || null,
          assigned_name: selectedUser?.username || null,
          assigned_email: selectedUser?.email || null,
          created_by: profile?.user_id
        });

      if (error) throw error;

      toast.success('维护计划已添加');
      setShowAddModal(false);
      resetForm();
      fetchSchedules();
      onScheduleChange?.();
    } catch (error) {
      console.error('Error adding maintenance schedule:', error);
      toast.error('添加维护计划失败');
    }
  };

  const handleUpdateSchedule = async () => {
    if (!editingSchedule || !formData.title || !formData.next_due_date) {
      toast.error('请填写标题和下次维护日期');
      return;
    }

    try {
      const selectedUser = users.find(u => u.user_id === formData.assigned_user_id);
      const scheduleDescription = formData.description?.trim() || `${formData.title} - ${equipmentName}`;

      const { error } = await supabase
        .from('maintenance_schedules')
        .update({
          title: formData.title,
          description: scheduleDescription,
          frequency: formData.frequency,
          next_due_date: formData.next_due_date,
          reminder_days_before: formData.reminder_days_before,
          assigned_user_id: formData.assigned_user_id || null,
          assigned_name: selectedUser?.username || null,
          assigned_email: selectedUser?.email || null,
          reminder_sent: false
        })
        .eq('id', editingSchedule.id);

      if (error) throw error;

      toast.success('维护计划已更新');
      setShowEditModal(false);
      setEditingSchedule(null);
      resetForm();
      fetchSchedules();
      onScheduleChange?.();
    } catch (error) {
      console.error('Error updating maintenance schedule:', error);
      toast.error('更新维护计划失败');
    }
  };

  const handleDeleteSchedule = async (id: string) => {
    if (!window.confirm('确定要删除这个维护计划吗？')) return;

    try {
      const { error } = await supabase
        .from('maintenance_schedules')
        .update({ is_active: false })
        .eq('id', id);

      if (error) throw error;

      toast.success('维护计划已删除');
      fetchSchedules();
      onScheduleChange?.();
    } catch (error) {
      console.error('Error deleting maintenance schedule:', error);
      toast.error('删除维护计划失败');
    }
  };

  const handleCompleteSchedule = async (schedule: MaintenanceSchedule) => {
    try {
      const currentDate = new Date(schedule.next_due_date);
      let nextDate = new Date(currentDate);

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

      const { error: scheduleError } = await supabase
        .from('maintenance_schedules')
        .update({
          next_due_date: nextDate.toISOString().split('T')[0],
          last_completed_at: new Date().toISOString(),
          reminder_sent: false
        })
        .eq('id', schedule.id);

      if (scheduleError) throw scheduleError;

      const { error: logError } = await supabase
        .from('maintenance_logs')
        .insert({
          schedule_id: schedule.id,
          equipment_id: equipmentId,
          completed_by: profile?.user_id,
          completed_by_name: profile?.username || 'Unknown'
        });

      if (logError) throw logError;

      toast.success('维护已完成，下次维护日期已更新');
      fetchSchedules();
      onScheduleChange?.();
    } catch (error) {
      console.error('Error completing maintenance:', error);
      toast.error('完成维护失败');
    }
  };

  const handleSendReminder = async (schedule: MaintenanceSchedule) => {
    try {
      const recipients: string[] = [];

      if (schedule.assigned_email) {
        recipients.push(schedule.assigned_email);
      }

      if (equipmentResponsibleEmail && !recipients.includes(equipmentResponsibleEmail)) {
        recipients.push(equipmentResponsibleEmail);
      }

      const adminEmail = 'zhifu.feng@brightfuture.com.hk';
      if (!recipients.includes(adminEmail)) {
        recipients.push(adminEmail);
      }

      if (recipients.length === 0) {
        toast.error('没有可发送的邮箱地址');
        return;
      }

      const { data: equipmentInfo } = await supabase
        .from('equipment')
        .select('name, type')
        .eq('id', equipmentId)
        .maybeSingle();

      const equipmentList = [
        {
          scheduleId: schedule.id,
          equipmentId,
          equipmentName: equipmentInfo?.name || equipmentName || equipmentId,
          equipmentType: equipmentInfo?.type || '未分类',
          maintenanceTitle: schedule.title,
          description: schedule.description?.trim() || `${schedule.title} - ${equipmentName}`,
          dueDate: schedule.next_due_date,
          frequency: schedule.frequency,
          assignedPerson: schedule.assigned_name || equipmentResponsible || '未指定',
        },
      ];

      const { error } = await supabase.functions.invoke('send-equipment-notification', {
        body: {
          status: 'maintenance-batch-reminder',
          reporterName: profile?.username || 'System',
          adminEmail: recipients.join(','),
          equipmentList,
        }
      });

      if (error) throw error;

      await supabase
        .from('maintenance_schedules')
        .update({ reminder_sent: true })
        .eq('id', schedule.id);

      toast.success(`提醒已发送给: ${recipients.join(', ')}`);
      fetchSchedules();
    } catch (error) {
      console.error('Error sending reminder:', error);
      toast.error('发送提醒失败');
    }
  };

  const resetForm = () => {
    setFormData({
      title: '',
      description: '',
      frequency: 'monthly',
      next_due_date: '',
      reminder_days_before: 7,
      assigned_user_id: ''
    });
  };

  const openEditModal = (schedule: MaintenanceSchedule) => {
    setEditingSchedule(schedule);
    setFormData({
      title: schedule.title,
      description: schedule.description || '',
      frequency: schedule.frequency,
      next_due_date: schedule.next_due_date,
      reminder_days_before: schedule.reminder_days_before,
      assigned_user_id: schedule.assigned_user_id || ''
    });
    setShowEditModal(true);
  };

  const getDaysUntilDue = (dueDate: string) => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const due = new Date(dueDate);
    const diffTime = due.getTime() - today.getTime();
    return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  };

  const getUrgencyColor = (daysUntil: number) => {
    if (daysUntil < 0) return 'bg-red-500 text-white';
    if (daysUntil <= 7) return 'bg-orange-500 text-white';
    if (daysUntil <= 30) return 'bg-yellow-500 text-white';
    return 'bg-green-500 text-white';
  };

  return (
    <Card className="mt-3 bg-white/10 backdrop-blur-sm border-white/20">
      <CardHeader className="flex flex-row items-center justify-between py-2 px-3">
        <CardTitle className="text-sm flex items-center gap-2 text-white">
          <div className="p-1 bg-teal-500 rounded-md">
            <Calendar className="h-3.5 w-3.5 text-white" />
          </div>
          维护计划管理
        </CardTitle>
        {!readOnly && (
          <Button size="sm" onClick={() => setShowAddModal(true)} className="h-6 text-xs bg-teal-500 hover:bg-teal-600 text-white">
            <Plus className="h-3 w-3 mr-0.5" />
            添加计划
          </Button>
        )}
      </CardHeader>
      <CardContent className="px-3 pb-2 pt-0">
        {loading ? (
          <div className="text-center py-2 text-white/60 text-xs">加载中...</div>
        ) : schedules.length === 0 ? (
          <div className="text-center py-2 text-white/60 text-xs">
            暂无维护计划
          </div>
        ) : (
          <div className="space-y-2">
            {schedules.map((schedule) => {
              const daysUntil = getDaysUntilDue(schedule.next_due_date);
              return (
                <div
                  key={schedule.id}
                  className="p-2 rounded-lg bg-white/5 border border-white/10 hover:bg-white/10 transition-colors"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5 mb-0.5 flex-wrap">
                        <span className="font-medium text-white text-xs">{schedule.title}</span>
                        <Badge variant="outline" className="border-white/30 text-white/80 text-xs">
                          {frequencyLabels[schedule.frequency]}
                        </Badge>
                        <Badge className={`text-xs ${getUrgencyColor(daysUntil)}`}>
                          {daysUntil < 0 ? `已过期 ${Math.abs(daysUntil)} 天` :
                           daysUntil === 0 ? '今天到期' :
                           `${daysUntil} 天后到期`}
                        </Badge>
                        {schedule.reminder_sent && (
                          <Badge variant="secondary" className="text-xs bg-white/20 text-white/80">已发送提醒</Badge>
                        )}
                      </div>
                      {schedule.description && (
                        <p className="text-sm text-white font-bold mb-2 whitespace-pre-line">{schedule.description}</p>
                      )}
                      <div className="text-xs text-white/50 flex items-center gap-3 flex-wrap">
                        <span className="flex items-center gap-1">
                          <div className="p-0.5 bg-blue-500 rounded">
                            <Calendar className="h-2.5 w-2.5 text-white" />
                          </div>
                          下次: {schedule.next_due_date}
                        </span>
                        {schedule.assigned_name && (
                          <span className="flex items-center gap-1">
                            <div className="p-0.5 bg-purple-500 rounded">
                              <Bell className="h-2.5 w-2.5 text-white" />
                            </div>
                            {schedule.assigned_name}
                          </span>
                        )}
                        <span className="flex items-center gap-1">
                          <div className="p-0.5 bg-orange-500 rounded">
                            <Bell className="h-2.5 w-2.5 text-white" />
                          </div>
                          提前 {schedule.reminder_days_before} 天提醒
                        </span>
                      </div>
                    </div>
                    {!readOnly && (
                      <div className="flex items-center gap-1 shrink-0">
                        <Button
                          size="sm"
                          onClick={() => handleSendReminder(schedule)}
                          title="发送提醒"
                          className="h-7 w-7 p-0 bg-orange-500 hover:bg-orange-600 text-white"
                        >
                          <Bell className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          size="sm"
                          onClick={() => handleCompleteSchedule(schedule)}
                          title="标记完成"
                          className="h-7 w-7 p-0 bg-green-500 hover:bg-green-600 text-white"
                        >
                          <Check className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          size="sm"
                          onClick={() => openEditModal(schedule)}
                          title="编辑"
                          className="h-7 w-7 p-0 bg-blue-500 hover:bg-blue-600 text-white"
                        >
                          <Edit className="h-3.5 w-3.5" />
                        </Button>
                        {isAdmin() && (
                          <Button
                            size="sm"
                            onClick={() => handleDeleteSchedule(schedule.id)}
                            title="删除"
                            className="h-7 w-7 p-0 bg-red-500 hover:bg-red-600 text-white"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>

      {/* Add Schedule Modal */}
      <Dialog open={showAddModal} onOpenChange={setShowAddModal}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>添加维护计划</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>维护标题 *</Label>
              <Input
                value={formData.title}
                onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                placeholder="例如: 月度保养、年度校正"
              />
            </div>
            <div>
              <Label>维护内容</Label>
              <Textarea
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                placeholder="详细描述维护内容..."
                rows={3}
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>维护周期 *</Label>
                <Select
                  value={formData.frequency}
                  onValueChange={(value: 'daily' | 'weekly' | 'monthly' | 'quarterly' | 'yearly') =>
                    setFormData({ ...formData, frequency: value })
                  }
                >
                  <SelectTrigger>
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
              <div>
                <Label>下次维护日期 *</Label>
                <Input
                  type="date"
                  value={formData.next_due_date}
                  onChange={(e) => setFormData({ ...formData, next_due_date: e.target.value })}
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>提前提醒天数</Label>
                <Input
                  type="number"
                  value={formData.reminder_days_before}
                  onChange={(e) => setFormData({ ...formData, reminder_days_before: parseInt(e.target.value) || 7 })}
                  min={1}
                  max={90}
                />
              </div>
              <div>
                <Label>指定维护人</Label>
                <Select
                  value={formData.assigned_user_id}
                  onValueChange={(value) => setFormData({ ...formData, assigned_user_id: value })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="选择维护人" />
                  </SelectTrigger>
                  <SelectContent>
                    {users.map((user) => (
                      <SelectItem key={user.user_id} value={user.user_id}>
                        {user.username}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setShowAddModal(false); resetForm(); }}>
              取消
            </Button>
            <Button onClick={handleAddSchedule}>添加</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Schedule Modal */}
      <Dialog open={showEditModal} onOpenChange={setShowEditModal}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>编辑维护计划</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>维护标题 *</Label>
              <Input
                value={formData.title}
                onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                placeholder="例如: 月度保养、年度校正"
              />
            </div>
            <div>
              <Label>维护内容</Label>
              <Textarea
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                placeholder="详细描述维护内容..."
                rows={3}
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>维护周期 *</Label>
                <Select
                  value={formData.frequency}
                  onValueChange={(value: 'daily' | 'weekly' | 'monthly' | 'quarterly' | 'yearly') =>
                    setFormData({ ...formData, frequency: value })
                  }
                >
                  <SelectTrigger>
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
              <div>
                <Label>下次维护日期 *</Label>
                <Input
                  type="date"
                  value={formData.next_due_date}
                  onChange={(e) => setFormData({ ...formData, next_due_date: e.target.value })}
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>提前提醒天数</Label>
                <Input
                  type="number"
                  value={formData.reminder_days_before}
                  onChange={(e) => setFormData({ ...formData, reminder_days_before: parseInt(e.target.value) || 7 })}
                  min={1}
                  max={90}
                />
              </div>
              <div>
                <Label>指定维护人</Label>
                <Select
                  value={formData.assigned_user_id}
                  onValueChange={(value) => setFormData({ ...formData, assigned_user_id: value })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="选择维护人" />
                  </SelectTrigger>
                  <SelectContent>
                    {users.map((user) => (
                      <SelectItem key={user.user_id} value={user.user_id}>
                        {user.username}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setShowEditModal(false); setEditingSchedule(null); resetForm(); }}>
              取消
            </Button>
            <Button onClick={handleUpdateSchedule}>保存</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
};

export default MaintenanceScheduleManager;
