
import React, { useRef } from 'react';
import { Download, Printer } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Equipment } from '@/types/equipment';
import QRCode from 'qrcode';
import html2canvas from 'html2canvas';
import jsPDF from 'jspdf';

interface QRCodeGeneratorProps {
  equipment: Equipment;
}

const QRCodeGenerator: React.FC<QRCodeGeneratorProps> = ({ equipment }) => {
  const labelRef = useRef<HTMLDivElement>(null);
  const [qrCodeUrl, setQrCodeUrl] = React.useState<string>('');

  React.useEffect(() => {
    const generateQRCode = async () => {
      try {
        // 简化二维码内容，只包含必要信息便于扫描
        const qrContent = `${window.location.origin}?id=${equipment.id}`;
        
        const url = await QRCode.toDataURL(qrContent, {
          width: 200,
          margin: 1,
          color: {
            dark: '#000000',
            light: '#FFFFFF'
          }
        });
        setQrCodeUrl(url);
      } catch (error) {
        console.error('Error generating QR code:', error);
      }
    };

    generateQRCode();
  }, [equipment]);

  const downloadLabel = async () => {
    if (!labelRef.current) return;

    try {
      const canvas = await html2canvas(labelRef.current, {
        backgroundColor: '#ffffff',
        scale: 2
      });
      
      const link = document.createElement('a');
      link.download = `${equipment.id}_label.png`;
      link.href = canvas.toDataURL();
      link.click();
    } catch (error) {
      console.error('Error downloading label:', error);
    }
  };

  const printLabel = async () => {
    if (!labelRef.current) return;

    try {
      const canvas = await html2canvas(labelRef.current, {
        backgroundColor: '#ffffff',
        scale: 2
      });
      
      const imgData = canvas.toDataURL('image/png');
      const pdf = new jsPDF({
        orientation: 'portrait',
        unit: 'mm',
        format: [80, 60] // 标签尺寸
      });
      
      pdf.addImage(imgData, 'PNG', 5, 5, 70, 50);
      pdf.autoPrint();
      window.open(pdf.output('bloburl'), '_blank');
    } catch (error) {
      console.error('Error printing label:', error);
    }
  };

  return (
    <div className="space-y-4">
      <h3 className="text-lg font-semibold">二维码标签</h3>
      
      {/* 标签预览 */}
      <div 
        ref={labelRef}
        className="bg-white border-2 border-dashed border-gray-300 p-4 rounded-lg text-center"
        style={{ width: '320px', height: '240px' }}
      >
        <div className="flex flex-col items-center justify-center h-full space-y-2">
          {qrCodeUrl && (
            <img 
              src={qrCodeUrl} 
              alt="QR Code" 
              className="w-24 h-24"
            />
          )}
          <div className="text-center">
            <h4 className="font-bold text-sm">{equipment.name}</h4>
            <p className="text-xs text-gray-600">{equipment.id}</p>
            <p className="text-xs text-gray-500">{equipment.location}</p>
          </div>
        </div>
      </div>

      {/* 操作按钮 */}
      <div className="flex gap-2">
        <Button
          onClick={downloadLabel}
          size="sm"
          className="flex-1 bg-green-600 hover:bg-green-700"
        >
          <Download className="h-4 w-4 mr-2" />
          下载
        </Button>
        <Button
          onClick={printLabel}
          size="sm"
          variant="outline"
          className="flex-1"
        >
          <Printer className="h-4 w-4 mr-2" />
          打印
        </Button>
      </div>

      <div className="text-xs text-gray-500 text-center">
        标签尺寸: 80mm × 60mm
      </div>
    </div>
  );
};

export default QRCodeGenerator;
