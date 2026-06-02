/**
 * SmartOCRModal — 智能 OCR 设备匹配
 * 拍照 → OCR识别 → 字段解析 → 数据库匹配 → 差异对比 → 更新/新建
 */
import React, { useState, useRef, useCallback, useEffect, useReducer } from 'react';
import {
  X, Upload, Camera, Loader2, RefreshCw, Search, CheckCircle2,
  AlertTriangle, Plus, ChevronLeft, ChevronRight, Info, FileImage,
  Circle, Check, Pencil, ExternalLink,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Equipment, statusLabels } from '@/types/equipment';
import {
  parseOCRText, searchEquipment, compareFields, parsedFieldsToEquipment,
  ParsedField, OCRMatchResult, FieldComparison, normalizeDateString,
  parseOCRWithLLM, parseOCRWithLayout, OCRDetail,
  getCustomMappings, addCustomMapping, removeCustomMapping, exportCustomMappings, importCustomMappings,
  CustomLabelMapping,
  chatWithAI, buildAIContext, ChatMessage, ChatAction,
} from '@/utils/ocrFieldParser';

// ====================== 高级图片预处理（抗反光） ======================

/**
 * 预处理策略：生成多个预处理版本，OCR 时取最优
 * 核心思路：自适应阈值 + 局部对比度增强 + 反光抑制
 */
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

      // ===== Step 1: 灰度化 + 反光抑制 =====
      const gray = new Float32Array(w * h);
      for (let i = 0; i < pixels.length; i += 4) {
        const idx = i / 4;
        // 加权灰度
        gray[idx] = 0.299 * pixels[i] + 0.587 * pixels[i + 1] + 0.114 * pixels[i + 2];
      }

      // ===== Step 2: 反光检测和压制 =====
      // 检测过曝区域（亮度 > 240 的像素），用局部中值替换
      const GLARE_THRESHOLD = 240;
      const glareMask = new Uint8Array(w * h);
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          const idx = y * w + x;
          if (gray[idx] > GLARE_THRESHOLD) glareMask[idx] = 1;
        }
      }

      // 对反光区域做简单中值修复（缩小窗口，快速）
      const windowSize = 5;
      const halfW = Math.floor(windowSize / 2);
      const repaired = new Float32Array(gray);
      for (let y = halfW; y < h - halfW; y++) {
        for (let x = halfW; x < w - halfW; x++) {
          const idx = y * w + x;
          if (glareMask[idx]) {
            // 收集邻域非反光像素
            const vals: number[] = [];
            for (let dy = -halfW; dy <= halfW; dy++) {
              for (let dx = -halfW; dx <= halfW; dx++) {
                const nIdx = (y + dy) * w + (x + dx);
                if (!glareMask[nIdx]) vals.push(gray[nIdx]);
              }
            }
            if (vals.length > 0) {
              vals.sort((a, b) => a - b);
              repaired[idx] = vals[Math.floor(vals.length / 2)];
            } else {
              repaired[idx] = 128; // 全反光区域用中性灰
            }
          }
        }
      }

      // ===== Step 3: 自适应阈值（Sauvola 算法简化版） =====
      // 核心：每个像素根据其局部邻域的均值和标准差动态计算阈值
      // 反光区域的邻域均值高 → 阈值自动升高 → 反光处变白（背景）
      // 暗区域的邻域均值低 → 阈值自动降低 → 暗处也能检测出黑字
      const WINDOW = 15; // 局部窗口大小
      const halfWin = Math.floor(WINDOW / 2);
      const K = 0.2;     // Sauvola 灵敏度（越大越敏感）
      const R = 128;     // 动态范围

      const result = ctx.createImageData(w, h);
      const out = result.data;

      // 预计算积分图用于快速均值/方差
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

      const getWindowSum = (arr: Float64Array, y1: number, x1: number, y2: number, x2: number) => {
        const yy1 = Math.max(0, y1), xx1 = Math.max(0, x1);
        const yy2 = Math.min(h, y2), xx2 = Math.min(w, x2);
        return arr[yy2 * (w + 1) + xx2] - arr[yy1 * (w + 1) + xx2]
             - arr[yy2 * (w + 1) + xx1] + arr[yy1 * (w + 1) + xx1];
      };

      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          const y1 = y - halfWin, x1 = x - halfWin;
          const y2 = y + halfWin + 1, x2 = x + halfWin + 1;
          const count = (y2 - y1) * (x2 - x1);
          const sum = getWindowSum(integral, y1, x1, y2, x2);
          const sumSq = getWindowSum(integralSq, y1, x1, y2, x2);
          const mean = sum / count;
          const variance = (sumSq / count) - (mean * mean);
          const stddev = Math.sqrt(Math.max(0, variance));

          // Sauvola 阈值：T = mean * (1 + K * (stddev/R - 1))
          const threshold = mean * (1 + K * ((stddev / R) - 1));

          const pixelIdx = y * w + x;
          // 文字比背景暗 → 低于阈值的是文字（黑色）
          const isText = repaired[pixelIdx] < threshold;
          const outIdx = pixelIdx * 4;
          out[outIdx] = isText ? 0 : 255;
          out[outIdx + 1] = isText ? 0 : 255;
          out[outIdx + 2] = isText ? 0 : 255;
          out[outIdx + 3] = 255;
        }
      }

      ctx.putImageData(result, 0, 0);

      // ===== Step 4: 去噪（形态学开运算简化：去除孤立噪点） =====
      // 3x3 去噪：如果像素周围超过 6 个同色像素，保留；否则翻转
      const denoised = ctx.getImageData(0, 0, w, h);
      const din = denoised.data;
      for (let y = 1; y < h - 1; y++) {
        for (let x = 1; x < w - 1; x++) {
          const idx = (y * w + x) * 4;
          let blackNeighbors = 0;
          for (let dy = -1; dy <= 1; dy++) {
            for (let dx = -1; dx <= 1; dx++) {
              if (dy === 0 && dx === 0) continue;
              if (din[((y + dy) * w + (x + dx)) * 4] === 0) blackNeighbors++;
            }
          }
          const isBlack = din[idx] === 0;
          if (isBlack && blackNeighbors < 3) {
            // 孤立黑点 → 变白（去噪）
            din[idx] = 255; din[idx + 1] = 255; din[idx + 2] = 255;
          } else if (!isBlack && blackNeighbors > 5) {
            // 被黑包围的白点 → 变黑（填补空洞）
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

// ====================== Step 枚举 ======================

type Step = 'capture' | 'processing' | 'review' | 'results' | 'confirm' | 'success';

// ====================== State & Reducer ======================

interface SmartOCRState {
  step: Step;
  imageData: string;
  processedImage: string;
  rawOcrText: string | null;
  ocrDetails: OCRDetail[] | null;  // 含位置坐标的详细结果
  parsedFields: ParsedField[];
  editedFields: Partial<Equipment>;
  matchResult: OCRMatchResult | null;
  selectedMatchIndex: number;
  checkedFields: Set<string>;
  isProcessing: boolean;
  progress: number;
  error: string;
  actionResult: string;
  // 摄像头
  showCamera: boolean;
}

type Action =
  | { type: 'SET_IMAGE'; imageData: string; processedImage: string }
  | { type: 'SET_STEP'; step: Step }
  | { type: 'SET_PROCESSING'; isProcessing: boolean }
  | { type: 'SET_PROGRESS'; progress: number }
  | { type: 'SET_ERROR'; error: string }
  | { type: 'SET_OCR_TEXT'; text: string }
  | { type: 'SET_OCR_DETAILS'; details: OCRDetail[] }
  | { type: 'SET_PARSED_FIELDS'; fields: ParsedField[] }
  | { type: 'EDIT_FIELD'; field: string; value: string }
  | { type: 'SET_MATCH_RESULT'; result: OCRMatchResult }
  | { type: 'SELECT_MATCH'; index: number }
  | { type: 'TOGGLE_FIELD'; field: string }
  | { type: 'CHECK_ALL_MISMATCH' }
  | { type: 'SET_ACTION_RESULT'; message: string }
  | { type: 'SET_SHOW_CAMERA'; show: boolean }
  | { type: 'RESET' };

const initialState: SmartOCRState = {
  step: 'capture',
  imageData: '',
  processedImage: '',
  rawOcrText: null,
  ocrDetails: null,
  parsedFields: [],
  editedFields: {},
  matchResult: null,
  selectedMatchIndex: 0,
  checkedFields: new Set(),
  isProcessing: false,
  progress: 0,
  error: '',
  actionResult: '',
  showCamera: false,
};

function smartOCRReducer(state: SmartOCRState, action: Action): SmartOCRState {
  switch (action.type) {
    case 'SET_IMAGE':
      return { ...state, imageData: action.imageData, processedImage: action.processedImage, error: '' };
    case 'SET_STEP':
      return { ...state, step: action.step };
    case 'SET_PROCESSING':
      return { ...state, isProcessing: action.isProcessing };
    case 'SET_PROGRESS':
      return { ...state, progress: action.progress };
    case 'SET_ERROR':
      return { ...state, error: action.error };
    case 'SET_OCR_TEXT':
      return { ...state, rawOcrText: action.text };
    case 'SET_OCR_DETAILS':
      return { ...state, ocrDetails: action.details };
    case 'SET_PARSED_FIELDS':
      return { ...state, parsedFields: action.fields, editedFields: {} };
    case 'EDIT_FIELD':
      return { ...state, editedFields: { ...state.editedFields, [action.field]: action.value } };
    case 'SET_MATCH_RESULT':
      return { ...state, matchResult: action.result, selectedMatchIndex: 0 };
    case 'SELECT_MATCH':
      return { ...state, selectedMatchIndex: action.index };
    case 'TOGGLE_FIELD': {
      const updated = new Set(state.checkedFields);
      if (updated.has(action.field)) updated.delete(action.field);
      else updated.add(action.field);
      return { ...state, checkedFields: updated };
    }
    case 'CHECK_ALL_MISMATCH': {
      const all = new Set<string>();
      const comp = state.matchResult?.matches[state.selectedMatchIndex]?.fieldComparisons || [];
      for (const c of comp) {
        if (c.status === 'mismatch' || c.status === 'ocr_only') all.add(c.field);
      }
      return { ...state, checkedFields: all };
    }
    case 'SET_ACTION_RESULT':
      return { ...state, actionResult: action.message };
    case 'SET_SHOW_CAMERA':
      return { ...state, showCamera: action.show };
    case 'RESET':
      return { ...initialState };
    default:
      return state;
  }
}

// ====================== Props ======================

interface SmartOCRModalProps {
  open: boolean;
  onClose: () => void;
  equipment: Equipment[];
  onUpdateEquipment: (id: string, updates: Partial<Equipment>) => Promise<void>;
  onCreateEquipment: (data: Partial<Equipment>) => Promise<void>;
}

// ====================== 主组件 ======================

const SmartOCRModal: React.FC<SmartOCRModalProps> = ({
  open, onClose, equipment, onUpdateEquipment, onCreateEquipment,
}) => {
  const [state, dispatch] = useReducer(smartOCRReducer, initialState);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [cameraStream, setCameraStream] = useState<MediaStream | null>(null);
  const [showAnnotation, setShowAnnotation] = useState(false);
  const [showAIChat, setShowAIChat] = useState(false);

  // 关闭时清理
  useEffect(() => {
    if (!open) {
      cameraStream?.getTracks().forEach(t => t.stop());
      setCameraStream(null);
      dispatch({ type: 'RESET' });
    }
  }, [open]);

  // 键盘粘贴事件
  const handlePaste = useCallback((event: ClipboardEvent) => {
    const items = event.clipboardData?.items;
    if (items) {
      for (let i = 0; i < items.length; i++) {
        if (items[i].type.startsWith('image/')) {
          const file = items[i].getAsFile();
          if (file) handleFile(file);
          break;
        }
      }
    }
  }, []);

  useEffect(() => {
    if (open) {
      document.addEventListener('paste', handlePaste);
      return () => document.removeEventListener('paste', handlePaste);
    }
  }, [open, handlePaste]);

  const handleFile = useCallback(async (file: File) => {
    if (!file.type.startsWith('image/')) {
      dispatch({ type: 'SET_ERROR', error: '请选择有效的图片文件' });
      return;
    }
    const reader = new FileReader();
    reader.onload = async (e) => {
      const dataUrl = e.target?.result as string;
      const enhanced = await preprocessImage(dataUrl);
      dispatch({ type: 'SET_IMAGE', imageData: dataUrl, processedImage: enhanced });
    };
    reader.readAsDataURL(file);
  }, []);

  // 拍照功能
  const startCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment', width: { ideal: 1920 } }
      });
      setCameraStream(stream);
      if (videoRef.current) videoRef.current.srcObject = stream;
      dispatch({ type: 'SET_SHOW_CAMERA', show: true });
    } catch {
      dispatch({ type: 'SET_ERROR', error: '无法打开摄像头，请检查权限或使用上传功能' });
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
    const enhanced = await preprocessImage(dataUrl);
    dispatch({ type: 'SET_IMAGE', imageData: dataUrl, processedImage: enhanced });
    cameraStream?.getTracks().forEach(t => t.stop());
    setCameraStream(null);
    dispatch({ type: 'SET_SHOW_CAMERA', show: false });
  };

  const stopCamera = () => {
    cameraStream?.getTracks().forEach(t => t.stop());
    setCameraStream(null);
    dispatch({ type: 'SET_SHOW_CAMERA', show: false });
  };

  // ===== OCR 识别 =====
  const runOCR = async () => {
    if (!state.imageData) {
      dispatch({ type: 'SET_ERROR', error: '请先选择或拍摄图片' });
      return;
    }
    dispatch({ type: 'SET_STEP', step: 'processing' });
    dispatch({ type: 'SET_PROCESSING', isProcessing: true });
    dispatch({ type: 'SET_PROGRESS', progress: 10 });
    dispatch({ type: 'SET_ERROR', error: '' });

    try {
      const base64 = state.imageData.replace(/^data:image\/\w+;base64,/, '');
      dispatch({ type: 'SET_PROGRESS', progress: 30 });

      // 方案1：PaddleOCR (HuggingFace) — 返回文字+位置坐标
      let text = '';
      let ocrDetails: OCRDetail[] | null = null;
      try {
        const hfResponse = await fetch('https://zhifu1-paddle-ocr.hf.space/ocr', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ image: base64 }),
        });
        if (hfResponse.ok) {
          const result = await hfResponse.json();
          text = result.text?.trim() || '';
          ocrDetails = result.details || null;
          dispatch({ type: 'SET_OCR_DETAILS', details: ocrDetails || [] });
        }
      } catch { /* fallback */ }

      dispatch({ type: 'SET_PROGRESS', progress: 60 });

      // 方案2：OCR.space fallback
      if (!text || text.length < 3) {
        try {
          const formData = new FormData();
          formData.append('base64Image', 'data:image/png;base64,' + base64);
          formData.append('language', 'chs');
          formData.append('OCREngine', '2');
          const resp = await fetch('https://api.ocr.space/parse/image', {
            method: 'POST', body: formData,
            headers: { 'apikey': 'helloworld' },
          });
          const result = await resp.json();
          if (result?.ParsedResults?.length > 0) {
            text = result.ParsedResults.map((r: any) => r.ParsedText).join('\n').trim();
          }
        } catch { /* fallback */ }
      }

      dispatch({ type: 'SET_PROGRESS', progress: 80 });

      // 方案3：Tesseract 本地
      if (!text || text.length < 3) {
        const Tesseract = (await import('tesseract.js')).default;
        const worker = await Tesseract.createWorker('chi_sim+eng', 1, {
          logger: (m: any) => {
            if (m.status === 'recognizing text') {
              dispatch({ type: 'SET_PROGRESS', progress: 80 + Math.round(m.progress * 15) });
            }
          },
        });
        await worker.setParameters({ tessedit_pageseg_mode: '3', preserve_interword_spaces: '1' });
        const imgToUse = state.processedImage || state.imageData;
        const { data: { text: tesseractText } } = await worker.recognize(imgToUse);
        await worker.terminate();
        text = tesseractText.trim();
      }

      dispatch({ type: 'SET_PROGRESS', progress: 95 });

      if (!text || text.length < 2) {
        dispatch({ type: 'SET_ERROR', error: '图片中未检测到文字。建议：\n① 换个角度避开反光\n② 确保光线均匀（不要一侧亮一侧暗）\n③ 尽量正对铭牌拍摄，不要倾斜\n④ 靠近一点让文字占画面更大比例' });
        dispatch({ type: 'SET_STEP', step: 'capture' });
        return;
      }

      dispatch({ type: 'SET_OCR_TEXT', text });

      // 优先使用基于空间布局的解析（利用位置坐标匹配标签→值）
      let fields: ParsedField[];
      if (ocrDetails && ocrDetails.length > 0) {
        fields = parseOCRWithLayout(ocrDetails);
      }
      // 回退到纯文本解析
      if (!fields || fields.length === 0) {
        fields = parseOCRText(text);
      }
      dispatch({ type: 'SET_PARSED_FIELDS', fields });
      dispatch({ type: 'SET_PROGRESS', progress: 100 });
      dispatch({ type: 'SET_STEP', step: 'review' });
    } catch (err: any) {
      dispatch({ type: 'SET_ERROR', error: 'OCR识别失败：' + (err.message || '网络异常') });
      dispatch({ type: 'SET_STEP', step: 'capture' });
    } finally {
      dispatch({ type: 'SET_PROCESSING', isProcessing: false });
    }
  };

  // ===== AI 智能解析 =====
  const handleLLMParse = async () => {
    if (!state.rawOcrText) return;
    let apiKey = localStorage.getItem('ocr_llm_api_key');
    if (!apiKey) {
      apiKey = prompt('请输入 AI API 密钥（DeepSeek 或 OpenAI 兼容）：\n密钥仅保存在本地浏览器，不会上传到任何服务器');
      if (!apiKey) return;
      localStorage.setItem('ocr_llm_api_key', apiKey);
    }

    dispatch({ type: 'SET_PROCESSING', isProcessing: true });
    dispatch({ type: 'SET_ERROR', error: '' });
    try {
      const fields = await parseOCRWithLLM(state.rawOcrText, apiKey);
      if (fields.length === 0) {
        dispatch({ type: 'SET_ERROR', error: 'AI 解析也未提取到字段，请手动输入或换角度重拍' });
      } else {
        dispatch({ type: 'SET_PARSED_FIELDS', fields });
      }
    } catch (err: any) {
      if (err.message.includes('401')) {
        localStorage.removeItem('ocr_llm_api_key');
        dispatch({ type: 'SET_ERROR', error: 'API 密钥无效，已清除。请重新点击 AI 解析并输入正确的密钥' });
      } else {
        dispatch({ type: 'SET_ERROR', error: 'AI 解析失败：' + (err.message || '网络错误') });
      }
    } finally {
      dispatch({ type: 'SET_PROCESSING', isProcessing: false });
    }
  };

  // ===== 搜索匹配 =====
  const doSearch = () => {
    // 合并用户编辑
    const mergedFields = state.parsedFields.map(pf => {
      if (state.editedFields[pf.field] !== undefined) {
        return { ...pf, value: String(state.editedFields[pf.field]) };
      }
      return pf;
    });

    const result = searchEquipment(mergedFields, equipment);
    dispatch({ type: 'SET_MATCH_RESULT', result });
    // 自动勾选所有差异和新字段
    if (result.bestMatch) {
      setTimeout(() => dispatch({ type: 'CHECK_ALL_MISMATCH' }), 0);
    }
    dispatch({ type: 'SET_STEP', step: 'results' });
  };

  // ===== 执行更新 =====
  const handleConfirmUpdate = async () => {
    if (!state.matchResult?.bestMatch) return;

    const comps = state.matchResult.bestMatch.fieldComparisons;
    const updates: Partial<Equipment> = {};

    for (const field of state.checkedFields) {
      const comp = comps.find(c => c.field === field);
      if (comp?.ocrValue) {
        (updates as any)[field] = comp.ocrValue;
      }
    }

    if (Object.keys(updates).length === 0) {
      dispatch({ type: 'SET_ERROR', error: '请至少选择一个要更新的字段' });
      return;
    }

    dispatch({ type: 'SET_STEP', step: 'confirm' });
    dispatch({ type: 'SET_PROCESSING', isProcessing: true });

    try {
      await onUpdateEquipment(state.matchResult.bestMatch.equipment.id, updates);
      dispatch({ type: 'SET_ACTION_RESULT', message: `已更新设备 "${state.matchResult.bestMatch.equipment.name}" 的 ${Object.keys(updates).length} 个字段` });
      dispatch({ type: 'SET_STEP', step: 'success' });
    } catch (err: any) {
      dispatch({ type: 'SET_ERROR', error: '更新失败：' + (err.message || '未知错误') });
      dispatch({ type: 'SET_STEP', step: 'results' });
    } finally {
      dispatch({ type: 'SET_PROCESSING', isProcessing: false });
    }
  };

  // ===== 创建新设备 =====
  const handleCreateNew = async () => {
    const mergedFields = state.parsedFields.map(pf => {
      if (state.editedFields[pf.field] !== undefined) {
        return { ...pf, value: String(state.editedFields[pf.field]) };
      }
      return pf;
    });
    const data = parsedFieldsToEquipment(mergedFields);

    if (!data.name) {
      dispatch({ type: 'SET_ERROR', error: '创建新设备需要至少识别出仪器名称' });
      return;
    }

    dispatch({ type: 'SET_PROCESSING', isProcessing: true });
    try {
      await onCreateEquipment(data);
      dispatch({ type: 'SET_ACTION_RESULT', message: `已创建新设备 "${data.name}"` });
      dispatch({ type: 'SET_STEP', step: 'success' });
    } catch (err: any) {
      dispatch({ type: 'SET_ERROR', error: '创建失败：' + (err.message || '未知错误') });
    } finally {
      dispatch({ type: 'SET_PROCESSING', isProcessing: false });
    }
  };

  // ===== 继续扫描 =====
  const handleScanAnother = () => {
    dispatch({ type: 'RESET' });
  };

  if (!open) return null;

  // ====================== 步骤条 ======================
  const steps: { key: Step; label: string }[] = [
    { key: 'capture', label: '拍照' },
    { key: 'processing', label: '识别' },
    { key: 'review', label: '确认' },
    { key: 'results', label: '匹配' },
    { key: 'confirm', label: '更新' },
    { key: 'success', label: '完成' },
  ];
  const stepIdx = steps.findIndex(s => s.key === state.step);

  // ====================== RENDER ======================
  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-[300] p-4">
      <div className="bg-white rounded-2xl max-w-2xl w-full max-h-[92vh] flex flex-col shadow-2xl overflow-hidden">
        {/* 头部 */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="p-1.5 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-lg">
              <Search className="h-5 w-5 text-white" />
            </div>
            <div>
              <h2 className="text-base font-bold">智能设备识别</h2>
              <p className="text-[11px] text-muted-foreground">拍照识别铭牌，自动匹配数据库</p>
            </div>
          </div>
          <Button variant="ghost" size="sm" onClick={onClose}><X className="h-5 w-5" /></Button>
        </div>

        {/* 步骤指示器 */}
        {state.step !== 'success' && (
          <div className="flex items-center gap-1 px-5 py-2 border-b bg-gray-50/50 shrink-0 overflow-x-auto">
            {steps.filter(s => s.key !== 'success').map((s, i) => (
              <React.Fragment key={s.key}>
                <div className={`flex items-center gap-1.5 text-xs whitespace-nowrap ${
                  i <= stepIdx ? 'text-blue-600' : 'text-gray-400'
                }`}>
                  <div className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold ${
                    i < stepIdx ? 'bg-blue-600 text-white'
                    : i === stepIdx ? 'bg-blue-100 text-blue-600 border border-blue-300'
                    : 'bg-gray-200 text-gray-500'
                  }`}>
                    {i < stepIdx ? <Check className="h-3 w-3" /> : i + 1}
                  </div>
                  <span className="hidden sm:inline">{s.label}</span>
                </div>
                {i < steps.filter(s => s.key !== 'success').length - 1 && (
                  <div className={`w-4 h-0.5 ${i < stepIdx ? 'bg-blue-400' : 'bg-gray-200'}`} />
                )}
              </React.Fragment>
            ))}
          </div>
        )}

        {/* 内容区 */}
        <div className="flex-1 overflow-y-auto p-5">
          {/* ===== STEP: CAPTURE ===== */}
          {state.step === 'capture' && (
            <CaptureStep
              state={state}
              fileInputRef={fileInputRef}
              videoRef={videoRef}
              canvasRef={canvasRef}
              onFileSelect={(e) => {
                const file = e.target.files?.[0];
                if (file) handleFile(file);
              }}
              onStartCamera={startCamera}
              onCapture={capturePhoto}
              onStopCamera={stopCamera}
              onRunOCR={runOCR}
            />
          )}

          {/* ===== STEP: PROCESSING ===== */}
          {state.step === 'processing' && (
            <ProcessingStep progress={state.progress} />
          )}

          {/* ===== STEP: PARSED_REVIEW ===== */}
          {state.step === 'review' && (
            <ParsedReviewStep
              state={state}
              dispatch={dispatch}
              onSearch={doSearch}
              onBack={() => dispatch({ type: 'SET_STEP', step: 'capture' })}
              onLLMParse={handleLLMParse}
              onReparse={() => {
                if (state.ocrDetails && state.ocrDetails.length > 0) {
                  const fields = parseOCRWithLayout(state.ocrDetails);
                  dispatch({ type: 'SET_PARSED_FIELDS', fields });
                } else if (state.rawOcrText) {
                  const fields = parseOCRText(state.rawOcrText);
                  dispatch({ type: 'SET_PARSED_FIELDS', fields });
                }
              }}
              onAIFill={(field, value) => dispatch({ type: 'EDIT_FIELD', field, value })}
            />
          )}

          {/* ===== STEP: MATCH_RESULTS ===== */}
          {state.step === 'results' && state.matchResult && (
            <MatchResultsStep
              state={state}
              dispatch={dispatch}
              matchResult={state.matchResult}
              onConfirmUpdate={() => dispatch({ type: 'SET_STEP', step: 'confirm' })}
              onCreateNew={handleCreateNew}
              onBack={() => dispatch({ type: 'SET_STEP', step: 'review' })}
            />
          )}

          {/* ===== STEP: CONFIRM ===== */}
          {state.step === 'confirm' && state.matchResult?.bestMatch && (
            <ConfirmStep
              state={state}
              match={state.matchResult.bestMatch}
              onConfirm={handleConfirmUpdate}
              onCancel={() => dispatch({ type: 'SET_STEP', step: 'results' })}
              isProcessing={state.isProcessing}
            />
          )}

          {/* ===== STEP: SUCCESS ===== */}
          {state.step === 'success' && (
            <SuccessStep
              message={state.actionResult}
              onScanAnother={handleScanAnother}
              onClose={onClose}
            />
          )}

          {/* 错误提示 */}
          {state.error && (
            <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700 flex items-start gap-2">
              <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
              <span>{state.error}</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default SmartOCRModal;

// ====================== 子组件 ======================

// ---------- Capture Step ----------
const CaptureStep: React.FC<{
  state: SmartOCRState;
  fileInputRef: React.RefObject<HTMLInputElement>;
  videoRef: React.RefObject<HTMLVideoElement>;
  canvasRef: React.RefObject<HTMLCanvasElement>;
  onFileSelect: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onStartCamera: () => void;
  onCapture: () => void;
  onStopCamera: () => void;
  onRunOCR: () => void;
}> = ({ state, fileInputRef, videoRef, canvasRef, onFileSelect, onStartCamera, onCapture, onStopCamera, onRunOCR }) => {
  if (state.showCamera) {
    return (
      <div className="relative rounded-xl overflow-hidden bg-black">
        <video ref={videoRef as any} autoPlay playsInline className="w-full" />
        <canvas ref={canvasRef as any} className="hidden" />
        <div className="absolute bottom-4 left-0 right-0 flex justify-center gap-3">
          <Button onClick={onCapture} className="bg-white text-black hover:bg-gray-200 rounded-full w-14 h-14 p-0">
            <Camera className="h-6 w-6" />
          </Button>
          <Button onClick={onStopCamera} variant="ghost" className="text-white">
            <X className="h-5 w-5" />
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div
        className="border-2 border-dashed border-gray-300 rounded-xl p-6 text-center bg-gray-50 hover:bg-gray-100 transition-colors cursor-pointer"
        onClick={() => fileInputRef.current?.click()}
      >
        {state.imageData ? (
          <div className="space-y-3">
            <img src={state.imageData} alt="拍摄图片" className="max-w-full max-h-48 mx-auto rounded-lg shadow" />
            {state.processedImage && (
              <div className="flex gap-2 justify-center flex-wrap">
                <span className="text-xs text-gray-400">预处理增强：</span>
                <img src={state.processedImage} alt="预处理" className="max-w-full max-h-12 rounded border" />
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-3 py-4">
            <FileImage className="h-14 w-14 text-gray-300 mx-auto" />
            <div>
              <p className="text-gray-600 font-medium">拍摄仪器铭牌、校正标签或资产标签</p>
              <p className="text-gray-400 text-xs mt-1">点击选择图片，Ctrl+V 粘贴截图，或用摄像头拍照</p>
            </div>
            <div className="flex gap-2 justify-center flex-wrap">
              <Button variant="outline" size="sm" onClick={(e) => { e.stopPropagation(); fileInputRef.current?.click(); }}>
                <Upload className="h-4 w-4 mr-1.5" /> 选择文件
              </Button>
              <Button variant="outline" size="sm" onClick={(e) => { e.stopPropagation(); onStartCamera(); }}>
                <Camera className="h-4 w-4 mr-1.5" /> 拍照
              </Button>
            </div>
          </div>
        )}
      </div>

      <input ref={fileInputRef as any} type="file" accept="image/*" onChange={onFileSelect} className="hidden" />

      {state.imageData && (
        <div className="flex gap-2 justify-center">
          <Button variant="outline" size="sm" onClick={(e) => { e.stopPropagation(); fileInputRef.current?.click(); }}>
            <Upload className="h-4 w-4 mr-1.5" /> 重新选择
          </Button>
          <Button onClick={onRunOCR} disabled={state.isProcessing} className="bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700">
            <Search className="h-4 w-4 mr-1.5" /> 开始识别
          </Button>
        </div>
      )}
    </div>
  );
};

// ---------- Processing Step ----------
const ProcessingStep: React.FC<{ progress: number }> = ({ progress }) => (
  <div className="flex flex-col items-center justify-center py-12 space-y-6">
    <div className="relative">
      <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-blue-100 to-indigo-100 flex items-center justify-center">
        <Loader2 className="h-10 w-10 text-blue-600 animate-spin" />
      </div>
      <div className="absolute -bottom-1 -right-1 w-7 h-7 rounded-full bg-blue-600 flex items-center justify-center">
        <Search className="h-3.5 w-3.5 text-white" />
      </div>
    </div>
    <div className="text-center space-y-2">
      <p className="text-lg font-semibold text-gray-700">正在识别图片文字...</p>
      <p className="text-sm text-gray-400">首次使用可能需要加载模型（5-15秒），后续会更快</p>
    </div>
    <div className="w-64 h-2 bg-gray-200 rounded-full overflow-hidden">
      <div className="h-full bg-gradient-to-r from-blue-500 to-indigo-600 rounded-full transition-all duration-500"
        style={{ width: `${progress}%` }} />
    </div>
    <p className="text-xs text-gray-400">{progress}%</p>
  </div>
);

// ---------- Image + OCR Text Overlay ----------

// ---------- Image + OCR Text Overlay (simplified, dropdown annotate) ----------

const FIELD_DROPDOWN_OPTIONS: { value: keyof Equipment; label: string }[] = [
  { value: 'name', label: '名称' }, { value: 'model', label: '型号' },
  { value: 'serialNumber', label: '序列号' }, { value: 'assetNumber', label: '资产编号' },
  { value: 'manufacturer', label: '厂商' }, { value: 'location', label: '位置' },
  { value: 'responsible', label: '负责人' }, { value: 'type', label: '类型' },
  { value: 'nextCalibrationDate', label: '校正日期' }, { value: 'supplier', label: '供应商' },
  { value: 'status', label: '状态' }, { value: 'notes', label: '备注' },
];

const ImageTextOverlay: React.FC<{
  imageData: string; ocrDetails: OCRDetail[] | null; parsedFields: ParsedField[];
  onAnnotate: (pattern: string, field: keyof Equipment) => void;
}> = ({ imageData, ocrDetails, parsedFields, onAnnotate }) => {
  const imgRef = useRef<HTMLImageElement>(null);
  const [imgNatural, setImgNatural] = useState({ w: 1, h: 1 });
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);
  const [selectedIdx, setSelectedIdx] = useState<number | null>(null);
  const [copiedIdx, setCopiedIdx] = useState<number | null>(null);
  const [dropdownIdx, setDropdownIdx] = useState<number | null>(null);

  const getMatchField = (detail: OCRDetail) =>
    parsedFields.find(pf => pf.rawMatch?.includes(detail.text)) || null;

  const handleCopy = (text: string, idx: number) => {
    navigator.clipboard.writeText(text); setCopiedIdx(idx); setTimeout(() => setCopiedIdx(null), 1500);
  };

  const boxes = ocrDetails || [];
  const displayW = 200;

  return (
    <div className="w-[200px] shrink-0">
      <div className="relative rounded-lg overflow-hidden shadow bg-black">
        <img ref={imgRef} src={imageData} alt="原始图片" className="w-full block"
          onLoad={() => imgRef.current && setImgNatural({ w: imgRef.current.naturalWidth, h: imgRef.current.naturalHeight })} />
        {boxes.length > 0 && imgNatural.w > 1 && (
          <div className="absolute inset-0 pointer-events-none">
            {boxes.map((detail, idx) => {
              const matched = getMatchField(detail);
              const scaleX = displayW / imgNatural.w, scaleY = (displayW * (imgNatural.h / imgNatural.w)) / imgNatural.h;
              const x = detail.box.x * scaleX, y = detail.box.y * scaleY;
              const w = Math.max(detail.box.w * scaleX, 20), h = Math.max(detail.box.h * scaleY, 10);
              const color = matched ? '#22c55e' : '#f97316';
              const bg = (hoveredIdx === idx || selectedIdx === idx)
                ? (matched ? 'rgba(34,197,94,0.35)' : 'rgba(249,115,22,0.4)')
                : (matched ? 'rgba(34,197,94,0.1)' : 'rgba(249,115,22,0.12)');
              return (
                <div key={idx} className="absolute cursor-pointer transition-all pointer-events-auto"
                  style={{ left: x, top: y, width: w, height: h, border: `1.5px solid ${hoveredIdx === idx || selectedIdx === idx ? color : 'transparent'}`, backgroundColor: bg, borderRadius: 2 }}
                  onMouseEnter={() => setHoveredIdx(idx)} onMouseLeave={() => setHoveredIdx(null)}
                  onClick={() => { setSelectedIdx(selectedIdx === idx ? null : idx); setDropdownIdx(null); }}>
                  {selectedIdx === idx && (
                    <div className="absolute z-50 left-1/2 -translate-x-1/2 bg-gray-900 text-white rounded-lg shadow-2xl px-1.5 py-1 flex items-center gap-1 text-[10px] whitespace-nowrap"
                      style={{ bottom: 'calc(100% + 4px)' }}>
                      <span className="text-white/80 max-w-[100px] truncate">{detail.text}</span>
                      <button onClick={e => { e.stopPropagation(); handleCopy(detail.text, idx); }}
                        className="px-1 py-0.5 rounded bg-blue-600 hover:bg-blue-500">{copiedIdx === idx ? '✓' : '📋'}</button>
                      {!matched && (dropdownIdx === idx ? (
                        <select className="bg-white text-gray-800 text-[10px] rounded px-1 py-0.5 w-20"
                          value="" onChange={e => { if (e.target.value) { onAnnotate(detail.text, e.target.value as keyof Equipment); setSelectedIdx(null); setDropdownIdx(null); }}}>
                          <option value="">选字段</option>
                          {FIELD_DROPDOWN_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                        </select>
                      ) : (
                        <button onClick={e => { e.stopPropagation(); setDropdownIdx(idx); }}
                          className="px-1 py-0.5 rounded bg-purple-600 hover:bg-purple-500">🏷️</button>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
        {boxes.length > 0 && (
          <div className="absolute bottom-1 left-1 flex gap-2 text-[9px] bg-black/60 rounded px-1.5 py-0.5 text-white/80">
            <span className="flex items-center gap-0.5"><span className="w-2 h-2 rounded-sm bg-green-500/60"/>已匹配</span>
            <span className="flex items-center gap-0.5"><span className="w-2 h-2 rounded-sm bg-orange-500/60"/>未匹配</span>
          </div>
        )}
      </div>
    </div>
  );
};

// ---------- Parsed Review Step (unified: image + unmatched words + fields + AI button) ----------

const FIELD_CN: Record<string, string> = {
  name:'名称', model:'型号', manufacturer:'厂商', serialNumber:'序列号', assetNumber:'资产编号',
  status:'状态', location:'位置', responsible:'负责人', type:'类型',
  nextCalibrationDate:'下次校正', lastCalibrationDate:'上次校正', maintenanceDate:'维护日期',
  warrantyExpiry:'保修到期', supplier:'供应商', notes:'备注', purchasePrice:'采购价格',
};

const ParsedReviewStep: React.FC<{
  state: SmartOCRState; dispatch: React.Dispatch<Action>;
  onSearch: () => void; onBack: () => void; onLLMParse: () => void;
  onReparse: () => void; onAIFill: (field: string, value: string) => void;
}> = ({ state, dispatch, onSearch, onBack, onLLMParse, onReparse, onAIFill }) => {

  // 找出未匹配的文字块
  const unmatched = (state.ocrDetails || []).filter(d =>
    !state.parsedFields.some(pf => pf.rawMatch?.includes(d.text))
  );

  const handleAnnotate = (pattern: string, field: keyof Equipment) => {
    addCustomMapping(pattern, field, 'medium');
    onReparse();
  };

  // AI 一键分析
  const handleAIAnalyze = async () => {
    if (!state.rawOcrText) return;
    let apiKey = localStorage.getItem('ocr_llm_api_key');
    if (!apiKey) { apiKey = prompt('输入 DeepSeek API Key (https://platform.deepseek.com)：'); if (!apiKey) return; localStorage.setItem('ocr_llm_api_key', apiKey); }
    dispatch({ type: 'SET_PROCESSING', isProcessing: true });
    try {
      const context = buildAIContext(state.rawOcrText, state.ocrDetails, state.parsedFields, getCustomMappings());
      const { reply, actions } = await chatWithAI(
        [{ role: 'system', content: context }, { role: 'user', content: '分析这些OCR结果，创建标注规则并填充所有你能确定的字段。用[ANNOTATE:pattern=xxx,field=yyy]和[FILL:field=xxx,value=yyy]格式操作。' }],
        apiKey
      );
      let annotated = 0, filled = 0;
      for (const action of actions) {
        if (action.type === 'annotate' && action.params.pattern && action.params.field) {
          addCustomMapping(action.params.pattern, action.params.field as keyof Equipment, 'medium');
          annotated++;
        } else if (action.type === 'fill' && action.params.field && action.params.value) {
          dispatch({ type: 'EDIT_FIELD', field: action.params.field, value: action.params.value });
          filled++;
        }
      }
      if (annotated > 0) onReparse();
      dispatch({ type: 'SET_ERROR', error: annotated > 0 || filled > 0
        ? `AI 完成：${annotated} 个标注, ${filled} 个字段填充。${reply.slice(0, 80)}`
        : `AI 分析：${reply.slice(0, 120)}` });
    } catch (err: any) {
      if (err.message.includes('401')) { localStorage.removeItem('ocr_llm_api_key'); dispatch({ type: 'SET_ERROR', error: 'API Key 无效，已清除。' }); }
      else dispatch({ type: 'SET_ERROR', error: 'AI 调用失败：' + (err.message || '网络错误') });
    } finally {
      dispatch({ type: 'SET_PROCESSING', isProcessing: false });
    }
  };

  const getEffectiveValue = (field: string): string => {
    if (state.editedFields[field as keyof Equipment] !== undefined) return String(state.editedFields[field as keyof Equipment]);
    return state.parsedFields.find(p => p.field === field)?.value || '';
  };

  return (
    <div className="space-y-4">
      {/* 图片 + 未匹配词快速标注 */}
      <div className="flex gap-4">
        {state.imageData && (
          <ImageTextOverlay imageData={state.imageData} ocrDetails={state.ocrDetails}
            parsedFields={state.parsedFields} onAnnotate={handleAnnotate} />
        )}
        <div className="flex-1 min-w-0 space-y-2">
          {unmatched.length > 0 && (
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-2">
              <p className="text-[10px] font-medium text-amber-700 mb-1.5">⚠️ {unmatched.length} 个未匹配词 — 点击标注：</p>
              <div className="flex flex-wrap gap-1">
                {unmatched.map((d, i) => (
                  <div key={i} className="group relative inline-flex items-center gap-0.5 bg-white border border-amber-300 rounded px-1.5 py-0.5 text-xs">
                    <span className="text-gray-700 font-mono">{d.text}</span>
                    <select
                      className="text-[10px] border-0 bg-transparent text-purple-600 opacity-0 group-hover:opacity-100 focus:opacity-100 cursor-pointer"
                      value=""
                      onChange={e => { if (e.target.value) { handleAnnotate(d.text, e.target.value as keyof Equipment); }}}>
                      <option value="">▾</option>
                      {FIELD_DROPDOWN_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                    </select>
                  </div>
                ))}
              </div>
            </div>
          )}
          <div>
            <p className="text-[10px] font-medium text-gray-400 mb-1">原始OCR文字</p>
            <div className="bg-gray-50 rounded-lg p-1.5 text-[11px] text-gray-500 max-h-20 overflow-y-auto whitespace-pre-wrap font-mono leading-relaxed">
              {state.rawOcrText || '(无)'}
            </div>
          </div>
        </div>
      </div>

      {/* 解析字段 */}
      {state.parsedFields.length > 0 ? (
        <div className="space-y-1 bg-blue-50/50 rounded-lg p-3 border border-blue-100">
          <p className="text-xs font-medium text-blue-700 mb-2">识别到 {state.parsedFields.length} 个字段</p>
          {state.parsedFields.map(pf => {
            const value = getEffectiveValue(pf.field);
            const isDate = pf.field.includes('Date') || pf.field.includes('date');
            return (
              <div key={pf.field} className="flex items-center gap-2 py-1">
                <span className="w-20 shrink-0 text-[11px] font-medium text-gray-600">{FIELD_CN[pf.field] || pf.field}</span>
                {isDate ? (
                  <Input type="date" value={value?.toString().slice(0, 10) || ''}
                    onChange={e => dispatch({ type: 'EDIT_FIELD', field: pf.field, value: e.target.value })}
                    className="flex-1 h-7 text-xs" />
                ) : (
                  <Input value={value}
                    onChange={e => dispatch({ type: 'EDIT_FIELD', field: pf.field, value: e.target.value })}
                    className="flex-1 h-7 text-xs" />
                )}
                <Badge className={`text-[10px] shrink-0 ${pf.confidence === 'high' ? 'bg-green-100 text-green-700' : pf.confidence === 'medium' ? 'bg-yellow-100 text-yellow-700' : 'bg-red-100 text-red-600'}`}>
                  {pf.confidence === 'high' ? '高' : pf.confidence === 'medium' ? '中' : '低'}
                </Badge>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="text-center py-4 text-gray-400"><Info className="h-6 w-6 mx-auto mb-1"/><p className="text-xs">未解析出字段</p></div>
      )}

      {/* 底部操作 */}
      <div className="flex justify-between items-center gap-2 pt-2 border-t">
        <Button variant="outline" size="sm" onClick={onBack}><ChevronLeft className="h-4 w-4 mr-1"/>重拍</Button>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={handleAIAnalyze}
            disabled={state.isProcessing || !state.rawOcrText}
            className="text-indigo-600 border-indigo-300 hover:bg-indigo-50">
            {state.isProcessing ? <Loader2 className="h-4 w-4 mr-1 animate-spin"/> : '🧠'} AI 一键分析
          </Button>
          <Button variant="outline" size="sm" onClick={onLLMParse}
            disabled={state.isProcessing || !state.rawOcrText}
            className="text-purple-600 border-purple-300 hover:bg-purple-50">
            🤖 LLM 解析
          </Button>
          <Button onClick={onSearch} disabled={state.parsedFields.length === 0}
            className="bg-gradient-to-r from-blue-600 to-indigo-600">
            <Search className="h-4 w-4 mr-1.5"/>搜索匹配
          </Button>
        </div>
      </div>
    </div>
  );
};

// ---------- Match Results Step ----------
const MatchResultsStep: React.FC<{
  state: SmartOCRState;
  dispatch: React.Dispatch<Action>;
  matchResult: OCRMatchResult;
  onConfirmUpdate: () => void;
  onCreateNew: () => void;
  onBack: () => void;
}> = ({ state, dispatch, matchResult, onConfirmUpdate, onCreateNew, onBack }) => {
  const selectedMatch = matchResult.matches[state.selectedMatchIndex];

  // 无匹配
  if (!matchResult.bestMatch && matchResult.matches.length === 0) {
    return (
      <div className="space-y-6 text-center py-6">
        <div className="w-16 h-16 rounded-full bg-amber-100 flex items-center justify-center mx-auto">
          <Info className="h-8 w-8 text-amber-600" />
        </div>
        <div>
          <h3 className="text-lg font-semibold text-gray-700">未找到匹配设备</h3>
          <p className="text-sm text-gray-500 mt-1">数据库中未找到与识别字段匹配的仪器</p>
        </div>
        <div className="flex gap-3 justify-center">
          <Button variant="outline" onClick={onBack}><ChevronLeft className="h-4 w-4 mr-1" /> 返回修改</Button>
          <Button onClick={onCreateNew} className="bg-green-600 hover:bg-green-700">
            <Plus className="h-4 w-4 mr-1.5" /> 创建新设备
          </Button>
        </div>
      </div>
    );
  }

  // 多个匹配 → 列表选择
  if (matchResult.isMultipleMatches && matchResult.matches.length > 1) {
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-2 text-amber-700 bg-amber-50 rounded-lg px-3 py-2">
          <AlertTriangle className="h-4 w-4" />
          <span className="text-sm font-medium">找到 {matchResult.matches.length} 个可能匹配，请选择正确设备</span>
        </div>
        <div className="space-y-2">
          {matchResult.matches.map((m, i) => (
            <div
              key={m.equipment.id}
              className={`p-3 rounded-xl border-2 cursor-pointer transition-all ${
                state.selectedMatchIndex === i
                  ? 'border-blue-500 bg-blue-50'
                  : 'border-gray-200 hover:border-blue-300'
              }`}
              onClick={() => dispatch({ type: 'SELECT_MATCH', index: i })}
            >
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-semibold text-gray-800">{m.equipment.name}</p>
                  <p className="text-xs text-gray-500">
                    {m.equipment.model} | {m.equipment.manufacturer} | {m.equipment.location}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Badge className={m.score >= 0.9 ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'}>
                    {(m.score * 100).toFixed(0)}% 匹配
                  </Badge>
                  {state.selectedMatchIndex === i && <CheckCircle2 className="h-5 w-5 text-blue-600" />}
                </div>
              </div>
              <p className="text-[10px] text-gray-400 mt-1">匹配方式：{m.matchedBy.join(', ')}</p>
            </div>
          ))}
        </div>
        <div className="flex justify-between">
          <Button variant="outline" size="sm" onClick={onBack}><ChevronLeft className="h-4 w-4 mr-1" /> 返回</Button>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={onCreateNew}>作为新设备创建</Button>
            <Button size="sm" onClick={onConfirmUpdate} className="bg-blue-600 hover:bg-blue-700">
              对比选中设备 <ChevronRight className="h-4 w-4 ml-1" />
            </Button>
          </div>
        </div>
      </div>
    );
  }

  // 单个匹配 → 字段对比
  if (!selectedMatch) return null;

  const comps = selectedMatch.fieldComparisons;
  const matchCount = comps.filter(c => c.status === 'match').length;
  const mismatchCount = comps.filter(c => c.status === 'mismatch').length;
  const ocrOnlyCount = comps.filter(c => c.status === 'ocr_only').length;

  return (
    <div className="space-y-4">
      {/* 匹配摘要 */}
      <div className="flex items-center gap-3 bg-green-50 rounded-xl p-3 border border-green-200">
        <CheckCircle2 className="h-6 w-6 text-green-600" />
        <div className="flex-1">
          <p className="font-semibold text-green-800">{selectedMatch.equipment.name}</p>
          <p className="text-xs text-green-600">
            {selectedMatch.equipment.model} | {selectedMatch.equipment.manufacturer}
            {selectedMatch.equipment.serialNumber && ` | S/N: ${selectedMatch.equipment.serialNumber}`}
          </p>
        </div>
        <Badge className="bg-green-600 text-white">{(selectedMatch.score * 100).toFixed(0)}%</Badge>
      </div>

      {/* 统计 */}
      <div className="flex gap-3 text-xs text-gray-500">
        <span className="flex items-center gap-1"><div className="w-3 h-3 rounded bg-green-400" /> {matchCount} 匹配</span>
        <span className="flex items-center gap-1"><div className="w-3 h-3 rounded bg-yellow-400" /> {mismatchCount} 差异</span>
        <span className="flex items-center gap-1"><div className="w-3 h-3 rounded bg-blue-400" /> {ocrOnlyCount} 新增</span>
      </div>

      {/* 字段对比表 */}
      <div className="border rounded-xl overflow-hidden">
        <div className="grid grid-cols-[2fr_3fr_3fr_40px] gap-0 text-xs">
          {/* 表头 */}
          <div className="bg-gray-100 p-2 font-semibold text-gray-600">字段</div>
          <div className="bg-gray-100 p-2 font-semibold text-gray-600">识别值</div>
          <div className="bg-gray-100 p-2 font-semibold text-gray-600">数据库值</div>
          <div className="bg-gray-100 p-2 font-semibold text-gray-600 text-center">更新</div>

          {comps.filter(c => c.status !== 'db_only').map(comp => (
            <React.Fragment key={comp.field}>
              <div className={`p-2 border-t flex items-center ${
                comp.status === 'match' ? 'bg-green-50'
                : comp.status === 'mismatch' ? 'bg-yellow-50'
                : 'bg-blue-50'
              }`}>
                <span className="font-medium text-gray-700">{comp.label}</span>
              </div>
              <div className={`p-2 border-t flex items-center ${
                comp.status === 'match' ? 'bg-green-50 text-green-700'
                : comp.status === 'mismatch' ? 'bg-yellow-50 text-yellow-700'
                : 'bg-blue-50 text-blue-700'
              }`}>
                {comp.ocrValue || <span className="text-gray-300">-</span>}
              </div>
              <div className={`p-2 border-t flex items-center ${
                comp.status === 'match' ? 'bg-green-50 text-green-700'
                : comp.status === 'mismatch' ? 'bg-yellow-50 text-yellow-700'
                : 'bg-blue-50'
              }`}>
                {comp.dbValue || <span className="text-gray-300">-</span>}
              </div>
              <div className={`p-2 border-t flex items-center justify-center ${
                comp.status === 'match' ? 'bg-green-50'
                : comp.status === 'mismatch' ? 'bg-yellow-50'
                : 'bg-blue-50'
              }`}>
                {comp.status !== 'match' && (
                  <button
                    onClick={() => dispatch({ type: 'TOGGLE_FIELD', field: comp.field })}
                    className={`w-5 h-5 rounded border-2 flex items-center justify-center transition-colors ${
                      state.checkedFields.has(comp.field)
                        ? 'bg-blue-600 border-blue-600 text-white'
                        : 'border-gray-300 hover:border-blue-400'
                    }`}
                  >
                    {state.checkedFields.has(comp.field) && <Check className="h-3 w-3" />}
                  </button>
                )}
              </div>
            </React.Fragment>
          ))}
        </div>
      </div>

      {/* 快速操作 */}
      <div className="flex gap-2">
        <Button variant="outline" size="sm" onClick={() => dispatch({ type: 'CHECK_ALL_MISMATCH' })}>
          全选差异字段
        </Button>
        <span className="text-xs text-gray-400 self-center">
          已选 {state.checkedFields.size} 个字段
        </span>
      </div>

      {/* 底部按钮 */}
      <div className="flex justify-between pt-2 border-t">
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={onBack}><ChevronLeft className="h-4 w-4 mr-1" /> 返回</Button>
          <Button variant="outline" size="sm" onClick={onCreateNew} className="text-green-600 border-green-300">
            <Plus className="h-4 w-4 mr-1" /> 作为新设备
          </Button>
        </div>
        <Button
          size="sm"
          onClick={onConfirmUpdate}
          disabled={state.checkedFields.size === 0}
          className="bg-gradient-to-r from-blue-600 to-indigo-600"
        >
          更新选中字段 ({state.checkedFields.size})
        </Button>
      </div>
    </div>
  );
};

// ---------- Confirm Step ----------
const ConfirmStep: React.FC<{
  state: SmartOCRState;
  match: import('@/utils/ocrFieldParser').EquipmentMatch;
  onConfirm: () => void;
  onCancel: () => void;
  isProcessing: boolean;
}> = ({ state, match, onConfirm, onCancel, isProcessing }) => {
  const comps = match.fieldComparisons;
  const selectedComps = comps.filter(c => state.checkedFields.has(c.field));

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3 bg-blue-50 rounded-xl p-3 border border-blue-200">
        <Info className="h-5 w-5 text-blue-600" />
        <div>
          <p className="font-semibold text-blue-800">确认更新</p>
          <p className="text-xs text-blue-600">以下字段将更新到设备 "{match.equipment.name}"</p>
        </div>
      </div>

      <div className="border rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50">
              <th className="p-2 text-left text-xs font-semibold text-gray-600">字段</th>
              <th className="p-2 text-left text-xs font-semibold text-gray-600">当前值</th>
              <th className="p-2 text-left text-xs font-semibold text-gray-600">→ 新值</th>
            </tr>
          </thead>
          <tbody>
            {selectedComps.map(comp => (
              <tr key={comp.field} className="border-t">
                <td className="p-2 text-xs font-medium text-gray-700">{comp.label}</td>
                <td className="p-2 text-xs text-gray-500">{comp.dbValue || '-'}</td>
                <td className="p-2 text-xs text-blue-700 font-medium">→ {comp.ocrValue}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex justify-end gap-3">
        <Button variant="outline" onClick={onCancel} disabled={isProcessing}>取消</Button>
        <Button onClick={onConfirm} disabled={isProcessing} className="bg-green-600 hover:bg-green-700">
          {isProcessing ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <Check className="h-4 w-4 mr-1.5" />}
          确认更新 ({selectedComps.length} 个字段)
        </Button>
      </div>
    </div>
  );
};

// ---------- AI Chat Panel ----------

const AIChatPanel: React.FC<{
  rawText: string;
  ocrDetails: OCRDetail[] | null;
  parsedFields: ParsedField[];
  onAddAnnotation: (pattern: string, field: keyof Equipment) => void;
  onFillField: (field: string, value: string) => void;
  onReparse: () => void;
}> = ({ rawText, ocrDetails, parsedFields, onAddAnnotation, onFillField, onReparse }) => {
  const [messages, setMessages] = useState<{ role: 'user' | 'assistant'; text: string }[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => { chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);

  const handleSend = async () => {
    if (!input.trim() || loading) return;
    const userMsg = input.trim();
    setInput('');
    setMessages(prev => [...prev, { role: 'user', text: userMsg }]);
    setLoading(true);

    let apiKey = localStorage.getItem('ocr_llm_api_key');
    if (!apiKey) {
      apiKey = prompt('请输入 AI API 密钥（DeepSeek 推荐，便宜且中文好）：');
      if (!apiKey) { setLoading(false); return; }
      localStorage.setItem('ocr_llm_api_key', apiKey);
    }

    try {
      const context = buildAIContext(
        rawText, ocrDetails, parsedFields, getCustomMappings(),
      );
      const chatMessages: ChatMessage[] = [
        { role: 'system', content: context },
        ...messages.map(m => ({ role: m.role as 'user' | 'assistant', content: m.text })),
        { role: 'user', content: userMsg },
      ];

      const { reply, actions } = await chatWithAI(chatMessages, apiKey);

      // 执行 AI 操作
      for (const action of actions) {
        if (action.type === 'annotate') {
          const pattern = action.params.pattern || '';
          const field = (action.params.field || 'serialNumber') as keyof Equipment;
          if (pattern) {
            onAddAnnotation(pattern, field);
            onReparse();
          }
        } else if (action.type === 'fill') {
          const field = action.params.field || '';
          const value = action.params.value || '';
          if (field && value) onFillField(field, value);
        }
      }

      setMessages(prev => [...prev, { role: 'assistant', text: reply || '收到，请再描述一下需要我做什么？' }]);
    } catch (err: any) {
      if (err.message.includes('401')) {
        localStorage.removeItem('ocr_llm_api_key');
        setMessages(prev => [...prev, { role: 'assistant', text: 'API 密钥无效，已清除。请重新输入。' }]);
      } else {
        setMessages(prev => [...prev, { role: 'assistant', text: `抱歉，连接失败：${err.message}` }]);
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="mt-3 bg-indigo-50/50 rounded-lg border border-indigo-200 overflow-hidden">
      {/* 消息列表 */}
      <div className="h-48 overflow-y-auto p-3 space-y-2">
        {messages.length === 0 && (
          <div className="text-center text-gray-400 text-xs py-4 space-y-1">
            <p className="text-2xl">💬</p>
            <p>你可以跟 AI 对话来完成标注和填充</p>
            <p className="text-[10px]">试试说：</p>
            <p className="text-[10px] bg-white/60 rounded px-2 py-0.5 inline-block">
              "容SN 这个应该对应序列号"
            </p>
            <p className="text-[10px] bg-white/60 rounded px-2 py-0.5 inline-block">
              "把1260填到型号字段"
            </p>
          </div>
        )}
        {messages.map((m, i) => (
          <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div className={`max-w-[85%] rounded-xl px-3 py-1.5 text-xs ${
              m.role === 'user'
                ? 'bg-indigo-600 text-white rounded-br-sm'
                : 'bg-white border border-indigo-100 text-gray-700 rounded-bl-sm'
            }`}>
              {m.text}
            </div>
          </div>
        ))}
        {loading && (
          <div className="flex justify-start">
            <div className="bg-white border border-indigo-100 rounded-xl rounded-bl-sm px-3 py-1.5">
              <Loader2 className="h-3 w-3 animate-spin text-indigo-400" />
            </div>
          </div>
        )}
        <div ref={chatEndRef} />
      </div>

      {/* 输入框 */}
      <div className="flex gap-1.5 p-2 bg-white border-t border-indigo-100">
        <Input
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handleSend()}
          placeholder="告诉 AI 你需要的..."
          className="h-7 text-xs flex-1"
          disabled={loading}
        />
        <Button size="sm" onClick={handleSend} disabled={loading || !input.trim()} className="h-7 text-xs bg-indigo-600 hover:bg-indigo-700">
          发送
        </Button>
      </div>
    </div>
  );
};

// ---------- Annotation Panel ----------
const FIELD_OPTIONS: { value: keyof Equipment; label: string }[] = [
  { value: 'name', label: '仪器名称' },
  { value: 'model', label: '型号' },
  { value: 'manufacturer', label: '厂商' },
  { value: 'serialNumber', label: '序列号' },
  { value: 'assetNumber', label: '资产编号' },
  { value: 'location', label: '位置' },
  { value: 'responsible', label: '负责人' },
  { value: 'type', label: '设备类型' },
  { value: 'nextCalibrationDate', label: '校正日期' },
  { value: 'lastCalibrationDate', label: '上次校正' },
  { value: 'maintenanceDate', label: '维护日期' },
  { value: 'warrantyExpiry', label: '保修到期' },
  { value: 'supplier', label: '供应商' },
  { value: 'status', label: '状态' },
  { value: 'notes', label: '备注' },
];

const AnnotationPanel: React.FC<{ onReparse: () => void }> = ({ onReparse }) => {
  const [mappings, setMappings] = useState<CustomLabelMapping[]>(getCustomMappings());
  const [pattern, setPattern] = useState('');
  const [field, setField] = useState<keyof Equipment>('serialNumber');
  const [conf, setConf] = useState<'high' | 'medium' | 'low'>('medium');

  const handleAdd = () => {
    if (!pattern.trim()) return;
    addCustomMapping(pattern.trim(), field, conf);
    setMappings(getCustomMappings());
    setPattern('');
    onReparse(); // 立即用新规则重新解析
  };

  const handleDelete = (id: string) => {
    removeCustomMapping(id);
    setMappings(getCustomMappings());
    onReparse();
  };

  const handleExport = () => {
    const json = exportCustomMappings();
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'ocr_labels_backup.json'; a.click();
    URL.revokeObjectURL(url);
  };

  const handleImport = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.onchange = (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        const added = importCustomMappings(reader.result as string);
        setMappings(getCustomMappings());
        if (added > 0) {
          onReparse();
          alert(`成功导入 ${added} 个标注`);
        } else {
          alert('未导入新标注（可能已存在或无有效数据）');
        }
      };
      reader.readAsText(file);
    };
    input.click();
  };

  return (
    <div className="mt-3 space-y-3 bg-purple-50/50 rounded-lg p-3 border border-purple-200 text-xs">
      {/* 自定义标签列表 */}
      {mappings.length > 0 ? (
        <div className="space-y-1 max-h-32 overflow-y-auto">
          {mappings.map(m => (
            <div key={m.id} className="flex items-center justify-between bg-white rounded px-2 py-1">
              <div className="flex items-center gap-2">
                <Badge className={`text-[10px] ${
                  m.confidence === 'high' ? 'bg-green-100 text-green-700'
                  : m.confidence === 'medium' ? 'bg-yellow-100 text-yellow-700'
                  : 'bg-red-100 text-red-600'
                }`}>
                  {FIELD_OPTIONS.find(o => o.value === m.field)?.label || m.field}
                </Badge>
                <span className="text-gray-600">←</span>
                <code className="text-purple-700 font-mono bg-purple-50 px-1 rounded">{m.pattern}</code>
              </div>
              <button
                onClick={() => handleDelete(m.id)}
                className="text-gray-400 hover:text-red-500 transition-colors p-0.5"
                title="删除此标注"
              >
                <X className="h-3 w-3" />
              </button>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-gray-400 text-center py-2">
          还没有自定义标注。添加后系统会自动识别你们实验室特有的标签缩写。
        </p>
      )}

      {/* 添加新标注 */}
      <div className="flex gap-1.5 items-end flex-wrap">
        <div className="flex-1 min-w-[100px]">
          <Label className="text-[10px] text-purple-600">铭牌上的文字</Label>
          <Input
            placeholder="如: SN, 容SN, 出厂号"
            value={pattern}
            onChange={e => setPattern(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleAdd()}
            className="h-7 text-xs"
          />
        </div>
        <div className="w-24">
          <Label className="text-[10px] text-purple-600">对应字段</Label>
          <select
            value={field}
            onChange={e => setField(e.target.value as keyof Equipment)}
            className="w-full h-7 text-xs border border-input rounded-md bg-white px-1"
          >
            {FIELD_OPTIONS.map(o => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </div>
        <div className="w-16">
          <Label className="text-[10px] text-purple-600">置信度</Label>
          <select
            value={conf}
            onChange={e => setConf(e.target.value as 'high' | 'medium' | 'low')}
            className="w-full h-7 text-xs border border-input rounded-md bg-white px-1"
          >
            <option value="high">高</option>
            <option value="medium">中</option>
            <option value="low">低</option>
          </select>
        </div>
        <Button size="sm" onClick={handleAdd} disabled={!pattern.trim()} className="h-7 text-xs bg-purple-600 hover:bg-purple-700">
          ➕ 添加
        </Button>
      </div>

      {/* 导入/导出 */}
      <div className="flex gap-2 justify-end">
        <button onClick={handleExport} className="text-[10px] text-gray-500 hover:text-purple-600">
          📤 导出备份
        </button>
        <button onClick={handleImport} className="text-[10px] text-gray-500 hover:text-purple-600">
          📥 导入
        </button>
      </div>
    </div>
  );
};

// ---------- Success Step ----------
const SuccessStep: React.FC<{
  message: string;
  onScanAnother: () => void;
  onClose: () => void;
}> = ({ message, onScanAnother, onClose }) => (
  <div className="flex flex-col items-center py-10 space-y-6">
    <div className="w-20 h-20 rounded-full bg-green-100 flex items-center justify-center">
      <CheckCircle2 className="h-10 w-10 text-green-600" />
    </div>
    <div className="text-center space-y-1">
      <h3 className="text-lg font-semibold text-gray-800">操作成功！</h3>
      <p className="text-sm text-gray-500">{message}</p>
    </div>
    <div className="flex gap-3">
      <Button variant="outline" onClick={onClose}>关闭</Button>
      <Button onClick={onScanAnother} className="bg-gradient-to-r from-blue-600 to-indigo-600">
        <Camera className="h-4 w-4 mr-1.5" /> 继续扫描
      </Button>
    </div>
  </div>
);
