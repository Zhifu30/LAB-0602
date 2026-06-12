/**
 * 设备类型维护计划管理面板 v5
 *
 * 对标 TypeImagePanel——模板 CRUD + 同步 + 设备计数 + 自检。
 * 数据来源：equipment_templates.maintenance_plans JSONB。
 */

import React, { useState, useEffect, useCallback } from 'react';
import { Plus, RefreshCw, Wrench } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { toast } from 'sonner';
import {
  MaintenancePlan, getTypeMaintenancePlans, saveOrUpdateTypePlanRPC, deleteTypeMaintenancePlan,
  syncPlanInstances,
} from '@/utils/maintenanceUtils';
import MaintenanceScheduleFormDialog from '@/components/shared/MaintenanceScheduleFormDialog';
import MaintenanceTemplateCard from '@/components/shared/MaintenanceTemplateCard';
import { DEFAULT_ACTION_REGISTRY } from '@/utils/maintenanceActionRegistry';

interface TypeMaintenancePlanPanelProps {
  selectedType: string | null;
  onRefresh?: () => void;
}

const frequencyLabels: Record<string, string> = {
  daily: '每日', weekly: '每周', monthly: '每月', quarterly: '每季度', yearly: '每年'
};

export const TypeMaintenancePlanPanel: React.FC<TypeMaintenancePlanPanelProps> = ({ selectedType, onRefresh }) => {
  const [plans, setPlans] = useState<MaintenancePlan[]>([]);
  const [loading, setLoading] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingPlan, setEditingPlan] = useState<MaintenancePlan | null>(null);
  const [syncCounts, setSyncCounts] = useState<Record<string, number>>({});

  useEffect(() => { loadPlans(); }, [selectedType]);

  const loadPlans = async () => {
    if (!selectedType) { setPlans([]); return; }
    setLoading(true);
    const data = await getTypeMaintenancePlans(selectedType);
    setPlans(data);
    // 每个模板的关联设备数
    const counts: Record<string, number> = {};
    for (const p of data) {
      const { count } = await getPlanDeviceCount(p.key);
      counts[p.key] = count;
    }
    setSyncCounts(counts);
    setLoading(false);
  };

  const getPlanDeviceCount = async (key: string) => {
    const { count } = await import('@/integrations/supabase/client').then(m =>
      m.supabase.from('maintenance_schedules').select('*', { count: 'exact', head: true })
        .eq('template_key', key).eq('is_active', true));
    return { count: count ?? 0 };
  };

  const handleOpenAdd = () => { setEditingPlan(null); setDialogOpen(true); };
  const handleOpenEdit = (p: MaintenancePlan) => { setEditingPlan(p); setDialogOpen(true); };

  const handleSubmit = async (formData: any) => {
    if (!selectedType) return;
    const ok = await saveOrUpdateTypePlanRPC(selectedType, {
      title: formData.title, description: formData.description || '',
      frequency: formData.frequency, reminder_days_before: Number(formData.reminder_days_before || 7),
      ...(editingPlan?.key ? { key: editingPlan.key } : {}),
    });
    if (ok) { setDialogOpen(false); loadPlans(); onRefresh?.(); }
  };

  const handleDelete = async (key: string) => {
    if (!selectedType || !window.confirm('删除此模板将同步撤销该类型下所有设备的此维护计划，是否继续？')) return;
    await deleteTypeMaintenancePlan(selectedType, key);
    loadPlans(); onRefresh?.();
  };

  const handleSync = async (key?: string) => {
    if (!selectedType) return;
    await syncPlanInstances(selectedType, key);
    loadPlans(); onRefresh?.();
    toast.success('已同步模板到设备实例');
  };

  if (!selectedType) {
    return (
      <div className="h-full flex flex-col items-center justify-center border border-dashed rounded-xl p-6 text-muted-foreground text-xs bg-muted/10">
        <Wrench className="h-8 w-8 mb-2 text-muted-foreground/60" />
        请在左侧选择一个设备类型
      </div>
    );
  }

  return (
    <Card className="h-full flex flex-col border rounded-xl overflow-hidden bg-card text-card-foreground">
      <CardHeader className="py-3 px-4 bg-muted/20 border-b flex flex-row items-center justify-between">
        <div>
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <div className="p-1 bg-primary/10 text-primary rounded"><Wrench className="h-3.5 w-3.5" /></div>
            [{selectedType}] 维护计划
          </CardTitle>
          <CardDescription className="text-[11px] text-muted-foreground mt-0.5">
            模板将自动应用到所有该类型设备
          </CardDescription>
        </div>
        <div className="flex items-center gap-1">
          <Button size="sm" variant="outline" className="h-7 text-xs"
            onClick={() => handleSync()} title="同步所有模板到设备">
            <RefreshCw className="h-3.5 w-3.5 mr-1" />同步
          </Button>
          <Button size="sm" onClick={handleOpenAdd} className="h-7 text-xs px-2.5">
            <Plus className="h-3.5 w-3.5 mr-1" />添加
          </Button>
        </div>
      </CardHeader>

      <CardContent className="flex-1 p-3 overflow-hidden">
        {loading ? (
          <div className="h-full flex items-center justify-center text-xs text-muted-foreground gap-1.5">
            <RefreshCw className="h-3.5 w-3.5 animate-spin text-primary" />加载中...
          </div>
        ) : plans.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center border border-dashed rounded-lg p-6 text-center bg-accent/20">
            <span className="text-xs text-muted-foreground">尚无维护计划模板</span>
            <Button variant="link" size="sm" onClick={handleOpenAdd} className="text-xs text-primary font-medium mt-1 p-0 h-auto">
              创建首个模板
            </Button>
          </div>
        ) : (
          <ScrollArea className="h-full pr-1">
            <div className="space-y-2.5">
              {plans.map((plan) => (
                <MaintenanceTemplateCard
                  key={plan.key}
                  mode="template-panel"
                  schedule={{
                    title: plan.title, description: plan.description,
                    frequency: plan.frequency, reminder_days_before: plan.reminder_days_before,
                    display: plan.display, actions: plan.actions,
                  }}
                  enabledActions={[
                    { key: 'edit', def: DEFAULT_ACTION_REGISTRY.edit, onClick: () => handleOpenEdit(plan) },
                    { key: 'sync', def: DEFAULT_ACTION_REGISTRY.sync, onClick: () => handleSync(plan.key) },
                    { key: 'delete', def: DEFAULT_ACTION_REGISTRY.delete, onClick: () => handleDelete(plan.key) },
                  ]}
                />
              ))}
            </div>
          </ScrollArea>
        )}
      </CardContent>

      <MaintenanceScheduleFormDialog
        open={dialogOpen} onOpenChange={setDialogOpen}
        title={editingPlan ? '编辑模板' : '添加模板'}
        users={[]} showAssignee={false}
        initialData={editingPlan ? {
          title: editingPlan.title, description: editingPlan.description,
          frequency: editingPlan.frequency, reminder_days_before: editingPlan.reminder_days_before,
          next_due_date: new Date().toISOString().split('T')[0],
        } : undefined}
        onSubmit={handleSubmit}
        submitLabel={editingPlan ? '确认修改并同步' : '确认生成模板'}
      />
    </Card>
  );
};

export default TypeMaintenancePlanPanel;
