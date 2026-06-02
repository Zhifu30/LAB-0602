import React, { useState, useCallback, useMemo } from 'react';
import { Download, Eye, Edit, Trash2, Plus, Settings, Upload, Image, FileText, Link } from 'lucide-react';
import { DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors, DragEndEvent } from '@dnd-kit/core';
import { arrayMove, SortableContext, horizontalListSortingStrategy } from '@dnd-kit/sortable';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Equipment, statusLabels, statusColors, statusIcons, TableExportConfig, getAllColumns, equipmentTypeLabels, EquipmentType } from '@/types/equipment';
import TableImportModal from './TableImportModal';
import InlineEditCell from './InlineEditCell';
import ResizableTableHeader from './ResizableTableHeader';
import EquipmentTypeManager from './EquipmentTypeManager';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

interface EquipmentTableViewProps {
  equipments: Equipment[];
  onEdit: (equipment: Equipment) => void;
  onDelete: (id: string) => void;
  onView: (equipment: Equipment) => void;
  onAdd: () => void;
  onImport: (equipments: Equipment[]) => void;
  exportConfigs: TableExportConfig[];
  columnLabels: Record<keyof Equipment, string>;
  onOpenConfig: () => void;
  onStatusChange?: (equipmentId: string, currentStatus: Equipment['status']) => void;
  onEquipmentUpdate?: (equipment: Equipment) => void;
  onEquipmentRefresh?: () => void;
}

