import React, { useState, useRef, useCallback, useEffect } from 'react';
import { X, Upload, FileImage, Loader2, Copy, Download, Camera, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface ImageOCRModalProps {
  isOpen: boolean;
  onClose: () => void;
  onTextExtracted: (text: string) => void;
}

// === 高级图片预处理：自适应阈值 + 反光抑制 ===
function preprocessImage(imageDataUrl: string): Promise<string> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      const maxW = 1920;
      const scale = img.width > maxW ? maxW / img.width : 1;
      canvas.width = img.width * scale;
      canvas.height = img.height * scale;
      const ctx = canvas.getContext('2d')!;
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

      const src = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const w = canvas.width, h = canvas.height;
      const pixels = src.data;

      // Step 1: 灰度化
      const gray = new Float32Array(w * h);
      for (let i = 0; i < pixels.length; i += 4) {
        const idx = i / 4;
        gray[idx] = 0.299 * pixels[i] + 0.587 * pixels[i + 1] + 0.114 * pixels[i + 2];
      }

      // Step 2: 反光压制（过曝区域用局部中值替换）
      const repaired = new Float32Array(gray);
      const halfW = 2;
      for (let y = halfW; y < h - halfW; y++) {
        for (let x = halfW; x < w - halfW; x++) {
          const idx = y * w + x;
          if (gray[idx] > 240) {
            const vals: number[] = [];
            for (let dy = -halfW; dy <= halfW; dy++)
              for (let dx = -halfW; dx <= halfW; dx++) {
                const nIdx = (y + dy) * w + (x + dx);
                if (gray[nIdx] <= 240) vals.push(gray[nIdx]);
              }
            if (vals.length > 0) {
              vals.sort((a, b) => a - b);
              repaired[idx] = vals[Math.floor(vals.length / 2)];
            } else {
              repaired[idx] = 128;
            }
          }
        }
      }

      // Step 3: 自适应阈值 (Sauvola 简化版)
      const WINDOW = 15, halfWin = 7, K = 0.2, R = 128;
      const integral = new Float64Array((w + 1) * (h + 1));
      const integralSq = new Float64Array((w + 1) * (h + 1));
      for (let y = 0; y < h; y++) {
        let sum = 0, sumSq = 0;
        for (let x = 0; x < w; x++) {
          const idx = y * w + x;
          const v = repaired[idx];
          sum += v;
          sumSq += v * v;
          const iIdx = (y + 1) * (w + 1) + (x + 1);
          integral[iIdx] = integral[y * (w + 1) + (x + 1)] + sum;
          integralSq[iIdx] = integralSq[y * (w + 1) + (x + 1)] + sumSq;
        }
      }
      const getSum = (arr: Float64Array, y1: number, x1: number, y2: number, x2: number) =>
        arr[y2 * (w + 1) + x2] - arr[y1 * (w + 1) + x2] - arr[y2 * (w + 1) + x1] + arr[y1 * (w + 1) + x1];

      const result = ctx.createImageData(w, h);
      const out = result.data;
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          const y1 = y - halfWin, x1 = x - halfWin;
          const y2 = y + halfWin + 1, x2 = x + halfWin + 1;
          const count = (y2 - y1) * (x2 - x1);
          const sum = getSum(integral, y1, x1, y2, x2);
          const sumSq = getSum(integralSq, y1, x1, y2, x2);
          const mean = sum / count;
          const variance = (sumSq / count) - (mean * mean);
          const stddev = Math.sqrt(Math.max(0, variance));
          const threshold = mean * (1 + K * ((stddev / R) - 1));

          const isText = repaired[y * w + x] < threshold;
          const outIdx = (y * w + x) * 4;
          out[outIdx] = isText ? 0 : 255;
          out[outIdx + 1] = isText ? 0 : 255;
          out[outIdx + 2] = isText ? 0 : 255;
          out[outIdx + 3] = 255;
        }
      }
      ctx.putImageData(result, 0, 0);

      // Step 4: 去噪
      const denoised = ctx.getImageData(0, 0, w, h);
      const din = denoised.data;
      for (let y = 1; y < h - 1; y++) {
        for (let x = 1; x < w - 1; x++) {
          const idx = (y * w + x) * 4;
          let blackNeighbors = 0;
          for (let dy = -1; dy <= 1; dy++)
            for (let dx = -1; dx <= 1; dx++) {
              if (dy === 0 && dx === 0) continue;
              if (din[((y + dy) * w + (x + dx)) * 4] === 0) blackNeighbors++;
            }
          if (din[idx] === 0 && blackNeighbors < 3) {
            din[idx] = 255; din[idx + 1] = 255; din[idx + 2] = 255;
          } else if (din[idx] !== 0 && blackNeighbors > 5) {
            din[idx] = 0; din[idx + 1] = 0; din[idx + 2] = 0;
          }
        }
      }
      ctx.putImageData(denoised, 0, 0);

      resolve(canvas.toDataURL('image/png'));
    };
    img.src = imageDataUrl;
  });
}

