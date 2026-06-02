import React, { useState, useEffect, useCallback } from 'react';
import { X, Edit, Trash2, Download, QrCode, FileText, ExternalLink, Calendar } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Equipment, EquipmentStatus, statusLabels, statusColors, statusIcons } from '@/types/equipment';
import QRCodeGenerator from '@/components/QRCodeGenerator';
import ImageUploader from '@/components/ImageUploader';
import MultipleFileUploader from '@/components/MultipleFileUploader';
import StatusSelectModal from '@/components/StatusSelectModal';
import FaultReportModal, { FaultReportData } from '@/components/FaultReportModal';
import ScrapEquipmentModal from '@/components/ScrapEquipmentModal';
import QuickCalibrationDateEditor from '@/components/QuickCalibrationDateEditor';
import MaintenanceScheduleManager from '@/components/MaintenanceScheduleManager';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { useEquipmentTypes } from '@/hooks/useEquipmentTypes';
import { useProfiles } from '@/hooks/useProfiles';

interface EquipmentTypeOption { id: string; name: string; }
interface TypeResourceInfo { sharedImageUrl: string | null; sharedSopFiles: { url: string; name: string; }[] | null; }
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
        .from('equipment_types').select('shared_image_url, shared_sop_files')
        .eq('equipment_type', equipment.type).eq('model', TYPE_SENTINEL).eq('manufacturer', TYPE_SENTINEL).maybeSingle();
      if (data) setTypeResource({ sharedImageUrl: data.shared_image_url, sharedSopFiles: data.shared_sop_files as { url: string; name: string; }[] | null });
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
      const updatedEquipment = { ...equipment, status: 'scrapped' as EquipmentStatus, is_scrapped: true, scrapped_at: new Date().toISOString(), scrapped_by: profile?.user_id };
      onUpdate(updatedEquipment); setEditedEquipment(updatedEquipment);
      await supabase.from('scrap_records').insert({ equipment_id: equipment.id, scrapped_by: profile?.user_id, scrapper_name: profile?.username || 'Unknown', reason, admin_password: password });
      await supabase.functions.invoke('send-equipment-notification', {
        body: { equipmentId: equipment.id, equipmentName: equipment.name, status: 'scrapped', reporterName: profile?.username || 'Unknown', reason, adminEmail: 'zhifu.feng@brightfuture.com.hk' }
      });
      toast.success('设备已报废，管理员已收到通知');
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

  const backgroundImageUrl = equipment.imageUrl || typeResource?.sharedImageUrl;

  const DetailContent = () => (
    <div className="flex flex-col h-full overflow-hidden rounded-lg relative">
      {backgroundImageUrl && <div className="absolute inset-0 bg-cover bg-center" style={{ backgroundImage: `url(${backgroundImageUrl})` }} />}
      <div className="absolute inset-0 bg-gradient-to-b from-black/70 via-black/50 to-black/70" />
      <div className="relative flex flex-col h-full">
        <div className="shrink-0 relative">
          <div className="p-3 text-white">
            <div className="flex items-center justify-between mb-2">
              <div className={`flex items-center gap-2 px-3 py-1.5 rounded-lg ${!readOnly ? 'cursor-pointer hover:opacity-90' : ''} transition-opacity ${statusColors[equipment.status]}`}
                onClick={() => !readOnly && setShowStatusModal(true)} title={readOnly ? undefined : "点击更改状态"}>
                <span className="text-lg">{statusIcons[equipment.status]}</span>
                <h2 className={`font-semibold truncate ${embedded ? 'text-sm' : 'text-base'}`}>{equipment.name}</h2>
              </div>
              <div className="flex items-center gap-1.5">
                {(equipment.sopFileUrl || (typeResource?.sharedSopFiles && typeResource.sharedSopFiles.length > 0)) && (
                  <Button variant={backgroundImageUrl ? "secondary" : "outline"} size="sm" className="h-8 w-8 p-0 bg-emerald-500 hover:bg-emerald-600 text-white border-0"
                    onClick={() => { if (equipment.sopFileUrl) window.open(equipment.sopFileUrl, '_blank'); else if (typeResource?.sharedSopFiles?.[0]) window.open(typeResource.sharedSopFiles[0].url, '_blank'); }}
                    title={equipment.sopFileUrl ? (equipment.sopFileName || 'SOP文件') : '类型共享SOP'}>
                    <FileText className="h-5 w-5" />
                  </Button>
                )}
                {!readOnly && (
                  <Button variant={backgroundImageUrl ? "secondary" : "outline"} size="sm" onClick={() => setShowQRCode(!showQRCode)}
                    className={`h-8 w-8 p-0 ${showQRCode ? 'bg-primary text-white' : 'bg-blue-500 hover:bg-blue-600 text-white'} border-0`} title={showQRCode ? '隐藏二维码' : '显示二维码'}>
                    <QrCode className="h-5 w-5" />
                  </Button>
                )}
                <Button variant={backgroundImageUrl ? "secondary" : "ghost"} size="sm" onClick={onClose}
                  className={`h-8 w-8 p-0 ${backgroundImageUrl ? 'bg-white/20 hover:bg-white/30 text-white' : ''}`}>
                  <X className="h-5 w-5" />
                </Button>
              </div>
            </div>
            {!equipment.imageUrl && typeResource?.sharedImageUrl && (
              <div className="mt-1"><span className="text-[10px] px-1.5 py-0.5 rounded bg-white/20 text-white/80">类型共享图片</span></div>
            )}
          </div>
        </div>
        <div className="flex-1 overflow-y-auto p-3">
          <div className="space-y-4 text-white">
            {showQRCode && (
              <div className="border border-white/20 rounded-lg p-2 bg-white/10 backdrop-blur-sm"><QRCodeGenerator equipment={equipment} /></div>
            )}
            {typeResource?.sharedSopFiles && typeResource.sharedSopFiles.length > 1 && (
              <div className="flex flex-wrap gap-1 bg-white/10 backdrop-blur-sm rounded-lg p-2 border border-white/20">
                <span className="text-xs text-white/80">更多SOP:</span>
                {typeResource.sharedSopFiles.slice(1).map((file, index) => (
                  <Button key={index} variant="outline" size="sm" className="h-6 text-xs bg-emerald-500/80 border-emerald-400/50 text-white hover:bg-emerald-500" onClick={() => window.open(file.url, '_blank')}>
                    <FileText className="h-3 w-3 mr-1" />{file.name}
                  </Button>
                ))}
              </div>
            )}
            {isEditing && !readOnly ? (
              <EditForm equipment={editedEquipment} onChange={handleChange} onSave={handleSave} onCancel={handleCancel} equipmentTypes={equipmentTypes} />
            ) : (
              <ViewForm equipment={equipment} onEdit={() => setIsEditing(true)} onDelete={handleDelete} equipmentTypes={equipmentTypes} readOnly={readOnly} />
            )}
            <MaintenanceScheduleManager
              equipmentId={equipment.id} equipmentName={equipment.name} equipmentResponsible={equipment.responsible}
              equipmentResponsibleEmail={equipment.responsible_email} onScheduleChange={() => setMaintenanceSchedulesKey(prev => prev + 1)} readOnly={readOnly} />
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

const EditForm: React.FC<{
  equipment: Equipment; onChange: (field: keyof Equipment, value: string) => void; onSave: () => void; onCancel: () => void; equipmentTypes: EquipmentTypeOption[];
}> = ({ equipment, onChange, onSave, onCancel, equipmentTypes }) => {
  const { profiles: users, loading: loadingUsers } = useProfiles();

  const handleResponsibleChange = (username: string) => {
    const selectedUser = users.find(u => u.username === username);
    if (selectedUser) { onChange('responsible', selectedUser.username); if (selectedUser.email) onChange('responsible_email', selectedUser.email); }
  };

  return (
    <div className="space-y-6 bg-white/10 backdrop-blur-sm rounded-lg p-4 border border-white/20">
      <div className="flex justify-between items-center">
        <h3 className="text-lg font-semibold text-white">编辑仪器信息</h3>
        <div className="flex gap-2">
          <Button onClick={onSave} size="sm" className="bg-green-600 hover:bg-green-700 text-white">保存</Button>
          <Button onClick={onCancel} size="sm" variant="outline" className="bg-white/20 hover:bg-white/30 text-white border-white/30">取消</Button>
        </div>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-white/5 rounded-lg p-2"><Label htmlFor="edit-name" className="text-xs text-white/80">仪器名称</Label><Input id="edit-name" value={equipment.name} onChange={(e) => onChange('name', e.target.value)} className="bg-white/10 border-white/20 text-white placeholder:text-white/50" /></div>
        <div className="bg-white/5 rounded-lg p-2"><Label htmlFor="edit-type" className="text-xs text-white/80">设备类型</Label><Select value={equipment.type || ''} onValueChange={(value: string) => onChange('type', value)}><SelectTrigger className="bg-white/10 border-white/20 text-white"><SelectValue placeholder="选择设备类型" /></SelectTrigger><SelectContent className="z-[300] bg-popover">{equipmentTypes.length > 0 ? equipmentTypes.map((t) => (<SelectItem key={t.id} value={t.name}>{t.name}</SelectItem>)) : <SelectItem value="__empty__" disabled>请先在设备类型管理中添加类型</SelectItem>}</SelectContent></Select></div>
        <div className="bg-white/5 rounded-lg p-2"><Label htmlFor="edit-model" className="text-xs text-white/80">型号</Label><Input id="edit-model" value={equipment.model} onChange={(e) => onChange('model', e.target.value)} className="bg-white/10 border-white/20 text-white placeholder:text-white/50" /></div>
        <div className="bg-white/5 rounded-lg p-2"><Label htmlFor="edit-manufacturer" className="text-xs text-white/80">厂商</Label><Input id="edit-manufacturer" value={equipment.manufacturer} onChange={(e) => onChange('manufacturer', e.target.value)} className="bg-white/10 border-white/20 text-white placeholder:text-white/50" /></div>
        <div className="bg-white/5 rounded-lg p-2"><Label htmlFor="edit-status" className="text-xs text-white/80">状态</Label><Select value={equipment.status} onValueChange={(value: EquipmentStatus) => onChange('status', value)}><SelectTrigger className="bg-white/10 border-white/20 text-white"><SelectValue /></SelectTrigger><SelectContent className="z-[300] bg-popover">{Object.entries(statusLabels).map(([key, label]) => (<SelectItem key={key} value={key}>{label}</SelectItem>))}</SelectContent></Select></div>
        <div className="bg-white/5 rounded-lg p-2"><Label htmlFor="edit-location" className="text-xs text-white/80">位置</Label><Input id="edit-location" value={equipment.location} onChange={(e) => onChange('location', e.target.value)} className="bg-white/10 border-white/20 text-white placeholder:text-white/50" /></div>
        <div className="bg-white/5 rounded-lg p-2"><Label htmlFor="edit-responsible" className="text-xs text-white/80">负责人</Label><Select value={equipment.responsible} onValueChange={handleResponsibleChange} disabled={loadingUsers}><SelectTrigger className="bg-white/10 border-white/20 text-white"><SelectValue placeholder={loadingUsers ? '加载中...' : '选择负责人'} /></SelectTrigger><SelectContent className="z-[300] bg-popover">{users.map((user) => (<SelectItem key={user.user_id} value={user.username}>{user.username}</SelectItem>))}</SelectContent></Select></div>
        <div className="bg-white/5 rounded-lg p-2"><Label htmlFor="edit-nextCalibrationDate" className="text-xs text-white/80">下次校正日期</Label><Input id="edit-nextCalibrationDate" type="date" value={equipment.nextCalibrationDate || ''} onChange={(e) => onChange('nextCalibrationDate', e.target.value)} className="bg-white/10 border-white/20 text-white" /></div>
        <div className="md:col-span-2 bg-white/5 rounded-lg p-2"><Label className="text-xs text-white/80">维护日期管理</Label><p className="mt-1 text-xs text-white/60 bg-white/5 p-2 rounded">维护日期通过下方的"维护计划管理"进行设置和管理，支持自动周期性更新。</p></div>
      </div>
      <div className="bg-white/5 rounded-lg p-2"><Label htmlFor="edit-description" className="text-xs text-white/80">描述</Label><Textarea id="edit-description" value={equipment.description} onChange={(e) => onChange('description', e.target.value)} rows={3} className="bg-white/10 border-white/20 text-white placeholder:text-white/50" /></div>
      <ImageUploader imageUrl={equipment.imageUrl} onImageChange={(imageUrl) => onChange('imageUrl', imageUrl)} equipmentModel={equipment.model} manufacturer={equipment.manufacturer} />
      <MultipleFileUploader files={equipment.sopFiles ? JSON.parse(equipment.sopFiles) : []} onFilesChange={(files) => onChange('sopFiles', JSON.stringify(files))} bucketName="sop-files" label="SOP文件和附件" acceptedTypes=".pdf,.doc,.docx,.txt,.jpg,.jpeg,.png" maxFiles={10} />
    </div>
  );
};

export default EquipmentDetailModal;
