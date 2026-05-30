import { useState, useEffect } from 'react';
import { Mail, Save, TestTube, Loader2, Clock, Calendar } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface EmailConfigModalProps {
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
}

export function EmailConfigModal({ open, onOpenChange }: EmailConfigModalProps) {
  const [loadingConfig, setLoadingConfig] = useState(false);
  const [savingConfig, setSavingConfig] = useState(false);
  const [testingEmail, setTestingEmail] = useState(false);
  const [testEmail, setTestEmail] = useState('');
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
  });

  useEffect(() => {
    if (open) {
      loadConfig();
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

      if (error) {
        if (error.code === 'PGRST116') {
          console.log('No email config found, using defaults');
          return;
        }
        throw error;
      }

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
        });
        setTestEmail(data.from_email || '');
      }
    } catch (error: any) {
      console.error('Load email config error:', error);
    } finally {
      setLoadingConfig(false);
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
        body: {
          ...config,
          test_email: testEmail,
        },
      });

      if (error) throw error;
      toast.success(`测试邮件已发送到 ${testEmail}`);
    } catch (error: any) {
      console.error('Test email error:', error);
      toast.error(error.message || '发送测试邮件时发生错误');
    } finally {
      setTestingEmail(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Mail className="h-5 w-5" />
            邮件配置
          </DialogTitle>
          <DialogDescription>
            配置SMTP服务器和邮件发送规则
          </DialogDescription>
        </DialogHeader>

        {loadingConfig ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            <span className="ml-2 text-muted-foreground">加载配置中...</span>
          </div>
        ) : (
          <div className="space-y-4 py-4">
            {/* SMTP配置 */}
            <div className="space-y-3">
              <h4 className="text-sm font-medium flex items-center gap-2">
                <Mail className="h-4 w-4" />
                SMTP 服务器设置
              </h4>
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
            </div>

            <Separator />

            {/* 发送规则设置 */}
            <div className="space-y-3">
              <h4 className="text-sm font-medium flex items-center gap-2">
                <Clock className="h-4 w-4" />
                发送规则设置
              </h4>
              
              <div className="flex items-center justify-between py-2 px-3 bg-muted/50 rounded-md">
                <div className="space-y-0.5">
                  <Label className="text-sm">仅工作日发送</Label>
                  <p className="text-xs text-muted-foreground">周六日不发送提醒邮件</p>
                </div>
                <Switch
                  checked={config.workday_only}
                  onCheckedChange={(checked) => setConfig({ ...config, workday_only: checked })}
                />
              </div>

              <div className="flex items-center justify-between py-2 px-3 bg-muted/50 rounded-md">
                <div className="space-y-0.5">
                  <Label className="text-sm">合并邮件</Label>
                  <p className="text-xs text-muted-foreground">每人只收一封汇总邮件</p>
                </div>
                <Switch
                  checked={config.consolidate_emails}
                  onCheckedChange={(checked) => setConfig({ ...config, consolidate_emails: checked })}
                />
              </div>

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
                  <SelectContent className="bg-background border shadow-lg z-50">
                    <SelectItem value="0">当天提醒</SelectItem>
                    <SelectItem value="1">提前1天</SelectItem>
                    <SelectItem value="3">提前3天</SelectItem>
                    <SelectItem value="5">提前5天</SelectItem>
                    <SelectItem value="7">提前7天（默认）</SelectItem>
                    <SelectItem value="14">提前14天</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  在维护到期前多少天发送提醒邮件
                </p>
              </div>
            </div>

            <Separator />

            {/* 测试邮件 */}
            <div className="space-y-2">
              <Label htmlFor="test_email" className="text-xs">测试邮件接收地址</Label>
              <Input
                id="test_email"
                type="email"
                value={testEmail}
                onChange={(e) => setTestEmail(e.target.value)}
                placeholder="your-email@example.com"
                className="h-8 text-sm"
              />
            </div>

            <div className="flex gap-2">
              <Button
                variant="outline"
                onClick={handleTestEmail}
                disabled={testingEmail}
                className="flex-1 h-8 text-sm"
              >
                {testingEmail ? (
                  <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                ) : (
                  <TestTube className="h-4 w-4 mr-1" />
                )}
                发送测试邮件
              </Button>
              <Button onClick={handleSave} disabled={savingConfig} className="flex-1 h-8 text-sm">
                {savingConfig ? (
                  <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                ) : (
                  <Save className="h-4 w-4 mr-1" />
                )}
                保存配置
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
