import React, { useEffect, useState } from 'react';
import { Calendar, MapPin, User, QrCode, Microscope, RotateCcw, FlaskConical, ScanLine, Thermometer, Flame, Scale, Package, FileText, Trash2, Wrench } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { Equipment, statusLabels, statusIcons, equipmentTypeLabels, equipmentTypeIcons } from '@/types/equipment';
import { supabase } from '@/integrations/supabase/client';

// 类型定义标识符
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

  // 获取最近的维护计划
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

      if (data) {
        setMaintenanceInfo(data);
      }
    };
    fetchMaintenanceInfo();
  }, [equipment.id]);

  // 获取类型资源（共享背景图片）
  useEffect(() => {
    const fetchTypeResource = async () => {
      if (!equipment.type) {
        setTypeResource(null);
        return;
      }

      const { data } = await supabase
        .from('equipment_templates')
        .select('shared_image_url')
        .eq('equipment_type', equipment.type)
        .eq('model', TYPE_SENTINEL)
        .eq('manufacturer', TYPE_SENTINEL)
        .maybeSingle();

      if (data) {
        setTypeResource({
          sharedImageUrl: data.shared_image_url
        });
      }
    };
    fetchTypeResource();
  }, [equipment.type]);

  // 获取状态颜色 - 优化配色方案
  const getStatusColor = (status: Equipment['status']) => {
    const statusColorMap: Record<Equipment['status'], string> = {
      'available': '#10b981',     // 翠绿色
      'in-use': '#3b82f6',       // 蓝色
      'calibration': '#3b82f6',   // 蓝色
      'out-of-order': '#ef4444', // 红色
      'scrapped': '#64748b'      // 石板灰
    };
    return statusColorMap[status] || '#6b7280';
  };

  const statusColor = getStatusColor(equipment.status);

  // 默认设备图片
  const getDefaultImage = (type?: string) => {
    const imageMap: Record<string, string> = {
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
    return imageMap[type || 'other'];
  };

  // 计算下次校正时间的颜色
  const getCalibrationColor = (nextCalibrationDate?: string) => {
    if (!nextCalibrationDate) return '#6b7280';

    const today = new Date();
    const nextDate = new Date(nextCalibrationDate);
    const daysUntilCalibration = Math.ceil((nextDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));

    if (daysUntilCalibration <= 5) return '#ef4444'; // 红色
    if (daysUntilCalibration <= 30) return '#f59e0b'; // 黄色
    return '#22c55e'; // 绿色
  };

  // 计算维护时间的颜色
  const getMaintenanceColor = (nextDueDate?: string) => {
    if (!nextDueDate) return '#6b7280';

    const today = new Date();
    const nextDate = new Date(nextDueDate);
    const daysUntilMaintenance = Math.ceil((nextDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));

    if (daysUntilMaintenance < 0) return '#ef4444'; // 红色 - 已过期
    if (daysUntilMaintenance <= 7) return '#f59e0b'; // 黄色
    return '#10b981'; // 绿色
  };

  // 状态切换处理
  const handleStatusClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (onStatusChange) {
      onStatusChange(equipment.id, equipment.status);
    }
  };

  const handleQRClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (onQRClick) {
      onQRClick(equipment);
    }
  };

  // 优先级: 设备自己的图片 > 类型共享图片 > 默认图片
  const backgroundImage = equipment.imageUrl || typeResource?.sharedImageUrl || getDefaultImage(equipment.type);
  const calibrationColor = getCalibrationColor(equipment.nextCalibrationDate);
  const maintenanceColor = getMaintenanceColor(maintenanceInfo?.next_due_date);

  return (
    <div
      className="group relative rounded-2xl overflow-hidden cursor-pointer transform transition-all duration-500 hover:scale-[1.02] hover:shadow-2xl bg-gradient-to-br from-slate-900 to-slate-800"
      style={{
        aspectRatio: '3/4',
        maxWidth: '400px',
        border: `2px solid ${statusColor}`,
        boxShadow: `0 15px 40px -15px ${statusColor}50, 0 0 0 1px ${statusColor}20`
      }}
      onClick={onClick}
    >
      {/* 全背景图片 */}
      <div
        className="absolute inset-0 bg-cover bg-center transition-all duration-700 group-hover:scale-110"
        style={{
          backgroundImage: `url(${backgroundImage})`,
          backgroundColor: '#1e293b',
          filter: 'saturate(1.1) contrast(1.05)'
        }}
      >
        <div className="absolute inset-0 flex items-center justify-center opacity-10">
          <EquipmentIcon size={120} strokeWidth={0.5} color="#ffffff" />
        </div>
        <div className="absolute inset-0 bg-gradient-to-t from-slate-900/85 via-slate-900/30 to-transparent" />
        <div className="absolute inset-0 bg-gradient-to-b from-black/20 via-transparent to-transparent" />
      </div>

      {/* 底部设备名称 */}
      <div className="absolute bottom-12 left-4 right-4 z-20">
        <h3 className="text-white font-semibold text-sm drop-shadow-lg">{equipment.name}</h3>
        <p className="text-white/70 text-xs drop-shadow-lg">{equipment.model}</p>
      </div>

      {/* 顶部信息栏 */}
      <div className="absolute top-4 left-4 right-4 flex justify-between items-start z-20">
        <div className="flex items-center gap-1.5">
          <div
            className="px-2.5 py-1.5 rounded-lg shadow-lg border border-white/30 backdrop-blur-md flex items-center gap-1.5"
            style={{
              background: `linear-gradient(135deg, ${statusColor}ee 0%, ${statusColor}cc 100%)`,
              boxShadow: `0 6px 20px ${statusColor}40`
            }}
          >
            <span className="text-white text-xs font-bold">{equipment.id}</span>
            <div className="w-px h-3 bg-white/40" />
            <div className="flex items-center gap-0.5 cursor-pointer" onClick={handleStatusClick} title="点击选择状态">
              <span className="text-white/90 text-xs">{statusIcons[equipment.status]}</span>
              <span className="text-white text-[10px] font-semibold">{statusLabels[equipment.status]}</span>
            </div>
          </div>
        </div>
        <div className="flex gap-2">
          {equipment.sopFileUrl && (
            <div className="p-2 rounded-full shadow-lg border border-white/20 backdrop-blur-md cursor-pointer"
              style={{ backgroundColor: `${statusColor}cc` }}
              onClick={e => { e.stopPropagation(); window.open(equipment.sopFileUrl, '_blank'); }}>
              <FileText className="h-4 w-4 text-white" />
            </div>
          )}
          <div className="p-2 rounded-full shadow-lg border border-white/20 backdrop-blur-md cursor-pointer"
            style={{ backgroundColor: `${statusColor}cc` }}
            onClick={handleQRClick}>
            <QrCode className="h-4 w-4 text-white" />
          </div>
          {isAdmin() && onScrap && (
            <div className="p-2 rounded-full shadow-lg border border-white/20 backdrop-blur-md cursor-pointer"
              style={{ backgroundColor: '#ef4444cc' }}
              onClick={e => { e.stopPropagation(); onScrap(equipment); }}>
              <Trash2 className="h-4 w-4 text-white" />
            </div>
          )}
        </div>
      </div>

      {/* 底部日期信息 */}
      {(maintenanceInfo || equipment.nextCalibrationDate) && (
        <div className="absolute bottom-2 left-3 right-3 z-20 flex items-center gap-1.5 justify-center">
          {maintenanceInfo && (
            <div className="px-2 py-1 rounded-lg text-[10px] font-semibold shadow-lg backdrop-blur-md border border-white/30 flex items-center gap-1"
              style={{ background: `linear-gradient(135deg, ${maintenanceColor}ee 0%, ${maintenanceColor}cc 100%)`, color: 'white' }}>
              <Wrench className="h-3 w-3" /> 维护: {maintenanceInfo.next_due_date}
            </div>
          )}
          {equipment.nextCalibrationDate && (
            <div className="px-2 py-1 rounded-lg text-[10px] font-semibold shadow-lg backdrop-blur-md border border-white/30 flex items-center gap-1"
              style={{ background: `linear-gradient(135deg, ${calibrationColor}ee 0%, ${calibrationColor}cc 100%)`, color: 'white' }}>
              <Calendar className="h-3 w-3" /> 校正: {equipment.nextCalibrationDate}
            </div>
          )}
        </div>
      )}

      {/* 悬停光晕 */}
      <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none"
        style={{ background: `linear-gradient(45deg, transparent 30%, ${statusColor}15 50%, transparent 70%)` }} />
      <div className="absolute inset-0 rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none"
        style={{ boxShadow: `inset 0 0 15px ${statusColor}25, 0 0 25px ${statusColor}15` }} />
    </div>
  );
};

export default EquipmentCard;
