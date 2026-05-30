import React, { useState } from 'react';
import { X, Plus, Trash2, Edit, Save, Copy } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Equipment, TableExportConfig, ColumnConfig, defaultColumnConfigs, EquipmentType, equipmentTypeLabels } from '@/types/equipment';

interface TableConfigModalProps {
  isOpen: boolean;
  onClose: () => void;
  exportConfigs: TableExportConfig[];
  onUpdateConfigs: (configs: TableExportConfig[]) => void;
  availableColumns: (keyof Equipment)[];
  columnLabels: Record<keyof Equipment, string>;
  onUpdateColumnLabels: (labels: Record<keyof Equipment, string>) => void;
}

const TableConfigModal: React.FC<TableConfigModalProps> = ({
  isOpen,
  onClose,
  exportConfigs,
  onUpdateConfigs,
  availableColumns,
  columnLabels,
  onUpdateColumnLabels
}) => {
  const [configs, setConfigs] = useState<TableExportConfig[]>(exportConfigs);
  const [labels, setLabels] = useState<Record<keyof Equipment, string>>(columnLabels);
  const [columnConfigs, setColumnConfigs] = useState<ColumnConfig[]>(defaultColumnConfigs);
  const [editingConfig, setEditingConfig] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'columns' | 'templates' | 'master-table'>('master-table');

  // 新增列的状态
  const [newColumnKey, setNewColumnKey] = useState('');
  const [newColumnLabel, setNewColumnLabel] = useState('');
  const [newColumnType, setNewColumnType] = useState<'text' | 'number' | 'date' | 'status' | 'equipment-type'>('text');

  // 自定义模板创建
  const [selectedColumns, setSelectedColumns] = useState<Set<keyof Equipment>>(new Set());
  const [newTemplateName, setNewTemplateName] = useState('');
  const [newTemplateDescription, setNewTemplateDescription] = useState('');

  if (!isOpen) return null;

  const handleSave = () => {
    onUpdateConfigs(configs);
    onUpdateColumnLabels(labels);
    onClose();
  };

  const handleAddTemplate = () => {
    const newConfig: TableExportConfig = {
      id: `template-${Date.now()}`,
      name: '新模板',
      columns: ['id', 'name', 'status'],
      description: '新建的模板'
    };
    setConfigs([...configs, newConfig]);
    setEditingConfig(newConfig.id);
  };

  const handleCreateCustomTemplate = () => {
    if (!newTemplateName || selectedColumns.size === 0) return;

    const newConfig: TableExportConfig = {
      id: `custom-${Date.now()}`,
      name: newTemplateName,
      columns: Array.from(selectedColumns),
      description: newTemplateDescription || '自定义模板'
    };

    setConfigs([...configs, newConfig]);
    
    // 重置状态
    setSelectedColumns(new Set());
    setNewTemplateName('');
    setNewTemplateDescription('');
  };

  const handleDeleteTemplate = (id: string) => {
    setConfigs(configs.filter(c => c.id !== id));
  };

  const handleUpdateTemplate = (id: string, updates: Partial<TableExportConfig>) => {
    setConfigs(configs.map(c => c.id === id ? { ...c, ...updates } : c));
  };

  const handleToggleColumn = (templateId: string, column: keyof Equipment) => {
    const template = configs.find(c => c.id === templateId);
    if (!template) return;

    const newColumns = template.columns.includes(column)
      ? template.columns.filter(c => c !== column)
      : [...template.columns, column];

    handleUpdateTemplate(templateId, { columns: newColumns });
  };

  const handleToggleSelectedColumn = (column: keyof Equipment) => {
    const newSelected = new Set(selectedColumns);
    if (newSelected.has(column)) {
      newSelected.delete(column);
    } else {
      newSelected.add(column);
    }
    setSelectedColumns(newSelected);
  };

  const handleAddColumn = () => {
    if (!newColumnKey || !newColumnLabel) return;

    const newConfig: ColumnConfig = {
      key: newColumnKey as keyof Equipment,
      label: newColumnLabel,
      type: newColumnType,
      required: false,
      editable: true
    };

    setColumnConfigs([...columnConfigs, newConfig]);
    setLabels(prev => ({ ...prev, [newColumnKey]: newColumnLabel }));
    
    // 清空输入
    setNewColumnKey('');
    setNewColumnLabel('');
    setNewColumnType('text');
  };

  const handleDeleteColumn = (key: keyof Equipment) => {
    if (columnConfigs.find(c => c.key === key)?.required) {
      alert('必填列不能删除');
      return;
    }

    setColumnConfigs(columnConfigs.filter(c => c.key !== key));
    
    // 从所有模板中移除这个列
    setConfigs(configs.map(config => ({
      ...config,
      columns: config.columns.filter(col => col !== key)
    })));
  };

  const handleDuplicateTemplate = (template: TableExportConfig) => {
    const newConfig: TableExportConfig = {
      id: `copy-${Date.now()}`,
      name: `${template.name} (副本)`,
      columns: [...template.columns],
      description: `${template.description} (副本)`
    };
    setConfigs([...configs, newConfig]);
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl max-w-6xl w-full max-h-screen overflow-y-auto shadow-2xl">
        <div className="flex justify-between items-center p-6 border-b bg-gradient-to-r from-blue-50 to-purple-50">
          <h2 className="text-xl font-bold text-gray-800">表格配置管理</h2>
          <Button variant="ghost" size="sm" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        </div>

        <div className="p-6">
          {/* 标签页 */}
          <div className="flex border-b mb-6 bg-gray-50 rounded-lg p-1">
            <button
              className={`px-6 py-3 font-medium rounded-md transition-all ${activeTab === 'master-table' ? 'bg-white shadow-md text-blue-600 border border-blue-200' : 'text-gray-500 hover:text-gray-700'}`}
              onClick={() => setActiveTab('master-table')}
            >
              总表管理
            </button>
            <button
              className={`px-6 py-3 font-medium rounded-md transition-all ${activeTab === 'columns' ? 'bg-white shadow-md text-blue-600 border border-blue-200' : 'text-gray-500 hover:text-gray-700'}`}
              onClick={() => setActiveTab('columns')}
            >
              列名管理
            </button>
            <button
              className={`px-6 py-3 font-medium rounded-md transition-all ${activeTab === 'templates' ? 'bg-white shadow-md text-blue-600 border border-blue-200' : 'text-gray-500 hover:text-gray-700'}`}
              onClick={() => setActiveTab('templates')}
            >
              导出模板管理
            </button>
          </div>

          {activeTab === 'master-table' && (
            <div className="space-y-6">
              <div className="bg-blue-50 p-4 rounded-lg border border-blue-200">
                <h3 className="text-lg font-bold text-blue-800 mb-1">总表列管理</h3>
                <p className="text-blue-600 text-sm">管理主数据表的所有可用列</p>
              </div>
              
              {/* 添加新列 */}
              <div className="bg-gray-50 p-4 rounded-lg border border-gray-200">
                <h4 className="font-semibold mb-3 text-gray-800">添加新列</h4>
                <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                  <Input
                    placeholder="列字段名 (英文)"
                    value={newColumnKey}
                    onChange={(e) => setNewColumnKey(e.target.value)}
                    className="focus:ring-2 focus:ring-blue-500"
                  />
                  <Input
                    placeholder="列显示名称"
                    value={newColumnLabel}
                    onChange={(e) => setNewColumnLabel(e.target.value)}
                    className="focus:ring-2 focus:ring-blue-500"
                  />
                  <Select value={newColumnType} onValueChange={(value: any) => setNewColumnType(value)}>
                    <SelectTrigger className="focus:ring-2 focus:ring-blue-500">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="text">文本</SelectItem>
                      <SelectItem value="number">数字</SelectItem>
                      <SelectItem value="date">日期</SelectItem>
                      <SelectItem value="status">状态</SelectItem>
                      <SelectItem value="equipment-type">设备类型</SelectItem>
                    </SelectContent>
                  </Select>
                  <Button 
                    onClick={handleAddColumn} 
                    disabled={!newColumnKey || !newColumnLabel}
                    className="bg-blue-600 hover:bg-blue-700"
                  >
                    <Plus className="h-4 w-4 mr-2" />
                    添加列
                  </Button>
                </div>
              </div>

              {/* 现有列列表 */}
              <div className="space-y-2">
                <h4 className="font-semibold text-gray-800">现有列</h4>
                <div className="grid gap-2">
                  {columnConfigs.map(config => (
                    <div key={config.key} className="flex items-center justify-between p-3 bg-white border border-gray-200 rounded-lg shadow-sm hover:shadow-md transition-shadow">
                      <div className="flex items-center gap-4">
                        <span className="font-mono text-sm bg-gray-100 px-3 py-1 rounded-md">{config.key}</span>
                        <span className="font-medium text-gray-800">{config.label}</span>
                        <span className="text-sm text-gray-500 capitalize bg-gray-50 px-2 py-1 rounded">{config.type}</span>
                        {config.required && (
                          <span className="text-xs bg-red-100 text-red-800 px-2 py-1 rounded-full font-medium">必填</span>
                        )}
                      </div>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => handleDeleteColumn(config.key)}
                        disabled={config.required}
                        className="text-red-600 hover:text-red-700 hover:bg-red-50"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {activeTab === 'columns' && (
            <div className="space-y-4">
              <div className="bg-blue-50 p-4 rounded-lg border border-blue-200">
                <h3 className="text-lg font-bold text-blue-800 mb-1">自定义列名</h3>
                <p className="text-blue-600 text-sm">设置各列在界面中的显示名称</p>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {availableColumns.map(column => (
                  <div key={column} className="flex items-center gap-3 p-3 bg-white border border-gray-200 rounded-lg">
                    <Label className="w-24 text-sm font-medium text-gray-700">{column}:</Label>
                    <Input
                      value={labels[column] || ''}
                      onChange={(e) => setLabels(prev => ({ ...prev, [column]: e.target.value }))}
                      placeholder={`${column}的显示名称`}
                      className="flex-1 focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                ))}
              </div>
            </div>
          )}

          {activeTab === 'templates' && (
            <div className="space-y-6">
              <div className="flex justify-between items-center">
                <div className="bg-blue-50 p-4 rounded-lg border border-blue-200 flex-1 mr-4">
                  <h3 className="text-lg font-bold text-blue-800 mb-1">导出模板管理</h3>
                  <p className="text-blue-600 text-sm">创建和管理数据导出模板</p>
                </div>
                <Button onClick={handleAddTemplate} className="bg-blue-600 hover:bg-blue-700">
                  <Plus className="h-4 w-4 mr-2" />
                  添加模板
                </Button>
              </div>

              {/* 自定义模板创建区域 */}
              <div className="bg-green-50 p-4 rounded-lg border border-green-200">
                <h4 className="font-semibold text-green-800 mb-3">快速创建自定义模板</h4>
                <div className="space-y-3">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <Input
                      placeholder="模板名称"
                      value={newTemplateName}
                      onChange={(e) => setNewTemplateName(e.target.value)}
                      className="focus:ring-2 focus:ring-green-500"
                    />
                    <Input
                      placeholder="模板描述"
                      value={newTemplateDescription}
                      onChange={(e) => setNewTemplateDescription(e.target.value)}
                      className="focus:ring-2 focus:ring-green-500"
                    />
                  </div>
                  
                  <div>
                    <Label className="text-sm font-medium mb-2 block text-green-800">选择包含的列:</Label>
                    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2 max-h-32 overflow-y-auto bg-white p-3 rounded border">
                      {availableColumns.map(column => (
                        <div key={column} className="flex items-center space-x-2">
                          <Checkbox
                            id={`custom-${column}`}
                            checked={selectedColumns.has(column)}
                            onCheckedChange={() => handleToggleSelectedColumn(column)}
                          />
                          <Label htmlFor={`custom-${column}`} className="text-sm">
                            {labels[column] || column}
                          </Label>
                        </div>
                      ))}
                    </div>
                  </div>
                  
                  <Button 
                    onClick={handleCreateCustomTemplate}
                    disabled={!newTemplateName || selectedColumns.size === 0}
                    className="bg-green-600 hover:bg-green-700"
                  >
                    <Plus className="h-4 w-4 mr-2" />
                    创建模板 ({selectedColumns.size} 列)
                  </Button>
                </div>
              </div>

              {/* 现有模板列表 */}
              {configs.map(config => (
                <div key={config.id} className="border border-gray-200 rounded-lg p-4 bg-white shadow-sm">
                  <div className="flex justify-between items-start mb-4">
                    <div className="flex-1 mr-4">
                      {editingConfig === config.id ? (
                        <div className="space-y-2">
                          <Input
                            value={config.name}
                            onChange={(e) => handleUpdateTemplate(config.id, { name: e.target.value })}
                            placeholder="模板名称"
                            className="focus:ring-2 focus:ring-blue-500"
                          />
                          <Textarea
                            value={config.description}
                            onChange={(e) => handleUpdateTemplate(config.id, { description: e.target.value })}
                            placeholder="模板描述"
                            rows={2}
                            className="focus:ring-2 focus:ring-blue-500"
                          />
                        </div>
                      ) : (
                        <div>
                          <h4 className="font-semibold text-gray-800">{config.name}</h4>
                          <p className="text-sm text-gray-600">{config.description}</p>
                          <p className="text-xs text-gray-500 mt-1">包含 {config.columns.length} 列</p>
                        </div>
                      )}
                    </div>
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => handleDuplicateTemplate(config)}
                        className="text-blue-600 hover:text-blue-700"
                        title="复制模板"
                      >
                        <Copy className="h-4 w-4" />
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => setEditingConfig(editingConfig === config.id ? null : config.id)}
                        className="text-gray-600 hover:text-gray-700"
                      >
                        {editingConfig === config.id ? <Save className="h-4 w-4" /> : <Edit className="h-4 w-4" />}
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => handleDeleteTemplate(config.id)}
                        className="text-red-600 hover:text-red-700"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>

                  <div>
                    <Label className="text-sm font-medium mb-2 block text-gray-700">包含列:</Label>
                    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2">
                      {availableColumns.map(column => (
                        <div key={column} className="flex items-center space-x-2">
                          <Checkbox
                            id={`${config.id}-${column}`}
                            checked={config.columns.includes(column)}
                            onCheckedChange={() => handleToggleColumn(config.id, column)}
                          />
                          <Label htmlFor={`${config.id}-${column}`} className="text-sm">
                            {labels[column] || column}
                          </Label>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          <div className="flex justify-end gap-3 mt-8 pt-6 border-t">
            <Button variant="outline" onClick={onClose} className="bg-gray-50">
              取消
            </Button>
            <Button onClick={handleSave} className="bg-green-600 hover:bg-green-700">
              <Save className="h-4 w-4 mr-2" />
              保存配置
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default TableConfigModal;
