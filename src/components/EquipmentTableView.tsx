
import React, { useState, useCallback, useMemo } from 'react';
import { Download, Eye, Edit, Trash2, Plus, Settings, Upload, Image, FileText, Link } from 'lucide-react';
import { DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors, DragEndEvent } from '@dnd-kit/core';
import { arrayMove, SortableContext, horizontalListSortingStrategy } from '@dnd-kit/sortable';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Equipment, statusLabels, statusColors, statusIcons, TableExportConfig, getAllColumns, equipmentTypeLabels, EquipmentType, camelToSnake, ColumnConfig } from '@/types/equipment';
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
  columnLabels: Record<string, string>;
  tableSchema?: { columnConfigs: ColumnConfig[]; frontendColumns: (keyof Equipment)[] };
  onOpenConfig: () => void;
  onStatusChange?: (equipmentId: string, currentStatus: Equipment['status']) => void;
  onEquipmentUpdate?: (equipment: Equipment) => void;
  onEquipmentRefresh?: () => void;
}

const EquipmentTableView: React.FC<EquipmentTableViewProps> = ({
  equipments,
  onEdit,
  onDelete,
  onView,
  onAdd,
  onImport,
  exportConfigs,
  columnLabels,
  tableSchema,
  onOpenConfig,
  onStatusChange,
  onEquipmentUpdate,
  onEquipmentRefresh
}) => {
  const { toast } = useToast();
  
  // Create default config if exportConfigs is empty
  const defaultConfig: TableExportConfig = {
    id: 'complete-info',
    name: '完整信息表',
    description: '包含所有设备信息的详细表格',
    columns: getAllColumns()
  };
  
  const [selectedConfig, setSelectedConfig] = useState<TableExportConfig>(
    exportConfigs.length > 0 ? exportConfigs[0] : defaultConfig
  );
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [isTypeManagerOpen, setIsTypeManagerOpen] = useState(false);
  
  // 列顺序状态 — 动态列优先，过滤掉已删除的无效列
  const validColumns = tableSchema?.frontendColumns?.length
    ? tableSchema.frontendColumns
    : getAllColumns();
  const [columnOrder, setColumnOrder] = useState<(keyof Equipment)[]>(() => {
    const saved = localStorage.getItem('equipment-table-column-order');
    if (saved) {
      const parsed = JSON.parse(saved) as (keyof Equipment)[];
      // Only keep columns that still exist in the valid list
      const filtered = parsed.filter(col => validColumns.includes(col));
      // If we lost columns, update localStorage
      if (filtered.length !== parsed.length) {
        localStorage.setItem('equipment-table-column-order', JSON.stringify(filtered));
      }
      return filtered.length > 0 ? filtered : validColumns;
    }
    return validColumns;
  });
  
  // 列宽度状态
  const [columnWidths, setColumnWidths] = useState<Record<string, number>>(() => {
    const saved = localStorage.getItem('equipment-table-column-widths');
    return saved ? JSON.parse(saved) : {};
  });

  // 编辑状态
  const [editingCell, setEditingCell] = useState<{ equipmentId: string; field: keyof Equipment } | null>(null);

  // DnD sensors
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    }),
    useSensor(KeyboardSensor)
  );

  // 获取当前配置的列，按照自定义顺序排列
  const getDisplayColumns = useCallback(() => {
    const configColumns = selectedConfig?.id === 'complete-info'
      ? validColumns
      : (selectedConfig?.columns || validColumns);
    // 按照 columnOrder 排序，合并动态新增的列
    const merged = [...new Set([...columnOrder, ...validColumns])];
    return merged.filter(col => configColumns.includes(col as any));
  }, [selectedConfig, columnOrder, validColumns]);

  const displayColumns = useMemo(() => getDisplayColumns(), [getDisplayColumns]);

  const getFieldValue = (equipment: Equipment, field: keyof Equipment): string => {
    const value = equipment[field];
    if (field === 'status') {
      return statusLabels[value as Equipment['status']];
    }
    if (field === 'type') {
      // 检查自定义类型
      const customTypes = JSON.parse(localStorage.getItem('equipment-custom-types') || '[]');
      const customType = customTypes.find((ct: any) => ct.customType === value);
      if (customType) return customType.customType;
      return equipmentTypeLabels[value as EquipmentType] || value?.toString() || '-';
    }
    return value?.toString() || '-';
  };

  const getFieldLabel = (field: keyof Equipment): string => {
    return columnLabels[field] || field;
  };

  const getColumnWidth = (column: keyof Equipment): number => {
    return columnWidths[column] || 150;
  };

  const handleColumnResize = useCallback((column: keyof Equipment, width: number) => {
    setColumnWidths(prev => {
      const updated = { ...prev, [column]: width };
      localStorage.setItem('equipment-table-column-widths', JSON.stringify(updated));
      return updated;
    });
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

  // 内联编辑保存
  const handleInlineSave = useCallback(async (equipmentId: string, field: keyof Equipment, value: any) => {
    try {
      // 如果修改负责人，同时查询邮箱和user_id
      let extraUpdates: Record<string, any> = {};

      if (field === 'responsible' && value) {
        const { data: userData } = await supabase
          .from('profiles')
          .select('email, user_id')
          .eq('username', value)
          .maybeSingle();
        if (userData?.email) {
          extraUpdates.responsible_email = userData.email;
        }
      }

      // 动态字段名转换：camelCase → snake_case（自动匹配DB列）
      const dbField = camelToSnake(field as string);
      
      // 合并额外字段（如自动查询的邮箱）
      const updateData = { [dbField]: value, ...extraUpdates };

      const { error } = await supabase
        .from('equipment')
        .update(updateData)
        .eq('id', equipmentId);

      if (error) throw error;

      // 更新本地状态 — 同时应用额外字段
      const equipment = equipments.find(e => e.id === equipmentId);
      if (equipment && onEquipmentUpdate) {
        const mergedUpdates = { [field]: value };
        if (extraUpdates.responsible_email) {
          (mergedUpdates as any).responsible_email = extraUpdates.responsible_email;
        }
        onEquipmentUpdate({ ...equipment, ...mergedUpdates });
      }

      toast({
        title: '已保存',
        description: `${getFieldLabel(field)} 已更新`,
      });
    } catch (error) {
      console.error('保存失败:', error);
      toast({
        title: '保存失败',
        description: '请重试',
        variant: 'destructive'
      });
    }
  }, [equipments, onEquipmentUpdate, toast, columnLabels]);

  const exportToCSV = () => {
    const headers = displayColumns.map(col => getFieldLabel(col));
    const csvContent = [
      headers.join(','),
      ...equipments.map(equipment => 
        displayColumns.map(col => `"${getFieldValue(equipment, col)}"`).join(',')
      )
    ].join('\n');

    const blob = new Blob(['\ufeff' + csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `${selectedConfig.name}_${new Date().toISOString().split('T')[0]}.csv`;
    link.click();
  };

  return (
    <div className="space-y-6">
      {/* 表格控制栏 */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-card p-4 rounded-lg shadow-md border">
        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
          <h2 className="text-lg font-semibold">表格视图</h2>
          {exportConfigs.length > 0 && (
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">导出模板:</span>
              <Select
                value={selectedConfig?.id || defaultConfig.id}
                onValueChange={(value) => {
                  const config = exportConfigs.find(c => c.id === value);
                  if (config) setSelectedConfig(config);
                }}
              >
                <SelectTrigger className="w-48">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {exportConfigs.map(config => (
                    <SelectItem key={config.id} value={config.id}>
                      {config.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
        </div>
        
        <div className="flex flex-wrap gap-2">
          <Button onClick={() => setIsTypeManagerOpen(true)} variant="outline" size="sm">
            <Link className="h-4 w-4 mr-2" />
            类型管理
          </Button>
          <Button onClick={() => setIsImportModalOpen(true)} variant="outline" size="sm">
            <Upload className="h-4 w-4 mr-2" />
            导入
          </Button>
          <Button onClick={onOpenConfig} variant="outline" size="sm">
            <Settings className="h-4 w-4 mr-2" />
            配置
          </Button>
          <Button onClick={exportToCSV} variant="outline" size="sm">
            <Download className="h-4 w-4 mr-2" />
            导出
          </Button>
          <Button onClick={onAdd} className="bg-primary hover:bg-primary/90" size="sm">
            <Plus className="h-4 w-4 mr-2" />
            添加
          </Button>
        </div>
      </div>

      {/* 模板描述和提示 */}
      <div className="bg-blue-50 dark:bg-blue-950/30 p-3 rounded-lg space-y-1">
        <p className="text-sm text-blue-800 dark:text-blue-200">
          {selectedConfig?.description || defaultConfig.description}
        </p>
        <p className="text-xs text-blue-600 dark:text-blue-400">
          💡 拖拽列头可调整顺序 | 拖拽列边缘可调整宽度 | 双击单元格可编辑
        </p>
      </div>

      {/* 表格 */}
      <div className="bg-card rounded-lg shadow-md overflow-hidden border">
        <div className="overflow-x-auto">
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={handleDragEnd}
          >
            <Table>
              <TableHeader className="bg-gradient-to-r from-slate-100 to-blue-50 dark:from-slate-800 dark:to-slate-700">
                <TableRow className="hover:bg-transparent">
                  <SortableContext items={displayColumns} strategy={horizontalListSortingStrategy}>
                    {displayColumns.map(column => (
                      <ResizableTableHeader
                        key={column}
                        column={column}
                        label={getFieldLabel(column)}
                        width={getColumnWidth(column)}
                        onResize={handleColumnResize}
                      />
                    ))}
                  </SortableContext>
                  <TableHead className="w-28 sticky right-0 bg-gradient-to-r from-slate-100 to-blue-50 dark:from-slate-800 dark:to-slate-700 font-semibold">操作</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {equipments.map((equipment, index) => (
                  <EquipmentTableRow
                    key={equipment.id}
                    equipment={equipment}
                    index={index}
                    displayColumns={displayColumns}
                    columnWidths={columnWidths}
                    editingCell={editingCell}
                    onStartEdit={(field) => setEditingCell({ equipmentId: equipment.id, field })}
                    onCancelEdit={() => setEditingCell(null)}
                    onInlineSave={handleInlineSave}
                    onStatusChange={onStatusChange}
                    onView={onView}
                    onEdit={onEdit}
                    onDelete={onDelete}
                    getFieldValue={getFieldValue}
                    getColumnWidth={(col) => getColumnWidth(col)}
                  />
                ))}
              </TableBody>
            </Table>
          </DndContext>
        </div>
      </div>

      {equipments.length === 0 && (
        <div className="text-center py-12 bg-card rounded-lg border">
          <p className="text-muted-foreground text-lg">暂无仪器数据</p>
        </div>
      )}

      <TableImportModal
        isOpen={isImportModalOpen}
        onClose={() => setIsImportModalOpen(false)}
        onImport={onImport}
        columnLabels={columnLabels}
        availableColumns={getAllColumns()}
      />

      <EquipmentTypeManager
        isOpen={isTypeManagerOpen}
        onClose={() => setIsTypeManagerOpen(false)}
        equipments={equipments}
        onEquipmentRefresh={onEquipmentRefresh}
        onTypesUpdate={() => {}}
      />
    </div>
  );
};

// Optimized row component with inline editing
interface EquipmentTableRowProps {
  equipment: Equipment;
  index: number;
  displayColumns: (keyof Equipment)[];
  columnWidths: Record<string, number>;
  editingCell: { equipmentId: string; field: keyof Equipment } | null;
  onStartEdit: (field: keyof Equipment) => void;
  onCancelEdit: () => void;
  onInlineSave: (equipmentId: string, field: keyof Equipment, value: any) => void;
  onStatusChange?: (equipmentId: string, currentStatus: Equipment['status']) => void;
  onView: (equipment: Equipment) => void;
  onEdit: (equipment: Equipment) => void;
  onDelete: (id: string) => void;
  getFieldValue: (equipment: Equipment, field: keyof Equipment) => string;
  getColumnWidth: (column: keyof Equipment) => number;
}

const EquipmentTableRow: React.FC<EquipmentTableRowProps> = ({
  equipment,
  index,
  displayColumns,
  columnWidths,
  editingCell,
  onStartEdit,
  onCancelEdit,
  onInlineSave,
  onStatusChange,
  onView,
  onEdit,
  onDelete,
  getFieldValue,
  getColumnWidth
}) => {
  const [isSelected, setIsSelected] = useState(false);

  const handleRowClick = () => {
    setIsSelected(!isSelected);
  };

  const getStatusBorderColor = (status: Equipment['status']) => {
    const colors: Record<string, string> = {
      'available': '#10b981',
      'in-use': '#3b82f6',
      'calibration': '#f59e0b',
      'out-of-order': '#ef4444',
      'scrapped': '#6b7280',
    };
    return colors[status] || '#e2e8f0';
  };

  const getStatusStyle = (status: Equipment['status']) => {
    const styles: Record<string, string> = {
      'available': 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300',
      'in-use': 'bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-300',
      'calibration': 'bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-300',
      'out-of-order': 'bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-300',
      'scrapped': 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400',
    };
    return styles[status] || '';
  };

  const handleCellContent = (column: keyof Equipment) => {
    const isEditing = editingCell?.equipmentId === equipment.id && editingCell?.field === column;
    
    // 不可编辑的特殊列
    if (column === 'imageUrl') {
      return equipment.imageUrl ? (
        <Button
          size="sm"
          variant="outline"
          onClick={(e) => {
            e.stopPropagation();
            window.open(equipment.imageUrl, '_blank');
          }}
          className="h-7 gap-1 text-xs"
        >
          <Image className="h-3 w-3" />
          查看
        </Button>
      ) : (
        <span className="text-muted-foreground text-xs">无</span>
      );
    }

    if (column === 'sopFileUrl') {
      return equipment.sopFileUrl ? (
        <Button
          size="sm"
          variant="outline"
          onClick={(e) => {
            e.stopPropagation();
            window.open(equipment.sopFileUrl, '_blank');
          }}
          className="h-7 gap-1 text-xs"
        >
          <FileText className="h-3 w-3" />
          查看
        </Button>
      ) : (
        <span className="text-muted-foreground text-xs">无</span>
      );
    }

    // 状态列特殊处理 — 彩色 Badge
    if (column === 'status') {
      return isEditing ? (
        <InlineEditCell
          value={equipment.status}
          field={column}
          equipmentId={equipment.id}
          onSave={onInlineSave}
          isEditing={isEditing}
          onStartEdit={() => onStartEdit(column)}
          onCancelEdit={onCancelEdit}
        />
      ) : (
        <span
          className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold cursor-pointer hover:opacity-80 transition-opacity ${getStatusStyle(equipment.status)}`}
          onDoubleClick={(e) => {
            e.stopPropagation();
            onStartEdit(column);
          }}
          title="双击更改状态"
        >
          <span>{statusIcons[equipment.status]}</span>
          <span>{statusLabels[equipment.status]}</span>
        </span>
      );
    }

    // 其他可编辑列 — 空值显示占位符
    const rawValue = getFieldValue(equipment, column);
    const displayValue = rawValue === '' || rawValue === null || rawValue === undefined ? '—' : rawValue;

    return isEditing ? (
      <InlineEditCell
        value={rawValue}
        field={column}
        equipmentId={equipment.id}
        onSave={onInlineSave}
        isEditing={isEditing}
        onStartEdit={() => onStartEdit(column)}
        onCancelEdit={onCancelEdit}
      />
    ) : (
      <span
        className={`text-sm ${displayValue === '—' ? 'text-gray-300 dark:text-gray-600 italic' : 'text-foreground'}`}
        onDoubleClick={(e) => {
          e.stopPropagation();
          onStartEdit(column);
        }}
        title={displayValue === '—' ? '双击编辑' : String(displayValue)}
      >
        {displayValue}
      </span>
    );
  };

  return (
    <TableRow
      className={`transition-all duration-200 border-l-4 ${
        isSelected
          ? 'bg-primary/10 border-l-primary'
          : index % 2 === 0
            ? 'bg-white dark:bg-slate-900 border-l-transparent hover:bg-blue-50/50 dark:hover:bg-slate-800/50'
            : 'bg-slate-50/50 dark:bg-slate-900/50 border-l-transparent hover:bg-blue-50/50 dark:hover:bg-slate-800/50'
      }`}
      style={{
        borderLeftColor: !isSelected ? getStatusBorderColor(equipment.status) : undefined
      }}
      onClick={handleRowClick}
    >
      {displayColumns.map(column => (
        <TableCell 
          key={column} 
          className="whitespace-nowrap overflow-hidden"
          style={{ 
            width: `${getColumnWidth(column)}px`,
            minWidth: `${getColumnWidth(column)}px`,
            maxWidth: `${getColumnWidth(column)}px`
          }}
          onDoubleClick={(e) => {
            e.stopPropagation();
            onStartEdit(column);
          }}
        >
          {handleCellContent(column)}
        </TableCell>
      ))}
      <TableCell
        onClick={(e) => e.stopPropagation()}
        className="sticky right-0 bg-white dark:bg-slate-900 shadow-l"
        style={{ boxShadow: '-4px 0 8px -4px rgba(0,0,0,0.1)' }}
      >
        <div className="flex gap-0.5">
          <Button
            size="sm"
            variant="ghost"
            onClick={() => onView(equipment)}
            className="h-7 w-7 p-0 hover:bg-blue-100 hover:text-blue-600 dark:hover:bg-blue-900"
            title="查看详情"
          >
            <Eye className="h-3.5 w-3.5" />
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => onEdit(equipment)}
            className="h-7 w-7 p-0 hover:bg-amber-100 hover:text-amber-600 dark:hover:bg-amber-900"
            title="编辑设备"
          >
            <Edit className="h-3.5 w-3.5" />
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => onDelete(equipment.id)}
            className="h-7 w-7 p-0 text-destructive hover:text-destructive"
            title="删除设备"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      </TableCell>
    </TableRow>
  );
};

export default EquipmentTableView;
