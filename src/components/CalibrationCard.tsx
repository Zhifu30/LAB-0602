import React, { useEffect, useState } from 'react';
import { Calendar, Clock, User, AlertTriangle, CheckCircle, Activity } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { differenceInDays, isPast, isToday, format } from 'date-fns';
import { zhCN } from 'date-fns/locale';

interface CalibrationEquipment {
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
}

interface CalibrationCardProps {
  equipment: CalibrationEquipment;
  onClick?: () => void;
}

const getDefaultImage = (type?: string | null) => {
  const m: Record<string, string> = {
    'microscope': 'https://images.unsplash.com/photo-1581093458791-9f3c3250e621?w=600&h=400&fit=crop&auto=format',
    'centrifuge': 'https://images.unsplash.com/photo-1576671081837-49000212a370?w=600&h=400&fit=crop&auto=format',
    'pcr': 'https://images.unsplash.com/photo-1532187863486-abf9dbad1b69?w=600&h=400&fit=crop&auto=format',
    'hplc': 'https://images.unsplash.com/photo-1518152006812-edab29b069ac?w=600&h=400&fit=crop&auto=format',
    'balance': 'https://images.unsplash.com/photo-1603627672787-b5d5be0f8e04?w=600&h=400&fit=crop&auto=format',
    'other': 'https://images.unsplash.com/photo-1518770660439-4636190af475?w=600&h=400&fit=crop&auto=format',
  };
  return m[type || 'other'] || m['other'];
};

export default function CalibrationCard({ equipment, onClick }: CalibrationCardProps) {
  const [typeImage, setTypeImage] = useState<string | null>(null);
  const [equipImg, setEquipImg] = useState<string | null>(null);

  useEffect(() => {
    setEquipImg(equipment.image_url);
    if (equipment.type) {
      supabase.from('equipment_types').select('shared_image_url')
        .eq('equipment_type', equipment.type).maybeSingle()
        .then(({ data }) => { if (data?.shared_image_url) setTypeImage(data.shared_image_url); });
    }
  }, [equipment.type, equipment.image_url]);

  const dueDate = new Date(equipment.next_calibration_date);
  const daysUntilDue = differenceInDays(dueDate, new Date());

  const getStatus = () => {
    if (isPast(dueDate) && !isToday(dueDate)) return { label: `过期 ${Math.abs(daysUntilDue)} 天`, color: '#ef4444', icon: AlertTriangle };
    if (isToday(dueDate)) return { label: '今日到期', color: '#f97316', icon: Clock };
    if (daysUntilDue <= 30) return { label: `${daysUntilDue} 天后到期`, color: '#eab308', icon: AlertTriangle };
    return { label: `${daysUntilDue} 天后到期`, color: '#22c55e', icon: CheckCircle };
  };

  const status = getStatus();
  const bg = equipImg || typeImage || getDefaultImage(equipment.type);

  return (
    <div className="group relative rounded-2xl overflow-hidden cursor-pointer transform transition-all duration-500 hover:scale-[1.02] hover:shadow-2xl h-[300px] bg-gradient-to-br from-slate-900 to-slate-800"
      style={{ border: `2px solid ${status.color}`, boxShadow: `0 15px 40px -15px ${status.color}50` }}
      onClick={onClick}>
      <div className="absolute inset-0 bg-cover bg-center transition-all duration-700 group-hover:scale-110"
        style={{ backgroundImage: `url(${bg})`, filter: 'saturate(1.1) contrast(1.05)' }}>
        <div className="absolute inset-0 bg-gradient-to-t from-slate-900/90 via-slate-900/40 to-transparent" />
        <div className="absolute inset-0 bg-gradient-to-b from-black/30 via-transparent to-transparent" />
        <div className="absolute inset-0 opacity-15" style={{ background: `radial-gradient(ellipse at bottom, ${status.color}50 0%, transparent 60%)` }} />
      </div>

      <div className="absolute top-4 left-4 right-4 flex justify-between items-start z-20">
        <div className="px-3 py-2 rounded-xl shadow-lg backdrop-blur-md border border-white/30 flex items-center gap-2"
          style={{ background: `linear-gradient(135deg, ${status.color}ee, ${status.color}cc)`, boxShadow: `0 6px 20px ${status.color}40` }}>
          <Activity className="h-3.5 w-3.5 text-white" strokeWidth={1.5} />
          <span className="text-white text-sm font-bold whitespace-nowrap">{equipment.id}</span>
        </div>
        <div className="px-3 py-2 rounded-xl shadow-lg backdrop-blur-md border border-white/30 flex items-center gap-2"
          style={{ background: `linear-gradient(135deg, ${status.color}ee, ${status.color}cc)`, boxShadow: `0 6px 20px ${status.color}40` }}>
          <Calendar className="h-3.5 w-3.5 text-white" strokeWidth={1.5} />
          <span className="text-white text-sm font-bold">{format(dueDate, 'MM-dd', { locale: zhCN })}</span>
        </div>
      </div>

      <div className="absolute bottom-4 left-4 right-4 z-20 space-y-3">
        <div>
          <h3 className="text-white font-bold text-base mb-1">{equipment.name}</h3>
          {equipment.model && <p className="text-white/70 text-xs">{equipment.model} | {equipment.manufacturer}</p>}
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {equipment.responsible && (
            <div className="px-2.5 py-1 rounded-lg bg-purple-500/90 backdrop-blur-md border border-white/20 shadow-lg flex items-center gap-1">
              <User className="h-3 w-3 text-white" strokeWidth={1.5} />
              <span className="text-white text-xs font-medium">{equipment.responsible}</span>
            </div>
          )}
          <div className="px-2.5 py-1 rounded-lg shadow-lg backdrop-blur-md border border-white/30"
            style={{ background: `linear-gradient(135deg, ${status.color}ee, ${status.color}cc)` }}>
            <span className="text-white text-xs font-semibold">{status.label}</span>
          </div>
        </div>
      </div>

      <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none"
        style={{ background: `linear-gradient(45deg, transparent 30%, ${status.color}15 50%, transparent 70%)` }} />
    </div>
  );
}
