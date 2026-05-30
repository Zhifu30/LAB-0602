import React, { useState } from 'react';
import { Package, Plus, Scan, Download, Upload, Filter, Search, Grid, List, ArrowLeft } from 'lucide-react';
import Header from '@/components/Header';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useParts } from '@/hooks/useParts';
import { partCategories } from '@/types/parts';
import PartCard from '@/components/PartCard';
import PartTableView from '@/components/PartTableView';
import AddPartModal from '@/components/AddPartModal';
import PartTransactionModal from '@/components/PartTransactionModal';
import PartQRScannerModal from '@/components/PartQRScannerModal';
import { useNavigate } from 'react-router-dom';

const PartsManagement = () => {
  const { parts, transactions, loading, addPart, addBatchParts, addTransaction, fetchParts } = useParts();
  const navigate = useNavigate();
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('');
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isTransactionModalOpen, setIsTransactionModalOpen] = useState(false);
  const [isQRScannerOpen, setIsQRScannerOpen] = useState(false);
  const [selectedPartId, setSelectedPartId] = useState<string | null>(null);
  const [transactionType, setTransactionType] = useState<'in' | 'out'>('in');
  const [viewMode, setViewMode] = useState<'card' | 'table'>('card');

  const filteredParts = parts.filter((part) => {
    const matchesSearch = searchTerm === '' || 
      part.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      part.id.toLowerCase().includes(searchTerm.toLowerCase()) ||
      part.barcode.toLowerCase().includes(searchTerm.toLowerCase());
    
    const matchesCategory = selectedCategory === '' || part.category === selectedCategory;
    
    return matchesSearch && matchesCategory;
  });

  const handleStockIn = (partId: string) => {
    setSelectedPartId(partId);
    setTransactionType('in');
    setIsTransactionModalOpen(true);
  };

  const handleStockOut = (partId: string) => {
    setSelectedPartId(partId);
    setTransactionType('out');
    setIsTransactionModalOpen(true);
  };

  const handleQRScan = (result: string) => {
    console.log('QR Scan result:', result);
    // 这里可以根据扫描结果查找配件
    const foundPart = parts.find(part => part.barcode === result);
    if (foundPart) {
      setSelectedPartId(foundPart.id);
      setTransactionType('out');
      setIsTransactionModalOpen(true);
    }
    setIsQRScannerOpen(false);
  };

  const handleImageUpload = async (partId: string, imageUrl: string) => {
    // 这里应该调用API更新配件图片
    // 暂时更新本地状态
    await fetchParts(); // 重新获取数据
  };

  const stockStats = {
    total: parts.length,
    lowStock: parts.filter(part => part.remainingStock <= (part.minStockLevel || 0)).length,
    outOfStock: parts.filter(part => part.remainingStock === 0).length,
    totalValue: parts.reduce((sum, part) => sum + (part.remainingStock * (part.unitPrice || 0)), 0)
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50">
      <Header />
      <div className="container mx-auto px-4 py-8">
        {/* 头部 */}
        <div className="flex justify-between items-center mb-8">
          <div className="flex items-center gap-4">
            <Button 
              variant="outline" 
              onClick={() => navigate('/')}
              className="flex items-center gap-2"
            >
              <ArrowLeft className="h-4 w-4" />
              返回设备管理
            </Button>
            <div>
              <h1 className="text-4xl font-bold text-slate-800 mb-2">配件管理系统</h1>
              <p className="text-slate-600">高效管理实验室配件库存，确保设备正常运行</p>
            </div>
          </div>
        </div>

        {/* 统计卡片 */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
          <div className="bg-white rounded-xl shadow-sm border p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-slate-600 font-medium">配件总数</p>
                <p className="text-2xl font-bold text-slate-800">{stockStats.total}</p>
              </div>
              <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
                <Package className="h-5 w-5 text-blue-600" />
              </div>
            </div>
          </div>

          <div className="bg-white rounded-xl shadow-sm border p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-slate-600 font-medium">低库存</p>
                <p className="text-2xl font-bold text-amber-600">{stockStats.lowStock}</p>
              </div>
              <div className="w-10 h-10 bg-amber-100 rounded-lg flex items-center justify-center">
                <span className="text-amber-600 text-lg">⚠️</span>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-xl shadow-sm border p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-slate-600 font-medium">缺货</p>
                <p className="text-2xl font-bold text-red-600">{stockStats.outOfStock}</p>
              </div>
              <div className="w-10 h-10 bg-red-100 rounded-lg flex items-center justify-center">
                <span className="text-red-600 text-lg">❌</span>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-xl shadow-sm border p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-slate-600 font-medium">库存价值</p>
                <p className="text-2xl font-bold text-green-600">¥{stockStats.totalValue.toFixed(2)}</p>
              </div>
              <div className="w-10 h-10 bg-green-100 rounded-lg flex items-center justify-center">
                <span className="text-green-600 text-lg">💰</span>
              </div>
            </div>
          </div>
        </div>

        {/* 工具栏 */}
        <div className="bg-white rounded-xl shadow-sm border p-6 mb-6">
          <div className="flex flex-col lg:flex-row gap-4 items-center justify-between">
            <div className="flex flex-col sm:flex-row gap-4 flex-1">
              <div className="relative flex-1 max-w-md">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400 h-4 w-4" />
                <Input
                  placeholder="搜索配件..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10"
                />
              </div>
              <select
                value={selectedCategory}
                onChange={(e) => setSelectedCategory(e.target.value)}
                className="px-3 py-2 border border-slate-300 rounded-lg bg-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
              >
                <option value="">全部分类</option>
                {Object.entries(partCategories).map(([key, label]) => (
                  <option key={key} value={key}>{label}</option>
                ))}
              </select>
            </div>
            
            <div className="flex flex-wrap gap-3">
              <div className="flex border rounded-lg p-1 bg-slate-50">
                <Button
                  variant={viewMode === 'card' ? 'default' : 'ghost'}
                  size="sm"
                  onClick={() => setViewMode('card')}
                  className="h-7 px-3"
                >
                  <Grid className="h-4 w-4" />
                </Button>
                <Button
                  variant={viewMode === 'table' ? 'default' : 'ghost'}
                  size="sm"
                  onClick={() => setViewMode('table')}
                  className="h-7 px-3"
                >
                  <List className="h-4 w-4" />
                </Button>
              </div>
              <Button
                onClick={() => setIsQRScannerOpen(true)}
                variant="outline"
                className="flex items-center gap-2 text-xs sm:text-sm"
                size="sm"
              >
                <Scan className="h-4 w-4" />
                <span className="hidden sm:inline">扫码出库</span>
              </Button>
              <Button
                onClick={() => setIsAddModalOpen(true)}
                className="flex items-center gap-2 text-xs sm:text-sm"
                size="sm"
              >
                <Plus className="h-4 w-4" />
                <span className="hidden sm:inline">添加配件</span>
              </Button>
            </div>
          </div>
        </div>

        {/* 配件列表 */}
        {loading ? (
          <div className="flex justify-center items-center py-12">
            <div className="text-slate-600">加载中...</div>
          </div>
        ) : viewMode === 'card' ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {filteredParts.map((part) => (
              <PartCard
                key={part.id}
                part={part}
                onStockIn={() => handleStockIn(part.id)}
                onStockOut={() => handleStockOut(part.id)}
                onUpdate={fetchParts}
                onImageUpload={handleImageUpload}
              />
            ))}
          </div>
        ) : (
          <PartTableView
            parts={filteredParts}
            onStockIn={handleStockIn}
            onStockOut={handleStockOut}
          />
        )}

        {/* 空状态 */}
        {!loading && filteredParts.length === 0 && (
          <div className="text-center py-16 bg-white rounded-xl shadow-sm border">
            <div className="text-6xl mb-4">📦</div>
            <p className="text-slate-500 text-xl font-medium mb-2">未找到配件</p>
            <p className="text-slate-400 text-sm">尝试调整搜索条件或添加新配件</p>
          </div>
        )}

        {/* 模态框 */}
        <AddPartModal
          isOpen={isAddModalOpen}
          onClose={() => setIsAddModalOpen(false)}
          onAdd={addPart}
          onBatchAdd={addBatchParts}
          parts={parts}
        />

        <PartTransactionModal
          isOpen={isTransactionModalOpen}
          onClose={() => {
            setIsTransactionModalOpen(false);
            setSelectedPartId(null);
          }}
          onTransaction={addTransaction}
          partId={selectedPartId}
          type={transactionType}
          parts={parts}
        />

        <PartQRScannerModal
          isOpen={isQRScannerOpen}
          onClose={() => setIsQRScannerOpen(false)}
          onScan={handleQRScan}
        />
      </div>
    </div>
  );
};

export default PartsManagement;