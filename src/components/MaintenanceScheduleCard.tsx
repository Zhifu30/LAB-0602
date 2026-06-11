import React, { useEffect, useState } from 'react';
import { Calendar, Clock, User, Wrench, AlertTriangle, CheckCircle, Bell } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { differenceInDays, isPast, isToday, format } from 'date-fns';
import { zhCN } from 'date-fns/locale';
import { getEffectiveImageUrl, fetchTypeTemplate } from '@/utils/imageUtils';

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
    imageUrl?: string | null;
  };
}

interface MaintenanceScheduleCardProps {
  schedule: MaintenanceSchedule;
  showResponsible?: boolean;
  onClick?: () => void;
}

const frequencyLabels: Record<string, string> = {
  daily: '每日', weekly: '每周', monthly: '每月', quarterly: '每季度', yearly: '每年',
};

const getDefaultImage = (type?: string | null) => {
  const m: Record<string, string> = {
    'microscope': 'https://images.unsplash.com/photo-1581093458791-9f3c3250e621?w=600&h=400&fit=crop&auto=format',
    'centrifuge': 'https://images.unsplash.com/photo-1576671081837-49000212a370?w=600&h=400&fit=crop&auto=format',
    'pcr': 'https://images.unsplash.com/photo-1532187863486-abf9dbad1b69?w=600&h=400&fit=crop&auto=format',
    'spectrophotometer': 'https://images.unsplash.com/photo-1567427018141-95ea3752f76d?w=600&h=400&fit=crop&auto=format',
    'incubator': 'https://images.unsplash.com/photo-1559757148-5c350d0d3c56?w=600&h=400&fit=crop&auto=format',
    'autoclave': 'https://images.unsplash.com/photo-1551601651-2a8555f1a136?w=600&h=400&fit=crop&auto=format',
    'balance': 'https://images.unsplash.com/photo-1603627672787-b5d5be0f8e04?w=600&h=400&fit=crop&auto=format',
    'hplc': 'https://images.unsplash.com/photo-1518152006812-edab29b069ac?w=600&h=400&fit=crop&auto=format',
    'other': 'https://images.unsplash.com/photo-1518770660439-4636190af475?w=600&h=400&fit=crop&auto=format'
  };
  return m[type || 'other'] || m['other'];
};

