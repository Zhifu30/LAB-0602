import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { RotateCcw, Check, Copy } from 'lucide-react';
import { toast } from 'sonner';

interface BarcodeGeneratorProps {
  isOpen: boolean;
  onClose: () => void;
  onGenerate: (barcode: string) => void;
  existingBarcodes: string[];
}

const BarcodeGenerator: React.FC<BarcodeGeneratorProps> = ({
  isOpen,
  onClose,
  onGenerate,
  existingBarcodes
}) => {
  const [generatedBarcode, setGeneratedBarcode] = useState('');
  const [customPrefix, setCustomPrefix] = useState('');

  const generateBarcode = (prefix: string = '') => {
    const timestamp = Date.now().toString();
    const random = Math.floor(Math.random() * 10000).toString().padStart(4, '0');
    
    // 使用前缀 + 时间戳后8位 + 随机4位数字
    let barcode = `${prefix}${timestamp.slice(-8)}${random}`;
    
    // 确保总长度不超过13位
    if (barcode.length > 13) {
      barcode = barcode.slice(0, 13);
    }
    
    // 检查是否已存在
    let attempts = 0;
    while (existingBarcodes.includes(barcode) && attempts < 20) {
      const newRandom = Math.floor(Math.random() * 10000).toString().padStart(4, '0');
      barcode = `${prefix}${timestamp.slice(-8)}${newRandom}`;
      if (barcode.length > 13) {
        barcode = barcode.slice(0, 13);
      }
      attempts++;
    }
    
    if (attempts >= 20) {
      toast.error('无法生成唯一条形码，请尝试不同的前缀');
      return null;
    }
    
    return barcode;
  };

  const handleGenerate = () => {
    const barcode = generateBarcode(customPrefix);
    if (barcode) {
      setGeneratedBarcode(barcode);
      toast.success('条形码生成成功');
    }
  };

  const handleUseBarcode = () => {
    if (generatedBarcode) {
      onGenerate(generatedBarcode);
      onClose();
      setGeneratedBarcode('');
      setCustomPrefix('');
    }
  };

  const handleCopyBarcode = () => {
    if (generatedBarcode) {
      navigator.clipboard.writeText(generatedBarcode);
      toast.success('条形码已复制到剪贴板');
    }
  };

  const formatBarcodeDisplay = (barcode: string) => {
    // 将条形码按照标准格式显示（每4位一组）
    return barcode.replace(/(\d{4})(?=\d)/g, '$1-');
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>条形码生成器</DialogTitle>
        </DialogHeader>
        
        <div className="space-y-6">
          {/* 自定义前缀 */}
          <div>
            <Label htmlFor="prefix">自定义前缀（可选）</Label>
            <Input
              id="prefix"
              value={customPrefix}
              onChange={(e) => setCustomPrefix(e.target.value.replace(/\D/g, '').slice(0, 4))}
              placeholder="例如: 2024"
              maxLength={4}
            />
            <p className="text-xs text-muted-foreground mt-1">
              数字前缀，最多4位，用于标识配件类别或年份
            </p>
          </div>

          {/* 生成按钮 */}
          <Button 
            onClick={handleGenerate} 
            className="w-full"
            variant="outline"
          >
            <RotateCcw className="h-4 w-4 mr-2" />
            生成新条形码
          </Button>

          {/* 显示生成的条形码 */}
          {generatedBarcode && (
            <div className="space-y-4">
              <div className="p-4 bg-muted rounded-lg">
                <Label className="text-sm font-medium">生成的条形码</Label>
                <div className="mt-2 flex items-center gap-2">
                  <code className="flex-1 text-lg font-mono bg-background px-3 py-2 rounded border">
                    {formatBarcodeDisplay(generatedBarcode)}
                  </code>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={handleCopyBarcode}
                    title="复制条形码"
                  >
                    <Copy className="h-4 w-4" />
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  原始格式: {generatedBarcode}
                </p>
              </div>

              {/* 验证信息 */}
              <div className="text-sm text-green-600 flex items-center gap-2">
                <Check className="h-4 w-4" />
                <span>条形码唯一性验证通过</span>
              </div>

              {/* 使用条形码 */}
              <div className="flex gap-2">
                <Button
                  onClick={handleUseBarcode}
                  className="flex-1"
                >
                  <Check className="h-4 w-4 mr-2" />
                  使用此条形码
                </Button>
                <Button
                  onClick={handleGenerate}
                  variant="outline"
                >
                  <RotateCcw className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}

          {/* 说明 */}
          <div className="text-xs text-muted-foreground space-y-1">
            <p>• 条形码格式：前缀 + 时间戳 + 随机数</p>
            <p>• 自动检查唯一性，避免重复</p>
            <p>• 符合标准条形码长度要求</p>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default BarcodeGenerator;