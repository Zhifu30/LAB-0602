import React, { useState, useRef } from 'react';
import { X, Upload, FileText, CheckCircle, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Equipment, EquipmentStatus, EquipmentType, statusLabels, equipmentTypeLabels } from '@/types/equipment';
import * as XLSX from 'xlsx';

interface TableImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  onImport: (equipments: Equipment[]) => void;
  columnLabels: Record<keyof Equipment, string>;
  availableColumns: (keyof Equipment)[];
}

const TableImportModal: React.FC<TableImportModalProps> = ({
  isOpen,
  onClose,
  onImport,
  columnLabels,
  availableColumns
}) => {
  const [csvData, setCsvData] = useState<string[][]>([]);
  const [headers, setHeaders] = useState<string[]>([]);
  const [mappedColumns, setMappedColumns] = useState<Record<number, keyof Equipment | null>>({});
  const [previewData, setPreviewData] = useState<Equipment[]>([]);
  const [step, setStep] = useState<'upload' | 'mapping' | 'preview'>('upload');
  const [parseError, setParseError] = useState<string>('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!isOpen) return null;

  const parseCSV = (text: string): string[][] => {
    try {
      const lines = text.trim().split('\n');
      const result: string[][] = [];
      
      for (const line of lines) {
        const row: string[] = [];
        let current = '';
        let inQuotes = false;
        let i = 0;
        
        while (i < line.length) {
          const char = line[i];
          
          if (char === '"') {
            if (inQuotes && i + 1 < line.length && line[i + 1] === '"') {
              current += '"';
              i += 2;
            } else {
              inQuotes = !inQuotes;
              i++;
            }
          } else if (char === ',' && !inQuotes) {
            row.push(current.trim());
            current = '';
            i++;
          } else {
            current += char;
            i++;
          }
        }
        
        row.push(current.trim());
        result.push(row);
      }
      
      return result;
    } catch (error) {
      console.error('CSV解析错误:', error);
      throw new Error('CSV解析失败：格式不正确');
    }
  };

  const parseExcel = (file: File): Promise<string[][]> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const data = new Uint8Array(e.target?.result as ArrayBuffer);
          const workbook = XLSX.read(data, { type: 'array' });
          const sheetName = workbook.SheetNames[0];
          const worksheet = workbook.Sheets[sheetName];
          
          // 使用 sheet_to_json 并处理空值
          const jsonData = XLSX.utils.sheet_to_json(worksheet, { 
            header: 1, 
            defval: '', // 设置默认值为空字符串
            raw: false // 不使用原始值，确保所有内容都是字符串
          }) as string[][];
          
          console.log('Excel解析成功，数据行数:', jsonData.length);
          console.log('前5行数据:', jsonData.slice(0, 5));
          
          resolve(jsonData);
        } catch (error) {
          console.error('Excel解析失败:', error);
          reject(new Error('Excel文件解析失败: ' + (error instanceof Error ? error.message : '未知错误')));
        }
      };
      reader.onerror = () => reject(new Error('文件读取失败'));
      reader.readAsArrayBuffer(file);
    });
  };

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    console.log('开始处理文件:', file.name, file.size);
    setParseError('');
    
    try {
      let parsed: string[][];
      
      // 检查文件类型
      const fileExtension = file.name.toLowerCase().split('.').pop();
      console.log('文件扩展名:', fileExtension);
      
      if (fileExtension === 'xlsx' || fileExtension === 'xls') {
        // 处理Excel文件
        parsed = await parseExcel(file);
      } else {
        // 处理CSV文件
        const text = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = (e) => resolve(e.target?.result as string);
          reader.onerror = () => reject(new Error('文件读取失败'));
          reader.readAsText(file, 'utf-8');
        });
        parsed = parseCSV(text);
      }
      
      console.log('文件解析结果:', parsed.length, '行');
      
      if (parsed.length === 0) {
        throw new Error('文件为空或格式不正确');
      }

      if (parsed.length === 1) {
        throw new Error('文件只包含标题行，没有数据行');
      }
      
      // 过滤空行并处理数据
      const filteredData = parsed.filter(row => 
        row && row.length > 0 && row.some(cell => cell && cell.toString().trim() !== '')
      );
      
      if (filteredData.length < 2) {
        throw new Error('没有找到有效的数据行');
      }
      
      // 处理数据，确保所有值都是字符串
      const processedData = filteredData.map(row => 
        row.map(cell => (cell || '').toString().trim())
      );
      
      console.log('处理后的数据:', processedData.length, '行');
      
      setHeaders(processedData[0]);
      setCsvData(processedData.slice(1));
      
      // Enhanced header matching logic with English support
      const autoMapping: Record<number, keyof Equipment | null> = {};
      
      const isMatch = (headerText: string | undefined | null, patterns: string[]): boolean => {
        if (!headerText || typeof headerText !== 'string' || headerText.trim() === '') return false;
        const header = String(headerText).toLowerCase().trim().replace(/['"\/\s\-_]/g, '');
        return patterns.some(pattern => {
          const cleanPattern = pattern.toLowerCase().replace(/[\/\s\-_]/g, '');
          return header.includes(cleanPattern) || cleanPattern.includes(header) || 
                 header === cleanPattern || 
                 (header.length > 2 && cleanPattern.length > 2 && 
                  (header.includes(cleanPattern.substring(0, Math.min(cleanPattern.length, 4))) ||
                   cleanPattern.includes(header.substring(0, Math.min(header.length, 4)))));
        });
      };
      
      processedData[0].forEach((header, index) => {
        if (!header || typeof header !== 'string' || header.trim() === '') return;
        const normalizedHeader = String(header).toLowerCase().trim().replace(/['"]/g, '');
        
        const matchedColumn = availableColumns.find(column => {
          const label = columnLabels[column].toLowerCase();
          const columnKey = column.toLowerCase();
          
          // Direct label/key matching
          if (label === normalizedHeader || columnKey === normalizedHeader) return true;
          
          // Enhanced pattern matching for each field
          switch (column) {
            case 'id':
              return isMatch(header, ['Equipment ID', 'ID', '设备ID', '仪器编号', '编号', 'Device ID', 'Equipment No']);
            case 'name':
              return isMatch(header, ['Equipment Name', 'System Name', 'Device Name', '设备名称', '仪器名称', '名称', 'System/Equipment Name']);
            case 'model':
              return isMatch(header, ['Model', '型号', 'Model No', 'Model Number']);
            case 'serialNumber':
              return isMatch(header, ['Serial No', 'Serial Number', 'Serial No./ Code', '序列号', 'Code', 'S/N']);
            case 'manufacturer':
              return isMatch(header, ['Manufacturer', 'Supplier', 'Manufacturer/ Supplier', '厂商', '制造商', '供应商']);
            case 'status':
              return isMatch(header, ['Status', '状态', 'State', 'Condition']);
            case 'location':
              return isMatch(header, ['Location', '位置', 'Position', 'Place']);
            case 'type':
              return isMatch(header, ['Type', 'Category', '类型', '分类', '设备类型']);
            case 'assetNumber':
              return isMatch(header, ['Fixed asset No', 'Asset Number', 'Asset No', '资产编号', 'Fixed Asset No.']);
            case 'description':
              return isMatch(header, ['Description', 'Remark', 'Note', '描述', '备注', 'Comment']);
            case 'calibrationCycle':
              return isMatch(header, ['Calibration Interval', 'Cal Interval', '校正周期', 'CALIBRATION INTERVAL']);
            case 'lastCalibrationDate':
              return isMatch(header, ['Calibration Date', 'Last Calibration', '上次校正', 'CALIBRATION DATE']);
            case 'nextCalibrationDate':
              return isMatch(header, ['Next Calibration due date', 'Next Calibration', '下次校正', 'Next Cal Date']);
            case 'responsible':
              return isMatch(header, ['Responsible', 'Owner', 'User', '负责人', '使用人']);
            case 'supplier':
              return isMatch(header, ['Supplier', 'Vendor', '供应商', '厂商']);
            case 'specifications':
              return isMatch(header, ['Specifications', 'Spec', 'Tech Spec', '技术规格', '规格']);
            default:
              return normalizedHeader.includes(label) || label.includes(normalizedHeader);
          }
        });
        
        if (matchedColumn) {
          autoMapping[index] = matchedColumn;
          console.log(`自动匹配: ${header} -> ${matchedColumn}`);
        }
      });
      
      setMappedColumns(autoMapping);
      setStep('mapping');
    } catch (error) {
      console.error('文件处理失败:', error);
      setParseError(error instanceof Error ? error.message : '文件解析失败，请检查文件格式');
    }
  };

  const generatePreview = () => {
    console.log('开始生成预览数据');
    const equipments: Equipment[] = [];
    
    csvData.forEach((row, rowIndex) => {
      const equipment: Partial<Equipment> = {};
      
      Object.entries(mappedColumns).forEach(([colIndex, column]) => {
        const cellValue = row[parseInt(colIndex)];
        if (column && cellValue !== undefined && cellValue !== null && cellValue !== '') {
          let value = String(cellValue).replace(/^"|"$/g, '').trim();
          
          if (column === 'status') {
            const statusMap: Record<string, EquipmentStatus> = {
              '待用': 'available',
              '使用中': 'in-use', 
              '校正': 'calibration',
              '故障': 'out-of-order',
              'available': 'available',
              'in-use': 'in-use',
              'calibration': 'calibration',
              'out-of-order': 'out-of-order'
            };
            value = statusMap[value] || 'available';
          }
          
          if (column === 'type') {
            const typeMap: Record<string, EquipmentType> = {
              '显微镜': 'microscope',
              '离心机': 'centrifuge',
              'HPLC': 'hplc',
              '分光光度计': 'spectrophotometer',
              '培养箱': 'incubator',
              '高压灭菌器': 'autoclave',
              '天平': 'balance',
              'PCR仪': 'pcr',
              '其他': 'other'
            };
            value = typeMap[value] || 'other';
          }
          
          if (['purchasePrice', 'depreciationRate', 'currentValue', 'usageHours'].includes(column)) {
            const numValue = parseFloat(value);
            if (!isNaN(numValue)) {
              (equipment as any)[column] = numValue;
            }
          } else {
            (equipment as any)[column] = value;
          }
        }
      });
      
      // 生成临时ID（将在导入时重新处理）
      const tempId = equipment.id && equipment.id.trim() !== '' ? 
        equipment.id.trim() : 
        `TEMP-${rowIndex + 1}-${Date.now()}`;
      
      // 确保必填字段有默认值
      const finalEquipment: Equipment = {
        id: tempId,
        name: equipment.name || `导入设备${rowIndex + 1}`,
        model: equipment.model || '未知型号',
        manufacturer: equipment.manufacturer || '未知厂商',
        status: (equipment.status as EquipmentStatus) || 'available',
        location: equipment.location || '待分配',
        maintenanceDate: equipment.maintenanceDate || new Date().toISOString().split('T')[0],
        description: equipment.description || '从Excel表格导入',
        responsible: equipment.responsible || '待分配',
        type: (equipment.type as EquipmentType) || 'other',
        notes: equipment.notes || equipment.description || '从Excel表格导入',
        serialNumber: equipment.serialNumber,
        imageUrl: equipment.imageUrl,
        sopFileUrl: equipment.sopFileUrl,
        sopFileName: equipment.sopFileName,
        assetNumber: equipment.assetNumber,
        purchasePrice: equipment.purchasePrice ? parseFloat(String(equipment.purchasePrice)) : undefined,
        depreciationRate: equipment.depreciationRate ? parseFloat(String(equipment.depreciationRate)) : undefined,
        currentValue: equipment.currentValue ? parseFloat(String(equipment.currentValue)) : undefined,
        supplier: equipment.supplier,
        warrantyExpiry: equipment.warrantyExpiry,
        specifications: equipment.specifications,
        operatingRange: equipment.operatingRange,
        accuracy: equipment.accuracy,
        calibrationCycle: equipment.calibrationCycle,
        lastCalibrationDate: equipment.lastCalibrationDate,
        nextCalibrationDate: equipment.nextCalibrationDate,
        usageHours: equipment.usageHours ? parseFloat(String(equipment.usageHours)) : undefined,
        maintenanceHistory: equipment.maintenanceHistory,
        repairHistory: equipment.repairHistory
      };
      
      equipments.push(finalEquipment);
    });
    
    console.log('生成预览数据完成，设备数量:', equipments.length);
    setPreviewData(equipments);
    setStep('preview');
  };

  const handleImport = () => {
    console.log('开始导入设备数据:', previewData.length);
    if (previewData.length > 0) {
      onImport(previewData);
      resetModal();
      onClose();
    }
  };

  const resetModal = () => {
    setCsvData([]);
    setHeaders([]);
    setMappedColumns({});
    setPreviewData([]);
    setParseError('');
    setStep('upload');
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleFileButtonClick = () => {
    fileInputRef.current?.click();
  };

  const renderUploadStep = () => (
    <div className="text-center py-8">
      <FileText className="h-16 w-16 text-blue-400 mx-auto mb-4" />
      <h3 className="text-lg font-semibold mb-2 text-gray-800">上传数据文件</h3>
      <p className="text-gray-600 mb-6">请选择包含仪器信息的 Excel 或 CSV 文件</p>
      
      {parseError && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg">
          <div className="flex items-center gap-2 text-red-700">
            <AlertCircle className="h-4 w-4" />
            <span className="text-sm">{parseError}</span>
          </div>
        </div>
      )}
      
      <input
        ref={fileInputRef}
        type="file"
        accept=".csv,.txt,.xlsx,.xls"
        onChange={handleFileUpload}
        className="hidden"
      />
      
      <Button 
        onClick={handleFileButtonClick}
        variant="outline" 
        className="cursor-pointer bg-blue-50 hover:bg-blue-100 border-blue-200"
      >
        <Upload className="h-4 w-4 mr-2" />
        选择文件
      </Button>
      
      <div className="mt-6 text-sm text-gray-500 bg-gray-50 p-4 rounded-lg">
        <h4 className="font-medium mb-2">支持的格式：</h4>
        <ul className="text-left space-y-1">
          <li>• Excel文件 (.xlsx, .xls)</li>
          <li>• CSV文件 (.csv, .txt)</li>
          <li>• 建议第一行为列标题</li>
          <li>• 支持中英文列名自动匹配</li>
        </ul>
      </div>
    </div>
  );

  const renderMappingStep = () => (
    <div className="space-y-4">
      <div className="bg-blue-50 p-4 rounded-lg border border-blue-200">
        <h3 className="text-lg font-semibold text-blue-800 mb-1">列映射设置</h3>
        <p className="text-blue-600 text-sm">系统已自动匹配部分列，请检查并调整映射关系</p>
      </div>
      
      <div className="space-y-2 max-h-60 overflow-y-auto bg-gray-50 p-3 rounded-lg">
        {headers.map((header, index) => (
          <div key={index} className="flex items-center gap-4 p-3 bg-white border border-gray-200 rounded-lg shadow-sm">
            <div className="w-32 text-sm font-medium truncate text-gray-700" title={header}>
              {header}
            </div>
            <div className="flex-1">
              <select
                value={mappedColumns[index] || ''}
                onChange={(e) => setMappedColumns(prev => ({
                  ...prev,
                  [index]: e.target.value as keyof Equipment || null
                }))}
                className="w-full p-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              >
                <option value="">-- 跳过此列 --</option>
                {availableColumns.map(column => (
                  <option key={column} value={column}>
                    {columnLabels[column]}
                  </option>
                ))}
              </select>
            </div>
          </div>
        ))}
      </div>
      
      <div className="flex justify-between pt-4 border-t">
        <Button variant="outline" onClick={() => setStep('upload')} className="bg-gray-50">
          返回上传
        </Button>
        <Button 
          onClick={generatePreview} 
          disabled={Object.keys(mappedColumns).length === 0}
          className="bg-blue-600 hover:bg-blue-700"
        >
          生成预览
        </Button>
      </div>
    </div>
  );

  const renderPreviewStep = () => (
    <div className="space-y-4">
      <div className="flex items-center justify-between bg-green-50 p-4 rounded-lg border border-green-200">
        <h3 className="text-lg font-semibold text-green-800">导入预览</h3>
        <div className="flex items-center gap-2 text-green-700">
          <CheckCircle className="h-5 w-5" />
          <span className="text-sm font-medium">预计导入 {previewData.length} 条记录</span>
        </div>
      </div>
      
      <div className="max-h-96 overflow-auto border border-gray-200 rounded-lg shadow-sm">
        <Table>
          <TableHeader>
            <TableRow className="bg-gray-50">
              <TableHead className="font-semibold">设备编号</TableHead>
              <TableHead className="font-semibold">设备名称</TableHead>
              <TableHead className="font-semibold">设备类型</TableHead>
              <TableHead className="font-semibold">型号</TableHead>
              <TableHead className="font-semibold">厂商</TableHead>
              <TableHead className="font-semibold">状态</TableHead>
              <TableHead className="font-semibold">位置</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {previewData.slice(0, 10).map((equipment, index) => (
              <TableRow key={index} className="hover:bg-gray-50">
                <TableCell className="font-mono text-sm">{equipment.id}</TableCell>
                <TableCell className="font-medium">{equipment.name}</TableCell>
                <TableCell>{equipment.type ? equipmentTypeLabels[equipment.type] : '-'}</TableCell>
                <TableCell>{equipment.model}</TableCell>
                <TableCell>{equipment.manufacturer}</TableCell>
                <TableCell>
                  <span className="text-sm">{statusLabels[equipment.status]}</span>
                </TableCell>
                <TableCell>{equipment.location}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        {previewData.length > 10 && (
          <div className="p-3 text-center text-sm text-gray-500 border-t bg-gray-50">
            还有 {previewData.length - 10} 条记录...
          </div>
        )}
      </div>
      
      <div className="flex justify-between pt-4 border-t">
        <Button variant="outline" onClick={() => setStep('mapping')} className="bg-gray-50">
          返回映射
        </Button>
        <Button 
          onClick={handleImport} 
          className="bg-green-600 hover:bg-green-700"
          disabled={previewData.length === 0}
        >
          <CheckCircle className="h-4 w-4 mr-2" />
          确认导入 ({previewData.length}条)
        </Button>
      </div>
    </div>
  );

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl max-w-4xl w-full max-h-screen overflow-y-auto shadow-2xl">
        <div className="flex justify-between items-center p-6 border-b bg-gradient-to-r from-blue-50 to-purple-50">
          <h2 className="text-xl font-bold text-gray-800">导入仪器数据</h2>
          <Button variant="ghost" size="sm" onClick={() => { onClose(); resetModal(); }} className="text-gray-500 hover:text-gray-700">
            <X className="h-4 w-4" />
          </Button>
        </div>

        <div className="p-6">
          {/* 步骤指示器 */}
          <div className="flex items-center justify-center mb-6">
            <div className={`flex items-center ${step === 'upload' ? 'text-blue-600' : step === 'mapping' || step === 'preview' ? 'text-green-600' : 'text-gray-400'}`}>
              <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium transition-colors ${step === 'upload' ? 'bg-blue-600 text-white' : step === 'mapping' || step === 'preview' ? 'bg-green-600 text-white' : 'bg-gray-200'}`}>
                1
              </div>
              <span className="ml-2 text-sm font-medium">上传文件</span>
            </div>
            <div className="w-12 h-px bg-gray-300 mx-4"></div>
            <div className={`flex items-center ${step === 'mapping' ? 'text-blue-600' : step === 'preview' ? 'text-green-600' : 'text-gray-400'}`}>
              <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium transition-colors ${step === 'mapping' ? 'bg-blue-600 text-white' : step === 'preview' ? 'bg-green-600 text-white' : 'bg-gray-200'}`}>
                2
              </div>
              <span className="ml-2 text-sm font-medium">列映射</span>
            </div>
            <div className="w-12 h-px bg-gray-300 mx-4"></div>
            <div className={`flex items-center ${step === 'preview' ? 'text-blue-600' : 'text-gray-400'}`}>
              <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium transition-colors ${step === 'preview' ? 'bg-blue-600 text-white' : 'bg-gray-200'}`}>
                3
              </div>
              <span className="ml-2 text-sm font-medium">预览导入</span>
            </div>
          </div>

          {/* 内容区域 */}
          {step === 'upload' && renderUploadStep()}
          {step === 'mapping' && renderMappingStep()}
          {step === 'preview' && renderPreviewStep()}
        </div>
      </div>
    </div>
  );
};

export default TableImportModal;