const ImageOCRModal: React.FC<ImageOCRModalProps> = ({
  isOpen,
  onClose,
  onTextExtracted
}) => {
  const [imageData, setImageData] = useState<string>('');
  const [processedImage, setProcessedImage] = useState<string>('');
  const [extractedText, setExtractedText] = useState<string>('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string>('');
  const [workerReady, setWorkerReady] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [showCamera, setShowCamera] = useState(false);
  const [cameraStream, setCameraStream] = useState<MediaStream | null>(null);

  // 预加载 tesseract worker
  useEffect(() => {
    if (!isOpen || workerReady) return;
    setWorkerReady(true);
    return () => {
      setWorkerReady(false);
    };
  }, [isOpen]);

  const handleImageUpload = useCallback(async (file: File) => {
    if (!file.type.startsWith('image/')) {
      setError('请选择有效的图片文件');
      return;
    }
    const reader = new FileReader();
    reader.onload = async (e) => {
      const result = e.target?.result as string;
      setImageData(result);
      setExtractedText('');
      setError('');
      // 自动预处理
      const enhanced = await preprocessImage(result);
      setProcessedImage(enhanced);
    };
    reader.readAsDataURL(file);
  }, []);

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) handleImageUpload(file);
  };

  const handlePaste = useCallback((event: ClipboardEvent) => {
    const items = event.clipboardData?.items;
    if (items) {
      for (let i = 0; i < items.length; i++) {
        if (items[i].type.startsWith('image/')) {
          const file = items[i].getAsFile();
          if (file) handleImageUpload(file);
          break;
        }
      }
    }
  }, [handleImageUpload]);

  // 拍照功能
  const startCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment', width: { ideal: 1920 } }
      });
      setCameraStream(stream);
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
      setShowCamera(true);
    } catch {
      setError('无法打开摄像头，请检查权限');
    }
  };

  const capturePhoto = async () => {
    if (!videoRef.current || !canvasRef.current) return;
    const video = videoRef.current;
    const canvas = canvasRef.current;
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext('2d')!.drawImage(video, 0, 0);
    const dataUrl = canvas.toDataURL('image/jpeg', 0.9);
    setImageData(dataUrl);
    const enhanced = await preprocessImage(dataUrl);
    setProcessedImage(enhanced);
    // 关闭摄像头
    cameraStream?.getTracks().forEach(t => t.stop());
    setCameraStream(null);
    setShowCamera(false);
  };

  const stopCamera = () => {
    cameraStream?.getTracks().forEach(t => t.stop());
    setCameraStream(null);
    setShowCamera(false);
  };

  // 清理
  useEffect(() => {
    if (!isOpen) {
      cameraStream?.getTracks().forEach(t => t.stop());
      setCameraStream(null);
      setShowCamera(false);
    }
  }, [isOpen]);

  useEffect(() => {
    if (isOpen) {
      document.addEventListener('paste', handlePaste);
      return () => document.removeEventListener('paste', handlePaste);
    }
  }, [isOpen, handlePaste]);

  if (!isOpen) return null;

  const extractTextFromImage = async () => {
    if (!imageData) {
      setError('请先选择或粘贴图片');
      return;
    }
    setIsProcessing(true);
    setError('');
    setProgress(10);

    try {
      // === 方案1：EasyOCR 云服务（HuggingFace，中文识别精准）===
      setProgress(20);
      const base64 = imageData.replace(/^data:image\/\w+;base64,/, '');

      let cloudDone = false;
      try {
        const hfResponse = await fetch('https://zhifu1-paddle-ocr.hf.space/ocr', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ image: base64 }),
        });

        if (hfResponse.ok) {
          const hfResult = await hfResponse.json();
          setProgress(80);
          if (hfResult.text && hfResult.text.trim().length > 0) {
            setExtractedText(hfResult.text.trim());
            setProgress(100);
            cloudDone = true;
          }
        }
      } catch (hfErr) {
        console.log('EasyOCR 云服务不可用，尝试备选...');
      }

      if (cloudDone) return;

      // === 方案2：OCR.space 云服务（免费备选）===
      setProgress(30);
      try {
        const formData = new FormData();
        formData.append('base64Image', 'data:image/png;base64,' + base64);
        formData.append('language', 'chs');
        formData.append('isOverlayRequired', 'false');
        formData.append('detectOrientation', 'true');
        formData.append('scale', 'true');
        formData.append('OCREngine', '2');

        const ocrResponse = await fetch('https://api.ocr.space/parse/image', {
          method: 'POST',
          body: formData,
          headers: { 'apikey': 'helloworld' },
        });

        const result = await ocrResponse.json();
        setProgress(80);

        if (result?.ParsedResults?.length > 0) {
          const cloudText = result.ParsedResults
            .map((r: any) => r.ParsedText)
            .join('\n')
            .trim();

          if (cloudText.length > 3) {
            setExtractedText(cloudText);
            setProgress(100);
            cloudDone = true;
          }
        }
      } catch (ocrErr) {
        console.log('OCR.space 不可用，使用本地 Tesseract...');
      }

      if (cloudDone) return;

      // === 方案3：Tesseract 本地回退（离线可用）===
      setProgress(50);
      const Tesseract = (await import('tesseract.js')).default;
      const worker = await Tesseract.createWorker('chi_sim+eng', 1, {
        logger: (m: any) => {
          if (m.status === 'recognizing text') {
            setProgress(50 + Math.round(m.progress * 40));
          }
        },
      });
      await worker.setParameters({
        tessedit_pageseg_mode: '3',
        preserve_interword_spaces: '1',
      });

      const imgToUse = processedImage || imageData;
      const { data: { text } } = await worker.recognize(imgToUse);
      await worker.terminate();
      setProgress(95);

      if (text.trim()) {
        setExtractedText(text.trim());
      } else {
        setError('识别失败，请使用更清晰的图片或在光线充足处重试');
      }
    } catch (err) {
      console.error('OCR失败:', err);
      setError('网络异常，请检查网络后重试');
    } finally {
      setIsProcessing(false);
      setProgress(0);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto shadow-2xl">
        {/* 头部 */}
        <div className="flex items-center justify-between px-5 py-4 border-b">
          <div className="flex items-center gap-2">
            <div className="p-1.5 bg-blue-500 rounded-lg"><FileImage className="h-5 w-5 text-white" /></div>
            <h2 className="text-lg font-bold">图像文字识别</h2>
          </div>
          <Button variant="ghost" size="sm" onClick={onClose}><X className="h-5 w-5" /></Button>
        </div>

        <div className="p-5 space-y-4">
          {/* 摄像头 */}
          {showCamera && (
            <div className="relative rounded-xl overflow-hidden bg-black">
              <video ref={videoRef} autoPlay playsInline className="w-full" />
              <canvas ref={canvasRef} className="hidden" />
              <div className="absolute bottom-4 left-0 right-0 flex justify-center gap-3">
                <Button onClick={capturePhoto} className="bg-white text-black hover:bg-gray-200 rounded-full w-14 h-14 p-0">
                  <Camera className="h-6 w-6" />
                </Button>
                <Button onClick={stopCamera} variant="ghost" className="text-white"><X className="h-5 w-5" /></Button>
              </div>
            </div>
          )}

          {/* 上传区 */}
          {!showCamera && (
            <div
              className="border-2 border-dashed border-gray-300 rounded-xl p-6 text-center bg-gray-50 hover:bg-gray-100 transition-colors cursor-pointer"
              onClick={() => fileInputRef.current?.click()}
            >
              {imageData ? (
                <div className="space-y-3">
                  <img src={imageData} alt="原始图片" className="max-w-full max-h-48 mx-auto rounded-lg shadow" />
                  {processedImage && (
                    <div className="flex gap-2 justify-center flex-wrap">
                      <span className="text-xs text-gray-400">预处理增强后：</span>
                      <img src={processedImage} alt="预处理" className="max-w-full max-h-16 rounded border" />
                    </div>
                  )}
                  <div className="flex gap-2 justify-center">
                    <Button variant="outline" size="sm" onClick={(e) => { e.stopPropagation(); fileInputRef.current?.click(); }}>
                      <Upload className="h-4 w-4 mr-1.5" /> 重新选择
                    </Button>
                    <Button size="sm" onClick={(e) => { e.stopPropagation(); extractTextFromImage(); }} disabled={isProcessing}>
                      {isProcessing ? <><Loader2 className="h-4 w-4 mr-1.5 animate-spin" />{progress}%</> : <><RefreshCw className="h-4 w-4 mr-1.5" />开始识别</>}
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="space-y-3">
                  <FileImage className="h-14 w-14 text-gray-300 mx-auto" />
                  <p className="text-gray-500 font-medium">点击选择图片或 Ctrl+V 粘贴截图</p>
                  <div className="flex gap-2 justify-center">
                    <Button variant="outline" size="sm" onClick={(e) => { e.stopPropagation(); fileInputRef.current?.click(); }}>
                      <Upload className="h-4 w-4 mr-1.5" /> 选择文件
                    </Button>
                    <Button variant="outline" size="sm" onClick={(e) => { e.stopPropagation(); startCamera(); }}>
                      <Camera className="h-4 w-4 mr-1.5" /> 拍照
                    </Button>
                  </div>
                </div>
              )}
            </div>
          )}

          <input ref={fileInputRef} type="file" accept="image/*" onChange={handleFileSelect} className="hidden" />
          <input ref={fileInputRef} type="file" accept="image/*" capture="environment" onChange={handleFileSelect} className="hidden" />

          {error && <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700">{error}</div>}

          {/* 结果 */}
          {extractedText && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="font-semibold">识别结果</h3>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={() => navigator.clipboard.writeText(extractedText)}>
                    <Copy className="h-4 w-4 mr-1.5" /> 复制
                  </Button>
                  <Button size="sm" className="bg-green-600 hover:bg-green-700" onClick={() => { onTextExtracted(extractedText); onClose(); }}>
                    <Download className="h-4 w-4 mr-1.5" /> 应用
                  </Button>
                </div>
              </div>
              <textarea
                className="w-full h-40 p-3 border rounded-xl text-sm font-mono resize-none bg-gray-50"
                value={extractedText}
                onChange={e => setExtractedText(e.target.value)}
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default ImageOCRModal;
