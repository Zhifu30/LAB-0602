import React, { useState, useEffect, useCallback } from 'react';
import { X, Edit, Trash2, Download, QrCode, FileText, ExternalLink, Calendar } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Equipment, statusLabels, statusColors, statusIcons } from '@/types/equipment';
import EquipmentForm from '@/components/shared/EquipmentForm';
import QRCodeGenerator from '@/components/QRCodeGenerator';
import StatusSelectModal from '@/components/StatusSelectModal';
import FaultReportModal, { FaultReportData } from '@/components/FaultReportModal';
import ScrapEquipmentModal from '@/components/ScrapEquipmentModal';
import QuickCalibrationDateEditor from '@/components/QuickCalibrationDateEditor';
import MaintenanceScheduleManager from '@/components/MaintenanceScheduleManager';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { useEquipmentTypes } from '@/hooks/useEquipmentTypes';
import { getEffectiveImageUrl } from '@/utils/imageUtils';

interface EquipmentTypeOption { id: string; name: string; }
interface TypeResourceInfo { typeImages: { url: string; is_default?: boolean }[] | null; sharedSopFiles: { url: string; name: string; }[] | null; }
const TYPE_SENTINEL = '__TYPE__';

interface MaintenanceSchedule {
  id: string;
  title: string;
  description: string | null;
  next_due_date: string;
  frequency: string;
  last_completed_at: string | null;
}

interface EquipmentDetailModalProps {
  equipment: Equipment;
  onClose: () => void;
  onUpdate: (equipment: Equipment) => void;
  onDelete: (id: string) => void;
  embedded?: boolean;
  readOnly?: boolean;
}

