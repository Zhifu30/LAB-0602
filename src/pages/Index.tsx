import React, { useState, useCallback, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { Plus, Grid, Table, Search, Upload, Download, QrCode, Camera, Trash2, FileText, Calendar, Microscope, CheckCircle2, PlayCircle, Gauge, AlertTriangle, TrendingUp, TrendingDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Equipment, statusLabels, statusColors, getAllColumns, TableExportConfig } from '@/types/equipment';
import { useLanguage } from '@/hooks/useLanguage';

import EquipmentCard from '@/components/EquipmentCard';
import EquipmentTableView from '@/components/EquipmentTableView';
import AddEquipmentModal from '@/components/AddEquipmentModal';
import EquipmentDetailModal from '@/components/EquipmentDetailModal';
import TableImportModal from '@/components/TableImportModal';
import QRScannerModal from '@/components/QRScannerModal';
import TableConfigModal from '@/components/TableConfigModal';
import SmartOCRModal from '@/components/SmartOCRModal';
import QRCodeModal from '@/components/QRCodeModal';
import StatusSelectModal from '@/components/StatusSelectModal';
import ScrapEquipmentModal from '@/components/ScrapEquipmentModal';
import BatchDateEditModal from '@/components/BatchDateEditModal';
import { IconContainer } from '@/components/ui/icon-container';
import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';

import { useEquipment } from '@/hooks/useEquipment';
import { useAuth } from '@/hooks/useAuth';

const Index = () => {
  const navigate = useNavigate();
  const { t } = useLanguage();
  const { isAdmin } = useAuth();
  const [viewMode, setViewMode] = useState<'grid' | 'table'>('grid');
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedStatus, setSelectedStatus] = useState<string>('');
  const { equipment, loading, tableSchema, addEquipment, updateEquipment, deleteEquipment, scrapEquipment: scrapEquipmentFn, importEquipment, fetchEquipment } = useEquipment();

  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [isQRScannerOpen, setIsQRScannerOpen] = useState(false);
  const [isConfigModalOpen, setIsConfigModalOpen] = useState(false);
  const [isOCRModalOpen, setIsOCRModalOpen] = useState(false);
  const [isQRModalOpen, setIsQRModalOpen] = useState(false);
  const [isStatusSelectOpen, setIsStatusSelectOpen] = useState(false);
  const [isScrapModalOpen, setIsScrapModalOpen] = useState(false);
  const [isBatchEditOpen, setIsBatchEditOpen] = useState(false);
  const [selectedEquipment, setSelectedEquipment] = useState<Equipment | null>(null);
  const [statusSelectEquipment, setStatusSelectEquipment] = useState<Equipment | null>(null);
  const [scrapEquipmentState, setScrapEquipmentState] = useState<Equipment | null>(null);
  const [exportConfigs, setExportConfigs] = useState<TableExportConfig[]>([]);
  // 动态列标签：从数据库 schema 自动生成
  const [columnLabels, setColumnLabels] = useState<Record<string, string>>({});

  useEffect(() => {
    if (tableSchema?.columnConfigs?.length) {
      const labels: Record<string, string> = {};
      for (const cfg of tableSchema.columnConfigs) {
        labels[cfg.key as string] = cfg.label;
      }
      setColumnLabels(labels);
    }
  }, [tableSchema]);

  // 检查URL参数，看是否有设备ID
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const equipmentId = urlParams.get('id');
    if (equipmentId && equipment && equipment.length > 0) {
      const foundEquipment = equipment.find(eq => eq?.id === equipmentId);
      if (foundEquipment) {
        setSelectedEquipment(foundEquipment);
        setIsDetailModalOpen(true);
      }
    }
  }, [equipment]);

  const handleEquipmentClick = useCallback((eq: Equipment) => {
    setSelectedEquipment(eq);
    setIsDetailModalOpen(true);
  }, []);

  const handleCloseDetailModal = useCallback(() => {
    setIsDetailModalOpen(false);
    setSelectedEquipment(null);
  }, []);

  const handleAddEquipment = useCallback(async (newEquipment: Equipment) => {
    try {
      const id = newEquipment.id?.trim() || `EQ${String((equipment?.length || 0) + 1).padStart(3, '0')}`;
      await addEquipment({ ...newEquipment, id });
      setIsAddModalOpen(false);
    } catch (error) {
      console.error('Failed to add equipment:', error);
    }
  }, [equipment?.length, addEquipment]);

  const handleUpdateEquipment = useCallback(async (updatedEquipment: Equipment) => {
    try {
      await updateEquipment(updatedEquipment.id, updatedEquipment);
      setIsDetailModalOpen(false);
      setSelectedEquipment(null);
    } catch (error) {
      console.error('Failed to update equipment:', error);
    }
  }, [updateEquipment]);

  const handleDeleteEquipment = useCallback(async (id: string) => {
    try {
      await deleteEquipment(id);
      setIsDetailModalOpen(false);
      setSelectedEquipment(null);
    } catch (error) {
      console.error('Failed to delete equipment:', error);
    }
  }, [deleteEquipment]);

  const handleImport = useCallback(async (importedEquipment: Equipment[]) => {
    try {
      const existingIds = equipment.map(eq => eq.id);
      const newEquipment = importedEquipment.filter(eq => !existingIds.includes(eq.id));

      if (newEquipment.length === 0) {
        toast.warning('所有设备ID已存在，没有新数据需要导入');
        return;
      }

      if (newEquipment.length < importedEquipment.length) {
        const duplicateCount = importedEquipment.length - newEquipment.length;
        toast.warning(`过滤掉 ${duplicateCount} 条重复ID的记录`);
      }

      await importEquipment(newEquipment);
      toast.success(`成功导入 ${newEquipment.length} 条设备记录`);
      setIsImportModalOpen(false);
    } catch (error) {
      console.error('Failed to import equipment:', error);
      toast.error('导入失败，请检查数据格式');
    }
  }, [importEquipment, equipment]);

  const handleQRScan = useCallback((result: string) => {
    console.log('QR Scan result:', result);
    setIsQRScannerOpen(false);
  }, []);

  const handleOCRTextExtracted = useCallback((text: string) => {
    console.log('OCR提取的文字:', text);
    toast.success('文字识别完成，已提取图片中的文字信息');
  }, []);

  // SmartOCR 回调
  const handleSmartOCRUpdate = useCallback(async (id: string, updates: Partial<Equipment>) => {
    await updateEquipment(id, updates);
    toast.success(`设备已更新，修改了 ${Object.keys(updates).length} 个字段`);
  }, [updateEquipment]);

  const handleSmartOCRCreate = useCallback(async (data: Partial<Equipment>) => {
    const id = `OCR${String(Date.now()).slice(-8)}`;
    await addEquipment({ ...data, id } as Equipment);
    toast.success(`新设备 "${data.name || id}" 已创建`);
  }, [addEquipment]);

  const filteredEquipment = (equipment || []).filter((eq) => {
    if (!eq) return false;

    const matchesSearch = searchTerm === '' ||
      eq.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      eq.id?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      eq.model?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      eq.manufacturer?.toLowerCase().includes(searchTerm.toLowerCase());

    const matchesStatus = selectedStatus === '' || eq.status === selectedStatus;

    return matchesSearch && matchesStatus;
  }).sort((a, b) => {
    const aNum = parseInt(a.id.replace(/\D/g, '')) || 0;
    const bNum = parseInt(b.id.replace(/\D/g, '')) || 0;
    return aNum - bNum;
  });

  // 根据选中状态和视图模式过滤设备
  const displayEquipment = (() => {
    if (selectedStatus === 'scrapped') {
      return filteredEquipment.filter(eq => eq.status === 'scrapped');
    } else if (selectedStatus === '') {
      return filteredEquipment.filter(eq => eq.status !== 'scrapped');
    }
    return filteredEquipment;
  })();

  const handleStatusClick = useCallback((equipmentId: string, currentStatus: Equipment['status']) => {
    const equipmentItem = filteredEquipment.find(eq => eq.id === equipmentId);
    if (equipmentItem) {
      setStatusSelectEquipment(equipmentItem);
      setIsStatusSelectOpen(true);
    }
  }, [filteredEquipment]);

  const handleStatusChange = useCallback(async (newStatus: Equipment['status']) => {
    if (statusSelectEquipment) {
      try {
        await updateEquipment(statusSelectEquipment.id, { ...statusSelectEquipment, status: newStatus });
        toast.success(`设备状态已更新为：${statusLabels[newStatus]}`);
        setIsStatusSelectOpen(false);
        setStatusSelectEquipment(null);
      } catch (error) {
        console.error('Failed to update status:', error);
        toast.error('状态更新失败');
      }
    }
  }, [statusSelectEquipment, updateEquipment]);

  const handleQRClick = useCallback((equipment: Equipment) => {
    setSelectedEquipment(equipment);
    setIsQRModalOpen(true);
  }, []);

  const statusStats = {
    total: equipment?.length || 0,
    available: equipment?.filter(eq => eq?.status === 'available').length || 0,
    'in-use': equipment?.filter(eq => eq?.status === 'in-use').length || 0,
    calibration: equipment?.filter(eq => eq?.status === 'calibration').length || 0,
    'out-of-order': equipment?.filter(eq => eq?.status === 'out-of-order').length || 0,
  };

  const handleScrapEquipment = useCallback((equipment: Equipment) => {
    if (!isAdmin()) {
      toast.error('只有管理员可以报废设备');
      return;
    }
    setScrapEquipmentState(equipment);
    setIsScrapModalOpen(true);
  }, [isAdmin]);

  const handleConfirmScrap = useCallback(async (password: string, reason: string) => {
    if (!scrapEquipmentState) return;
    try {
      await scrapEquipmentFn(scrapEquipmentState.id, reason);
      toast.success('设备已成功报废');
      setIsScrapModalOpen(false);
      setScrapEquipmentState(null);
    } catch (error: any) {
      console.error('Failed to scrap equipment:', error);
    }
  }, [scrapEquipmentState, scrapEquipmentFn]);

  return (
    <div className="p-4 space-y-4">
      {/* 头部 */}
      <div className="flex justify-between items-center flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <IconContainer variant="teal" size="lg">
            <Microscope />
          </IconContainer>
          <div>
            <h1 className="text-xl font-semibold">设备管理</h1>
            <p className="text-xs text-muted-foreground">管理实验室设备资产</p>
          </div>
        </div>
      </div>

      {/* 统计卡片 */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        <Card className="shadow-sm hover:shadow-md transition-shadow relative overflow-hidden min-h-[130px] bg-gradient-to-br from-white via-blue-50/30 to-blue-100/50">
          <div className="absolute -top-10 -right-10 w-36 h-36 rounded-full bg-gradient-to-br from-blue-200/60 to-blue-300/40 blur-sm" />
          <div className="absolute -top-4 -right-4 w-28 h-28 rounded-full bg-blue-100/70" />
          <div className="absolute top-4 right-4 w-14 h-14 rounded-full bg-gradient-to-br from-blue-400 to-blue-600 flex items-center justify-center shadow-lg shadow-blue-500/30">
            <Microscope className="h-7 w-7 text-white" strokeWidth={1.5} />
          </div>
          <CardContent className="p-5 relative">
            <div className="space-y-2">
              <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">设备总数</p>
              <p className="text-3xl font-bold">{statusStats.total}</p>
              <div className="flex items-center gap-1 text-blue-500">
                <TrendingUp className="h-3.5 w-3.5" />
                <span className="text-xs font-medium">{statusStats.available} 可用</span>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="shadow-sm hover:shadow-md transition-shadow relative overflow-hidden min-h-[130px] bg-gradient-to-br from-white via-green-50/30 to-green-100/50">
          <div className="absolute -top-10 -right-10 w-36 h-36 rounded-full bg-gradient-to-br from-green-200/60 to-green-300/40 blur-sm" />
          <div className="absolute -top-4 -right-4 w-28 h-28 rounded-full bg-green-100/70" />
          <div className="absolute top-4 right-4 w-14 h-14 rounded-full bg-gradient-to-br from-green-400 to-green-600 flex items-center justify-center shadow-lg shadow-green-500/30">
            <CheckCircle2 className="h-7 w-7 text-white" strokeWidth={1.5} />
          </div>
          <CardContent className="p-5 relative">
            <div className="space-y-2">
              <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">待用</p>
              <p className="text-3xl font-bold text-green-600">{statusStats.available}</p>
              <div className="flex items-center gap-1 text-green-500">
                <TrendingUp className="h-3.5 w-3.5" />
                <span className="text-xs font-medium">可立即使用</span>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="shadow-sm hover:shadow-md transition-shadow relative overflow-hidden min-h-[130px] bg-gradient-to-br from-white via-blue-50/30 to-blue-100/50">
          <div className="absolute -top-10 -right-10 w-36 h-36 rounded-full bg-gradient-to-br from-blue-200/60 to-blue-300/40 blur-sm" />
          <div className="absolute -top-4 -right-4 w-28 h-28 rounded-full bg-blue-100/70" />
          <div className="absolute top-4 right-4 w-14 h-14 rounded-full bg-gradient-to-br from-blue-400 to-blue-600 flex items-center justify-center shadow-lg shadow-blue-500/30">
            <PlayCircle className="h-7 w-7 text-white" strokeWidth={1.5} />
          </div>
          <CardContent className="p-5 relative">
            <div className="space-y-2">
              <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">使用中</p>
              <p className="text-3xl font-bold text-blue-600">{statusStats['in-use']}</p>
              <div className="flex items-center gap-1 text-blue-500">
                <TrendingUp className="h-3.5 w-3.5" />
                <span className="text-xs font-medium">运行中</span>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="shadow-sm hover:shadow-md transition-shadow relative overflow-hidden min-h-[130px] bg-gradient-to-br from-white via-amber-50/30 to-amber-100/50">
          <div className="absolute -top-10 -right-10 w-36 h-36 rounded-full bg-gradient-to-br from-amber-200/60 to-amber-300/40 blur-sm" />
          <div className="absolute -top-4 -right-4 w-28 h-28 rounded-full bg-amber-100/70" />
          <div className="absolute top-4 right-4 w-14 h-14 rounded-full bg-gradient-to-br from-amber-400 to-amber-600 flex items-center justify-center shadow-lg shadow-amber-500/30">
            <Gauge className="h-7 w-7 text-white" strokeWidth={1.5} />
          </div>
          <CardContent className="p-5 relative">
            <div className="space-y-2">
              <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">校正中</p>
              <p className="text-3xl font-bold text-amber-600">{statusStats.calibration}</p>
              <div className="flex items-center gap-1 text-amber-500">
                <TrendingDown className="h-3.5 w-3.5" />
                <span className="text-xs font-medium">维护保养</span>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className={cn(
          "shadow-sm hover:shadow-md transition-shadow relative overflow-hidden min-h-[130px]",
          statusStats['out-of-order'] > 0
            ? "border-red-200 bg-gradient-to-br from-white via-red-50/40 to-red-100/60"
            : "bg-gradient-to-br from-white via-red-50/20 to-red-100/40"
        )}>
          <div className="absolute -top-10 -right-10 w-36 h-36 rounded-full bg-gradient-to-br from-red-200/60 to-red-300/40 blur-sm" />
          <div className="absolute -top-4 -right-4 w-28 h-28 rounded-full bg-red-100/70" />
          <div className={cn(
            "absolute top-4 right-4 w-14 h-14 rounded-full flex items-center justify-center shadow-lg shadow-red-500/30",
            statusStats['out-of-order'] > 0 ? "bg-gradient-to-br from-red-400 to-red-600" : "bg-gradient-to-br from-red-300 to-red-500"
          )}>
            <AlertTriangle className="h-7 w-7 text-white" strokeWidth={1.5} />
          </div>
          <CardContent className="p-5 relative">
            <div className="space-y-2">
              <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">故障</p>
              <p className={cn("text-3xl font-bold", statusStats['out-of-order'] > 0 ? "text-red-600" : "text-muted-foreground")}>{statusStats['out-of-order']}</p>
              <div className={cn("flex items-center gap-1", statusStats['out-of-order'] > 0 ? "text-red-500" : "text-muted-foreground")}>
                {statusStats['out-of-order'] > 0 ? <TrendingDown className="h-3.5 w-3.5" /> : <TrendingUp className="h-3.5 w-3.5" />}
                <span className="text-xs font-medium">{statusStats['out-of-order'] > 0 ? '需要维修' : '运行良好'}</span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* 工具栏 */}
      <Card className="shadow-sm">
        <CardContent className="p-3">
          <div className="flex flex-col lg:flex-row gap-3 items-center justify-between">
            <div className="flex flex-col sm:flex-row gap-3 flex-1 w-full lg:w-auto">
              <div className="relative flex-1 max-w-sm">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground h-3.5 w-3.5" />
                <Input
                  placeholder="搜索设备..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-9 h-8 text-sm"
                />
              </div>
              <select
                value={selectedStatus}
                onChange={(e) => setSelectedStatus(e.target.value)}
                className="px-3 py-1.5 text-sm border border-input rounded-md bg-background focus:ring-2 focus:ring-ring focus:border-ring outline-none h-8"
              >
                <option value="">全部状态</option>
                <option value="available">待用</option>
                <option value="in-use">使用中</option>
                <option value="calibration">校正中</option>
                <option value="out-of-order">故障</option>
                <option value="scrapped">已报废</option>
              </select>
            </div>

            <div className="flex flex-wrap gap-2">
              <div className="flex bg-muted rounded-md p-0.5">
                <Button
                  onClick={() => setViewMode('grid')}
                  variant={viewMode === 'grid' ? 'default' : 'ghost'}
                  size="sm"
                  className="h-7 px-2"
                >
                  <Grid className="h-3.5 w-3.5" />
                </Button>
                <Button
                  onClick={() => setViewMode('table')}
                  variant={viewMode === 'table' ? 'default' : 'ghost'}
                  size="sm"
                  className="h-7 px-2"
                >
                  <Table className="h-3.5 w-3.5" />
                </Button>
              </div>
              <Button
                onClick={() => setIsImportModalOpen(true)}
                variant="outline"
                size="sm"
                className="h-7 px-2"
              >
                <Upload className="h-3.5 w-3.5" />
              </Button>
              <Button
                onClick={() => setIsQRScannerOpen(true)}
                variant="outline"
                size="sm"
                className="h-7 px-2"
              >
                <QrCode className="h-3.5 w-3.5" />
              </Button>
              <Button
                onClick={() => setIsOCRModalOpen(true)}
                variant="outline"
                size="sm"
                className="h-7 px-2"
              >
                <Camera className="h-3.5 w-3.5" />
              </Button>
              {isAdmin() && (
                <Button
                  onClick={() => setIsBatchEditOpen(true)}
                  variant="outline"
                  size="sm"
                  className="h-7 px-2"
                >
                  <Calendar className="h-3.5 w-3.5" />
                </Button>
              )}
              <Button
                onClick={() => setIsAddModalOpen(true)}
                size="sm"
                className="h-7"
              >
                <Plus className="h-3.5 w-3.5 mr-1" />
                添加
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* 内容区域 */}
        {viewMode === 'grid' ? (
          loading ? (
            <div className="flex justify-center items-center py-12">
              <div className="text-slate-600">加载中...</div>
            </div>
          ) : (
            <div className="grid gap-6" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))' }}>
              {displayEquipment.map((eq) => (
                <EquipmentCard
                  key={eq.id}
                  equipment={eq}
                  onClick={() => {
                    setSelectedEquipment(eq);
                    setIsDetailModalOpen(true);
                  }}
                  onStatusChange={handleStatusClick}
                  onQRClick={handleQRClick}
                  onScrap={handleScrapEquipment}
                />
              ))}
            </div>
          )
        ) : loading ? (
          <div className="flex justify-center items-center py-12">
            <div className="text-slate-600">加载中...</div>
          </div>
        ) : (
          <EquipmentTableView
            equipments={displayEquipment}
            onEdit={(eq) => {
              setSelectedEquipment(eq);
              setIsDetailModalOpen(true);
            }}
            onDelete={(id) => handleDeleteEquipment(id)}
            onView={(eq) => {
              setSelectedEquipment(eq);
              setIsDetailModalOpen(true);
            }}
            onAdd={() => setIsAddModalOpen(true)}
            onImport={handleImport}
            exportConfigs={exportConfigs}
            columnLabels={columnLabels}
            tableSchema={tableSchema}
            onOpenConfig={() => setIsConfigModalOpen(true)}
            onStatusChange={handleStatusClick}
            onEquipmentUpdate={(updatedEquipment) => {
              fetchEquipment();
            }}
            onEquipmentRefresh={fetchEquipment}
          />
        )}

        {/* 空状态 */}
        {!loading && displayEquipment.length === 0 && (
          <div className="text-center py-16 bg-white rounded-xl shadow-sm border">
            <div className="text-6xl mb-4">🔍</div>
            <p className="text-slate-500 text-xl font-medium mb-2">未找到设备</p>
            <p className="text-slate-400 text-sm">尝试调整搜索条件或添加新设备</p>
          </div>
        )}

        {/* 模态框 */}
        <AddEquipmentModal
          isOpen={isAddModalOpen}
          onClose={() => setIsAddModalOpen(false)}
          onAdd={handleAddEquipment}
          existingIds={equipment?.map(eq => eq?.id) || []}
        />

        <TableImportModal
          isOpen={isImportModalOpen}
          onClose={() => setIsImportModalOpen(false)}
          onImport={handleImport}
          columnLabels={columnLabels}
          availableColumns={Object.keys(columnLabels) as (keyof Equipment)[]}
        />

        <QRScannerModal
          isOpen={isQRScannerOpen}
          onClose={() => setIsQRScannerOpen(false)}
          onScan={handleQRScan}
        />

        <TableConfigModal
          isOpen={isConfigModalOpen}
          onClose={() => setIsConfigModalOpen(false)}
          exportConfigs={exportConfigs}
          onUpdateConfigs={setExportConfigs}
          availableColumns={getAllColumns()}
          columnLabels={columnLabels}
          onUpdateColumnLabels={setColumnLabels}
        />

        <SmartOCRModal
          open={isOCRModalOpen}
          onClose={() => setIsOCRModalOpen(false)}
          equipment={equipment || []}
          onUpdateEquipment={handleSmartOCRUpdate}
          onCreateEquipment={handleSmartOCRCreate}
        />

        {selectedEquipment && isDetailModalOpen && (
          <EquipmentDetailModal
            equipment={selectedEquipment}
            onClose={handleCloseDetailModal}
            onUpdate={handleUpdateEquipment}
            onDelete={handleDeleteEquipment}
          />
        )}

        {selectedEquipment && isQRModalOpen && (
          <QRCodeModal
            isOpen={isQRModalOpen}
            onClose={() => {
              setIsQRModalOpen(false);
              setSelectedEquipment(null);
            }}
            equipment={selectedEquipment}
          />
        )}

        {statusSelectEquipment && (
          <StatusSelectModal
            isOpen={isStatusSelectOpen}
            onClose={() => {
              setIsStatusSelectOpen(false);
              setStatusSelectEquipment(null);
            }}
            currentStatus={statusSelectEquipment.status}
            onStatusChange={handleStatusChange}
            equipmentId={statusSelectEquipment.id}
          />
        )}

        <ScrapEquipmentModal
          isOpen={isScrapModalOpen}
          onClose={() => {
            setIsScrapModalOpen(false);
            setScrapEquipmentState(null);
          }}
          equipment={scrapEquipmentState}
          onConfirm={handleConfirmScrap}
        />

        <BatchDateEditModal
          isOpen={isBatchEditOpen}
          onClose={() => setIsBatchEditOpen(false)}
          equipment={equipment || []}
          onUpdate={fetchEquipment}
        />
    </div>
  );
};

export default Index;
