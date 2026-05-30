import React, { useState, useEffect } from 'react';
import { X, Download, Copy } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Equipment } from '@/types/equipment';
import QRCode from 'qrcode';
import { useToast } from '@/hooks/use-toast';

interface QRCodeModalProps {
  isOpen: boolean;
  onClose: () => void;
  equipment: Equipment;
}

const QRCodeModal: React.FC<QRCodeModalProps> = ({ isOpen, onClose, equipment }) => {
  const [qrCodeUrl, setQrCodeUrl] = useState<string>('');
  const { toast } = useToast();

  useEffect(() => {
    if (isOpen && equipment) {
      generateQRCode();
    }
  }, [isOpen, equipment]);

  const generateQRCode = async () => {
    try {
      const qrData = JSON.stringify({
        id: equipment.id,
        name: equipment.name,
        model: equipment.model,
        location: equipment.location,
        status: equipment.status,
        responsible: equipment.responsible,
        url: `${window.location.origin}?id=${equipment.id}`
      });

      const url = await QRCode.toDataURL(qrData, {
        width: 300,
        margin: 2,
        color: {
          dark: '#000000',
          light: '#FFFFFF'
        }
      });
      setQrCodeUrl(url);
    } catch (error) {
      console.error('Error generating QR code:', error);
      toast({
        title: "生成失败",
        description: "二维码生成失败",
        variant: "destructive",
      });
    }
  };

  const downloadQRCode = () => {
    if (qrCodeUrl) {
      const link = document.createElement('a');
      link.download = `${equipment.id}_qrcode.png`;
      link.href = qrCodeUrl;
      link.click();
      
      toast({
        title: "下载成功",
        description: "二维码已保存到本地",
      });
    }
  };

  const copyQRData = () => {
    const qrData = JSON.stringify({
      id: equipment.id,
      name: equipment.name,
      model: equipment.model,
      location: equipment.location,
      status: equipment.status,
      responsible: equipment.responsible,
      url: `${window.location.origin}?id=${equipment.id}`
    }, null, 2);

    navigator.clipboard.writeText(qrData);
    toast({
      title: "复制成功",
      description: "设备信息已复制到剪贴板",
    });
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl max-w-md w-full shadow-2xl">
        <div className="flex justify-between items-center p-6 border-b bg-gradient-to-r from-blue-50 to-purple-50">
          <h2 className="text-xl font-bold text-gray-800">设备二维码</h2>
          <Button variant="ghost" size="sm" onClick={onClose} className="text-gray-500 hover:text-gray-700">
            <X className="h-4 w-4" />
          </Button>
        </div>

        <div className="p-6 space-y-6">
          {/* 设备信息 */}
          <div className="text-center">
            <h3 className="text-lg font-semibold text-gray-800 mb-2">{equipment.name}</h3>
            <p className="text-sm text-gray-600">{equipment.id} - {equipment.model}</p>
            <p className="text-sm text-gray-500">{equipment.location}</p>
          </div>

          {/* 二维码显示 */}
          <div className="flex justify-center">
            {qrCodeUrl ? (
              <div className="bg-white p-4 rounded-lg shadow-md border">
                <img 
                  src={qrCodeUrl} 
                  alt="QR Code" 
                  className="w-64 h-64"
                />
              </div>
            ) : (
              <div className="w-64 h-64 bg-gray-100 rounded-lg flex items-center justify-center">
                <p className="text-gray-500">生成中...</p>
              </div>
            )}
          </div>

          {/* 操作按钮 */}
          <div className="flex gap-2">
            <Button
              onClick={downloadQRCode}
              disabled={!qrCodeUrl}
              className="flex-1 bg-blue-600 hover:bg-blue-700"
            >
              <Download className="h-4 w-4 mr-2" />
              下载二维码
            </Button>
            <Button
              onClick={copyQRData}
              variant="outline"
              className="flex-1"
            >
              <Copy className="h-4 w-4 mr-2" />
              复制信息
            </Button>
          </div>

          <div className="text-xs text-gray-500 text-center">
            扫描二维码可查看设备详细信息
          </div>
        </div>
      </div>
    </div>
  );
};

export default QRCodeModal;