const EquipmentTableView: React.FC<EquipmentTableViewProps> = ({
  equipments, onEdit, onDelete, onView, onAdd, onImport, exportConfigs, columnLabels, onOpenConfig,
  onStatusChange, onEquipmentUpdate, onEquipmentRefresh
}) => {
  const { toast } = useToast();

  const defaultConfig: TableExportConfig = { id: 'complete-info', name: '完整信息表', description: '包含所有设备信息的详细表格', columns: getAllColumns() };
  const [selectedConfig, setSelectedConfig] = useState<TableExportConfig>(exportConfigs.length > 0 ? exportConfigs[0] : defaultConfig);
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [isTypeManagerOpen, setIsTypeManagerOpen] = useState(false);
  const [columnOrder, setColumnOrder] = useState<(keyof Equipment)[]>(() => {
    const saved = localStorage.getItem('equipment-table-column-order');
    return saved ? JSON.parse(saved) : getAllColumns();
  });
  const [columnWidths, setColumnWidths] = useState<Record<string, number>>(() => {
    const saved = localStorage.getItem('equipment-table-column-widths');
    return saved ? JSON.parse(saved) : {};
  });
  const [editingCell, setEditingCell] = useState<{ equipmentId: string; field: keyof Equipment } | null>(null);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }), useSensor(KeyboardSensor));

  const getDisplayColumns = useCallback(() => {
    const configColumns = selectedConfig?.id === 'complete-info' ? getAllColumns() : (selectedConfig?.columns || getAllColumns());
    return columnOrder.filter(col => configColumns.includes(col));
  }, [selectedConfig, columnOrder]);

  const displayColumns = useMemo(() => getDisplayColumns(), [getDisplayColumns]);

  const getFieldValue = (equipment: Equipment, field: keyof Equipment): string => {
    const value = equipment[field];
    if (field === 'status') return statusLabels[value as Equipment['status']];
    if (field === 'type') {
      const types = JSON.parse(localStorage.getItem('equipment-type-configs-v2') || '[]');
      const found = types.find((t: any) => t.name === value);
      if (found) return found.name;
      return equipmentTypeLabels[value as EquipmentType] || value?.toString() || '-';
    }
    return value?.toString() || '-';
  };

  const getFieldLabel = (field: keyof Equipment): string => columnLabels[field] || field;
  const getColumnWidth = (column: keyof Equipment): number => columnWidths[column] || 150;

  const handleColumnResize = useCallback((column: keyof Equipment, width: number) => {
    setColumnWidths(prev => { const updated = { ...prev, [column]: width }; localStorage.setItem('equipment-table-column-widths', JSON.stringify(updated)); return updated; });
  }, []);

  const handleDragEnd = useCallback((event: DragEndEvent) => {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      setColumnOrder(prev => {
        const oldIndex = prev.indexOf(active.id as keyof Equipment);
        const newIndex = prev.indexOf(over.id as keyof Equipment);
        const newOrder = arrayMove(prev, oldIndex, newIndex);
        localStorage.setItem('equipment-table-column-order', JSON.stringify(newOrder));
        return newOrder;
      });
    }
  }, []);

  const handleInlineSave = useCallback(async (equipmentId: string, field: keyof Equipment, value: any) => {
    try {
      const dbFieldMap: Record<string, string> = {
        maintenanceDate: 'maintenance_date', nextCalibrationDate: 'next_calibration_date', calibrationDate: 'calibration_date',
        serialNumber: 'serial_number', responsible_email: 'responsible_email', imageUrl: 'image_url', sopFileUrl: 'sop_file_url',
        sopFileName: 'sop_file_name', assetNumber: 'asset_number', purchasePrice: 'purchase_price', depreciationRate: 'depreciation_rate',
        currentValue: 'current_value', warrantyExpiry: 'warranty_expiry', operatingRange: 'operating_range',
        calibrationCycle: 'calibration_cycle', usageHours: 'usage_hours', maintenanceHistory: 'maintenance_history',
        repairHistory: 'repair_history', sopFiles: 'sop_files'
      };
      const dbField = dbFieldMap[field] || field;
      const { error } = await supabase.from('equipment').update({ [dbField]: value }).eq('id', equipmentId);
      if (error) throw error;
      const equipment = equipments.find(e => e.id === equipmentId);
      if (equipment && onEquipmentUpdate) onEquipmentUpdate({ ...equipment, [field]: value });
      toast({ title: '已保存', description: `${getFieldLabel(field)} 已更新` });
    } catch (error) {
      console.error('保存失败:', error);
      toast({ title: '保存失败', description: '请重试', variant: 'destructive' });
    }
  }, [equipments, onEquipmentUpdate, toast, columnLabels]);

  const exportToCSV = () => {
    const headers = displayColumns.map(col => getFieldLabel(col));
    const csvContent = [headers.join(','), ...equipments.map(equipment => displayColumns.map(col => `"${getFieldValue(equipment, col)}"`).join(','))].join('\n');
    const blob = new Blob(['﻿' + csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a'); link.href = URL.createObjectURL(blob);
    link.download = `${selectedConfig.name}_${new Date().toISOString().split('T')[0]}.csv`; link.click();
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-card p-4 rounded-lg shadow-md border">
        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
          <h2 className="text-lg font-semibold">表格视图</h2>
          {exportConfigs.length > 0 && (
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">导出模板:</span>
              <Select value={selectedConfig?.id || defaultConfig.id} onValueChange={(value) => { const config = exportConfigs.find(c => c.id === value); if (config) setSelectedConfig(config); }}>
                <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
                <SelectContent>{exportConfigs.map(config => (<SelectItem key={config.id} value={config.id}>{config.name}</SelectItem>))}</SelectContent>
              </Select>
            </div>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          <Button onClick={() => setIsTypeManagerOpen(true)} variant="outline" size="sm"><Link className="h-4 w-4 mr-2" />类型管理</Button>
          <Button onClick={() => setIsImportModalOpen(true)} variant="outline" size="sm"><Upload className="h-4 w-4 mr-2" />导入</Button>
          <Button onClick={onOpenConfig} variant="outline" size="sm"><Settings className="h-4 w-4 mr-2" />配置</Button>
          <Button onClick={exportToCSV} variant="outline" size="sm"><Download className="h-4 w-4 mr-2" />导出</Button>
          <Button onClick={onAdd} className="bg-primary hover:bg-primary/90" size="sm"><Plus className="h-4 w-4 mr-2" />添加</Button>
        </div>
      </div>
      <div className="bg-blue-50 dark:bg-blue-950/30 p-3 rounded-lg space-y-1">
        <p className="text-sm text-blue-800 dark:text-blue-200">{selectedConfig?.description || defaultConfig.description}</p>
        <p className="text-xs text-blue-600 dark:text-blue-400">💡 拖拽列头可调整顺序 | 拖拽列边缘可调整宽度 | 双击单元格可编辑</p>
      </div>
      <div className="bg-card rounded-lg shadow-md overflow-hidden border">
        <div className="overflow-x-auto">
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
            <Table>
              <TableHeader>
                <TableRow>
                  <SortableContext items={displayColumns} strategy={horizontalListSortingStrategy}>
                    {displayColumns.map(column => (
                      <ResizableTableHeader key={column} column={column} label={getFieldLabel(column)} width={getColumnWidth(column)} onResize={handleColumnResize} />
                    ))}
                  </SortableContext>
                  <TableHead className="w-28 sticky right-0 bg-card">操作</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {equipments.map((equipment, index) => (
                  <EquipmentTableRow key={equipment.id} equipment={equipment} index={index} displayColumns={displayColumns}
                    columnWidths={columnWidths} editingCell={editingCell} onStartEdit={(field) => setEditingCell({ equipmentId: equipment.id, field })}
                    onCancelEdit={() => setEditingCell(null)} onInlineSave={handleInlineSave} onStatusChange={onStatusChange}
                    onView={onView} onEdit={onEdit} onDelete={onDelete} getFieldValue={getFieldValue} getColumnWidth={(col) => getColumnWidth(col)} />
                ))}
              </TableBody>
            </Table>
          </DndContext>
        </div>
      </div>
      {equipments.length === 0 && (<div className="text-center py-12 bg-card rounded-lg border"><p className="text-muted-foreground text-lg">暂无仪器数据</p></div>)}
      <TableImportModal isOpen={isImportModalOpen} onClose={() => setIsImportModalOpen(false)} onImport={onImport} columnLabels={columnLabels} availableColumns={getAllColumns()} />
      <EquipmentTypeManager isOpen={isTypeManagerOpen} onClose={() => setIsTypeManagerOpen(false)} equipments={equipments} onEquipmentRefresh={onEquipmentRefresh} onTypesUpdate={() => {}} />
    </div>
  );
};

interface EquipmentTableRowProps {
  equipment: Equipment; index: number; displayColumns: (keyof Equipment)[]; columnWidths: Record<string, number>;
  editingCell: { equipmentId: string; field: keyof Equipment } | null; onStartEdit: (field: keyof Equipment) => void;
  onCancelEdit: () => void; onInlineSave: (equipmentId: string, field: keyof Equipment, value: any) => void;
  onStatusChange?: (equipmentId: string, currentStatus: Equipment['status']) => void; onView: (equipment: Equipment) => void;
  onEdit: (equipment: Equipment) => void; onDelete: (id: string) => void;
  getFieldValue: (equipment: Equipment, field: keyof Equipment) => string; getColumnWidth: (column: keyof Equipment) => number;
}

const EquipmentTableRow: React.FC<EquipmentTableRowProps> = ({
  equipment, index, displayColumns, columnWidths, editingCell, onStartEdit, onCancelEdit, onInlineSave,
  onStatusChange, onView, onEdit, onDelete, getFieldValue, getColumnWidth
}) => {
  const [isSelected, setIsSelected] = useState(false);

  const handleCellContent = (column: keyof Equipment) => {
    const isEditing = editingCell?.equipmentId === equipment.id && editingCell?.field === column;
    if (column === 'imageUrl') return equipment.imageUrl ? <Button size="sm" variant="outline" onClick={(e) => { e.stopPropagation(); window.open(equipment.imageUrl, '_blank'); }} className="h-7 gap-1 text-xs"><Image className="h-3 w-3" />查看</Button> : <span className="text-muted-foreground text-xs">无</span>;
    if (column === 'sopFileUrl') return equipment.sopFileUrl ? <Button size="sm" variant="outline" onClick={(e) => { e.stopPropagation(); window.open(equipment.sopFileUrl, '_blank'); }} className="h-7 gap-1 text-xs"><FileText className="h-3 w-3" />查看</Button> : <span className="text-muted-foreground text-xs">无</span>;
    return <InlineEditCell value={column === 'status' ? equipment.status : getFieldValue(equipment, column)} field={column} equipmentId={equipment.id} onSave={onInlineSave} isEditing={isEditing} onStartEdit={() => onStartEdit(column)} onCancelEdit={onCancelEdit} />;
  };

  return (
    <TableRow className={`transition-all duration-200 ${isSelected ? 'bg-primary/5 border-l-4 border-l-primary' : 'hover:bg-muted/50'}`} onClick={() => setIsSelected(!isSelected)}>
      {displayColumns.map(column => (
        <TableCell key={column} className="whitespace-nowrap overflow-hidden"
          style={{ width: `${getColumnWidth(column)}px`, minWidth: `${getColumnWidth(column)}px`, maxWidth: `${getColumnWidth(column)}px` }}
          onDoubleClick={(e) => { e.stopPropagation(); onStartEdit(column); }}>
          {handleCellContent(column)}
        </TableCell>
      ))}
      <TableCell onClick={(e) => e.stopPropagation()} className="sticky right-0 bg-card">
        <div className="flex gap-1">
          <Button size="sm" variant="ghost" onClick={() => onView(equipment)} className="h-7 w-7 p-0" title="查看详情"><Eye className="h-3.5 w-3.5" /></Button>
          <Button size="sm" variant="ghost" onClick={() => onEdit(equipment)} className="h-7 w-7 p-0" title="编辑设备"><Edit className="h-3.5 w-3.5" /></Button>
          <Button size="sm" variant="ghost" onClick={() => onDelete(equipment.id)} className="h-7 w-7 p-0 text-destructive hover:text-destructive" title="删除设备"><Trash2 className="h-3.5 w-3.5" /></Button>
        </div>
      </TableCell>
    </TableRow>
  );
};

export default EquipmentTableView;