const EquipmentDetailModal: React.FC<EquipmentDetailModalProps> = ({
  equipment, onClose, onUpdate, onDelete, embedded = false, readOnly = false
}) => {
  const { isAdmin, profile } = useAuth();
  const [isEditing, setIsEditing] = useState(false);
  const [editedEquipment, setEditedEquipment] = useState(equipment);
  const [showQRCode, setShowQRCode] = useState(false);
  const [showStatusModal, setShowStatusModal] = useState(false);
  const [showFaultModal, setShowFaultModal] = useState(false);
  const [showScrapModal, setShowScrapModal] = useState(false);
  const [maintenanceSchedulesKey, setMaintenanceSchedulesKey] = useState(0);
  const [typeResource, setTypeResource] = useState<TypeResourceInfo | null>(null);
  const { types: equipmentTypes } = useEquipmentTypes(); // ← 统一数据源

  const fetchTypeResource = useCallback(async () => {
    if (!equipment.type) { setTypeResource(null); return; }
    try {
      const { data } = await supabase
        .from('equipment_templates').select('type_images, shared_sop_files')
        .eq('equipment_type', equipment.type).eq('model', TYPE_SENTINEL).eq('manufacturer', TYPE_SENTINEL).maybeSingle();
      if (data) setTypeResource({ typeImages: (data as any).type_images, sharedSopFiles: data.shared_sop_files as { url: string; name: string; }[] | null });
    } catch (error) { console.error('Error fetching type resource:', error); }
  }, [equipment.type]);

  useEffect(() => { fetchTypeResource(); }, [fetchTypeResource, maintenanceSchedulesKey]);

  const handleSave = () => { onUpdate(editedEquipment); setIsEditing(false); };
  const handleCancel = () => { setEditedEquipment(equipment); setIsEditing(false); };
  const handleDelete = () => { if (window.confirm('确定要删除这台仪器吗？此操作不可撤销。')) onDelete(equipment.id); };
  const handleChange = (field: keyof Equipment, value: string) => setEditedEquipment(prev => ({ ...prev, [field]: value }));

  const handleStatusChange = async (newStatus: EquipmentStatus) => {
    if (newStatus === 'out-of-order') { setShowStatusModal(false); setShowFaultModal(true); return; }
    if (newStatus === 'scrapped') { setShowStatusModal(false); setShowScrapModal(true); return; }
    const updatedEquipment = { ...equipment, status: newStatus };
    onUpdate(updatedEquipment); setEditedEquipment(updatedEquipment); setShowStatusModal(false);
  };

  const handleFaultReport = async (faultData: FaultReportData) => {
    try {
      const updatedEquipment = { ...equipment, status: 'out-of-order' as EquipmentStatus };
      onUpdate(updatedEquipment); setEditedEquipment(updatedEquipment);
      await supabase.from('fault_reports').insert({
        equipment_id: equipment.id, reported_by: profile?.user_id, reporter_name: profile?.username || 'Unknown',
        reason: faultData.reason, custom_reason: faultData.customReason, description: faultData.description, image_url: faultData.imageUrl
      });
      await supabase.functions.invoke('send-equipment-notification', {
        body: { equipmentId: equipment.id, equipmentName: equipment.name, status: 'out-of-order', reporterName: profile?.username || 'Unknown', reason: faultData.reason, description: faultData.description, imageUrl: faultData.imageUrl, adminEmail: 'zhifu.feng@brightfuture.com.hk' }
      });
      toast.success('故障报告已提交，管理员已收到通知');
    } catch (error) { console.error('Error submitting fault report:', error); toast.error('提交故障报告失败'); }
  };

  const handleScrapConfirm = async (password: string, reason: string) => {
    try {
      const updatedEquipment = { ...equipment, type: null as any, status: 'scrapped' as EquipmentStatus, is_scrapped: true, scrapped_at: new Date().toISOString(), scrapped_by: profile?.user_id };
      onUpdate(updatedEquipment); setEditedEquipment(updatedEquipment);
      await supabase.from('scrap_records').insert({ equipment_id: equipment.id, scrapped_by: profile?.user_id, scrapper_name: profile?.username || 'Unknown', reason, admin_password: password });
      // 停用该设备的所有维护计划和校正提醒
      await supabase.from('maintenance_schedules').update({ is_active: false }).eq('equipment_id', equipment.id);
      await supabase.functions.invoke('send-equipment-notification', {
        body: { equipmentId: equipment.id, equipmentName: equipment.name, status: 'scrapped', reporterName: profile?.username || 'Unknown', reason, adminEmail: 'zhifu.feng@brightfuture.com.hk' }
      });
      toast.success('设备已报废，维护计划已停用');
    } catch (error) { console.error('Error scrapping equipment:', error); toast.error('报废操作失败'); }
  };

  const handleCalibrationDateUpdate = async (date: string) => {
    try {
      const { error } = await supabase.from('equipment').update({ next_calibration_date: date, calibration_reminder_sent: false }).eq('id', equipment.id);
      if (error) throw error;
      const updatedEquipment = { ...equipment, nextCalibrationDate: date };
      onUpdate(updatedEquipment); setEditedEquipment(updatedEquipment); toast.success('校正日期已更新');
    } catch (error) { console.error('Error updating calibration date:', error); toast.error('更新校正日期失败'); }
  };

  const backgroundImageUrl = getEffectiveImageUrl(equipment, typeResource ? { type_images: typeResource.typeImages } : null);

  const DetailContent = () => (
    <div className="flex flex-col h-full overflow-hidden rounded-lg relative bg-slate-900">
      {backgroundImageUrl && (
        <div className="absolute inset-0 bg-cover bg-center opacity-60 transition-all duration-700" 
          style={{ backgroundImage: `url(${backgroundImageUrl})` }} />
      )}
      <div className="absolute inset-0 bg-gradient-to-b from-black/20 via-transparent to-black/40" />
      
      <div className="relative flex flex-col h-full p-4 items-center justify-center">
        {/* 中央内容窗口 */}
        <div className="w-full max-w-lg bg-black/40 backdrop-blur-xl rounded-2xl border border-white/20 shadow-2xl overflow-hidden flex flex-col max-h-[90%]">
          <div className="shrink-0 p-4 border-b border-white/10 bg-white/5">
            <div className="flex items-center justify-between">
              <div className={`flex items-center gap-2 px-3 py-1.5 rounded-lg ${!readOnly && equipment.status !== 'scrapped' ? 'cursor-pointer hover:bg-white/10' : ''} transition-all ${statusColors[equipment.status]}`}
                onClick={() => !readOnly && equipment.status !== 'scrapped' && setShowStatusModal(true)} title={readOnly ? undefined : equipment.status === 'scrapped' ? '已报废' : '点击更改状态'}>
                <span className="text-xl">{statusIcons[equipment.status]}</span>
                <h2 className={`font-bold truncate text-white ${embedded ? 'text-sm' : 'text-lg'}`}>{equipment.name}</h2>
              </div>
              <div className="flex items-center gap-2">
                {(equipment.sopFileUrl || (typeResource?.sharedSopFiles && typeResource.sharedSopFiles.length > 0)) && (
                  <Button variant="ghost" size="icon" className="h-9 w-9 rounded-full bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500 hover:text-white border border-emerald-500/30"
                    onClick={() => { if (equipment.sopFileUrl) window.open(equipment.sopFileUrl, '_blank'); else if (typeResource?.sharedSopFiles?.[0]) window.open(typeResource.sharedSopFiles[0].url, '_blank'); }}
                    title={equipment.sopFileUrl ? (equipment.sopFileName || 'SOP文件') : '类型共享SOP'}>
                    <FileText className="h-5 w-5" />
                  </Button>
                )}
                {!readOnly && (
                  <Button variant="ghost" size="icon" onClick={() => setShowQRCode(!showQRCode)}
                    className={`h-9 w-9 rounded-full border transition-all ${showQRCode ? 'bg-primary text-white border-primary' : 'bg-blue-500/20 text-blue-400 border-blue-500/30 hover:bg-blue-500 hover:text-white'}`} 
                    title={showQRCode ? '隐藏二维码' : '显示二维码'}>
                    <QrCode className="h-5 w-5" />
                  </Button>
                )}
                <Button variant="ghost" size="icon" onClick={onClose}
                  className="h-9 w-9 rounded-full bg-white/10 text-white hover:bg-white/20 border border-white/20">
                  <X className="h-5 w-5" />
                </Button>
              </div>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-4 custom-scrollbar">
            <div className="space-y-6">
              {showQRCode && (
                <div className="border border-white/20 rounded-xl p-4 bg-white/5 backdrop-blur-sm flex justify-center animate-in zoom-in-95 duration-200">
                  <QRCodeGenerator equipment={equipment} />
                </div>
              )}
              
              {typeResource?.sharedSopFiles && typeResource.sharedSopFiles.length > 1 && (
                <div className="bg-white/5 backdrop-blur-sm rounded-xl p-3 border border-white/10">
                  <span className="text-xs text-white/50 block mb-2 font-medium uppercase tracking-wider">更多共享资源:</span>
                  <div className="flex flex-wrap gap-2">
                    {typeResource.sharedSopFiles.slice(1).map((file, index) => (
                      <Button key={index} variant="outline" size="sm" className="h-8 text-xs bg-emerald-500/10 border-emerald-500/30 text-emerald-400 hover:bg-emerald-500 hover:text-white" onClick={() => window.open(file.url, '_blank')}>
                        <FileText className="h-3.5 w-3.5 mr-1.5" />{file.name}
                      </Button>
                    ))}
                  </div>
                </div>
              )}

              {isEditing && !readOnly ? (
                <div className="animate-in fade-in duration-300">
                  <EquipmentForm
                    equipment={editedEquipment}
                    onChange={handleChange}
                    mode="edit"
                    variant="glass"
                    equipmentTypes={equipmentTypes}
                    footer={
                      <div className="flex justify-end gap-3 mt-6">
                        <Button onClick={handleCancel} variant="ghost" className="text-white hover:bg-white/10">取消</Button>
                        <Button onClick={handleSave} className="bg-green-600 hover:bg-green-700 text-white px-6">保存更改</Button>
                      </div>
                    }
                  />
                </div>
              ) : (
                <ViewForm equipment={equipment} onEdit={() => setIsEditing(true)} onDelete={handleDelete} equipmentTypes={equipmentTypes} readOnly={readOnly} />
              )}

              {equipment.status !== 'scrapped' && (
                <div className="pt-2">
                  <MaintenanceScheduleManager
                    equipmentId={equipment.id} equipmentName={equipment.name} equipmentResponsible={equipment.responsible}
                    equipmentResponsibleEmail={equipment.responsible_email} equipmentType={equipment.type}
                    onScheduleChange={() => setMaintenanceSchedulesKey(prev => prev + 1)} readOnly={readOnly} />
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
      <StatusSelectModal isOpen={showStatusModal} onClose={() => setShowStatusModal(false)} onStatusChange={handleStatusChange} currentStatus={equipment.status} equipmentId={equipment.id} />
      <FaultReportModal isOpen={showFaultModal} onClose={() => setShowFaultModal(false)} equipment={equipment} onSubmit={handleFaultReport} />
      <ScrapEquipmentModal isOpen={showScrapModal} onClose={() => setShowScrapModal(false)} equipment={equipment} onConfirm={handleScrapConfirm} />
    </div>
  );

  if (embedded) return <DetailContent />;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[200] p-4">
      <div className="w-full max-w-2xl h-[80vh]"><DetailContent /></div>
    </div>
  );
};

const ViewForm: React.FC<{
  equipment: Equipment; onEdit: () => void; onDelete: () => void; equipmentTypes: EquipmentTypeOption[]; readOnly?: boolean;
}> = ({ equipment, onEdit, onDelete, equipmentTypes, readOnly = false }) => {
  const { isAdmin } = useAuth();
  const getDateUrgencyColor = (dateStr: string | null | undefined) => {
    if (!dateStr) return 'text-muted-foreground';
    const daysUntil = Math.ceil((new Date(dateStr).getTime() - Date.now()) / 86400000);
    if (daysUntil < 0) return 'text-red-600 font-semibold';
    if (daysUntil <= 7) return 'text-orange-600 font-semibold';
    if (daysUntil <= 30) return 'text-yellow-600';
    return 'text-green-600';
  };
  return (
    <div className="space-y-4 bg-white/10 backdrop-blur-sm rounded-lg p-4 border border-white/20">
      <div className="flex justify-between items-center">
        <h3 className="text-base font-semibold text-white">仪器详细信息</h3>
        {!readOnly && isAdmin() && (
          <div className="flex gap-2">
            <Button onClick={onEdit} size="sm" className="h-7 bg-blue-500 hover:bg-blue-600 text-white"><Edit className="h-3 w-3 mr-1" />编辑</Button>
            <Button onClick={onDelete} size="sm" variant="destructive" className="h-7"><Trash2 className="h-3 w-3 mr-1" />删除</Button>
          </div>
        )}
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="bg-white/5 rounded-lg p-2"><Label className="text-xs text-white/80">仪器编号</Label><p className="text-white text-base font-bold">{equipment.id}</p></div>
        <div className="bg-white/5 rounded-lg p-2"><Label className="text-xs text-white/80">仪器名称</Label><p className="text-white text-base font-bold">{equipment.name}</p></div>
        <div className="bg-white/5 rounded-lg p-2"><Label className="text-xs text-white/80">设备类型</Label><p className="text-white text-base font-bold">{equipment.type || '未分类'}</p></div>
        <div className="bg-white/5 rounded-lg p-2"><Label className="text-xs text-white/80">型号</Label><p className="text-white text-base font-bold">{equipment.model}</p></div>
        <div className="bg-white/5 rounded-lg p-2"><Label className="text-xs text-white/80">厂商</Label><p className="text-white text-base font-bold">{equipment.manufacturer}</p></div>
        <div className="bg-white/5 rounded-lg p-2"><Label className="text-xs text-white/80">位置</Label><p className="text-white text-base font-bold">{equipment.location}</p></div>
        <div className="bg-white/5 rounded-lg p-2"><Label className="text-xs text-white/80">负责人</Label><p className="text-white text-base font-bold">{equipment.responsible}</p></div>
        <div className="bg-white/5 rounded-lg p-2"><Label className="text-xs text-white/80">下次校正日期</Label><p className={`text-base font-bold flex items-center gap-1 ${getDateUrgencyColor(equipment.nextCalibrationDate)}`}><Calendar className="h-3.5 w-3.5" />{equipment.nextCalibrationDate || '未设置'}</p></div>
      </div>
    </div>
  );
};

export default EquipmentDetailModal;
