import React, { useEffect, useState } from 'react';
import { Calendar, MapPin, User, QrCode, Microscope, RotateCcw, FlaskConical, ScanLine, Thermometer, Flame, Scale, Package, FileText, Trash2, Wrench } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { Equipment, statusLabels, statusIcons, equipmentTypeLabels, equipmentTypeIcons } from '@/types/equipment';
import { supabase } from '@/integrations/supabase/client';

const TYPE_SENTINEL = '__TYPE__';

interface MaintenanceInfo {
  next_due_date: string;
  title: string;
}

interface TypeResourceInfo {
  sharedImageUrl: string | null;
}

interface EquipmentCardProps {
  equipment: Equipment;
  onClick: () => void;
  onStatusChange?: (equipmentId: string, currentStatus: Equipment['status']) => void;
  onQRClick?: (equipment: Equipment) => void;
  onScrap?: (equipment: Equipment) => void;
}

const iconMap = {
  microscope: Microscope,
  'rotate-3d': RotateCcw,
  'flask-conical': FlaskConical,
  'scan-line': ScanLine,
  thermometer: Thermometer,
  flame: Flame,
  scale: Scale,
  dna: Package,
  package: Package
};

const getEquipmentIcon = (type?: string) => {
  if (!type) return Package;
  const iconName = equipmentTypeIcons[type as keyof typeof equipmentTypeIcons] || 'package';
  return iconMap[iconName as keyof typeof iconMap] || Package;
};

