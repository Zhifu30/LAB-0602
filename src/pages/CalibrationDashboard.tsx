import React, { useState, useEffect, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Calendar, Clock, User, AlertTriangle, CheckCircle, RefreshCw, Search, X, Activity, Users } from 'lucide-react';
import { differenceInDays, isPast, isToday } from 'date-fns';
import { toast } from 'sonner';
import CalibrationCard from '@/components/CalibrationCard';
import EquipmentDetailModal from '@/components/EquipmentDetailModal';
import { Equipment } from '@/types/equipment';
import { IconContainer } from '@/components/ui/icon-container';
import { cn } from '@/lib/utils';

interface CalibrationRow {
  id: string;
  name: string;
  model: string | null;
  manufacturer: string | null;
  location: string | null;
  responsible: string | null;
  responsible_email: string | null;
  type: string | null;
  next_calibration_date: string;
  image_url: string | null;
  status: string;
}

export default function CalibrationDashboard() {
  const [data, setData] = useState<CalibrationRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [selectedEquipment, setSelectedEquipment] = useState<Equipment | null>(null);
  const [showDetail, setShowDetail] = useState(false);

  const fetchData = async () => {
    setLoading(true);
    try {
      const { data: eqs, error } = await supabase
        .from('equipment')
        .select('id, name, model, manufacturer, location, responsible, responsible_email, type, next_calibration_date, image_url, status')
        .not('next_calibration_date', 'is', null)
        .neq('is_scrapped', true)
        .order('next_calibration_date', { ascending: true });

      if (error) throw error;
      setData(eqs || []);
    } catch (e: any) {
      toast.error('加载校正数据失败');
    } finally { setLoading(false); }
  };

  useEffect(() => { fetchData(); }, []);

  const filtered = useMemo(() => {
    if (!search.trim()) return data;
    const q = search.toLowerCase();
    return data.filter(d =>
      d.name.toLowerCase().includes(q) || d.id.toLowerCase().includes(q) ||
      (d.model && d.model.toLowerCase().includes(q)) ||
      (d.responsible && d.responsible.toLowerCase().includes(q))
    );
  }, [data, search]);

  const getStats = () => {
    const overdue = data.filter(d => isPast(new Date(d.next_calibration_date)) && !isToday(new Date(d.next_calibration_date))).length;
    const today = data.filter(d => isToday(new Date(d.next_calibration_date))).length;
    const soon = data.filter(d => {
      const days = differenceInDays(new Date(d.next_calibration_date), new Date());
      return days > 0 && days <= 30;
    }).length;
    return { overdue, today, soon, total: data.length };
  };

  const stats = getStats();
  const uniqueResponsible = new Set(data.map(d => d.responsible).filter(Boolean)).size;

  const handleCardClick = async (row: CalibrationRow) => {
    const { data: full } = await supabase.from('equipment').select('*').eq('id', row.id).single();
    if (full) {
      setSelectedEquipment({
        id: full.id, name: full.name, model: full.model, manufacturer: full.manufacturer,
        status: full.status, location: full.location, maintenanceDate: full.maintenance_date || '',
        description: full.notes || '', nextCalibrationDate: full.next_calibration_date,
        responsible: full.responsible, notes: full.notes, imageUrl: full.image_url,
        sopFileUrl: full.sop_file_url, responsible_email: full.responsible_email,
        type: full.type,
      } as Equipment);
      setShowDetail(true);
    }
  };

  if (loading) {
    return <Card><CardContent className="p-6 flex justify-center"><RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" /></CardContent></Card>;
  }

  return (
    <div className="p-4 space-y-4">
      <div className="flex items-center gap-3">
        <IconContainer variant="amber" size="lg"><Activity /></IconContainer>
        <div><h1 className="text-xl font-semibold">校正管理</h1><p className="text-xs text-muted-foreground">跟踪设备校正日期与状态</p></div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
        <Card className="relative overflow-hidden shadow-sm min-h-[130px] bg-gradient-to-br from-white via-amber-50/30 to-amber-100/50">
          <div className="absolute -top-10 -right-10 w-36 h-36 rounded-full bg-gradient-to-br from-amber-200/60 to-amber-300/40 blur-sm" />
          <div className="absolute top-4 right-4 w-14 h-14 rounded-full bg-gradient-to-br from-amber-400 to-amber-600 flex items-center justify-center shadow-lg shadow-amber-500/30">
            <Activity className="h-7 w-7 text-white" strokeWidth={1.5} />
          </div>
          <CardContent className="p-4 pt-5"><p className="text-sm text-muted-foreground mb-1">校正总数</p><p className="text-3xl font-bold">{stats.total}</p><p className="text-xs text-amber-500 mt-2">需校正设备</p></CardContent>
        </Card>
        <Card className="relative overflow-hidden shadow-sm min-h-[130px] bg-gradient-to-br from-white via-teal-50/30 to-teal-100/50">
          <div className="absolute -top-10 -right-10 w-36 h-36 rounded-full bg-gradient-to-br from-teal-200/60 to-teal-300/40 blur-sm" />
          <div className="absolute top-4 right-4 w-14 h-14 rounded-full bg-gradient-to-br from-teal-400 to-teal-600 flex items-center justify-center shadow-lg shadow-teal-500/30">
            <Users className="h-7 w-7 text-white" strokeWidth={1.5} />
          </div>
          <CardContent className="p-4 pt-5"><p className="text-sm text-muted-foreground mb-1">负责人</p><p className="text-3xl font-bold">{uniqueResponsible}</p><p className="text-xs text-teal-500 mt-2">位负责人</p></CardContent>
        </Card>
        <Card className={cn("relative overflow-hidden shadow-sm min-h-[130px]", stats.overdue > 0 ? "border-red-200 bg-gradient-to-br from-white via-red-50/40 to-red-100/60" : "bg-gradient-to-br from-white via-gray-50/30 to-gray-100/50")}>
          <div className="absolute top-4 right-4 w-14 h-14 rounded-full flex items-center justify-center shadow-lg shadow-red-500/30"
            style={{ background: stats.overdue > 0 ? 'linear-gradient(135deg, #ef4444, #dc2626)' : 'linear-gradient(135deg, #d1d5db, #9ca3af)' }}>
            <AlertTriangle className="h-7 w-7 text-white" strokeWidth={1.5} />
          </div>
          <CardContent className="p-4 pt-5"><p className="text-sm text-muted-foreground mb-1">已过期</p><p className={cn("text-3xl font-bold", stats.overdue > 0 && "text-red-500")}>{stats.overdue}</p><p className="text-xs mt-2">{stats.overdue > 0 ? '⚠ 需要处理' : '✓ 无过期'}</p></CardContent>
        </Card>
        <Card className={cn("relative overflow-hidden shadow-sm min-h-[130px]", stats.today > 0 ? "border-orange-200 bg-gradient-to-br from-white via-orange-50/40 to-orange-100/60" : "bg-gradient-to-br from-white via-gray-50/30 to-gray-100/50")}>
          <div className="absolute top-4 right-4 w-14 h-14 rounded-full flex items-center justify-center shadow-lg shadow-orange-500/30"
            style={{ background: stats.today > 0 ? 'linear-gradient(135deg, #f97316, #ea580c)' : 'linear-gradient(135deg, #d1d5db, #9ca3af)' }}>
            <Clock className="h-7 w-7 text-white" strokeWidth={1.5} />
          </div>
          <CardContent className="p-4 pt-5"><p className="text-sm text-muted-foreground mb-1">今日到期</p><p className={cn("text-3xl font-bold", stats.today > 0 && "text-orange-500")}>{stats.today}</p><p className="text-xs mt-2">{stats.today > 0 ? '⏰ 请及时处理' : '✓ 暂无'}</p></CardContent>
        </Card>
        <Card className={cn("relative overflow-hidden shadow-sm min-h-[130px]", stats.soon > 0 ? "border-yellow-200 bg-gradient-to-br from-white via-yellow-50/40 to-yellow-100/60" : "bg-gradient-to-br from-white via-gray-50/30 to-gray-100/50")}>
          <div className="absolute top-4 right-4 w-14 h-14 rounded-full flex items-center justify-center shadow-lg shadow-yellow-500/30"
            style={{ background: stats.soon > 0 ? 'linear-gradient(135deg, #eab308, #ca8a04)' : 'linear-gradient(135deg, #d1d5db, #9ca3af)' }}>
            <Calendar className="h-7 w-7 text-white" strokeWidth={1.5} />
          </div>
          <CardContent className="p-4 pt-5"><p className="text-sm text-muted-foreground mb-1">30天内到期</p><p className={cn("text-3xl font-bold", stats.soon > 0 && "text-yellow-600")}>{stats.soon}</p><p className="text-xs mt-2">{stats.soon > 0 ? '📅 计划中' : '✓ 近期无忧'}</p></CardContent>
        </Card>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input placeholder="搜索设备名称、ID、型号、负责人..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9 pr-9 h-9" />
        {search && <Button variant="ghost" size="sm" className="absolute right-1 top-1/2 -translate-y-1/2 h-7 w-7 p-0" onClick={() => setSearch('')}><X className="h-4 w-4" /></Button>}
      </div>

      {/* Cards */}
      {filtered.length === 0 ? (
        <Card><CardContent className="p-6 text-center text-muted-foreground">暂无校正数据</CardContent></Card>
      ) : (
        <div className="grid gap-6" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))' }}>
          {filtered.map(eq => <CalibrationCard key={eq.id} equipment={eq} onClick={() => handleCardClick(eq)} />)}
        </div>
      )}

      {showDetail && selectedEquipment && (
        <EquipmentDetailModal equipment={selectedEquipment}
          onClose={() => { setShowDetail(false); setSelectedEquipment(null); }}
          onUpdate={async (e) => { await supabase.from('equipment').update({
            name: e.name, model: e.model, manufacturer: e.manufacturer, status: e.status,
            location: e.location, maintenance_date: e.maintenanceDate, next_calibration_date: e.nextCalibrationDate,
            responsible: e.responsible, notes: e.notes, image_url: e.imageUrl, sop_file_url: e.sopFileUrl,
            responsible_email: e.responsible_email,
          }).eq('id', e.id); setShowDetail(false); fetchData(); }}
          onDelete={async (id) => { await supabase.from('equipment').delete().eq('id', id); setShowDetail(false); fetchData(); }}
        />
      )}
    </div>
  );
}
