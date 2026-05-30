import React, { useRef, useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Camera, X } from 'lucide-react';
import { toast } from 'sonner';

interface PartQRScannerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onScan: (result: string) => void;
}

const PartQRScannerModal: React.FC<PartQRScannerModalProps> = ({ isOpen, onClose, onScan }) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [scanning, setScanning] = useState(false);

  // 启动摄像头
  const startCamera = async () => {
    try {
      const mediaStream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment' } // 使用后置摄像头
      });
      
      if (videoRef.current) {
        videoRef.current.srcObject = mediaStream;
      }
      
      setStream(mediaStream);
      setScanning(true);
    } catch (error) {
      console.error('Error accessing camera:', error);
      toast.error('无法访问摄像头，请检查权限设置');
    }
  };

  // 停止摄像头
  const stopCamera = () => {
    if (stream) {
      stream.getTracks().forEach(track => track.stop());
      setStream(null);
    }
    setScanning(false);
  };

  // 模拟扫描功能（实际项目中需要集成真正的QR码识别库）
  const handleManualInput = () => {
    const result = prompt('请输入条形码:');
    if (result) {
      onScan(result);
    }
  };

  useEffect(() => {
    if (isOpen) {
      startCamera();
    } else {
      stopCamera();
    }

    return () => {
      stopCamera();
    };
  }, [isOpen]);

  const handleClose = () => {
    stopCamera();
    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex justify-between items-center">
            扫描配件条形码
            <Button variant="ghost" size="sm" onClick={handleClose}>
              <X className="h-4 w-4" />
            </Button>
          </DialogTitle>
        </DialogHeader>
        
        <div className="space-y-4">
          {/* 摄像头预览 */}
          <div className="relative aspect-square bg-black rounded-lg overflow-hidden">
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              className="w-full h-full object-cover"
            />
            
            {/* 扫描框 */}
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="w-48 h-48 border-2 border-white border-dashed rounded-lg flex items-center justify-center">
                <div className="text-white text-center">
                  <Camera className="h-8 w-8 mx-auto mb-2" />
                  <p className="text-sm">将条形码对准此处</p>
                </div>
              </div>
            </div>
          </div>

          {/* 状态显示 */}
          <div className="text-center">
            {scanning ? (
              <p className="text-sm text-slate-600">正在扫描中...</p>
            ) : (
              <p className="text-sm text-slate-500">准备扫描</p>
            )}
          </div>

          {/* 操作按钮 */}
          <div className="flex gap-2">
            <Button 
              variant="outline" 
              className="flex-1"
              onClick={handleManualInput}
            >
              手动输入
            </Button>
            <Button 
              variant="outline" 
              className="flex-1"
              onClick={startCamera}
              disabled={scanning}
            >
              重新扫描
            </Button>
          </div>

          <div className="text-xs text-slate-500 text-center">
            提示：将条形码放在扫描框内，确保光线充足
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default PartQRScannerModal;