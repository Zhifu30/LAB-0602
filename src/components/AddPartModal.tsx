import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Part, partCategories } from '@/types/parts';
import { Camera, Upload, FileSpreadsheet, Barcode } from 'lucide-react';
import { toast } from 'sonner';
import ImageOCRModal from '@/components/ImageOCRModal';
import BarcodeGenerator from '@/components/BarcodeGenerator';
import * as XLSX from 'xlsx';

interface AddPartModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAdd: (part: Omit<Part, 'createdAt' | 'updatedAt'>) => Promise<void>;
  onBatchAdd: (parts: Omit<Part, 'createdAt' | 'updatedAt'>[]) => Promise<void>;
  parts: Part[];
}

const AddPartModal: React.FC<AddPartModalProps> = ({ isOpen, onClose, onAdd, onBatchAdd, parts }) => {
  const [formData, setFormData] = useState({
    id: '',
    name: '',
    barcode: '',
    description: '',
    category: '',
    supplier: '',
    totalStock: 0,
    remainingStock: 0,
    unitPrice: 0,
    location: '',
    minStockLevel: 0,
    serialNumber: '',
    quantityPerVial: 1,
    imageUrl: ''
  });
  const [loading, setLoading] = useState(false);
  const [isOCRModalOpen, setIsOCRModalOpen] = useState(false);
  const [isBarcodeModalOpen, setIsBarcodeModalOpen] = useState(false);
  const [activeTab, setActiveTab] = useState('manual');

  const generateBarcode = () => {
    // 生成13位数字条形码
    const timestamp = Date.now().toString();
    const random = Math.floor(Math.random() * 1000).toString().padStart(3, '0');
    return `${timestamp.slice(-8)}${random}`;
  };

  const checkBarcodeUnique = (barcode: string) => {
    return !parts.some(part => part.barcode === barcode);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!formData.name || !formData.category) {
      toast.error('请填写必要信息：配件名称和分类');
      return;
    }

    // 自动生成条形码如果为空
    let barcode = formData.barcode;
    if (!barcode) {
      let attempts = 0;
      do {
        barcode = generateBarcode();
        attempts++;
      } while (!checkBarcodeUnique(barcode) && attempts < 10);
      
      if (attempts >= 10) {
        toast.error('无法生成唯一条形码，请手动输入');
        return;
      }
      
      setFormData(prev => ({ ...prev, barcode }));
      toast.success('已自动生成唯一条形码');
    } else if (!checkBarcodeUnique(barcode)) {
      toast.error('条形码已存在，请使用其他条形码');
      return;
    }

    setLoading(true);
    try {
      await onAdd({
        ...formData,
        barcode,
        remainingStock: formData.totalStock // 初始剩余库存等于总库存
      });
      
      // 重置表单
      setFormData({
        id: '',
        name: '',
        barcode: '',
        description: '',
        category: '',
        supplier: '',
        totalStock: 0,
        remainingStock: 0,
        unitPrice: 0,
        location: '',
        minStockLevel: 0,
        serialNumber: '',
        quantityPerVial: 1,
        imageUrl: ''
      });
      
      onClose();
    } catch (error) {
      console.error('Failed to add part:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleChange = (field: string, value: string | number) => {
    setFormData(prev => ({
      ...prev,
      [field]: value
    }));
  };

  const handleOCRTextExtracted = (text: string) => {
    // 解析OCR文字并自动填充表单
    const lines = text.split('\n').filter(line => line.trim());
    
    for (const line of lines) {
      const trimmedLine = line.trim();
      
      // 尝试匹配各种格式的信息
      if (trimmedLine.match(/^[A-Z0-9\-]+$/) && trimmedLine.length > 3) {
        // 可能是配件编号或条形码
        if (!formData.id) {
          setFormData(prev => ({ ...prev, id: trimmedLine }));
        } else if (!formData.barcode) {
          setFormData(prev => ({ ...prev, barcode: trimmedLine }));
        }
      } else if (trimmedLine.includes('¥') || trimmedLine.includes('元')) {
        // 价格信息
        const price = trimmedLine.match(/\d+\.?\d*/);
        if (price && !formData.unitPrice) {
          setFormData(prev => ({ ...prev, unitPrice: parseFloat(price[0]) }));
        }
      } else if (trimmedLine.includes('数量') || trimmedLine.includes('qty')) {
        // 数量信息
        const qty = trimmedLine.match(/\d+/);
        if (qty && !formData.totalStock) {
          setFormData(prev => ({ ...prev, totalStock: parseInt(qty[0]) }));
        }
      } else if (!formData.name && trimmedLine.length > 2) {
        // 可能是配件名称
        setFormData(prev => ({ ...prev, name: trimmedLine }));
      }
    }
    
    toast.success('已自动识别并填充部分信息，请检查并补充完整');
  };

  const handleExcelImport = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target?.result as ArrayBuffer);
        const workbook = XLSX.read(data, { type: 'array' });
        const worksheet = workbook.Sheets[workbook.SheetNames[0]];
        const jsonData = XLSX.utils.sheet_to_json(worksheet);
        
        const partsToAdd: Omit<Part, 'createdAt' | 'updatedAt'>[] = [];
        
        jsonData.forEach((row: any, index) => {
          if (row['配件编号'] && row['配件名称'] && row['条形码'] && row['分类']) {
            const existingPart = parts.find(p => p.id === row['配件编号']);
            
            if (existingPart) {
              // 如果货号相同但名称不同，添加到异名中
              if (existingPart.name !== row['配件名称']) {
                const aliases = existingPart.description ? 
                  existingPart.description + '; 异名: ' + row['配件名称'] :
                  '异名: ' + row['配件名称'];
                // 这里需要更新现有配件的描述
                toast.info(`配件 ${row['配件编号']} 已存在，异名已添加到描述中`);
              } else {
                // 相同货号相同名称，只更新数量
                toast.info(`配件 ${row['配件编号']} 已存在，请手动调整库存数量`);
              }
            } else {
                partsToAdd.push({
                  id: row['配件编号'] || `P${Date.now()}-${index}`,
                  name: row['配件名称'] || '',
                  barcode: row['条形码'] || '',
                  description: row['描述'] || '',
                  category: Object.keys(partCategories).find(key => 
                    partCategories[key as keyof typeof partCategories] === row['分类']
                  ) || 'other',
                  supplier: row['供应商'] || '',
                  totalStock: parseInt(row['总库存']) || 0,
                  remainingStock: parseInt(row['总库存']) || 0,
                  unitPrice: parseFloat(row['单价']) || 0,
                  location: row['存放位置'] || '',
                  minStockLevel: parseInt(row['最低库存']) || 0,
                  serialNumber: row['序列号'] || '',
                  quantityPerVial: parseInt(row['Quantity per Vial']) || 1,
                  imageUrl: row['图片链接'] || ''
                });
            }
          }
        });
        
        if (partsToAdd.length > 0) {
          onBatchAdd(partsToAdd);
          toast.success(`成功导入 ${partsToAdd.length} 个配件`);
        } else {
          toast.warning('没有找到有效的配件数据');
        }
      } catch (error) {
        console.error('Excel导入失败:', error);
        toast.error('Excel文件格式错误，请检查文件');
      }
    };
    reader.readAsArrayBuffer(file);
    
    // 重置文件输入
    event.target.value = '';
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>添加新配件</DialogTitle>
        </DialogHeader>
        
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="manual" className="flex items-center gap-2">
              <span>手动录入</span>
            </TabsTrigger>
            <TabsTrigger value="camera" className="flex items-center gap-2">
              <Camera className="h-4 w-4" />
              <span>拍照识别</span>
            </TabsTrigger>
            <TabsTrigger value="excel" className="flex items-center gap-2">
              <FileSpreadsheet className="h-4 w-4" />
              <span>Excel导入</span>
            </TabsTrigger>
          </TabsList>

          <TabsContent value="manual">
            <form onSubmit={handleSubmit} className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label htmlFor="id">配件编号 *</Label>
              <Input
                id="id"
                value={formData.id}
                onChange={(e) => handleChange('id', e.target.value)}
                placeholder="例如: P001"
                required
              />
            </div>

            <div>
              <Label htmlFor="name">配件名称 *</Label>
              <Input
                id="name"
                value={formData.name}
                onChange={(e) => handleChange('name', e.target.value)}
                placeholder="例如: 过滤器"
                required
              />
            </div>

            <div>
              <Label htmlFor="barcode">条形码</Label>
              <div className="flex gap-2">
                <Input
                  id="barcode"
                  value={formData.barcode}
                  onChange={(e) => handleChange('barcode', e.target.value)}
                  placeholder="留空自动生成唯一条形码"
                />
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setIsBarcodeModalOpen(true)}
                  className="whitespace-nowrap"
                >
                  <Barcode className="h-4 w-4 mr-1" />
                  生成
                </Button>
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                每个配件必须有唯一的条形码，留空将自动生成
              </p>
            </div>

            <div>
              <Label htmlFor="category">分类 *</Label>
              <select
                id="category"
                value={formData.category}
                onChange={(e) => handleChange('category', e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                required
              >
                <option value="">请选择分类</option>
                {Object.entries(partCategories).map(([key, label]) => (
                  <option key={key} value={key}>{label}</option>
                ))}
              </select>
            </div>

            <div>
              <Label htmlFor="supplier">供应商</Label>
              <Input
                id="supplier"
                value={formData.supplier}
                onChange={(e) => handleChange('supplier', e.target.value)}
                placeholder="例如: 供应商名称"
              />
            </div>

            <div>
              <Label htmlFor="location">存放位置</Label>
              <Input
                id="location"
                value={formData.location}
                onChange={(e) => handleChange('location', e.target.value)}
                placeholder="例如: A区-B架-3层"
              />
            </div>

            <div>
              <Label htmlFor="totalStock">总库存</Label>
              <Input
                id="totalStock"
                type="number"
                value={formData.totalStock}
                onChange={(e) => handleChange('totalStock', parseInt(e.target.value) || 0)}
                min="0"
              />
            </div>

            <div>
              <Label htmlFor="unitPrice">单价 (¥)</Label>
              <Input
                id="unitPrice"
                type="number"
                step="0.01"
                value={formData.unitPrice}
                onChange={(e) => handleChange('unitPrice', parseFloat(e.target.value) || 0)}
                min="0"
              />
            </div>

            <div>
              <Label htmlFor="minStockLevel">最低库存警戒线</Label>
              <Input
                id="minStockLevel"
                type="number"
                value={formData.minStockLevel}
                onChange={(e) => handleChange('minStockLevel', parseInt(e.target.value) || 0)}
                min="0"
              />
            </div>

            <div>
              <Label htmlFor="serialNumber">序列号</Label>
              <Input
                id="serialNumber"
                value={formData.serialNumber}
                onChange={(e) => handleChange('serialNumber', e.target.value)}
                placeholder="例如: SN123456"
              />
            </div>

            <div>
              <Label htmlFor="quantityPerVial">Quantity per Vial</Label>
              <Input
                id="quantityPerVial"
                type="number"
                value={formData.quantityPerVial}
                onChange={(e) => handleChange('quantityPerVial', parseInt(e.target.value) || 1)}
                min="1"
                placeholder="每瓶数量"
              />
            </div>
          </div>

          <div>
            <Label htmlFor="description">描述</Label>
            <Textarea
              id="description"
              value={formData.description}
              onChange={(e) => handleChange('description', e.target.value)}
              placeholder="配件描述、规格、用途等..."
              rows={3}
            />
          </div>

          <div className="flex justify-end gap-3">
            <Button type="button" variant="outline" onClick={onClose}>
              取消
            </Button>
            <Button type="submit" disabled={loading}>
              {loading ? '添加中...' : '添加配件'}
            </Button>
          </div>
        </form>
          </TabsContent>

          <TabsContent value="camera" className="space-y-4">
            <div className="text-center py-8">
              <Camera className="h-16 w-16 mx-auto text-slate-400 mb-4" />
              <h3 className="text-lg font-medium mb-2">拍照识别配件信息</h3>
              <p className="text-sm text-slate-600 mb-6">
                拍摄设备标签、报价单或包装盒标签，自动识别配件信息
              </p>
              <Button onClick={() => setIsOCRModalOpen(true)} className="w-full">
                <Camera className="h-4 w-4 mr-2" />
                开始拍照识别
              </Button>
            </div>
            
            {/* 显示已识别的信息 */}
            {(formData.name || formData.id || formData.barcode) && (
              <div className="bg-slate-50 p-4 rounded-lg">
                <h4 className="font-medium mb-2">已识别信息：</h4>
                <div className="space-y-1 text-sm">
                  {formData.id && <p>配件编号: {formData.id}</p>}
                  {formData.name && <p>配件名称: {formData.name}</p>}
                  {formData.barcode && <p>条形码: {formData.barcode}</p>}
                  {formData.unitPrice > 0 && <p>单价: ¥{formData.unitPrice}</p>}
                  {formData.totalStock > 0 && <p>数量: {formData.totalStock}</p>}
                </div>
                <Button 
                  onClick={() => setActiveTab('manual')} 
                  variant="outline" 
                  size="sm" 
                  className="mt-3"
                >
                  编辑详细信息
                </Button>
              </div>
            )}
          </TabsContent>

          <TabsContent value="excel" className="space-y-4">
            <div className="text-center py-8">
              <FileSpreadsheet className="h-16 w-16 mx-auto text-slate-400 mb-4" />
              <h3 className="text-lg font-medium mb-2">Excel批量导入</h3>
              <p className="text-sm text-slate-600 mb-6">
                支持批量导入配件信息，Excel文件应包含以下列：<br/>
                配件编号、配件名称、条形码、分类、供应商、总库存、单价、存放位置、最低库存、序列号、Quantity per Vial、图片链接、描述
              </p>
              <div className="relative">
                <input
                  type="file"
                  accept=".xlsx,.xls"
                  onChange={handleExcelImport}
                  className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                />
                <Button className="w-full">
                  <Upload className="h-4 w-4 mr-2" />
                  选择Excel文件
                </Button>
              </div>
            </div>
          </TabsContent>
        </Tabs>

        <ImageOCRModal
          isOpen={isOCRModalOpen}
          onClose={() => setIsOCRModalOpen(false)}
          onTextExtracted={handleOCRTextExtracted}
        />

        <BarcodeGenerator
          isOpen={isBarcodeModalOpen}
          onClose={() => setIsBarcodeModalOpen(false)}
          onGenerate={(barcode) => {
            setFormData(prev => ({ ...prev, barcode }));
            toast.success('条形码已设置');
          }}
          existingBarcodes={parts.map(p => p.barcode)}
        />
      </DialogContent>
    </Dialog>
  );
};

export default AddPartModal;