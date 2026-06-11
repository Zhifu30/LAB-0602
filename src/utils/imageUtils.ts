/**
 * 设备类型共享图片 — 核心工具库 (v3 坚固版)
 *
 * 主要导出：
 *   级联显示:  getEffectiveImageUrl, getImageSourceType, getDefaultTypeImageUrl
 *   图片库CRUD: getTypeImages, addTypeImage, removeTypeImage, setDefaultTypeImage, importTypeImageFromEquipment
 *   推荐与同步: getImageRecommendations, syncTypeSharedImageToDevices, uploadTypeSharedImage
 *   清理扫描:  scanTypeImageUsage, cleanupOrphanImages, checkFullSyncStatus, cleanupNonSharedTypeFiles
 *   自检工具:  runImageSelfCheck
 *   工具函数:  sanitizeFileName, buildTypeImagePath, extractStoragePath, listTypeStorageFiles, fetchTypeTemplateCached
 */

import { supabase } from '@/integrations/supabase/client';

// ============================================================
// 类型定义
// ============================================================

export interface TypeImage {
  url: string;
  label: string;
  is_default: boolean;
}

export interface ImageMapping {
  imageUrl: string;
  equipmentIds: string[];
}

export interface ImageUsageReport {
  defaultUrl: string | null;
  allUrls: string[];
  healthyUrls: string[];
  orphanUrls: string[];
  mismatchedEquipment: { id: string; name: string; currentUrl: string | null }[];
}

export interface ImageRecommendation {
  topUrl: string | null;
  topCount: number;
  totalDevices: number;
  urlBreakdown: { url: string; count: number; equipmentNames: string[] }[];
}

export interface CheckResult {
  name: string;
  pass: boolean;
  detail: string;
  severity: 'ok' | 'warning' | 'error';
  fix?: () => Promise<void>;
}

export interface SyncResult {
  success: boolean;
  updatedCount: number;
  typeName: string;
  error?: string;
}

// ============================================================
// ⓪ 缓存层：防 N+1 查询 + Storage 安全扫描
// ============================================================

const typeTemplateCache = new Map<string, { data: any; ts: number }>();
const CACHE_TTL = 5 * 60 * 1000;
const pendingRequests = new Map<string, Promise<any>>();

/** 带缓存的类型模板查询。30 个组件并发调用 → 仅 1 次网络请求。 */
export async function fetchTypeTemplateCached(typeName: string): Promise<any> {
  const cached = typeTemplateCache.get(typeName);
  if (cached && Date.now() - cached.ts < CACHE_TTL) return cached.data;
  if (pendingRequests.has(typeName)) return pendingRequests.get(typeName)!;

  const promise = (async () => {
    const { data } = await supabase
      .from('equipment_templates')
      .select('type_images, shared_sop_files')
      .eq('equipment_type', typeName)
      .eq('model', '__TYPE__')
      .maybeSingle();
    typeTemplateCache.set(typeName, { data, ts: Date.now() });
    pendingRequests.delete(typeName);
    return data;
  })();
  pendingRequests.set(typeName, promise);
  return promise;
}

export const fetchTypeTemplate = fetchTypeTemplateCached;

/** 用服务器端 search 参数按前缀筛选，修复 .list() 100 条截断问题。 */
export async function listTypeStorageFiles(typeName: string) {
  const prefix = sanitizeFileName(typeName);
  const { data } = await supabase.storage
    .from('equipment-images')
    .list('types', {
      search: prefix,
      limit: 500,
    });
  return (data || []).map((f: any) => ({
    ...f,
    publicUrl: supabase.storage.from('equipment-images').getPublicUrl(`types/${f.name}`).data.publicUrl,
  }));
}

// ============================================================
// ① 统一级联显示
// ============================================================

/** 从 type_images 数组中提取默认图片 URL（带防御兜底） */
export function getDefaultTypeImageUrl(typeImages?: TypeImage[] | null): string | null {
  if (!typeImages || typeImages.length === 0) return null;
  const def = typeImages.find(img => img.is_default);
  return def?.url || typeImages[0]?.url || null;
}

/** 获取设备最终展示图片 URL。优先级：设备独有 > 类型默认 > null */
export function getEffectiveImageUrl(
  equipment: { imageUrl?: string | null },
  typeTemplate?: { type_images?: TypeImage[] | null } | null
): string | null {
  if (equipment.imageUrl?.trim()) return equipment.imageUrl.trim();
  return typeTemplate ? getDefaultTypeImageUrl(typeTemplate.type_images) : null;
}

// ============================================================
// ② 图片来源判断
// ============================================================

