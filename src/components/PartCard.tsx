import React, { useState } from 'react';
import { Part, partCategories } from '@/types/parts';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Package, ArrowUp, ArrowDown, AlertTriangle, Upload, ImageIcon, FileText } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

interface PartCardProps {
  part: Part;
  onStockIn: () => void;
  onStockOut: () => void;
  onUpdate?: () => void;
  onImageUpload?: (partId: string, imageUrl: string) => void;
}

const PartCard: React.FC<PartCardProps> = ({ part, onStockIn, onStockOut, onUpdate, onImageUpload }) => {
  const [imageError, setImageError] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const { toast } = useToast();

  const getStockStatus = () => {
    if (part.remainingStock === 0) {
      return { color: 'text-red-600', bg: 'bg-red-100 text-red-800', icon: <AlertTriangle className="h-4 w-4 text-red-600" /> };
    } else if (part.remainingStock <= (part.minStockLevel || 0)) {
      return { color: 'text-amber-600', bg: 'bg-amber-100 text-amber-800', icon: <AlertTriangle className="h-4 w-4 text-amber-600" /> };
    }
    return { color: 'text-green-600', bg: 'bg-green-100 text-green-800', icon: <Package className="h-4 w-4 text-green-600" /> };
  };

  const stockStatus = getStockStatus();
  const isOutOfStock = part.remainingStock === 0;
  const isLowStock = part.remainingStock <= (part.minStockLevel || 0) && part.remainingStock > 0;

  const handleImageUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      toast({
        title: "文件格式错误",
        description: "请选择图片文件",
        variant: "destructive",
      });
      return;
    }

    setIsUploading(true);
    try {
      // 转换为base64
      const reader = new FileReader();
      reader.onload = () => {
        const imageUrl = reader.result as string;
        if (onImageUpload) {
          onImageUpload(part.id, imageUrl);
        }
        toast({
          title: "图片上传成功",
          description: "配件图片已更新",
        });
      };
      reader.readAsDataURL(file);
    } catch (error) {
      toast({
        title: "上传失败",
        description: "图片上传过程中出现错误",
        variant: "destructive",
      });
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <div 
      className={`group relative rounded-2xl overflow-hidden transform transition-all duration-500 hover:scale-[1.02] hover:shadow-2xl h-80 ${
        isLowStock ? 'ring-2 ring-red-500 ring-opacity-70' : ''
      }`}
      style={{
        border: `3px solid ${isLowStock ? '#ef4444' : '#e2e8f0'}`,
        boxShadow: isLowStock ? '0 10px 40px -10px #ef444440' : '0 4px 20px -5px #00000020'
      }}
    >
      {/* 全背景图片 */}
      {part.imageUrl && !imageError ? (
        <div 
          className="absolute inset-0 bg-cover bg-center transition-all duration-700 group-hover:scale-105 cursor-pointer"
          style={{ 
            backgroundImage: `url(${part.imageUrl})`
          }}
          onClick={() => {
            // Navigate to part management or detail view
            console.log('Navigate to part detail:', part.id);
          }}
        >
          {/* 渐变遮罩层 */}
          <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/30 to-black/10 transition-all duration-500 group-hover:from-black/70 group-hover:via-black/20 group-hover:to-black/5" />
          
          {/* 库存状态发光效果 */}
          {isLowStock && (
            <div className="absolute inset-0 opacity-20 transition-opacity duration-300 group-hover:opacity-30 bg-gradient-radial from-red-500/40 via-transparent to-transparent" />
          )}
        </div>
      ) : (
        <div 
          className="absolute inset-0 bg-gradient-to-br from-slate-100 via-slate-50 to-slate-200 cursor-pointer"
          onClick={() => {
            // Navigate to part management or detail view
            console.log('Navigate to part detail:', part.id);
          }}
        >
          {/* 默认背景图案 */}
          <div className="absolute inset-0 opacity-5">
            <div className="w-full h-full flex items-center justify-center">
              <Package className="h-32 w-32 text-slate-400" />
            </div>
          </div>
          {/* 渐变遮罩 */}
          <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/20 to-black/5" />
        </div>
      )}

      {/* 顶部信息栏 */}
      <div className="absolute top-4 left-4 right-4 flex justify-between items-start z-20">
        <div className="px-3 py-1.5 rounded-full shadow-lg border border-white/20 backdrop-blur-md bg-black/60">
          <span className="text-white text-sm font-bold">{part.id}</span>
        </div>
        <div className="flex gap-2">
          <div 
            className="p-2 rounded-full shadow-lg border border-white/20 backdrop-blur-md"
            style={{
              backgroundColor: isLowStock ? '#ef4444cc' : '#22c55ecc'
            }}
          >
            {stockStatus.icon}
          </div>
          <label className="cursor-pointer p-2 rounded-full shadow-lg border border-white/20 hover:scale-110 transition-all duration-200 backdrop-blur-md bg-blue-500/80">
              <Upload className="h-4 w-4 text-white" />
              <input
                type="file"
                accept="image/*"
                onChange={handleImageUpload}
                className="hidden"
                disabled={isUploading}
              />
            </label>
          </div>
        </div>

        {/* 购买文件上传按钮 */}
        <div className="absolute top-4 right-4">
          <Button 
            size="sm" 
            variant="outline"
            className="bg-white/80 hover:bg-white/90 text-black border-white/20"
            onClick={() => {
              // Open purchase files management modal
              console.log('Open purchase files for part:', part.id);
            }}
          >
            <FileText className="h-4 w-4 mr-1" />
            购买文件
          </Button>
        </div>

      {/* 主要信息区域 - 底部显示 */}
      <div className="absolute bottom-0 left-0 right-0 z-20 p-4 bg-gradient-to-t from-black/90 via-black/70 to-transparent">
        {/* 配件名称和分类 */}
        <div className="mb-3">
          <h3 className="font-bold text-white text-lg mb-1 line-clamp-2">{part.name}</h3>
          <Badge 
            className="bg-white/20 text-white border-white/30 backdrop-blur-sm" 
            variant="outline"
          >
            {partCategories[part.category as keyof typeof partCategories] || part.category}
          </Badge>
        </div>

        {/* 条形码显示 */}
        <div className="mb-3 flex items-center gap-2">
          <span className="text-white/80 text-sm">条形码:</span>
          <code className="text-xs bg-white/20 backdrop-blur-sm text-white px-2 py-1 rounded border border-white/30">
            {part.barcode}
          </code>
        </div>

        {/* 库存信息 */}
        <div className="mb-4 flex justify-between items-center">
          <span className="text-white/80 text-sm">库存状态:</span>
          <div className="flex items-center gap-2">
            <span className="text-white font-bold text-lg">
              {part.remainingStock} / {part.totalStock}
            </span>
            <Badge 
              className={`${stockStatus.bg} border-white/30 backdrop-blur-sm`}
              style={{
                backgroundColor: isLowStock ? '#ef444480' : '#22c55e80',
                color: 'white'
              }}
            >
              {isOutOfStock ? '缺货' : isLowStock ? '库存不足' : '正常'}
            </Badge>
          </div>
        </div>

        {/* 操作按钮 */}
        <div className="flex gap-2">
          <Button
            onClick={onStockIn}
            variant="outline"
            size="sm"
            className="flex-1 flex items-center gap-1 bg-white/20 backdrop-blur-sm text-white border-white/30 hover:bg-white/30 transition-all duration-200"
          >
            <ArrowUp className="h-4 w-4" />
            入库
          </Button>
          <Button
            onClick={onStockOut}
            variant="outline"
            size="sm"
            className="flex-1 flex items-center gap-1 bg-white/20 backdrop-blur-sm text-white border-white/30 hover:bg-white/30 transition-all duration-200"
            disabled={isOutOfStock}
          >
            <ArrowDown className="h-4 w-4" />
            出库
          </Button>
        </div>
      </div>

      {/* 悬浮详细信息 */}
      <div className="absolute inset-x-4 top-20 z-20 opacity-0 group-hover:opacity-100 transition-all duration-300 transform translate-y-2 group-hover:translate-y-0">
        <div className="bg-black/90 backdrop-blur-md p-3 rounded-xl shadow-lg border border-white/20">
          <div className="grid grid-cols-1 gap-2 text-xs text-white">
            {part.serialNumber && (
              <div>
                <span className="text-gray-300">序列号:</span>
                <span className="ml-2 font-medium">{part.serialNumber}</span>
              </div>
            )}
            {part.location && (
              <div>
                <span className="text-gray-300">位置:</span>
                <span className="ml-2 font-medium">{part.location}</span>
              </div>
            )}
            {part.unitPrice && (
              <div>
                <span className="text-gray-300">单价:</span>
                <span className="ml-2 font-medium">¥{part.unitPrice}</span>
              </div>
            )}
            {part.supplier && (
              <div>
                <span className="text-gray-300">供应商:</span>
                <span className="ml-2 font-medium">{part.supplier}</span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* 边框发光效果 */}
      <div 
        className="absolute inset-0 rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none"
        style={{
          boxShadow: isLowStock 
            ? 'inset 0 0 20px #ef444430, 0 0 30px #ef444420'
            : 'inset 0 0 20px #3b82f630, 0 0 30px #3b82f620'
        }}
      />
    </div>
  );
};

export default PartCard;