const MaintenanceScheduleCard: React.FC<MaintenanceScheduleCardProps> = ({ schedule, showResponsible = false, onClick }) => {
  const [equipmentImg, setEquipmentImg] = useState<string | null>(null);
  const [typeTemplate, setTypeTemplate] = useState<{ type_images: { url: string; is_default?: boolean }[] } | null>(null);

  useEffect(() => {
    if (!schedule.equipment_id) return;
    supabase.from('equipment').select('image_url, type')
      .eq('id', schedule.equipment_id).maybeSingle()
      .then(({ data }) => {
        if (data?.image_url) setEquipmentImg(data.image_url);
        if (data?.type) fetchTypeTemplate(data.type).then(setTypeTemplate).catch(() => {});
      });
  }, [schedule.equipment_id]);

  const dueDate = new Date(schedule.next_due_date);
  const daysUntilDue = differenceInDays(dueDate, new Date());

  const getStatusInfo = () => {
    if (isPast(dueDate) && !isToday(dueDate)) return { label: `过期 ${Math.abs(daysUntilDue)} 天`, color: '#ef4444', icon: AlertTriangle };
    if (isToday(dueDate)) return { label: '今日到期', color: '#f97316', icon: Clock };
    if (daysUntilDue <= 7) return { label: `${daysUntilDue} 天后到期`, color: '#eab308', icon: AlertTriangle };
    return { label: `${daysUntilDue} 天后到期`, color: '#22c55e', icon: CheckCircle };
  };

  const statusInfo = getStatusInfo();
  const statusColor = statusInfo.color;
  const backgroundImage = getEffectiveImageUrl({ imageUrl: equipmentImg }, typeTemplate)
    || getDefaultImage(schedule.equipment?.type);

  return (
    <div className="group relative rounded-2xl overflow-hidden cursor-pointer transform transition-all duration-500 hover:scale-[1.02] hover:shadow-2xl h-[380px] bg-gradient-to-br from-slate-900 to-slate-800"
      style={{ border: `2px solid ${statusColor}`, boxShadow: `0 15px 40px -15px ${statusColor}50, 0 0 0 1px ${statusColor}20` }}
      onClick={onClick}>
      <div className="absolute inset-0 bg-cover bg-center transition-all duration-700 group-hover:scale-110"
        style={{ backgroundImage: `url(${backgroundImage})`, filter: 'saturate(1.1) contrast(1.05)' }}>
        <div className="absolute inset-0 bg-gradient-to-t from-slate-900/90 via-slate-900/40 to-transparent transition-all duration-500 group-hover:from-slate-900/85 group-hover:via-slate-900/30" />
        <div className="absolute inset-0 bg-gradient-to-b from-black/30 via-transparent to-transparent" />
        <div className="absolute inset-0 opacity-15 transition-opacity duration-300 group-hover:opacity-25"
          style={{ background: `radial-gradient(ellipse at bottom, ${statusColor}50 0%, transparent 60%)` }} />
      </div>

      <div className="absolute top-4 left-4 right-4 flex justify-between items-start z-20">
        <div className="flex items-center gap-2">
          <div className="px-3 py-2 rounded-xl shadow-lg backdrop-blur-md border border-white/30 flex items-center gap-2"
            style={{ background: `linear-gradient(135deg, ${statusColor}ee 0%, ${statusColor}cc 100%)`, boxShadow: `0 6px 20px ${statusColor}40` }}>
            <span className="text-white text-sm font-bold whitespace-nowrap">{schedule.equipment?.id || schedule.equipment_id}</span>
            {schedule.assigned_name && (
              <><div className="w-px h-4 bg-white/40" /><Wrench className="h-3.5 w-3.5 text-white" strokeWidth={1.5} /><span className="text-white text-sm font-bold whitespace-nowrap">{schedule.assigned_name}</span></>
            )}
          </div>
          {showResponsible && schedule.equipment?.responsible && (
            <div className="px-3 py-2 rounded-xl bg-purple-500/90 backdrop-blur-md border border-white/20 shadow-lg">
              <span className="text-white text-sm font-medium flex items-center gap-1.5"><User className="h-3.5 w-3.5" strokeWidth={1.5} />{schedule.equipment.responsible}</span>
            </div>
          )}
        </div>
        <div className="px-3 py-2 rounded-xl shadow-lg backdrop-blur-md border border-white/30 flex items-center gap-2"
          style={{ background: `linear-gradient(135deg, ${statusColor}ee 0%, ${statusColor}cc 100%)`, boxShadow: `0 6px 20px ${statusColor}40` }}>
          <Calendar className="h-3.5 w-3.5 text-white" strokeWidth={1.5} />
          <span className="text-white text-sm font-bold">{format(dueDate, 'MM-dd', { locale: zhCN })}</span>
        </div>
      </div>

      <div className="absolute bottom-3 left-3 right-0 z-20">
        {schedule.description && (
          <div className="text-white font-bold text-sm mb-3 space-y-0.5 overflow-y-auto max-h-[180px] pr-3">
            {schedule.description.split(/(?=\([1-9]\)|（[1-9]）|\d+[.、])/).filter(line => line.trim()).map((line, index) => (
              <p key={index} className="leading-tight">{line.trim()}</p>
            ))}
          </div>
        )}
        <div className="flex items-center gap-2 flex-wrap">
          <div className="px-2.5 py-1 rounded-lg bg-blue-500/90 backdrop-blur-md border border-white/20 shadow-lg flex items-center gap-1">
            <span className="text-white text-xs font-medium">{frequencyLabels[schedule.frequency] || schedule.frequency}</span>
          </div>
          <div className="px-2.5 py-1 rounded-lg bg-orange-500/90 backdrop-blur-md border border-white/20 shadow-lg flex items-center gap-1">
            <Bell className="h-3 w-3 text-white" strokeWidth={1.5} />
            <span className="text-white text-xs font-medium">{schedule.reminder_days_before} 天</span>
          </div>
          <div className="px-2.5 py-1 rounded-lg shadow-lg backdrop-blur-md border border-white/30 flex items-center gap-1"
            style={{ background: `linear-gradient(135deg, ${statusColor}ee 0%, ${statusColor}cc 100%)`, boxShadow: `0 4px 16px ${statusColor}40` }}>
            <span className="text-white text-xs font-semibold">{statusInfo.label}</span>
          </div>
        </div>
      </div>

      <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none"
        style={{ background: `linear-gradient(45deg, transparent 30%, ${statusColor}15 50%, transparent 70%)` }} />
      <div className="absolute inset-0 rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none"
        style={{ boxShadow: `inset 0 0 15px ${statusColor}25, 0 0 25px ${statusColor}15` }} />
    </div>
  );
};

export default MaintenanceScheduleCard;