export function getImageSourceType(
  equipment: { imageUrl?: string | null },
  typeTemplate?: { type_images?: TypeImage[] | null } | null
): 'shared' | 'unique' | 'none' {
  if (!equipment.imageUrl?.trim()) return 'none';
  const defaultUrl = typeTemplate ? getDefaultTypeImageUrl(typeTemplate.type_images) : null;
  if (defaultUrl && defaultUrl === equipment.imageUrl.trim()) return 'shared';
  return 'unique';
}

// ============================================================
// ③ 文件名安全处理
// ============================================================

export function sanitizeFileName(typeName: string): string {
  return typeName
    .replace(/[^a-zA-Z0-9一-龥_-]/g, '_')
    .replace(/\s+/g, '_')
    .replace(/_+/g, '_')
    .substring(0, 50);
}

// ============================================================
// ④ 构建 Storage 路径
// ============================================================

export function buildTypeImagePath(typeName: string, ext: string): string {
  const uuid8 = crypto.randomUUID().substring(0, 8);
  return `types/${sanitizeFileName(typeName)}_${uuid8}.${ext}`;
}

export function extractStoragePath(url: string): string | null {
  try {
    const u = new URL(url);
    const match = u.pathname.match(/\/public\/equipment-images\/(.+)$/);
    return match ? match[1] : null;
  } catch {
    return null;
  }
}

// ============================================================
// ⑤ 存量数据智能推荐
// ============================================================

export function getImageRecommendations(
  linkedEquipments: { id: string; name: string; imageUrl?: string | null }[]
): ImageRecommendation {
  const breakdown = new Map<string, { count: number; equipmentNames: string[] }>();
  for (const eq of linkedEquipments) {
    const url = eq.imageUrl?.trim();
    if (!url) continue;
    const entry = breakdown.get(url) || { count: 0, equipmentNames: [] };
    entry.count++;
    entry.equipmentNames.push(eq.name);
    breakdown.set(url, entry);
  }
  const urlBreakdown = Array.from(breakdown.entries())
    .map(([url, data]) => ({ url, count: data.count, equipmentNames: data.equipmentNames }))
    .sort((a, b) => b.count - a.count);
  return {
    topUrl: urlBreakdown.length > 0 ? urlBreakdown[0].url : null,
    topCount: urlBreakdown.length > 0 ? urlBreakdown[0].count : 0,
    totalDevices: linkedEquipments.length,
    urlBreakdown,
  };
}

// ============================================================
// ⑥ 扫描类型图片使用情况
// ============================================================

export async function scanTypeImageUsage(typeName: string): Promise<ImageUsageReport> {
  const { data: template } = await supabase
    .from('equipment_templates')
    .select('type_images')
    .eq('equipment_type', typeName)
    .eq('model', '__TYPE__')
    .maybeSingle();
  const typeImages = ((template as any)?.type_images as TypeImage[]) || [];
  const defaultUrl = getDefaultTypeImageUrl(typeImages);

  const { data: eqs } = await supabase
    .from('equipment')
    .select('id, name, image_url')
    .eq('type', typeName)
    .neq('status', 'scrapped');

  const equipmentList = (eqs || []) as { id: string; name: string; image_url: string | null }[];
  const allUrls = [...new Set(equipmentList.map(e => e.image_url).filter(Boolean))] as string[];

  const mismatchedEquipment = defaultUrl
    ? equipmentList
        .filter(e => e.image_url?.trim() !== defaultUrl)
        .map(e => ({ id: e.id, name: e.name, currentUrl: e.image_url }))
    : [];

  const healthyUrls: string[] = [];
  const orphanUrls: string[] = [];

  for (const url of allUrls) {
    if (url === defaultUrl) { healthyUrls.push(url); continue; }

    const { count } = await supabase
      .from('equipment')
      .select('*', { count: 'exact', head: true })
      .eq('image_url', url)
      .or(`type.neq.${typeName},type.is.null`);

    const { data: allTemplates } = await supabase
      .from('equipment_templates')
      .select('type_images')
      .neq('equipment_type', typeName);

    const otherTypeHasUrl = (allTemplates || []).some((t: any) => {
      const images = (t.type_images as TypeImage[]) || [];
      return images.some(img => img.url === url);
    });

    if ((count ?? 0) > 0 || otherTypeHasUrl) {
      healthyUrls.push(url);
    } else {
      orphanUrls.push(url);
    }
  }

  return { defaultUrl, allUrls, healthyUrls, orphanUrls, mismatchedEquipment };
}

// ============================================================
// ⑦ 清理无引用冗余图片
// ============================================================

