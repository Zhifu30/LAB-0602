/**
 * 设备类型图片库面板 v3 — 竖向列表画廊模式
 *
 * 功能：
 * - 画廊列表：显示类型下所有图片（竖向排列，每张图可设默认/删除）
 * - 上传：添加到类型库
 * - 导入：从关联设备图片导入到类型库
 * - 同步：选择性分配图片到设备
 * - 清理：全量同步后清理冗余
 */

import React, { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import {
  Upload, Trash2, Star, Download, Image as ImageIcon,
  RefreshCw, Search, Plus,
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
  Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList,
} from '@/components/ui/command';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import {
  TypeImage, getTypeImages, addTypeImage, removeTypeImage,
  setDefaultTypeImage, importTypeImageFromEquipment,
  uploadTypeSharedImage, getImageRecommendations,
  checkFullSyncStatus, cleanupNonSharedTypeFiles,
} from '@/utils/imageUtils';

interface TypeImagePanelProps {
  selectedType: {
    id: string;
    name: string;
    sharedImageUrl?: string | null;
  };
  linkedEquipments: any[];
  onRefresh: () => void;
  onSyncStart?: (url: string) => void;
}

const TypeImagePanel: React.FC<TypeImagePanelProps> = ({
  selectedType, linkedEquipments, onRefresh, onSyncStart,
}) => {
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const labelInputRef = useRef<HTMLInputElement>(null);
  const [gallery, setGallery] = useState<TypeImage[]>([]);
  const [galleryLoading, setGalleryLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [showUploadInput, setShowUploadInput] = useState(false);
  const [cleanupLoading, setCleanupLoading] = useState(false);
  const [syncStatus, setSyncStatus] = useState<any>(null);
  const [cleanupPreview, setCleanupPreview] = useState<any>(null);

  const imageRecs = useMemo(() => getImageRecommendations(linkedEquipments), [linkedEquipments]);

  // 加载画廊
  const loadGallery = useCallback(async () => {
    setGalleryLoading(true);
    try {
      const images = await getTypeImages(selectedType.name);
      setGallery(images);
    } catch { setGallery([]); }
    finally { setGalleryLoading(false); }
  }, [selectedType.name]);

  useEffect(() => { loadGallery(); }, [loadGallery]);

  // 画廊中未包含的设备图片（可导入）
  const importableImages = useMemo(() => {
    if (!imageRecs) return [];
    return imageRecs.urlBreakdown.filter(
      (item: any) => !gallery.some(g => g.url === item.url)
    );
  }, [imageRecs, gallery]);

  // 上传 → 添加到画廊
  const handleUpload = useCallback(async (file: File) => {
    setUploading(true);
    try {
      const url = await uploadTypeSharedImage(file, selectedType.name);
      const label = labelInputRef.current?.value?.trim() || file.name.split('.')[0];
      await addTypeImage(selectedType.name, url, label);
      await loadGallery();
      setShowUploadInput(false);
      toast({ title: '已添加', description: label });
    } catch (err: any) {
      toast({ title: '上传失败', description: err?.message, variant: 'destructive' });
    } finally { setUploading(false); }
  }, [selectedType.name, loadGallery, toast]);

  // 从设备导入
  const handleImport = useCallback(async (url: string, label: string) => {
    try {
      await importTypeImageFromEquipment(selectedType.name, url, label);
      await loadGallery();
      toast({ title: '已导入', description: label });
    } catch (err: any) {
      toast({ title: '导入失败', description: err?.message, variant: 'destructive' });
    }
  }, [selectedType.name, loadGallery, toast]);

  // 删除
  const handleRemove = useCallback(async (url: string) => {
    if (!window.confirm('确定要从类型库中移除此图片吗？（不会删除 Storage 文件）')) return;
    try {
      await removeTypeImage(selectedType.name, url);
      await loadGallery();
      toast({ title: '已移除' });
    } catch (err: any) {
      toast({ title: '移除失败', description: err?.message, variant: 'destructive' });
    }
  }, [selectedType.name, loadGallery, toast]);

  // 设默认
  const handleSetDefault = useCallback(async (url: string) => {
    try {
      await setDefaultTypeImage(selectedType.name, url);
      await loadGallery();
      onRefresh();
      toast({ title: '已设为默认' });
    } catch (err: any) {
      toast({ title: '设置失败', description: err?.message, variant: 'destructive' });
    }
  }, [selectedType.name, loadGallery, onRefresh, toast]);

  // 清理
  const handleCheckCleanup = useCallback(async () => {
    if (!selectedType.sharedImageUrl) return;
    setCleanupLoading(true);
    try {
      const status = await checkFullSyncStatus(selectedType.name, selectedType.sharedImageUrl);
      setSyncStatus(status);
      if (status.fullySynced) {
        const preview = await cleanupNonSharedTypeFiles(selectedType.name, selectedType.sharedImageUrl, true);
        setCleanupPreview(preview);
      }
    } catch (err: any) {
      toast({ title: '检查失败', description: err?.message, variant: 'destructive' });
    } finally { setCleanupLoading(false); }
  }, [selectedType.name, selectedType.sharedImageUrl, toast]);

  const handleConfirmCleanup = useCallback(async () => {
    if (!selectedType.sharedImageUrl) return;
    try {
      const result = await cleanupNonSharedTypeFiles(selectedType.name, selectedType.sharedImageUrl, false);
      toast({ title: '清理完成', description: `已删除 ${result.deleted.length} 个文件` });
      setCleanupPreview(null); setSyncStatus(null);
    } catch (err: any) {
      toast({ title: '清理失败', description: err?.message, variant: 'destructive' });
    }
  }, [selectedType.name, selectedType.sharedImageUrl, toast]);

  const mismatchedCount = selectedType.sharedImageUrl
    ? linkedEquipments.filter((eq: any) => eq.imageUrl !== selectedType.sharedImageUrl).length : 0;

  // 设备 Combobox 选项
  const equipmentOptions = linkedEquipments
    .filter((eq: any) => eq.imageUrl)
    .map((eq: any) => ({ id: eq.id, name: eq.name, imageUrl: eq.imageUrl }));

  return (
    <div className="flex flex-col overflow-hidden rounded-lg bg-white/10 backdrop-blur-sm border border-white/20">
      <div className="p-3 border-b border-white/20 bg-white/5">
        <h3 className="font-semibold text-sm text-white drop-shadow flex items-center gap-1.5">
          <ImageIcon className="h-4 w-4" />
          类型图片库
        </h3>
        <p className="text-xs text-white/60">{selectedType.name} · {gallery.length} 张图 · {linkedEquipments.length}台设备</p>
      </div>

      <ScrollArea className="flex-1 p-3">
        <div className="space-y-3">

          {/* === 画廊列表 === */}
          {galleryLoading ? (
            <div className="text-center py-8">
              <RefreshCw className="h-6 w-6 mx-auto animate-spin text-white/30" />
            </div>
          ) : gallery.length > 0 ? (
            <div className="space-y-2">
              {gallery.map((img, i) => (
                <div key={i} className={cn(
                  "rounded-lg overflow-hidden border transition-all",
                  img.is_default
                    ? "border-amber-400/50 bg-amber-500/5"
                    : "border-white/10 bg-white/5"
                )}>
                  <div className="relative aspect-[4/3] w-full overflow-hidden bg-muted">
                    <img src={img.url} alt={img.label}
                      className="h-full w-full object-cover object-center" />
                    {img.is_default && (
                      <div className="absolute top-2 left-2">
                        <Badge className="text-[9px] bg-amber-500 text-white border-0">
                          <Star className="h-3 w-3 mr-0.5 fill-white" />默认
                        </Badge>
                      </div>
                    )}
                  </div>
                  <div className="p-2 flex items-center justify-between gap-2">
                    <span className="text-xs text-white truncate flex-1">{img.label}</span>
                    <div className="flex items-center gap-1 shrink-0">
                      {!img.is_default && (
                        <Button size="sm" variant="ghost"
                          className="h-6 text-[10px] text-amber-400 hover:text-amber-300 hover:bg-amber-500/10"
                          onClick={() => handleSetDefault(img.url)}>
                          <Star className="h-3 w-3 mr-0.5" />默认
                        </Button>
                      )}
                      <Button size="sm" variant="ghost"
                        className="h-6 w-6 p-0 text-red-400 hover:text-red-300 hover:bg-red-500/10"
                        onClick={() => handleRemove(img.url)}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-8 text-white/20">
              <ImageIcon className="h-8 w-8 mx-auto mb-2 opacity-20" />
              <p className="text-[10px]">暂无类型图片</p>
              <p className="text-[9px] mt-1 opacity-50">上传或从设备导入</p>
            </div>
          )}

          {/* === 添加图片 === */}
          <div className="flex gap-1">
            <Button size="sm" className="flex-1 h-7 text-xs bg-green-500 hover:bg-green-600 text-white border-0"
              onClick={() => setShowUploadInput(!showUploadInput)}>
              <Plus className="h-3.5 w-3.5 mr-1" />上传图片
            </Button>
            <Popover>
              <PopoverTrigger asChild>
                <Button size="sm" variant="outline"
                  className="flex-1 h-7 text-xs bg-white/5 border-white/20 text-white/70 hover:bg-white/10"
                  disabled={importableImages.length === 0}>
                  <Download className="h-3.5 w-3.5 mr-1" />从设备导入
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-72 p-0 bg-slate-900/95 border-white/20 backdrop-blur-xl" align="start">
                <Command className="bg-transparent">
                  <CommandInput placeholder="搜索..." className="text-white placeholder:text-white/40" />
                  <CommandList>
                    <CommandEmpty className="text-white/50 text-xs py-4 text-center">无匹配</CommandEmpty>
                    <CommandGroup>
                      {importableImages.map((item: any, i: number) => {
                        const label = item.equipmentNames[0] || item.url.split('/').pop();
                        return (
                          <CommandItem key={i}
                            className="flex items-center gap-2 cursor-pointer text-white aria-selected:bg-white/10"
                            onSelect={() => handleImport(item.url, label)}>
                            <div className="h-6 w-6 rounded bg-cover bg-center shrink-0"
                              style={{ backgroundImage: `url(${item.url})` }} />
                            <div className="flex-1 min-w-0">
                              <span className="text-xs">{label}</span>
                              <span className="text-[9px] text-white/50 ml-1">({item.count}台)</span>
                            </div>
                          </CommandItem>
                        );
                      })}
                    </CommandGroup>
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>
          </div>

          {/* 上传输入区 */}
          {showUploadInput && (
            <div className="space-y-2 p-2 rounded bg-white/5 border border-white/10">
              <Input ref={labelInputRef} placeholder="图片标签（如：分析天平）"
                className="h-7 text-xs bg-white/10 border-white/20 text-white placeholder:text-white/40" />
              <div
                className={cn(
                  "relative border-2 border-dashed rounded-lg p-3 text-center transition-all duration-200 cursor-pointer",
                  dragOver ? "border-blue-400 bg-blue-500/10" : "border-white/20 bg-white/5 hover:border-white/30"
                )}
                onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                onDragLeave={() => setDragOver(false)}
                onDrop={(e) => {
                  e.preventDefault(); setDragOver(false);
                  const file = e.dataTransfer.files?.[0];
                  if (file?.type.startsWith('image/')) handleUpload(file);
                }}
                onClick={() => fileInputRef.current?.click()}
              >
                <Upload className={cn("h-5 w-5 mx-auto mb-1 transition-all duration-200",
                  dragOver ? "text-blue-400 -translate-y-0.5" : "text-white/40")} />
                <p className="text-[10px] text-white/60">{uploading ? '上传中...' : '点击或拖拽上传'}</p>
              </div>
              <input ref={fileInputRef} type="file" accept="image/*"
                onChange={(e) => { const f = e.target.files?.[0]; if (f) handleUpload(f); }}
                className="hidden" />
            </div>
          )}

          {/* === 从设备同步 === */}
          {gallery.length > 0 && (
            <>
              <Separator className="bg-white/10" />
              <div className="space-y-2">
                <p className="text-[10px] text-white/50 uppercase tracking-wider">同步设备</p>
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
                      <CommandInput placeholder="搜索设备..." className="text-white placeholder:text-white/40" />
                      <CommandList>
                        <CommandEmpty className="text-white/50 text-xs py-4 text-center">无匹配</CommandEmpty>
                        <CommandGroup>
                          {equipmentOptions.map((eq: any) => (
                            <CommandItem key={eq.id}
                              className="flex items-center gap-2 cursor-pointer text-white aria-selected:bg-white/10"
                              onSelect={() => onSyncStart?.(eq.imageUrl)}>
                              <div className="h-6 w-6 rounded bg-cover bg-center shrink-0"
                                style={{ backgroundImage: `url(${eq.imageUrl})` }} />
                              <span className="text-xs truncate">{eq.name}</span>
                            </CommandItem>
                          ))}
                        </CommandGroup>
                      </CommandList>
                    </Command>
                  </PopoverContent>
                </Popover>

                {mismatchedCount > 0 ? (
                  <Button size="sm" className="w-full h-7 text-xs bg-purple-500 hover:bg-purple-600 text-white border-0"
                    onClick={() => {
                      if (selectedType.sharedImageUrl) onSyncStart?.(selectedType.sharedImageUrl);
                    }}>
                    ⚡ 同步 ({mismatchedCount} 台不一致)
                  </Button>
                ) : (
                  <p className="text-xs text-green-400 text-center py-1">✅ 已全量同步</p>
                )}
              </div>
            </>
          )}

          {/* === 清理 === */}
          {selectedType.sharedImageUrl && (
            <>
              <Separator className="bg-white/10" />
              <div className="space-y-1">
                {syncStatus ? (
                  syncStatus.fullySynced ? (
                    <>
                      <p className="text-xs text-green-400 text-center">全部 {syncStatus.totalDevices} 台已同步</p>
                      {cleanupPreview && cleanupPreview.deleted.length > 0 ? (
                        <>
                          <Button size="sm" variant="destructive" className="w-full h-7 text-xs"
                            onClick={handleConfirmCleanup}>
                            🗑️ 清理 {cleanupPreview.deleted.length} 个冗余文件
                          </Button>
                          <div className="max-h-16 overflow-y-auto">
                            {cleanupPreview.deleted.map((f: string, i: number) => (
                              <p key={i} className="text-[9px] text-red-400/60 truncate">{f}</p>
                            ))}
                          </div>
                        </>
                      ) : (
                        <p className="text-xs text-green-400 text-center">🎉 无冗余</p>
                      )}
                    </>
                  ) : (
                    <div className="rounded-lg bg-amber-500/10 border border-amber-500/20 p-2 text-center">
                      <p className="text-[10px] text-amber-300">
                        同步进度: {syncStatus.syncedCount}/{syncStatus.totalDevices}
                      </p>
                    </div>
                  )
                ) : (
                  <Button size="sm" variant="outline"
                    className="w-full h-7 text-xs bg-white/5 border-white/20 text-white/50 hover:bg-white/10"
                    onClick={handleCheckCleanup} disabled={cleanupLoading}>
                    {cleanupLoading ? <RefreshCw className="h-3.5 w-3.5 mr-1 animate-spin" /> : <Trash2 className="h-3.5 w-3.5 mr-1" />}
                    检查清理状态
                  </Button>
                )}
              </div>
            </>
          )}

        </div>
      </ScrollArea>
    </div>
  );
};

export default TypeImagePanel;
