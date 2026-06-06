import React, { useState, useEffect, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Activity, Users, AlertTriangle, Clock, Calendar, Search, X, RefreshCw } from 'lucide-react';
import { isPast, isToday, differenceInDays } from 'date-fns';
import { toast } from 'sonner';
import { IconContainer } from '@/components/ui/icon-container';
import { cn } from '@/lib/utils';
import CalibrationCard from '@/components/CalibrationCard';
import EquipmentDetailModal from '@/components/EquipmentDetailModal';
import { Equipment } from '@/types/equipment';

interface CalRow { id: string; name: string; model: string | null; manufacturer: string | null; location: string | null; responsible: string | null; responsible_email: string | null; type: string | null; next_calibration_date: string; image_url: string | null; status: string; }

export default function CalibrationDashboard() {
  const [data, setData] = useState<CalRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<Equipment | null>(null);
  const [showDetail, setShowDetail] = useState(false);

  const fetchData = async () => {
    setLoading(true);
    const { data: eqs, error } = await supabase
      .from('equipment').select('id,name,model,manufacturer,location,responsible,responsible_email,type,next_calibration_date,image_url,status')
      .not('next_calibration_date', 'is', null).order('next_calibration_date', { ascending: true });
    if (error) { toast.error('加载校正数据失败'); } else { setData((eqs || []).filter((eq: any) => eq.is_scrapped !== true && eq.status !== 'scrapped')); }
    setLoading(false);
  };

  useEffect(() => { fetchData(); }, []);

  const filtered = useMemo(() => {
    if (!search.trim()) return data;
    const q = search.toLowerCase();
    return data.filter(d => d.name.toLowerCase().includes(q) || d.id.toLowerCase().includes(q) || (d.model||'').toLowerCase().includes(q) || (d.responsible||'').toLowerCase().includes(q));
  }, [data, search]);

  const now = new Date();
  const overdue = data.filter(d => isPast(new Date(d.next_calibration_date)) && !isToday(new Date(d.next_calibration_date))).length;
  const today = data.filter(d => isToday(new Date(d.next_calibration_date))).length;
  const soon = data.filter(d => { const dy = differenceInDays(new Date(d.next_calibration_date), now); return dy > 0 && dy <= 30; }).length;
  const resp = new Set(data.map(d => d.responsible).filter(Boolean)).size;

  const onCardClick = async (row: CalRow) => {
    const { data: full } = await supabase.from('equipment').select('*').eq('id', row.id).single();
    if (full) {
      setSelected({ id: full.id, name: full.name, model: full.model, manufacturer: full.manufacturer, status: full.status, location: full.location, maintenanceDate: full.maintenance_date||'', description: full.notes||'', nextCalibrationDate: full.next_calibration_date, responsible: full.responsible, notes: full.notes, imageUrl: full.image_url, sopFileUrl: full.sop_file_url, responsible_email: full.responsible_email, type: full.type } as Equipment);
      setShowDetail(true);
    }
  };

  const onUpdate = async (e: Equipment) => {
    const updateData: Record<string, any> = { name: e.name, model: e.model, manufacturer: e.manufacturer, status: e.status, location: e.location, maintenance_date: e.maintenanceDate, next_calibration_date: e.nextCalibrationDate, responsible: e.responsible, notes: e.notes, image_url: e.imageUrl, sop_file_url: e.sopFileUrl, responsible_email: e.responsible_email };
    if ((e as any).type !== undefined) updateData.type = (e as any).type;
    await supabase.from('equipment').update(updateData).eq('id', e.id);
    setShowDetail(false); fetchData();
  };

  const onDelete = async (id: string) => {
    await supabase.from('equipment').delete().eq('id', id);
    setShowDetail(false); fetchData();
  };

  if (loading) return <Card><CardContent className="p-6 flex justify-center"><RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" /></CardContent></Card>;

  return (
    <div className="p-4 space-y-4">
      <div className="flex items-center gap-3"><IconContainer variant="amber" size="lg"><Activity /></IconContainer><div><h1 className="text-xl font-semibold">校正管理</h1><p className="text-xs text-muted-foreground">跟踪仪器校正日期与状态</p></div></div>

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
        <Card className="relative overflow-hidden shadow-sm min-h-[130px] bg-gradient-to-br from-white via-amber-50/30 to-amber-100/50">
          <div className="absolute -top-10 -right-10 w-36 h-36 rounded-full bg-gradient-to-br from-amber-200/60 to-amber-300/40 blur-sm" /><div className="absolute -top-4 -right-4 w-28 h-28 rounded-full bg-amber-100/70" />
          <div className="absolute top-4 right-4 w-14 h-14 rounded-full bg-gradient-to-br from-amber-400 to-amber-600 flex items-center justify-center shadow-lg shadow-amber-500/30"><Activity className="h-7 w-7 text-white" strokeWidth={1.5} /></div>
          <CardContent className="p-4 pt-5"><p className="text-sm text-muted-foreground mb-1">校正总数</p><p className="text-3xl font-bold text-amber-600">{data.length}</p><p className="text-xs text-amber-500 mt-2">↗ 需校正设备</p></CardContent>
        </Card>
        <Card className="relative overflow-hidden shadow-sm min-h-[130px] bg-gradient-to-br from-white via-teal-50/30 to-teal-100/50">
          <div className="absolute -top-10 -right-10 w-36 h-36 rounded-full bg-gradient-to-br from-teal-200/60 to-teal-300/40 blur-sm" /><div className="absolute -top-4 -right-4 w-28 h-28 rounded-full bg-teal-100/70" />
          <div className="absolute top-4 right-4 w-14 h-14 rounded-full bg-gradient-to-br from-teal-400 to-teal-600 flex items-center justify-center shadow-lg shadow-teal-500/30"><Users className="h-7 w-7 text-white" strokeWidth={1.5} /></div>
          <CardContent className="p-4 pt-5"><p className="text-sm text-muted-foreground mb-1">负责人</p><p className="text-3xl font-bold text-teal-600">{resp}</p><p className="text-xs text-teal-500 mt-2">位负责人</p></CardContent>
        </Card>
        <Card className={cn("relative overflow-hidden shadow-sm min-h-[130px]", overdue > 0 ? "border-red-200 bg-gradient-to-br from-white via-red-50/40 to-red-100/60" : "bg-gradient-to-br from-white via-gray-50/30 to-gray-100/50")}>
          <div className="absolute top-4 right-4 w-14 h-14 rounded-full flex items-center justify-center shadow-lg shadow-red-500/30" style={{ background: overdue > 0 ? 'linear-gradient(135deg, #ef4444, #dc2626)' : 'linear-gradient(135deg, #d1d5db, #9ca3af)' }}><AlertTriangle className="h-7 w-7 text-white" strokeWidth={1.5} /></div>
          <CardContent className="p-4 pt-5"><p className="text-sm text-muted-foreground mb-1">已过期</p><p className={cn("text-3xl font-bold", overdue > 0 && "text-red-500")}>{overdue}</p><p className="text-xs mt-2">{overdue > 0 ? '⚠ 需要处理' : '✓ 无过期'}</p></CardContent>
        </Card>
        <Card className={cn("relative overflow-hidden shadow-sm min-h-[130px]", today > 0 ? "border-orange-200 bg-gradient-to-br from-white via-orange-50/40 to-orange-100/60" : "bg-gradient-to-br from-white via-gray-50/30 to-gray-100/50")}>
          <div className="absolute top-4 right-4 w-14 h-14 rounded-full flex items-center justify-center shadow-lg shadow-orange-500/30" style={{ background: today > 0 ? 'linear-gradient(135deg, #f97316, #ea580c)' : 'linear-gradient(135deg, #d1d5db, #9ca3af)' }}><Clock className="h-7 w-7 text-white" strokeWidth={1.5} /></div>
          <CardContent className="p-4 pt-5"><p className="text-sm text-muted-foreground mb-1">今日到期</p><p className={cn("text-3xl font-bold", today > 0 && "text-orange-500")}>{today}</p><p className="text-xs mt-2">{today > 0 ? '⏰ 请及时处理' : '✓ 暂无'}</p></CardContent>
        </Card>
        <Card className={cn("relative overflow-hidden shadow-sm min-h-[130px]", soon > 0 ? "border-yellow-200 bg-gradient-to-br from-white via-yellow-50/40 to-yellow-100/60" : "bg-gradient-to-br from-white via-gray-50/30 to-gray-100/50")}>
          <div className="absolute top-4 right-4 w-14 h-14 rounded-full flex items-center justify-center shadow-lg shadow-yellow-500/30" style={{ background: soon > 0 ? 'linear-gradient(135deg, #eab308, #ca8a04)' : 'linear-gradient(135deg, #d1d5db, #9ca3af)' }}><Calendar className="h-7 w-7 text-white" strokeWidth={1.5} /></div>
          <CardContent className="p-4 pt-5"><p className="text-sm text-muted-foreground mb-1">30天内到期</p><p className={cn("text-3xl font-bold", soon > 0 && "text-yellow-600")}>{soon}</p><p className="text-xs mt-2">{soon > 0 ? '📅 计划中' : '✓ 近期无忧'}</p></CardContent>
        </Card>
      </div>

      <div className="relative"><Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" /><Input placeholder="搜索名称/ID/型号/负责人..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9 pr-9 h-9" />{search && <Button variant="ghost" size="sm" className="absolute right-1 top-1/2 -translate-y-1/2 h-7 w-7 p-0" onClick={() => setSearch('')}><X className="h-4 w-4" /></Button>}</div>

      {filtered.length === 0 ? <Card><CardContent className="p-6 text-center text-muted-foreground">暂无校正数据，请在设备详情中设置下次校正日期</CardContent></Card>
        : <div className="grid gap-6" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))' }}>{filtered.map(eq => <CalibrationCard key={eq.id} equipment={eq} onClick={() => onCardClick(eq)} />)}</div>}

      {showDetail && selected && <EquipmentDetailModal equipment={selected} onClose={() => { setShowDetail(false); setSelected(null); }} onUpdate={onUpdate} onDelete={onDelete} />}
    </div>
  );
}