export async function cleanupOrphanImages(
  typeName: string,
  dryRun: boolean = true
): Promise<{ deleted: string[]; freedBytes: number; errors: string[] }> {
  const report = await scanTypeImageUsage(typeName);
  const deleted: string[] = [];
  const errors: string[] = [];
  let freedBytes = 0;

  const storageFiles = await listTypeStorageFiles(typeName);

  for (const url of report.orphanUrls) {
    const path = extractStoragePath(url);
    if (!path) { errors.push(`无法解析路径: ${url}`); continue; }

    const matchedFile = storageFiles.find(f => `types/${f.name}` === path || f.name === path.split('/').pop());
    const fileSize = matchedFile?.metadata?.size || 0;

    if (dryRun) { deleted.push(path); freedBytes += fileSize; continue; }

    const { error } = await supabase.storage.from('equipment-images').remove([path]);
    if (error) { errors.push(`删除失败 ${path}: ${error.message}`); }
    else { deleted.push(path); freedBytes += fileSize; }
  }

  return { deleted, freedBytes, errors };
}

/** 检查类型是否已全量同步（所有设备 image_url 都在画廊中） */
export async function checkFullSyncStatus(typeName: string): Promise<{
  fullySynced: boolean; totalDevices: number; syncedCount: number;
  unsyncedCount: number; unsyncedDevices: { id: string; name: string }[];
}> {
  const images = await getTypeImages(typeName);
  const galleryUrls = new Set(images.map(img => img.url));
  const { data: eqs } = await supabase
    .from('equipment')
    .select('id, name, image_url')
    .eq('type', typeName).neq('status', 'scrapped');

  const synced = (eqs || []).filter(e => galleryUrls.has(e.image_url));
  const unsynced = (eqs || []).filter(e => !galleryUrls.has(e.image_url));
  return {
    fullySynced: galleryUrls.size > 0 ? unsynced.length === 0 && (eqs || []).length > 0 : false,
    totalDevices: (eqs || []).length, syncedCount: synced.length,
    unsyncedCount: unsynced.length, unsyncedDevices: unsynced.map(e => ({ id: e.id, name: e.name })),
  };
}

/** 全量同步后的清理：删除该类型所有不在画廊中的冗余 Storage 文件 */
export async function cleanupNonSharedTypeFiles(
  typeName: string, dryRun: boolean = true
): Promise<{ deleted: string[]; freedBytes: number; errors: string[] }> {
  const deleted: string[] = []; const errors: string[] = []; let freedBytes = 0;
  const images = await getTypeImages(typeName);
  if (images.length === 0) return { deleted: [], freedBytes: 0, errors: ['无画廊图片，放弃清理'] };

  const galleryUrls = new Set(images.map(img => img.url));
  const typeFiles = await listTypeStorageFiles(typeName);
  const filesToDelete = typeFiles.filter((f: any) => !galleryUrls.has(f.publicUrl));
  if (filesToDelete.length === 0) return { deleted: [], freedBytes: 0, errors: [] };

  filesToDelete.forEach((f: any) => { if (f.metadata?.size) freedBytes += f.metadata.size; });
  if (dryRun) return { deleted: filesToDelete.map((f: any) => `types/${f.name}`), freedBytes, errors: [] };

  const paths = filesToDelete.map((f: any) => `types/${f.name}`);
  const { error } = await supabase.storage.from('equipment-images').remove(paths);
  if (error) { errors.push(error.message); }
  else { deleted.push(...paths); typeTemplateCache.delete(typeName); }
  return { deleted, freedBytes, errors };
}

// ============================================================
// ⑧ 开发模式自检
// ============================================================

