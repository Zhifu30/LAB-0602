/**
 * 设备类型共享图片管理面板 (v2.1)
 *
 * 功能：
 * - 已设置：图片预览 + Combobox 选图 + 上传 + 选择性同步 + 渐进式清理
 * - 未设置：智能推荐列表 + 点击选中高亮 + 上传
 *
 * 技术亮点：
 * - 拖拽上传微交互 (dragOver 状态联动)
 * - 渐进式按钮 (仅脏数据/孤儿文件时显示)
 * - aspect-[4/3] + object-cover 防变形
 */

import React, { useState, useRef, useCallback } from 'react';
import {
  Upload, Link2, Trash2, Check, Image as ImageIcon,
  RefreshCw, Search, ChevronRight,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import {
  Popover, PopoverContent, PopoverTrigger,
} from '@/components/ui/popover';
import {
  Command, CommandEmpty, CommandGroup, CommandInput, CommandItem,
} from '@/components/ui/command';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { Equipment } from '@/types/equipment';
import {
  uploadTypeSharedImage, syncTypeSharedImageToDevices,
  cleanupOrphanImages, getImageRecommendations,
} from '@/utils/imageUtils';
import { cn } from '@/lib/utils';

interface TypeImagePanelProps {
  selectedType: {
    id: string;
    name: string;
    sharedImageUrl?: string | null;
  };
  linkedEquipments: Equipment[];
  onRefresh: () => void;
  onSyncStart?: (url: string) => void;   // 打开外部设备选择器
}

const TypeImagePanel: React.FC<TypeImagePanelProps> = ({
  selectedType, linkedEquipments, onRefresh, onSyncStart,
}) => {
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [imageRecs] = useState(() => getImageRecommendations(linkedEquipments));
  const [selectedRecUrl, setSelectedRecUrl] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [cleanupLoading, setCleanupLoading] = useState(false);
  const [orphanCount, setOrphanCount] = useState<number | null>(null);
  const [cleanupPreview, setCleanupPreview] = useState<any>(null);

  // 统计不一致设备数
  const mismatchedCount = selectedType.sharedImageUrl
    ? linkedEquipments.filter(eq => eq.imageUrl !== selectedType.sharedImageUrl).length
    : 0;

  // 上传新共享图片
  const handleUpload = useCallback(async (file: File) => {
    setUploading(true);
    try {
      const url = await uploadTypeSharedImage(file, selectedType.name);
      setSelectedRecUrl(url);
      onSyncStart?.(url);
    } catch (err: any) {
      toast({ title: '上传失败', description: err?.message || '请重试', variant: 'destructive' });
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }, [selectedType.name, onSyncStart, toast]);

  // 从推荐选择
  const handleSelectRec = useCallback((url: string) => {
    setSelectedRecUrl(url);
    onSyncStart?.(url);
  }, [onSyncStart]);

  // 打开同步选择器
  const handleOpenSync = useCallback(() => {
    if (selectedType.sharedImageUrl) {
      setSelectedRecUrl(selectedType.sharedImageUrl);
      onSyncStart?.(selectedType.sharedImageUrl);
    }
  }, [selectedType.sharedImageUrl, onSyncStart]);

  // 扫描冗余
  const handleScanOrphans = useCallback(async () => {
    setCleanupLoading(true);
    try {
      const preview = await cleanupOrphanImages(selectedType.name, true);
      setCleanupPreview(preview);
      setOrphanCount(preview.deleted.length);
      if (preview.deleted.length === 0) {
        toast({ title: '🎉 无冗余文件', description: '所有图片均被引用' });
      }
    } catch (err: any) {
      toast({ title: '扫描失败', description: err?.message, variant: 'destructive' });
    } finally {
      setCleanupLoading(false);
    }
  }, [selectedType.name, toast]);

  // 确认清理
  const handleConfirmCleanup = useCallback(async () => {
    try {
      const result = await cleanupOrphanImages(selectedType.name, false);
      toast({ title: '清理完成', description: `已删除 ${result.deleted.length} 个冗余文件` });
      setCleanupPreview(null);
      setOrphanCount(null);
      onRefresh();
    } catch (err: any) {
      toast({ title: '清理失败', description: err?.message, variant: 'destructive' });
    }
  }, [selectedType.name, onRefresh, toast]);

  // 设备 Combobox 选项
  const equipmentOptions = linkedEquipments
    .filter(eq => eq.imageUrl)
    .map(eq => ({ id: eq.id, name: eq.name, imageUrl: eq.imageUrl!, }));

  return (
    <div className="flex flex-col overflow-hidden rounded-lg bg-white/10 backdrop-blur-sm border border-white/20">
      <div className="p-3 border-b border-white/20 bg-white/5">
        <h3 className="font-semibold text-sm text-white drop-shadow flex items-center gap-1.5">
          <ImageIcon className="h-4 w-4" />
          共享图片
        </h3>
        <p className="text-xs text-white/60">{selectedType.name} · {linkedEquipments.length}台设备</p>
      </div>

      <ScrollArea className="flex-1 p-3">
        <div className="space-y-3">

          {/* === 已设置共享图片 === */}
          {selectedType.sharedImageUrl ? (
            <>
              {/* 预览 */}
              <div className="rounded-lg overflow-hidden bg-white/5 border border-white/10">
                <div className="relative aspect-[4/3] w-full overflow-hidden bg-muted">
                  <img src={selectedType.sharedImageUrl} alt=""
                    className="h-full w-full object-cover object-center" />
                </div>
                <div className="p-2 flex items-center justify-between">
                  <span className="text-[10px] text-white/50 font-mono truncate max-w-[140px]"
                    title={selectedType.sharedImageUrl}>{selectedType.sharedImageUrl.split('/').pop()}</span>
                  <Badge className="text-[9px] bg-green-500/20 text-green-300 border-green-500/30">共享中</Badge>
                </div>
              </div>

              {/* Combobox 选设备图片更换 */}
              <Popover>
                <PopoverTrigger asChild>
                  <Button size="sm" variant="outline"
                    className="w-full h-7 text-xs justify-start bg-white/5 border-white/20 text-white/70 hover:bg-white/10">
                    <Search className="h-3.5 w-3.5 mr-1" />
                    从设备中选择图片...
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-72 p-0 bg-slate-900/95 border-white/20 backdrop-blur-xl" align="start">
                  <Command className="bg-transparent">
                    <CommandInput placeholder="搜索设备编号或名称..." className="text-white placeholder:text-white/40" />
                    <CommandEmpty className="text-white/50 text-xs py-4 text-center">无匹配设备</CommandEmpty>
                    <CommandGroup>
                      {equipmentOptions.map((eq) => (
                        <CommandItem key={eq.id}
                          className="flex items-center gap-2 cursor-pointer text-white aria-selected:bg-white/10"
                          onSelect={() => handleSelectRec(eq.imageUrl)}>
                          <div className="h-6 w-6 rounded bg-cover bg-center shrink-0"
                            style={{ backgroundImage: `url(${eq.imageUrl})` }} />
                          <span className="text-xs truncate">{eq.name}</span>
                          {eq.imageUrl === selectedRecUrl && <Check className="h-3.5 w-3.5 text-blue-400 ml-auto" />}
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  </Command>
                </PopoverContent>
              </Popover>

              {/* 上传 */}
              <Button size="sm" className="w-full h-7 text-xs bg-green-500 hover:bg-green-600 text-white border-0"
                onClick={() => fileInputRef.current?.click()} disabled={uploading}>
                {uploading ? <RefreshCw className="h-3.5 w-3.5 mr-1 animate-spin" /> : <Upload className="h-3.5 w-3.5 mr-1" />}
                上传新图片
              </Button>

              {/* 渐进式：仅不一致时显示同步 */}
              {mismatchedCount > 0 ? (
                <Button size="sm" className="w-full h-7 text-xs bg-purple-500 hover:bg-purple-600 text-white border-0"
                  onClick={handleOpenSync}>
                  ⚡ 同步到这 {linkedEquipments.length} 台设备 ({mismatchedCount} 台不一致)
                </Button>
              ) : (
                <p className="text-xs text-green-400 text-center py-1">✅ 已全量同步</p>
              )}

              {/* 渐进式：扫描后才显示清理 */}
              {orphanCount !== null ? (
                orphanCount > 0 ? (
                  <>
                    <Button size="sm" variant="destructive" className="w-full h-7 text-xs"
                      onClick={handleConfirmCleanup}>
                      🗑️ 清理冗余空间 ({orphanCount} 个文件)
                    </Button>
                    {cleanupPreview?.deleted.length > 0 && (
                      <div className="space-y-1">
                        {cleanupPreview.deleted.map((f: string, i: number) => (
                          <p key={i} className="text-[9px] text-red-400/70 truncate">{f}</p>
                        ))}
                      </div>
                    )}
                  </>
                ) : (
                  <p className="text-xs text-green-400 text-center">🎉 无冗余文件</p>
                )
              ) : (
                <Button size="sm" variant="outline"
                  className="w-full h-7 text-xs bg-white/5 border-white/20 text-white/50 hover:bg-white/10"
                  onClick={handleScanOrphans} disabled={cleanupLoading}>
                  {cleanupLoading ? <RefreshCw className="h-3.5 w-3.5 mr-1 animate-spin" /> : <Trash2 className="h-3.5 w-3.5 mr-1" />}
                  扫描冗余文件
                </Button>
              )}
            </>
          ) : (
            /* === 未设置共享图片 — 智能推荐 === */
            <>
              {imageRecs && imageRecs.urlBreakdown.length > 0 ? (
                <>
                  <div className="rounded-lg bg-blue-500/10 border border-blue-500/20 p-2.5">
                    <p className="text-[10px] text-blue-300">
                      💡 该类型 {imageRecs.totalDevices} 台设备使用了 {imageRecs.urlBreakdown.length} 张不同图片
                    </p>
                  </div>

                  <div className="space-y-1.5">
                    <p className="text-[10px] text-white/50 uppercase tracking-wider">从关联设备中选</p>
                    {imageRecs.urlBreakdown.map((item: any, i: number) => {
                      const isSelected = selectedRecUrl === item.url;
                      return (
                        <button key={i}
                          className={cn(
                            "w-full rounded-lg overflow-hidden transition-all text-left",
                            isSelected
                              ? "bg-blue-500/10 border border-blue-400 shadow-[0_0_12px_rgba(59,130,246,0.3)]"
                              : "bg-white/5 border border-white/10 hover:border-white/30"
                          )}
                          onClick={() => handleSelectRec(item.url)}>
                          <div className="flex items-center gap-2 p-2.5">
                            <div className="h-10 w-10 rounded bg-cover bg-center shrink-0 border border-white/10"
                              style={{ backgroundImage: `url(${item.url})` }} />
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-1.5 mb-0.5">
                                <p className="text-[11px] text-white font-medium truncate">{item.url.split('/').pop()}</p>
                                {isSelected && <Check className="h-3.5 w-3.5 text-blue-400 shrink-0" />}
                              </div>
                              <p className="text-[10px] text-white/50">
                                {item.count} 台 · {item.equipmentNames.slice(0, 3).join(', ')}
                                {item.equipmentNames.length > 3 ? ` 等${item.equipmentNames.length}台` : ''}
                              </p>
                            </div>
                            <Badge className={cn("text-[9px] shrink-0",
                              item.count === imageRecs.topCount ? 'bg-blue-500/20 text-blue-300' : 'bg-white/10 text-white/50'
                            )}>{item.count === imageRecs.topCount ? '最多' : `${item.count}台`}</Badge>
                          </div>
                          <div className={cn("px-2.5 py-1.5 border-t flex items-center justify-center",
                            isSelected ? 'bg-blue-500/20 border-blue-400/30' : 'bg-white/[0.02] border-white/5'
                          )}>
                            {isSelected ? (
                              <span className="text-[11px] text-blue-300 font-medium flex items-center gap-1">
                                <Check className="h-3.5 w-3.5" /> 已选 — 请选择同步设备
                              </span>
                            ) : (
                              <span className="text-[11px] text-white/60">选为共享图片 →</span>
                            )}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </>
              ) : (
                <div className="text-center py-8 text-white/20">
                  <ImageIcon className="h-8 w-8 mx-auto mb-2 opacity-20" />
                  <p className="text-[10px]">关联设备暂无图片</p>
                </div>
              )}

              <Separator className="bg-white/10" />

              {/* 拖拽上传区 */}
              <div
                className={cn(
                  "relative border-2 border-dashed rounded-lg p-4 text-center transition-all duration-200 cursor-pointer",
                  dragOver
                    ? "border-blue-400 bg-blue-500/10"
                    : "border-white/20 bg-white/5 hover:border-white/30"
                )}
                onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                onDragLeave={() => setDragOver(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setDragOver(false);
                  const file = e.dataTransfer.files?.[0];
                  if (file?.type.startsWith('image/')) handleUpload(file);
                  else toast({ title: '请上传图片文件', variant: 'destructive' });
                }}
                onClick={() => fileInputRef.current?.click()}
              >
                <Upload className={cn(
                  "h-6 w-6 mx-auto mb-2 transition-all duration-200",
                  dragOver ? "text-blue-400 -translate-y-0.5" : "text-white/40"
                )} />
                <p className="text-[10px] text-white/60">
                  {uploading ? '上传中...' : '拖拽图片到此处，或点击上传'}
                </p>
              </div>
            </>
          )}

          {/* 隐藏文件输入 */}
          <input ref={fileInputRef} type="file" accept="image/*"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) handleUpload(f); }}
            className="hidden" />
        </div>
      </ScrollArea>
    </div>
  );
};

export default TypeImagePanel;