const EquipmentCard: React.FC<EquipmentCardProps> = ({ equipment, onClick, onStatusChange, onQRClick, onScrap }) => {
  const EquipmentIcon = getEquipmentIcon(equipment.type);
  const { isAdmin } = useAuth();
  const [maintenanceInfo, setMaintenanceInfo] = useState<MaintenanceInfo | null>(null);
  const [typeResource, setTypeResource] = useState<TypeResourceInfo | null>(null);

  useEffect(() => {
    const fetchMaintenanceInfo = async () => {
      const { data } = await supabase
        .from('maintenance_schedules')
        .select('next_due_date, title')
        .eq('equipment_id', equipment.id)
        .eq('is_active', true)
        .order('next_due_date', { ascending: true })
        .limit(1)
        .single();
      if (data) setMaintenanceInfo(data);
    };
    fetchMaintenanceInfo();
  }, [equipment.id]);

  useEffect(() => {
    const fetchTypeResource = async () => {
      if (!equipment.type) { setTypeResource(null); return; }
      const { data } = await supabase
        .from('equipment_templates')
        .select('shared_image_url')
        .eq('equipment_type', equipment.type)
        .eq('model', TYPE_SENTINEL)
        .eq('manufacturer', TYPE_SENTINEL)
        .maybeSingle();
      if (data) setTypeResource({ sharedImageUrl: data.shared_image_url });
    };
    fetchTypeResource();
  }, [equipment.type]);

  const getStatusColor = (status: Equipment['status']) => {
    const m: Record<Equipment['status'], string> = {
      'available': '#10b981', 'in-use': '#3b82f6', 'calibration': '#3b82f6',
      'out-of-order': '#ef4444', 'scrapped': '#64748b'
    };
    return m[status] || '#6b7280';
  };

  const statusColor = getStatusColor(equipment.status);

  const getDefaultImage = (type?: string) => {
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
    return m[type || 'other'];
  };

  const getCalibrationColor = (d?: string) => {
    if (!d) return '#6b7280';
    const days = Math.ceil((new Date(d).getTime() - Date.now()) / 86400000);
    if (days <= 5) return '#ef4444';
    if (days <= 30) return '#f59e0b';
    return '#22c55e';
  };

  const getMaintenanceColor = (d?: string) => {
    if (!d) return '#6b7280';
    const days = Math.ceil((new Date(d).getTime() - Date.now()) / 86400000);
    if (days < 0) return '#ef4444';
    if (days <= 7) return '#f59e0b';
    return '#10b981';
  };

  const handleStatusClick = (e: React.MouseEvent) => { e.stopPropagation(); onStatusChange?.(equipment.id, equipment.status); };
  const handleQRClick = (e: React.MouseEvent) => { e.stopPropagation(); onQRClick?.(equipment); };

  const bg = equipment.imageUrl || typeResource?.sharedImageUrl || getDefaultImage(equipment.type);
  const calColor = getCalibrationColor(equipment.nextCalibrationDate);
  const maintColor = getMaintenanceColor(maintenanceInfo?.next_due_date);

  return (
    <div
      className="group relative rounded-2xl overflow-hidden cursor-pointer transform transition-all duration-500 hover:scale-[1.02] hover:shadow-2xl h-[380px] bg-gradient-to-br from-slate-900 to-slate-800"
      style={{ border: `2px solid ${statusColor}`, boxShadow: `0 15px 40px -15px ${statusColor}50, 0 0 0 1px ${statusColor}20` }}
      onClick={onClick}
    >
      <div className="absolute inset-0 bg-cover bg-center transition-all duration-700 group-hover:scale-110"
        style={{ backgroundImage: `url(${bg})`, filter: 'saturate(1.1) contrast(1.05)' }}>
        <div className="absolute inset-0 bg-gradient-to-t from-slate-900/90 via-slate-900/40 to-transparent transition-all duration-500 group-hover:from-slate-900/85 group-hover:via-slate-900/30" />
        <div className="absolute inset-0 bg-gradient-to-b from-black/30 via-transparent to-transparent" />
        <div className="absolute inset-0 opacity-15 transition-opacity duration-300 group-hover:opacity-25"
          style={{ background: `radial-gradient(ellipse at bottom, ${statusColor}50 0%, transparent 60%)` }} />
      </div>

      <div className="absolute top-4 left-4 right-4 flex justify-between items-start z-20">
        <div className="flex items-center gap-1.5">
          <div className="px-2.5 py-1.5 rounded-lg shadow-lg border border-white/30 backdrop-blur-md flex items-center gap-1.5"
            style={{ background: `linear-gradient(135deg, ${statusColor}ee 0%, ${statusColor}cc 100%)`, boxShadow: `0 6px 20px ${statusColor}40` }}>
            <span className="text-white text-xs font-bold whitespace-nowrap">{equipment.id}</span>
            <div className="w-px h-3 bg-white/40" />
            <div className="flex items-center gap-0.5 cursor-pointer transition-all duration-200 hover:scale-105" onClick={handleStatusClick} title="点击选择状态">
              <span className="text-white/90 text-xs">{statusIcons[equipment.status]}</span>
              <span className="text-white text-[10px] font-semibold whitespace-nowrap">{statusLabels[equipment.status]}</span>
            </div>
          </div>
        </div>
        <div className="flex gap-2">
          {equipment.sopFileUrl && (
            <div className="p-2 rounded-full shadow-lg border border-white/20 hover:scale-110 transition-all duration-200 backdrop-blur-md cursor-pointer"
              style={{ backgroundColor: `${statusColor}cc` }} onClick={e => { e.stopPropagation(); window.open(equipment.sopFileUrl, '_blank'); }} title="SOP文件">
              <FileText className="h-4 w-4 text-white" />
            </div>
          )}
          <div className="p-2 rounded-full shadow-lg border border-white/20 hover:scale-110 transition-all duration-200 backdrop-blur-md cursor-pointer"
            style={{ backgroundColor: `${statusColor}cc` }} onClick={handleQRClick} title="二维码">
            <QrCode className="h-4 w-4 text-white" />
          </div>
          {isAdmin() && onScrap && (
            <div className="p-2 rounded-full shadow-lg border border-white/20 hover:scale-110 transition-all duration-200 backdrop-blur-md cursor-pointer"
              style={{ backgroundColor: '#ef4444cc' }} onClick={e => { e.stopPropagation(); onScrap(equipment); }} title="设备报废">
              <Trash2 className="h-4 w-4 text-white" />
            </div>
          )}
        </div>
      </div>

      {(maintenanceInfo || equipment.nextCalibrationDate) && (
        <div className="absolute bottom-3 left-3 right-3 z-20 flex items-center gap-2 justify-center">
          {maintenanceInfo && (
            <div className="px-2 py-1 rounded-lg text-[10px] font-semibold shadow-lg backdrop-blur-md border border-white/30 flex items-center gap-1"
              style={{ background: `linear-gradient(135deg, ${maintColor}ee 0%, ${maintColor}cc 100%)`, color: 'white', boxShadow: `0 4px 16px ${maintColor}40` }} title={`维护: ${maintenanceInfo.title}`}>
              <Wrench className="h-3 w-3" /><span className="whitespace-nowrap">维护: {maintenanceInfo.next_due_date}</span>
            </div>
          )}
          {equipment.nextCalibrationDate && (
            <div className="px-2 py-1 rounded-lg text-[10px] font-semibold shadow-lg backdrop-blur-md border border-white/30 flex items-center gap-1"
              style={{ background: `linear-gradient(135deg, ${calColor}ee 0%, ${calColor}cc 100%)`, color: 'white', boxShadow: `0 4px 16px ${calColor}40` }} title="下次校正时间">
              <Calendar className="h-3 w-3" /><span className="whitespace-nowrap">校正: {equipment.nextCalibrationDate}</span>
            </div>
          )}
        </div>
      )}

      <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none"
        style={{ background: `linear-gradient(45deg, transparent 30%, ${statusColor}15 50%, transparent 70%)` }} />
      <div className="absolute inset-0 rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none"
        style={{ boxShadow: `inset 0 0 15px ${statusColor}25, 0 0 25px ${statusColor}15` }} />
    </div>
  );
};

export default EquipmentCard;
