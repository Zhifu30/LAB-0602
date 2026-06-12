import React, { useState, useEffect, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Calendar, Wrench, AlertTriangle, Clock, RefreshCw, Layers, Search, SlidersHorizontal } from 'lucide-react';
import { toast } from 'sonner';
import MaintenanceTemplateCard from '@/components/shared/MaintenanceTemplateCard';
import MaintenanceCalendarView from './MaintenanceCalendarView';
import { getMaintenanceStats, groupMaintenanceSchedules, ResolvedSchedule } from '@/utils/maintenanceUtils';
import { getDaysUntilDue } from '@/utils/maintenanceDateUtils';

export default function MaintenanceDashboard() {
  const [loading, setLoading] = useState(true);
  const [schedules, setSchedules] = useState<ResolvedSchedule[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [activeTab, setActiveTab] = useState('board');
  const [collapsedTypes, setCollapsedTypes] = useState<Set<string>>(new Set());

  useEffect(() => { loadData(); }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const { data } = await supabase.from('resolved_maintenance_schedules').select('*');
      setSchedules((data || []) as ResolvedSchedule[]);
    } catch {
      toast.error('请先在 Supabase 运行迁移创建 resolved_maintenance_schedules 视图');
      setSchedules([]);
    } finally { setLoading(false); }
  };

  const stats = useMemo(() => getMaintenanceStats(schedules), [schedules]);
  const groups = useMemo(() => {
    const filtered = searchTerm
      ? schedules.filter(s =>
          s.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
          (s.equipment?.name || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
          (s.assigned_name || '').toLowerCase().includes(searchTerm.toLowerCase()))
      : schedules;
    return Array.from(groupMaintenanceSchedules(filtered).entries());
  }, [schedules, searchTerm]);

  const toggleCollapse = (t: string) => {
    setCollapsedTypes(prev => { const next = new Set(prev); next.has(t) ? next.delete(t) : next.add(t); return next; });
  };

  return (
    <div className="space-y-5 p-4 max-w-[1600px] mx-auto">
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        {[
          { label: '全部计划', val: stats.total, icon: Wrench, color: 'primary' },
          { label: '超期', val: stats.overdue, icon: AlertTriangle, color: 'destructive' },
          { label: '今日到期', val: stats.today, icon: Clock, color: 'amber' },
          { label: '即将到期', val: stats.upcoming, icon: Calendar, color: 'primary' },
        ].map(({ label, val, icon: Icon, color }) => (
          <Card key={label} className={`border rounded-xl ${color === 'destructive' ? 'border-destructive/30' : ''}`}>
            <CardContent className="p-4 flex items-center justify-between">
              <div><span className="text-xs text-muted-foreground">{label}</span>
                <h3 className={`text-2xl font-bold ${color === 'destructive' ? 'text-destructive' : color === 'amber' ? 'text-amber-600' : ''}`}>{val}</h3></div>
              <div className={`p-3 rounded-xl ${color === 'destructive' ? 'bg-destructive/10 text-destructive' : color === 'amber' ? 'bg-amber-500/10 text-amber-600' : 'bg-primary/10 text-primary'}`}><Icon className="h-5 w-5" /></div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="flex items-center justify-between gap-3 border-b pb-3">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input placeholder="搜索设备/任务/负责人..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} className="pl-9 h-9 text-xs rounded-lg" />
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={loadData} disabled={loading} className="h-9 text-xs">
            <RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${loading ? 'animate-spin' : ''}`} />刷新
          </Button>
          <Tabs value={activeTab} onValueChange={setActiveTab} className="w-[180px]">
            <TabsList className="grid w-full grid-cols-2 h-9 rounded-lg">
              <TabsTrigger value="board" className="text-xs rounded-md">类型看板</TabsTrigger>
              <TabsTrigger value="calendar" className="text-xs rounded-md">日历</TabsTrigger>
            </TabsList>
          </Tabs>
        </div>
      </div>

      {loading ? (
        <div className="py-20 text-center text-xs text-muted-foreground">
          <RefreshCw className="h-5 w-5 animate-spin mx-auto mb-2 text-primary" />加载中...
        </div>
      ) : activeTab === 'calendar' ? (
        <div className="border rounded-xl p-2 bg-card shadow-sm"><MaintenanceCalendarView /></div>
      ) : groups.length === 0 ? (
        <div className="py-16 text-center border border-dashed rounded-xl bg-accent/20 text-muted-foreground text-xs">
          <Layers className="h-6 w-6 mx-auto mb-2 opacity-50" />未检索到维护计划
        </div>
      ) : (
        <div className="space-y-3.5">
          {groups.map(([typeName, items]) => (
            <Card key={typeName} className="border rounded-xl overflow-hidden">
              <div className="flex items-center justify-between p-3 bg-muted/30 border-b">
                <div className="flex items-center gap-2">
                  <h3 className="text-xs font-bold">{typeName}</h3>
                  <Badge variant="secondary" className="text-[10px] px-1.5">{items.length} 个实例</Badge>
                </div>
                <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => toggleCollapse(typeName)}>
                  <SlidersHorizontal className="h-3.5 w-3.5" />
                </Button>
              </div>
              {!collapsedTypes.has(typeName) && (
                <CardContent className="p-3">
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
                    {items.map(s => {
                      const days = getDaysUntilDue(s.next_due_date);
                      return <MaintenanceTemplateCard key={s.id} mode="dashboard"
                        schedule={{ ...s, display: { color: days < 0 ? '#ef4444' : days === 0 ? '#f97316' : days <= 7 ? '#f59e0b' : '#22c55e', icon: days < 0 ? 'alert-triangle' : 'wrench' } }} />;
                    })}
                  </div>
                </CardContent>
              )}
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