export async function runImageSelfCheck(typeName: string): Promise<CheckResult[]> {
  const results: CheckResult[] = [];
  const images = await getTypeImages(typeName);
  const defaultUrl = getDefaultTypeImageUrl(images);

  if (defaultUrl) {
    const { data: eqs } = await supabase
      .from('equipment').select('id, name, image_url')
      .eq('type', typeName).neq('status', 'scrapped');
    const mismatched = (eqs || []).filter(e => e.image_url !== defaultUrl);
    results.push({
      name: '设备图片与共享图片一致性',
      pass: mismatched.length === 0,
      detail: mismatched.length === 0
        ? `全部 ${(eqs || []).length} 台设备使用相同共享图片`
        : `${mismatched.length}/${(eqs || []).length} 台不一致: ${mismatched.map(e => e.name).join(', ')}`,
      severity: mismatched.length > 0 ? 'warning' : 'ok',
      fix: mismatched.length > 0 ? async () => {
        await supabase.from('equipment').update({ image_url: defaultUrl }).in('id', mismatched.map(e => e.id));
      } : undefined,
    });
  }

  const { data: eqUrls } = await supabase
    .from('equipment').select('image_url')
    .eq('type', typeName).neq('status', 'scrapped').not('image_url', 'is', null);
  const uniqueUrls = [...new Set((eqUrls || []).map(e => e.image_url))];
  results.push({
    name: '类型图片 URL 唯一性', pass: uniqueUrls.length <= 1,
    detail: uniqueUrls.length <= 1 ? 'OK' : `发现 ${uniqueUrls.length} 个不同 URL`,
    severity: uniqueUrls.length > 1 ? 'warning' : 'ok',
  });

  const { count } = await supabase
    .from('equipment').select('*', { count: 'exact', head: true })
    .or('status.eq.scrapped,is_scrapped.eq.true').not('image_url', 'is', null);
  results.push({
    name: '报废设备残留图片', pass: (count ?? 0) === 0,
    detail: count ? `${count} 台报废设备仍有图片引用` : 'OK',
    severity: (count ?? 0) > 0 ? 'warning' : 'ok',
    fix: (count ?? 0) > 0 ? async () => {
      await supabase.from('equipment').update({ image_url: null }).or('status.eq.scrapped,is_scrapped.eq.true');
    } : undefined,
  });

  const { data: templateExists } = await supabase
    .from('equipment_templates').select('id')
    .eq('equipment_type', typeName).eq('model', '__TYPE__').maybeSingle();
  results.push({
    name: '类型模板存在', pass: !!templateExists,
    detail: templateExists ? 'OK' : `类型 "${typeName}" 缺少模板定义`,
    severity: templateExists ? 'ok' : 'error',
  });

  if (defaultUrl) {
    const path = extractStoragePath(defaultUrl);
    if (path) {
      try {
        const parts = path.split('/'); const fileName = parts.pop()!; const dirPath = parts.join('/');
        const { data: files, error } = await supabase.storage.from('equipment-images').list(dirPath || undefined, { search: fileName });
        results.push({
          name: '共享图片文件存在', pass: !error && (files || []).some(f => f.name === fileName),
          detail: !error && (files || []).some(f => f.name === fileName) ? 'OK' : `文件未找到: ${path}`,
          severity: !error && (files || []).some(f => f.name === fileName) ? 'ok' : 'error',
        });
      } catch {
        results.push({ name: '共享图片文件存在', pass: false, detail: `无法验证: ${path}`, severity: 'warning' });
      }
    }
  }

  return results;
}

// ============================================================
// ⑨ 同步
// ============================================================

export async function syncTypeSharedImageToDevices(
  typeName: string, imageUrl: string, equipmentIds: string[]
): Promise<SyncResult> {
  const { error } = await supabase.from('equipment').update({ image_url: imageUrl }).in('id', equipmentIds);
  if (error) return { success: false, updatedCount: 0, typeName, error: error.message };
  return { success: true, updatedCount: equipmentIds.length, typeName };
}

// ============================================================
// 上传
// ============================================================

export async function uploadTypeSharedImage(file: File, typeName: string): Promise<string> {
  const ext = file.name.split('.').pop() || 'jpg';
  const path = buildTypeImagePath(typeName, ext);
  const { error: uploadError } = await supabase.storage
    .from('equipment-images').upload(path, file, { contentType: file.type, upsert: true });
  if (uploadError) throw uploadError;
  const { data: urlData } = supabase.storage.from('equipment-images').getPublicUrl(path);
  return urlData.publicUrl;
}

// ============================================================
// ⑩ v3 类型图片库管理
// ============================================================

export async function getTypeImages(typeName: string): Promise<TypeImage[]> {
  const { data } = await supabase
    .from('equipment_templates').select('type_images')
    .eq('equipment_type', typeName).eq('model', '__TYPE__').maybeSingle();
  return ((data as any)?.type_images as TypeImage[]) || [];
}

export async function addTypeImage(typeName: string, url: string, label: string): Promise<void> {
  const images = await getTypeImages(typeName);
  if (images.some(img => img.url === url)) return;
  images.push({ url, label, is_default: images.length === 0 });
  await supabase.from('equipment_templates').upsert({
    equipment_type: typeName, model: '__TYPE__', type_images: images as any,
  } as any, { onConflict: 'equipment_type,model' });
  typeTemplateCache.delete(typeName);
}

export async function removeTypeImage(typeName: string, url: string): Promise<void> {
  let images = await getTypeImages(typeName);
  const removed = images.find(img => img.url === url);
  images = images.filter(img => img.url !== url);
  if (removed?.is_default && images.length > 0) images[0].is_default = true;
  await supabase.from('equipment_templates').upsert({
    equipment_type: typeName, model: '__TYPE__', type_images: images as any,
  } as any, { onConflict: 'equipment_type,model' });
  typeTemplateCache.delete(typeName);
}

export async function setDefaultTypeImage(typeName: string, url: string): Promise<void> {
  const images = await getTypeImages(typeName);
  const updated = images.map(img => ({ ...img, is_default: img.url === url }));
  await supabase.from('equipment_templates').upsert({
    equipment_type: typeName, model: '__TYPE__', type_images: updated as any,
  } as any, { onConflict: 'equipment_type,model' });
  typeTemplateCache.delete(typeName);
}

export async function importTypeImageFromEquipment(typeName: string, url: string, label: string): Promise<void> {
  await addTypeImage(typeName, url, label);
}
