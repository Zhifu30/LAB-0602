import { useState, useEffect } from 'react';
import { Mail, Save, TestTube, Loader2, Clock, Calendar, Eye, RefreshCw, Users, FileText, Workflow, RotateCcw } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { format, endOfMonth, addMonths } from 'date-fns';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar as CalendarComponent } from '@/components/ui/calendar';
import { cn } from '@/lib/utils';


interface EmailSettingsPageProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface EmailConfig {
  smtp_host: string;
  smtp_port: string;
  smtp_user: string;
  smtp_password: string;
  from_email: string;
  from_name: string;
  workday_only: boolean;
  reminder_days_before: number;
  consolidate_emails: boolean;
  send_hour: number;
  send_minute: number;
}

interface Recipient {
  email: string;
  name: string;
  count: number;
}

export function EmailSettingsPage({ open, onOpenChange }: EmailSettingsPageProps) {
  const [activeTab, setActiveTab] = useState('config');
  const [loadingConfig, setLoadingConfig] = useState(false);
  const [savingConfig, setSavingConfig] = useState(false);
  const [testingEmail, setTestingEmail] = useState(false);
  const [testEmail, setTestEmail] = useState('');
  const [recipients, setRecipients] = useState<Recipient[]>([]);
  const [loadingRecipients, setLoadingRecipients] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [selectedDate, setSelectedDate] = useState<Date>(endOfMonth(new Date()));
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [loadingPreview, setLoadingPreview] = useState(false);

  // Preview generated in frontend using the SAME template logic as backend
  const [previewSearchType, setPreviewSearchType] = useState<'schedule_id' | 'equipment_id' | 'responsible' | 'type'>('schedule_id');
  const [previewSearchValue, setPreviewSearchValue] = useState('');
  const [previewSubject, setPreviewSubject] = useState('');
  const [previewHtml, setPreviewHtml] = useState('');
  
  const [config, setConfig] = useState<EmailConfig>({
    smtp_host: '',
    smtp_port: '587',
    smtp_user: '',
    smtp_password: '',
    from_email: '',
    from_name: '实验室设备管理系统',
    workday_only: true,
    reminder_days_before: 7,
    consolidate_emails: true,
    send_hour: 9,
    send_minute: 0,
  });

  // 模板生成逻辑已统一到 Edge Function (send-equipment-notification)
  // 预览和真实发送都调用同一个后端函数，确保一致性

  // 统一架构：预览时调用 Edge Function 的 previewOnly=true，确保预览内容与真实发送完全一致
  const loadPreviewBySearch = async () => {
    const searchValue = previewSearchValue?.trim();
    if (!searchValue) {
      toast.error('请输入搜索内容');
      return;
    }

    setLoadingPreview(true);
    try {
      let schedules: any[] = [];

      // 根据搜索类型查询数据
      if (previewSearchType === 'schedule_id') {
        if (/^\d+$/.test(searchValue)) {
          const { data: allSchedules, error: allError } = await supabase
            .from('maintenance_schedules')
            .select(`
              id, title, description, next_due_date, frequency, assigned_name, assigned_email, equipment_id,
              equipment:equipment_id(id, name, type, responsible, responsible_email)
            `)
            .eq('is_active', true)
            .limit(500);
          
          if (allError) throw allError;
          schedules = allSchedules?.filter(s => s.id.includes(searchValue)) || [];
        } else {
          const { data, error } = await supabase
            .from('maintenance_schedules')
            .select(`
              id, title, description, next_due_date, frequency, assigned_name, assigned_email, equipment_id,
              equipment:equipment_id(id, name, type, responsible, responsible_email)
            `)
            .eq('is_active', true)
            .ilike('id', `%${searchValue}%`)
            .limit(50);
          if (error) throw error;
          schedules = data || [];
        }
      } else if (previewSearchType === 'equipment_id') {
        const { data, error } = await supabase
          .from('maintenance_schedules')
          .select(`
            id, title, description, next_due_date, frequency, assigned_name, assigned_email, equipment_id,
            equipment:equipment_id(id, name, type, responsible, responsible_email)
          `)
          .eq('is_active', true)
          .limit(500);
        if (error) throw error;
        // 按设备ID过滤（equipment.id 是人类可读的ID如 BAL-001）
        schedules = (data || []).filter((s: any) => 
          s.equipment?.id?.toLowerCase().includes(searchValue.toLowerCase())
        );
      } else if (previewSearchType === 'responsible') {
        const { data, error } = await supabase
          .from('maintenance_schedules')
          .select(`
            id, title, description, next_due_date, frequency, assigned_name, assigned_email, equipment_id,
            equipment:equipment_id(id, name, type, responsible, responsible_email)
          `)
          .eq('is_active', true)
          .or(`assigned_name.ilike.%${searchValue}%,assigned_email.ilike.%${searchValue}%`)
          .limit(50);
        if (error) throw error;
        schedules = data || [];
      } else if (previewSearchType === 'type') {
        const { data, error } = await supabase
          .from('maintenance_schedules')
          .select(`
            id, title, description, next_due_date, frequency, assigned_name, assigned_email, equipment_id,
            equipment:equipment_id(id, name, type, responsible, responsible_email)
          `)
          .eq('is_active', true)
          .limit(500);
        if (error) throw error;
        schedules = (data || []).filter((s: any) => 
          s.equipment?.type?.toLowerCase().includes(searchValue.toLowerCase())
        );
      }

      if (!schedules || schedules.length === 0) {
        const typeLabels: Record<string, string> = {
          schedule_id: '计划ID',
          equipment_id: '设备ID',
          responsible: '负责人',
          type: '仪器类型'
        };
        toast.error(`未找到${typeLabels[previewSearchType]}包含 "${searchValue}" 的维护计划`);
        return;
      }

      // 构建 equipmentList - 与 MaintenanceDashboard.sendGroupEmail 完全一致
      const equipmentList = schedules.map((s: any) => ({
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

      // 调用后端 Edge Function 的 previewOnly 模式，获取真实邮件模板
      const { data: previewData, error: previewError } = await supabase.functions.invoke('send-equipment-notification', {
        body: {
          status: 'maintenance-batch-reminder',
          adminEmail: 'preview@example.com',
          equipmentList: equipmentList,
          reporterName: '系统',
          previewOnly: true
        }
      });

      if (previewError) {
        console.error('Preview error:', previewError);
        toast.error(`预览加载失败: ${previewError.message}`);
        return;
      }

      if (!previewData?.htmlContent) {
        toast.error('后端未返回预览内容，请确认 Edge Function 已部署最新版本');
        return;
      }

      setPreviewSubject(previewData.subject || 'Equipment Maintenance Summary');
      setPreviewHtml(previewData.htmlContent);
      toast.success(`已加载 ${equipmentList.length} 条维护计划的真实邮件预览`);
    } catch (e: any) {
      console.error('Load preview error:', e);
      toast.error(e?.message || '加载邮件预览失败');
    } finally {
      setLoadingPreview(false);
    }
  };

  // Auto-load config and recipients when dialog opens
  useEffect(() => {
    if (open) {
      loadConfig();
      loadRecipients();
    }
  }, [open]);

  const loadConfig = async () => {
    setLoadingConfig(true);
    try {
      const { data, error } = await supabase
        .from('email_settings')
        .select('*')
        .eq('id', 'default')
        .single();

      if (error && error.code !== 'PGRST116') throw error;

      if (data) {
        setConfig({
          smtp_host: data.smtp_host || '',
          smtp_port: data.smtp_port || '587',
          smtp_user: data.smtp_user || '',
          smtp_password: data.smtp_password || '',
          from_email: data.from_email || '',
          from_name: data.from_name || '实验室设备管理系统',
          workday_only: (data as any).workday_only ?? true,
          reminder_days_before: (data as any).reminder_days_before ?? 7,
          consolidate_emails: (data as any).consolidate_emails ?? true,
          send_hour: (data as any).send_hour ?? 9,
          send_minute: (data as any).send_minute ?? 0,
        });
        setTestEmail(data.from_email || '');
      }
    } catch (error: any) {
      console.error('Load email config error:', error);
    } finally {
      setLoadingConfig(false);
    }
  };

  const loadRecipients = async () => {
    setLoadingRecipients(true);
    try {
      // Get all maintenance schedules with assigned emails
      const { data: schedules, error } = await supabase
        .from('maintenance_schedules')
        .select('assigned_email, assigned_name, equipment:equipment_id(responsible_email, responsible)')
        .eq('is_active', true);

      if (error) throw error;

      // Aggregate recipients
      const recipientMap = new Map<string, Recipient>();
      
      schedules?.forEach((s: any) => {
        if (s.assigned_email) {
          const existing = recipientMap.get(s.assigned_email);
          if (existing) {
            existing.count++;
          } else {
            recipientMap.set(s.assigned_email, {
              email: s.assigned_email,
              name: s.assigned_name || '未设置',
              count: 1
            });
          }
        }
        if (s.equipment?.responsible_email) {
          const existing = recipientMap.get(s.equipment.responsible_email);
          if (existing) {
            existing.count++;
          } else {
            recipientMap.set(s.equipment.responsible_email, {
              email: s.equipment.responsible_email,
              name: s.equipment.responsible || '未设置',
              count: 1
            });
          }
        }
      });

      setRecipients(Array.from(recipientMap.values()).sort((a, b) => b.count - a.count));
    } catch (error) {
      console.error('Load recipients error:', error);
    } finally {
      setLoadingRecipients(false);
    }
  };

  const handleSave = async () => {
    if (!config.smtp_host || !config.smtp_user || !config.smtp_password || !config.from_email) {
      toast.error('请填写SMTP服务器、用户名、密码和发件人邮箱');
      return;
    }

    setSavingConfig(true);
    try {
      const { error } = await supabase.functions.invoke('save-email-config', {
        body: config,
      });

      if (error) throw error;
      toast.success('邮件配置已保存');
    } catch (error: any) {
      console.error('Save email config error:', error);
      toast.error(error.message || '保存邮件配置时发生错误');
    } finally {
      setSavingConfig(false);
    }
  };

  const handleTestEmail = async () => {
    if (!config.smtp_host || !config.smtp_user || !config.smtp_password || !config.from_email) {
      toast.error('请先填写完整的SMTP配置');
      return;
    }

    if (!testEmail) {
      toast.error('请输入测试邮件接收地址');
      return;
    }

    setTestingEmail(true);
    try {
      const { error } = await supabase.functions.invoke('test-email-config', {
        body: { ...config, test_email: testEmail },
      });

      if (error) throw error;
      toast.success(`测试邮件已发送到 ${testEmail}`);
    } catch (error: any) {
      toast.error(error.message || '发送测试邮件时发生错误');
    } finally {
      setTestingEmail(false);
    }
  };

  const handleResetMaintenanceDates = async () => {
    setResetting(true);
    try {
      const { data: schedules, error: fetchError } = await supabase
        .from('maintenance_schedules')
        .select('*')
        .eq('is_active', true)
        .eq('frequency', 'monthly');

      if (fetchError) throw fetchError;

      if (!schedules || schedules.length === 0) {
        toast.info('没有找到需要重置的月度维护计划');
        setResetting(false);
        return;
      }

      let updatedCount = 0;
      for (const schedule of schedules) {
        const { error: updateError } = await supabase
          .from('maintenance_schedules')
          .update({
            next_due_date: format(selectedDate, 'yyyy-MM-dd'),
            reminder_sent: false,
            updated_at: new Date().toISOString()
          })
          .eq('id', schedule.id);

        if (!updateError) updatedCount++;
      }

      toast.success(`成功重置 ${updatedCount} 个维护计划到 ${format(selectedDate, 'yyyy-MM-dd')}`);
    } catch (error) {
      console.error('Error resetting maintenance dates:', error);
      toast.error('重置失败，请稍后重试');
    } finally {
      setResetting(false);
    }
  };

  const loadPreviewData = async () => {
    setLoadingPreview(true);
    try {
      // Get first equipment id to auto-load preview
      const { data: schedules, error } = await supabase
        .from('maintenance_schedules')
        .select(`equipment_id`)
        .eq('is_active', true)
        .order('next_due_date', { ascending: true })
        .limit(1);

      if (error) throw error;

      if (schedules && schedules.length > 0) {
        const firstEquipmentId = schedules[0].equipment_id;
        setPreviewSearchType('equipment_id');
        setPreviewSearchValue(firstEquipmentId);
        // Trigger search after state update
        setTimeout(() => loadPreviewBySearch(), 100);
      }
    } catch (error) {
      console.error('Load preview data error:', error);
    } finally {
      setLoadingPreview(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[800px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Mail className="h-5 w-5" />
            邮件与系统设置
          </DialogTitle>
          <DialogDescription>
            配置邮件服务器、发送规则、收件人管理和系统维护
          </DialogDescription>
        </DialogHeader>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="config" className="flex items-center gap-1.5 text-xs">
              <Mail className="h-3.5 w-3.5" />
              邮件配置
            </TabsTrigger>
            <TabsTrigger value="recipients" className="flex items-center gap-1.5 text-xs">
              <Users className="h-3.5 w-3.5" />
              收件人
            </TabsTrigger>
            <TabsTrigger value="preview" className="flex items-center gap-1.5 text-xs">
              <Eye className="h-3.5 w-3.5" />
              邮件预览
            </TabsTrigger>
            <TabsTrigger value="workflow" className="flex items-center gap-1.5 text-xs">
              <Workflow className="h-3.5 w-3.5" />
              发送逻辑
            </TabsTrigger>
          </TabsList>

          {/* 邮件配置标签页 */}
          <TabsContent value="config" className="mt-4 space-y-4">
            {loadingConfig ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                <span className="ml-2 text-muted-foreground">加载配置中...</span>
              </div>
            ) : (
              <>
                {/* 配置状态指示器 */}
                <Card className={cn(
                  "border-l-4",
                  config.smtp_host ? "border-l-green-500 bg-green-50/50" : "border-l-yellow-500 bg-yellow-50/50"
                )}>
                  <CardContent className="py-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        {config.smtp_host ? (
                          <>
                            <div className="h-2 w-2 rounded-full bg-green-500" />
                            <span className="text-sm font-medium text-green-700">SMTP 已配置</span>
                            <span className="text-xs text-muted-foreground">({config.smtp_host}:{config.smtp_port})</span>
                          </>
                        ) : (
                          <>
                            <div className="h-2 w-2 rounded-full bg-yellow-500" />
                            <span className="text-sm font-medium text-yellow-700">SMTP 未配置</span>
                            <span className="text-xs text-muted-foreground">请填写以下配置后保存</span>
                          </>
                        )}
                      </div>
                      <Button 
                        variant="outline" 
                        size="sm" 
                        onClick={loadConfig}
                        disabled={loadingConfig}
                        className="h-7 text-xs"
                      >
                        <RefreshCw className={cn("h-3 w-3 mr-1", loadingConfig && "animate-spin")} />
                        刷新配置
                      </Button>
                    </div>
                  </CardContent>
                </Card>

                {/* SMTP配置 */}
                <Card>
                  <CardHeader className="py-3">
                    <CardTitle className="text-sm flex items-center gap-2">
                      <Mail className="h-4 w-4" />
                      SMTP 服务器设置
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1.5">
                        <Label htmlFor="smtp_host" className="text-xs">SMTP服务器 *</Label>
                        <Input
                          id="smtp_host"
                          value={config.smtp_host}
                          onChange={(e) => setConfig({ ...config, smtp_host: e.target.value })}
                          placeholder="smtp-relay.brevo.com"
                          className="h-8 text-sm"
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label htmlFor="smtp_port" className="text-xs">端口 *</Label>
                        <Input
                          id="smtp_port"
                          value={config.smtp_port}
                          onChange={(e) => setConfig({ ...config, smtp_port: e.target.value })}
                          placeholder="587"
                          className="h-8 text-sm"
                        />
                      </div>
                    </div>

                    <div className="space-y-1.5">
                      <Label htmlFor="smtp_user" className="text-xs">SMTP用户名/Login *</Label>
                      <Input
                        id="smtp_user"
                        value={config.smtp_user}
                        onChange={(e) => setConfig({ ...config, smtp_user: e.target.value })}
                        placeholder="your-smtp-user@smtp-provider.com"
                        className="h-8 text-sm"
                      />
                    </div>

                    <div className="space-y-1.5">
                      <Label htmlFor="smtp_password" className="text-xs">SMTP密码/Password *</Label>
                      <Input
                        id="smtp_password"
                        type="password"
                        value={config.smtp_password}
                        onChange={(e) => setConfig({ ...config, smtp_password: e.target.value })}
                        placeholder="输入SMTP密码"
                        className="h-8 text-sm"
                      />
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1.5">
                        <Label htmlFor="from_email" className="text-xs">发件人邮箱 *</Label>
                        <Input
                          id="from_email"
                          type="email"
                          value={config.from_email}
                          onChange={(e) => setConfig({ ...config, from_email: e.target.value })}
                          placeholder="noreply@your-domain.com"
                          className="h-8 text-sm"
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label htmlFor="from_name" className="text-xs">发件人名称</Label>
                        <Input
                          id="from_name"
                          value={config.from_name}
                          onChange={(e) => setConfig({ ...config, from_name: e.target.value })}
                          placeholder="实验室设备管理系统"
                          className="h-8 text-sm"
                        />
                      </div>
                    </div>
                  </CardContent>
                </Card>

                {/* 发送规则设置 */}
                <Card>
                  <CardHeader className="py-3">
                    <CardTitle className="text-sm flex items-center gap-2">
                      <Clock className="h-4 w-4" />
                      发送规则设置
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="flex items-center justify-between py-2 px-3 bg-muted/50 rounded-md">
                      <div className="space-y-0.5">
                        <Label className="text-sm">仅工作日发送</Label>
                        <p className="text-xs text-muted-foreground">周六日不发送，周一自动补发周末应发邮件</p>
                      </div>
                      <Switch
                        checked={config.workday_only}
                        onCheckedChange={(checked) => setConfig({ ...config, workday_only: checked })}
                      />
                    </div>

                    <div className="flex items-center justify-between py-2 px-3 bg-muted/50 rounded-md">
                      <div className="space-y-0.5">
                        <Label className="text-sm">合并邮件</Label>
                        <p className="text-xs text-muted-foreground">每人只收一封包含所有任务的汇总邮件</p>
                      </div>
                      <Switch
                        checked={config.consolidate_emails}
                        onCheckedChange={(checked) => setConfig({ ...config, consolidate_emails: checked })}
                      />
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1.5">
                        <Label className="text-xs flex items-center gap-1">
                          <Calendar className="h-3.5 w-3.5" />
                          提前提醒天数
                        </Label>
                        <Select
                          value={config.reminder_days_before.toString()}
                          onValueChange={(value) => setConfig({ ...config, reminder_days_before: parseInt(value) })}
                        >
                          <SelectTrigger className="h-8 text-sm">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="0">当天提醒</SelectItem>
                            <SelectItem value="1">提前1天</SelectItem>
                            <SelectItem value="3">提前3天</SelectItem>
                            <SelectItem value="5">提前5天</SelectItem>
                            <SelectItem value="7">提前7天（默认）</SelectItem>
                            <SelectItem value="14">提前14天</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      
                      <div className="space-y-1.5">
                        <Label className="text-xs flex items-center gap-1">
                          <Clock className="h-3.5 w-3.5" />
                          每日发送时间
                        </Label>
                        <div className="flex items-center gap-1">
                          <Select
                            value={config.send_hour.toString()}
                            onValueChange={(value) => setConfig({ ...config, send_hour: parseInt(value) })}
                          >
                            <SelectTrigger className="h-8 text-sm flex-1">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {Array.from({ length: 24 }, (_, i) => (
                                <SelectItem key={i} value={i.toString()}>
                                  {i.toString().padStart(2, '0')}时
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <span className="text-muted-foreground">:</span>
                          <Select
                            value={config.send_minute.toString()}
                            onValueChange={(value) => setConfig({ ...config, send_minute: parseInt(value) })}
                          >
                            <SelectTrigger className="h-8 text-sm flex-1">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="0">00分</SelectItem>
                              <SelectItem value="15">15分</SelectItem>
                              <SelectItem value="30">30分</SelectItem>
                              <SelectItem value="45">45分</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        <p className="text-xs text-muted-foreground">
                          当前设置: 每天 {config.send_hour.toString().padStart(2, '0')}:{config.send_minute.toString().padStart(2, '0')} 发送
                        </p>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                {/* 手动重置维护日期 */}
                <Card>
                  <CardHeader className="py-3">
                    <CardTitle className="text-sm flex items-center gap-2">
                      <RotateCcw className="h-4 w-4" />
                      手动重置维护日期
                    </CardTitle>
                    <CardDescription className="text-xs">
                      将所有月度维护计划重置到指定日期（自动重置会在每月邮件发送后执行）
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="flex items-center gap-3">
                      <Popover open={calendarOpen} onOpenChange={setCalendarOpen}>
                        <PopoverTrigger asChild>
                          <Button variant="outline" className={cn("flex-1 justify-start text-left font-normal h-8 text-sm")}>
                            <Calendar className="mr-2 h-4 w-4" />
                            {format(selectedDate, 'yyyy-MM-dd')}
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-auto p-0 z-[9999]" align="start">
                          <CalendarComponent
                            mode="single"
                            selected={selectedDate}
                            onSelect={(date) => {
                              if (date) {
                                setSelectedDate(date);
                                setCalendarOpen(false);
                              }
                            }}
                            initialFocus
                          />
                        </PopoverContent>
                      </Popover>
                      <Button 
                        onClick={handleResetMaintenanceDates}
                        disabled={resetting}
                        variant="secondary"
                        className="h-8 text-sm"
                      >
                        {resetting ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <RotateCcw className="h-4 w-4 mr-1" />}
                        执行重置
                      </Button>
                    </div>
                  </CardContent>
                </Card>

                {/* 测试邮件 */}
                <Card>
                  <CardHeader className="py-3">
                    <CardTitle className="text-sm flex items-center gap-2">
                      <TestTube className="h-4 w-4" />
                      测试邮件
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <Input
                      type="email"
                      value={testEmail}
                      onChange={(e) => setTestEmail(e.target.value)}
                      placeholder="your-email@example.com"
                      className="h-8 text-sm"
                    />
                    <div className="flex gap-2">
                      <Button variant="outline" onClick={handleTestEmail} disabled={testingEmail} className="flex-1 h-8 text-sm">
                        {testingEmail ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <TestTube className="h-4 w-4 mr-1" />}
                        发送测试邮件
                      </Button>
                      <Button onClick={handleSave} disabled={savingConfig} className="flex-1 h-8 text-sm">
                        {savingConfig ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Save className="h-4 w-4 mr-1" />}
                        保存配置
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              </>
            )}
          </TabsContent>

          {/* 收件人标签页 */}
          <TabsContent value="recipients" className="mt-4">
            <Card>
              <CardHeader className="py-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <Users className="h-4 w-4" />
                    当前收件人列表
                  </CardTitle>
                  <Button variant="ghost" size="sm" onClick={loadRecipients} disabled={loadingRecipients}>
                    <RefreshCw className={cn("h-4 w-4", loadingRecipients && "animate-spin")} />
                  </Button>
                </div>
                <CardDescription className="text-xs">
                  基于维护计划自动汇总的收件人（每人会收到一封合并邮件）
                </CardDescription>
              </CardHeader>
              <CardContent>
                {loadingRecipients ? (
                  <div className="flex items-center justify-center py-8">
                    <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                  </div>
                ) : recipients.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-4">暂无收件人数据</p>
                ) : (
                  <div className="space-y-2 max-h-[300px] overflow-y-auto">
                    {recipients.map((r, i) => (
                      <div key={i} className="flex items-center justify-between py-2 px-3 bg-muted/30 rounded-md">
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">{r.name}</p>
                          <p className="text-xs text-muted-foreground truncate">{r.email}</p>
                        </div>
                        <Badge variant="secondary" className="ml-2">{r.count} 个任务</Badge>
                      </div>
                    ))}
                  </div>
                )}
                <p className="text-xs text-muted-foreground mt-3">
                  * 管理员 (zhifu.feng@brightfuture.com.hk) 会自动收到所有邮件
                </p>
              </CardContent>
            </Card>
          </TabsContent>

          {/* 邮件预览标签页 */}
          <TabsContent value="preview" className="mt-4">
            <Card>
              <CardHeader className="py-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <FileText className="h-4 w-4" />
                    邮件内容预览（与系统模板完全一致）
                  </CardTitle>
                  <Button variant="ghost" size="sm" onClick={loadPreviewData} disabled={loadingPreview}>
                    <RefreshCw className={cn("h-4 w-4", loadingPreview && "animate-spin")} />
                  </Button>
                </div>
                <CardDescription className="text-xs">
                  支持按计划ID、设备ID、负责人、仪器类型搜索，预览真实邮件内容
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  <div className="flex flex-col sm:flex-row gap-2">
                    <div className="w-32">
                      <Label className="text-xs">搜索类型</Label>
                      <Select
                        value={previewSearchType}
                        onValueChange={(v) => setPreviewSearchType(v as any)}
                      >
                        <SelectTrigger className="h-8 text-sm">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="schedule_id">计划ID</SelectItem>
                          <SelectItem value="equipment_id">设备ID</SelectItem>
                          <SelectItem value="responsible">负责人</SelectItem>
                          <SelectItem value="type">仪器类型</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="flex-1">
                      <Label className="text-xs">
                        {previewSearchType === 'schedule_id' && '输入计划ID（如 15888 或 UUID）'}
                        {previewSearchType === 'equipment_id' && '输入设备ID（如 BAL-001）'}
                        {previewSearchType === 'responsible' && '输入负责人姓名或邮箱'}
                        {previewSearchType === 'type' && '输入仪器类型（如 HPLC、天平）'}
                      </Label>
                      <Input
                        value={previewSearchValue}
                        onChange={(e) => setPreviewSearchValue(e.target.value)}
                        placeholder={
                          previewSearchType === 'schedule_id' ? '例如：15888' :
                          previewSearchType === 'equipment_id' ? '例如：BAL-001' :
                          previewSearchType === 'responsible' ? '例如：张三' :
                          '例如：HPLC'
                        }
                        className="h-8 text-sm"
                        onKeyDown={(e) => e.key === 'Enter' && loadPreviewBySearch()}
                      />
                    </div>
                    <div className="flex items-end">
                      <Button
                        onClick={loadPreviewBySearch}
                        disabled={loadingPreview}
                        className="h-8 text-sm"
                      >
                        {loadingPreview ? (
                          <>
                            <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                            加载中
                          </>
                        ) : (
                          <>
                            <Eye className="h-4 w-4 mr-1" />
                            生成预览
                          </>
                        )}
                      </Button>
                    </div>
                  </div>

                  {previewSubject && (
                    <div className="rounded-md border p-3">
                      <p className="text-xs text-muted-foreground">Subject</p>
                      <p className="text-sm font-medium break-all">{previewSubject}</p>
                    </div>
                  )}

                  {previewHtml ? (
                    <div className="rounded-md border overflow-hidden">
                      <iframe
                        title="email-preview"
                        className="w-full h-[520px] bg-background"
                        srcDoc={previewHtml}
                      />
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground text-center py-6">
                      暂无预览内容，请输入计划ID（例如 15888）并点击“生成预览”
                    </p>
                  )}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* 发送逻辑标签页 */}
          <TabsContent value="workflow" className="mt-4 space-y-4">
            {/* 可视化流程图 */}
            <Card>
              <CardHeader className="py-3">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Workflow className="h-4 w-4" />
                  邮件发送可视化流程图
                </CardTitle>
                <CardDescription className="text-xs">
                  系统每天检查一次，但每个任务只发送一次提醒邮件
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="bg-muted/20 rounded-lg p-4 overflow-x-auto">
                  <div className="min-w-[600px]">
                    {/* 流程图 */}
                    <div className="flex flex-col items-center gap-2">
                      {/* 开始 */}
                      <div className="bg-blue-500 text-white px-4 py-2 rounded-full text-sm font-medium">
                        ⏰ 每日 {config.send_hour.toString().padStart(2, '0')}:{config.send_minute.toString().padStart(2, '0')} Cron 触发
                      </div>
                      <div className="w-0.5 h-4 bg-border" />
                      
                      {/* 工作日判断 */}
                      <div className="relative">
                        <div className="bg-amber-100 dark:bg-amber-900/30 border-2 border-amber-500 px-4 py-2 rotate-45 w-32 h-32 flex items-center justify-center">
                          <span className="-rotate-45 text-xs text-center font-medium">
                            {config.workday_only ? '工作日?' : '每天执行'}
                          </span>
                        </div>
                      </div>
                      
                      {config.workday_only && (
                        <div className="flex gap-8 items-start -mt-4">
                          <div className="flex flex-col items-center">
                            <span className="text-xs text-muted-foreground mb-1">否（周末）</span>
                            <div className="w-0.5 h-4 bg-border" />
                            <div className="bg-gray-200 dark:bg-gray-700 px-3 py-1.5 rounded text-xs">
                              跳过（周一补发）
                            </div>
                          </div>
                          <div className="flex flex-col items-center">
                            <span className="text-xs text-muted-foreground mb-1">是</span>
                            <div className="w-0.5 h-4 bg-border" />
                            <div className="bg-purple-100 dark:bg-purple-900/30 border border-purple-500 px-3 py-1.5 rounded text-xs">
                              是周一? +2天窗口
                            </div>
                          </div>
                        </div>
                      )}
                      
                      <div className="w-0.5 h-4 bg-border" />
                      
                      {/* 查询任务 */}
                      <div className="bg-slate-100 dark:bg-slate-800 border border-slate-300 dark:border-slate-600 px-4 py-2 rounded text-sm">
                        📋 查询 reminder_sent=false 且到期日 ≤ {config.reminder_days_before} 天的任务
                      </div>
                      <div className="w-0.5 h-4 bg-border" />
                      
                      {/* 有任务判断 */}
                      <div className="relative">
                        <div className="bg-amber-100 dark:bg-amber-900/30 border-2 border-amber-500 px-3 py-1.5 rotate-45 w-24 h-24 flex items-center justify-center">
                          <span className="-rotate-45 text-xs text-center font-medium">有任务?</span>
                        </div>
                      </div>
                      
                      <div className="flex gap-12 items-start -mt-2">
                        <div className="flex flex-col items-center">
                          <span className="text-xs text-muted-foreground mb-1">否</span>
                          <div className="w-0.5 h-4 bg-border" />
                          <div className="bg-gray-200 dark:bg-gray-700 px-3 py-1.5 rounded text-xs">结束</div>
                        </div>
                        <div className="flex flex-col items-center">
                          <span className="text-xs text-muted-foreground mb-1">是</span>
                          <div className="w-0.5 h-4 bg-border" />
                          <div className="bg-indigo-100 dark:bg-indigo-900/30 border border-indigo-500 px-3 py-1.5 rounded text-xs">
                            {config.consolidate_emails ? '按收件人分组' : '逐个处理'}
                          </div>
                        </div>
                      </div>
                      
                      <div className="w-0.5 h-4 bg-border" />
                      
                      {/* 发送邮件 */}
                      <div className="bg-green-100 dark:bg-green-900/30 border border-green-500 px-4 py-2 rounded text-sm">
                        ✉️ {config.consolidate_emails ? '每人一封合并邮件' : '每任务一封邮件'}
                      </div>
                      <div className="w-0.5 h-4 bg-border" />
                      
                      {/* 更新状态 */}
                      <div className="bg-slate-100 dark:bg-slate-800 border border-slate-300 dark:border-slate-600 px-4 py-2 rounded text-sm">
                        ✅ 更新 reminder_sent = true
                      </div>
                      <div className="w-0.5 h-4 bg-border" />
                      
                      {/* 月度重置 */}
                      <div className="bg-orange-100 dark:bg-orange-900/30 border border-orange-500 px-4 py-2 rounded text-sm">
                        🔄 月度计划自动重置到下月最后一天
                      </div>
                      <div className="w-0.5 h-4 bg-border" />
                      
                      {/* 结束 */}
                      <div className="bg-gray-500 text-white px-4 py-2 rounded-full text-sm font-medium">
                        结束
                      </div>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* 设置关联说明 */}
            <Card>
              <CardHeader className="py-3">
                <CardTitle className="text-sm">⚙️ 设置与后端关联说明</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2 text-xs">
                  <div className="flex items-center gap-2 p-2 bg-green-50 dark:bg-green-950 rounded">
                    <Badge variant="outline" className="bg-green-100 text-green-700 border-green-300">✓ 已关联</Badge>
                    <span><strong>仅工作日发送</strong> - 后端读取 workday_only 字段</span>
                  </div>
                  <div className="flex items-center gap-2 p-2 bg-green-50 dark:bg-green-950 rounded">
                    <Badge variant="outline" className="bg-green-100 text-green-700 border-green-300">✓ 已关联</Badge>
                    <span><strong>合并邮件</strong> - 后端读取 consolidate_emails 字段</span>
                  </div>
                  <div className="flex items-center gap-2 p-2 bg-green-50 dark:bg-green-950 rounded">
                    <Badge variant="outline" className="bg-green-100 text-green-700 border-green-300">✓ 已关联</Badge>
                    <span><strong>提前提醒天数</strong> - 后端读取 reminder_days_before 字段</span>
                  </div>
                  <div className="flex items-center gap-2 p-2 bg-amber-50 dark:bg-amber-950 rounded">
                    <Badge variant="outline" className="bg-amber-100 text-amber-700 border-amber-300">⚠ 需手动</Badge>
                    <span><strong>发送时间</strong> - 已保存到数据库，但 Cron 定时任务需在 Supabase 控制台手动更新</span>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* 重置端口说明 */}
            <Card>
              <CardHeader className="py-3">
                <CardTitle className="text-sm">🔄 重置端口说明</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 gap-3 text-xs">
                  <div className="bg-blue-50 dark:bg-blue-950 p-3 rounded-md">
                    <p className="font-medium text-blue-700 dark:text-blue-300">自动重置</p>
                    <p className="text-muted-foreground mt-1">邮件发送后系统自动将月度计划重置到下月最后一天，并将 reminder_sent 重置为 false</p>
                  </div>
                  <div className="bg-orange-50 dark:bg-orange-950 p-3 rounded-md">
                    <p className="font-medium text-orange-700 dark:text-orange-300">手动重置</p>
                    <p className="text-muted-foreground mt-1">在"邮件配置"标签页可手动选择日期批量重置所有月度维护计划</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* 关键说明 */}
            <Card className="border-primary/50">
              <CardHeader className="py-3">
                <CardTitle className="text-sm text-primary">💡 核心逻辑说明</CardTitle>
              </CardHeader>
              <CardContent className="text-xs space-y-2">
                <p><strong>Q: 每天发送还是每月发送？</strong></p>
                <p className="text-muted-foreground">
                  系统<strong>每天</strong>运行检查，但每个维护任务只会发送<strong>一次</strong>提醒邮件。
                  通过 <code className="bg-muted px-1 rounded">reminder_sent</code> 标志控制，发送后标记为 true，避免重复。
                </p>
                <Separator className="my-2" />
                <p><strong>Q: 什么是"合并邮件"？</strong></p>
                <p className="text-muted-foreground">
                  如果某人负责多个设备，开启后只收<strong>一封</strong>包含所有待处理任务的汇总邮件，而不是每个任务一封。
                </p>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
