/**
 * 设备类型共享图片 — 核心工具库
 *
 * 功能：
 * ① getEffectiveImageUrl()    — 统一级联显示（设备独有 > 类型共享 > 默认图）
 * ② getImageSourceType()      — 判断图片来源（共享/独有/无）
 * ③ sanitizeFileName()        — 文件名安全处理
 * ④ buildTypeImagePath()      — 构建类型图片 Storage 路径
 * ⑤ getImageRecommendations() — 存量数据智能推荐
 * ⑥ scanTypeImageUsage()      — 扫描类型图片使用情况
 * ⑦ cleanupOrphanImages()     — 清理无引用冗余图片（支持 dryRun）
 * ⑧ runImageSelfCheck()       — 开发模式自检
 * ⑨ syncTypeSharedImage()     — RPC 事务批量同步封装
 */

import { supabase } from '@/integrations/supabase/client';

// ============================================================
// 类型定义
// ============================================================

export interface ImageMapping {
  imageUrl: string;
  equipmentIds: string[];
}

export interface ImageUsageReport {
  sharedUrl: string | null;
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
const CACHE_TTL = 5 * 60 * 1000; // 5 分钟
const pendingRequests = new Map<string, Promise<any>>(); // 并发去重

/**
 * 带缓存的类型模板查询。30 个组件并发调用 → 仅 1 次网络请求。
 */
export async function fetchTypeTemplateCached(typeName: string): Promise<any> {
  const cached = typeTemplateCache.get(typeName);
  if (cached && Date.now() - cached.ts < CACHE_TTL) return cached.data;
  if (pendingRequests.has(typeName)) return pendingRequests.get(typeName)!;
  const promise = (async () => {
    const { data } = await supabase
      .from('equipment_templates')
      .select('shared_image_url, shared_sop_files')
      .eq('equipment_type', typeName).eq('model', '__TYPE__').maybeSingle();
    typeTemplateCache.set(typeName, { data, ts: Date.now() });
    pendingRequests.delete(typeName);
    return data;
  })();
  pendingRequests.set(typeName, promise);
  return promise;
}

/** 兼容别名 */
export const fetchTypeTemplate = fetchTypeTemplateCached;

/**
 * ★ 用服务器端 search 参数按前缀筛选，修复 .list() 100 条截断问题。
 */
export async function listTypeStorageFiles(typeName: string) {
  const prefix = sanitizeFileName(typeName);
  const { data } = await supabase.storage
    .from('equipment-images')
    .list('types', {
      search: prefix,   // ★ 服务器端按前缀过滤
      limit: 500,       // ★ 单类型安全上限
    });
  return (data || []).map((f: any) => ({
    ...f,
    publicUrl: supabase.storage.from('equipment-images').getPublicUrl(`types/${f.name}`).data.publicUrl,
  }));
}

// ============================================================
// ① 统一级联显示
// ============================================================

/**
 * 获取设备最终展示图片 URL
 * 优先级：设备独有 image_url > 类型共享 shared_image_url > null（调用方用默认图兜底）
 */
export function getEffectiveImageUrl(
  equipment: { imageUrl?: string | null },
  typeTemplate?: { shared_image_url?: string | null } | null
): string | null {
  if (equipment.imageUrl?.trim()) return equipment.imageUrl.trim();
  if (typeTemplate?.shared_image_url?.trim()) return typeTemplate.shared_image_url.trim();
  return null;
}

// ============================================================
// ② 图片来源判断
// ============================================================

/**
 * 判断设备图片是"共享"还是"独有"还是"无"
 * 用于 EquipmentCard 上的徽章显示
 */
export function getImageSourceType(
  equipment: { imageUrl?: string | null },
  typeTemplate?: { shared_image_url?: string | null } | null
): 'shared' | 'unique' | 'none' {
  if (!equipment.imageUrl?.trim()) return 'none';
  if (typeTemplate?.shared_image_url?.trim() &&
      typeTemplate.shared_image_url.trim() === equipment.imageUrl.trim()) {
    return 'shared';
  }
  return 'unique';
}

// ============================================================
// ③ 文件名安全处理
// ============================================================

/**
 * 将类型名称转为安全的文件名片段
 * 保留中文字符（一-鿿），替换特殊字符为下划线
 */
export function sanitizeFileName(typeName: string): string {
  return typeName
    .replace(/[^a-zA-Z0-9一-龥_-]/g, '_') // ★ 标准闭包范围，兼容所有浏览器
    .replace(/\s+/g, '_')
    .replace(/_+/g, '_')
    .substring(0, 50);
}

// ============================================================
// ④ 构建 Storage 路径
// ============================================================

/**
 * 为类型共享图片生成安全的 Storage 路径
 * 格式: types/{sanitizedName}_{uuid8}.{ext}
 */
export function buildTypeImagePath(typeName: string, ext: string): string {
  const uuid8 = crypto.randomUUID().substring(0, 8);
  return `types/${sanitizeFileName(typeName)}_${uuid8}.${ext}`;
}

/**
 * 从 Storage public URL 提取文件路径（用于删除操作）
 */
export function extractStoragePath(url: string): string | null {
  try {
    const u = new URL(url);
    // URL 格式: https://xxx.supabase.co/storage/v1/object/public/equipment-images/types/xxx.jpg
    const match = u.pathname.match(/\/public\/equipment-images\/(.+)$/);
    return match ? match[1] : null;
  } catch {
    return null;
  }
}

// ============================================================
// ⑤ 存量数据智能推荐
// ============================================================

/**
 * 分析关联设备的图片使用情况，推荐共享图片
 */
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

/**
 * 扫描指定类型的所有图片使用情况
 */
export async function scanTypeImageUsage(typeName: string): Promise<ImageUsageReport> {
  // 1. 查类型共享图片
  const { data: template } = await supabase
    .from('equipment_templates')
    .select('shared_image_url')
    .eq('equipment_type', typeName)
    .eq('model', '__TYPE__')
    .maybeSingle();

  const sharedUrl = template?.shared_image_url?.trim() || null;

  // 2. 查该类型所有非报废设备的 image_url
  const { data: eqs } = await supabase
    .from('equipment')
    .select('id, name, image_url')
    .eq('type', typeName)
    .neq('status', 'scrapped');

  const equipmentList = (eqs || []) as { id: string; name: string; image_url: string | null }[];

  // 3. 收集所有不重复 URL
  const allUrls = [...new Set(equipmentList.map(e => e.image_url).filter(Boolean))] as string[];

  // 4. 与共享图片不一致的设备
  const mismatchedEquipment = sharedUrl
    ? equipmentList
        .filter(e => e.image_url?.trim() !== sharedUrl)
        .map(e => ({ id: e.id, name: e.name, currentUrl: e.image_url }))
    : [];

  // 5. 检查每个 URL 是否还被其他类型/设备引用
  const healthyUrls: string[] = [];
  const orphanUrls: string[] = [];

  for (const url of allUrls) {
    if (url === sharedUrl) {
      healthyUrls.push(url);
      continue;
    }

    // 检查是否有该类型外的其他设备引用
    const { count } = await supabase
      .from('equipment')
      .select('*', { count: 'exact', head: true })
      .eq('image_url', url)
      .or(`type.neq.${typeName},type.is.null`);

    if ((count ?? 0) > 0) {
      healthyUrls.push(url);
    } else {
      orphanUrls.push(url);
    }
  }

  return { sharedUrl, allUrls, healthyUrls, orphanUrls, mismatchedEquipment };
}

// ============================================================
// ⑦ 清理无引用冗余图片
// ============================================================

/**
 * 清理完全无引用的冗余图片文件
 * @param typeName 类型名称
 * @param dryRun true = 仅预览（返回即将删除的列表），false = 执行删除
 * @returns 即将删除/已删除的文件信息
 */
export async function cleanupOrphanImages(
  typeName: string,
  dryRun: boolean = true
): Promise<{ deleted: string[]; freedBytes: number; errors: string[] }> {
  const report = await scanTypeImageUsage(typeName);
  const deleted: string[] = [];
  const errors: string[] = [];
  let freedBytes = 0;

  for (const url of report.orphanUrls) {
    const path = extractStoragePath(url);
    if (!path) {
      errors.push(`无法解析路径: ${url}`);
      continue;
    }

    if (dryRun) {
      deleted.push(path);
      continue;
    }

    // 执行物理删除
    const { error } = await supabase.storage.from('equipment-images').remove([path]);
    if (error) {
      errors.push(`删除失败 ${path}: ${error.message}`);
    } else {
      deleted.push(path);
    }
  }

  return { deleted, freedBytes, errors };
}

// ============================================================
// ⑧ 开发模式自检
// ============================================================

/**
 * 运行图片健康度自检，返回检查结果列表
 * 每项检查 pass=true 或提供 fix 函数用于一键修复
 */
export async function runImageSelfCheck(typeName: string): Promise<CheckResult[]> {
  const results: CheckResult[] = [];

  // --- 检查 1：设备图片与共享图片是否一致 ---
  const { data: template } = await supabase
    .from('equipment_templates')
    .select('shared_image_url')
    .eq('equipment_type', typeName)
    .eq('model', '__TYPE__')
    .maybeSingle();

  const sharedUrl = template?.shared_image_url?.trim();

  if (sharedUrl) {
    const { data: eqs } = await supabase
      .from('equipment')
      .select('id, name, image_url')
      .eq('type', typeName)
      .neq('status', 'scrapped');

    const mismatched = (eqs || []).filter(e => e.image_url !== sharedUrl);
    results.push({
      name: '设备图片与共享图片一致性',
      pass: mismatched.length === 0,
      detail: mismatched.length === 0
        ? `全部 ${(eqs || []).length} 台设备使用相同共享图片`
        : `${mismatched.length}/${(eqs || []).length} 台不一致: ${mismatched.map(e => e.name).join(', ')}`,
      severity: mismatched.length > 0 ? 'warning' : 'ok',
      fix: mismatched.length > 0 ? async () => {
        await supabase.from('equipment')
          .update({ image_url: sharedUrl })
          .in('id', mismatched.map(e => e.id));
      } : undefined,
    });
  }

  // --- 检查 2：同类型图片 URL 唯一性 ---
  const { data: eqUrls } = await supabase
    .from('equipment')
    .select('image_url')
    .eq('type', typeName)
    .neq('status', 'scrapped')
    .not('image_url', 'is', null);

  const uniqueUrls = [...new Set((eqUrls || []).map(e => e.image_url))];
  results.push({
    name: '类型图片 URL 唯一性',
    pass: uniqueUrls.length <= 1,
    detail: uniqueUrls.length <= 1
      ? 'OK — 所有设备使用同一图片 URL'
      : `发现 ${uniqueUrls.length} 个不同 URL，建议设置共享图片统一`,
    severity: uniqueUrls.length > 1 ? 'warning' : 'ok',
  });

  // --- 检查 3：报废设备不应残留图片 ---
  const { count } = await supabase
    .from('equipment')
    .select('*', { count: 'exact', head: true })
    .or('status.eq.scrapped,is_scrapped.eq.true')
    .not('image_url', 'is', null);

  results.push({
    name: '报废设备残留图片',
    pass: (count ?? 0) === 0,
    detail: count ? `${count} 台报废设备仍有图片引用，可清理以节省存储` : 'OK',
    severity: (count ?? 0) > 0 ? 'warning' : 'ok',
    fix: (count ?? 0) > 0 ? async () => {
      await supabase.from('equipment')
        .update({ image_url: null })
        .or('status.eq.scrapped,is_scrapped.eq.true');
    } : undefined,
  });

  // --- 检查 4：类型在 templates 中有定义 ---
  const { data: templateExists } = await supabase
    .from('equipment_templates')
    .select('id')
    .eq('equipment_type', typeName)
    .eq('model', '__TYPE__')
    .maybeSingle();

  results.push({
    name: '类型在 equipment_templates 中有定义',
    pass: !!templateExists,
    detail: templateExists
      ? 'OK'
      : `类型 "${typeName}" 仅在 equipment 表中出现，缺少模板定义`,
    severity: templateExists ? 'ok' : 'error',
  });

  // --- 检查 5：共享图片 Storage 文件存在性 ---
  if (sharedUrl) {
    const path = extractStoragePath(sharedUrl);
    if (path) {
      try {
        // 用 list 检查文件存在
        const pathParts = path.split('/');
        const fileName = pathParts.pop()!;
        const dirPath = pathParts.join('/');

        const { data: files, error } = await supabase.storage
          .from('equipment-images')
          .list(dirPath || undefined, { search: fileName });

        const fileExists = !error && (files || []).some(f => f.name === fileName);
        results.push({
          name: '共享图片 Storage 文件存在',
          pass: fileExists,
          detail: fileExists ? 'OK — 文件在 Bucket 中' : `文件未找到: ${path}`,
          severity: fileExists ? 'ok' : 'error',
        });
      } catch {
        results.push({
          name: '共享图片 Storage 文件存在',
          pass: false,
          detail: `无法验证: ${path}`,
          severity: 'warning',
        });
      }
    }
  }

  return results;
}

// ============================================================
// ⑨ RPC 事务批量同步
// ============================================================

/**
 * 调用 Supabase RPC 函数，在单个事务中：
 * 1. 更新 equipment_templates.shared_image_url
 * 2. 批量同步所有关联设备的 image_url
 */
export async function syncTypeSharedImage(
  typeName: string,
  sharedImageUrl: string
): Promise<SyncResult> {
  const { data, error } = await supabase.rpc('sync_type_shared_image', {
    p_type_name: typeName,
    p_shared_image_url: sharedImageUrl,
  });

  if (error) {
    return { success: false, updatedCount: 0, typeName, error: error.message };
  }

  // RPC 返回 JSONB: { success, updated_count, type_name }
  const result = data as { success: boolean; updated_count: number; type_name: string; error?: string };
  return {
    success: result?.success ?? false,
    updatedCount: result?.updated_count ?? 0,
    typeName: result?.type_name ?? typeName,
    error: result?.error,
  };
}

/**
 * ★ RPC 选择性同步：只更新指定设备 ID 列表。
 */
export async function syncTypeSharedImageToDevices(
  typeName: string,
  sharedImageUrl: string,
  equipmentIds: string[]
): Promise<SyncResult> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase.rpc as any)('sync_type_shared_image_to_devices', {
    p_type_name: typeName,
    p_shared_image_url: sharedImageUrl,
    p_equipment_ids: equipmentIds,
  });
  if (error) {
    return { success: false, updatedCount: 0, typeName, error: error.message };
  }
  const result = data as unknown as { success: boolean; updated_count: number; type_name: string; error?: string };
  return {
    success: result?.success ?? false,
    updatedCount: result?.updated_count ?? 0,
    typeName: result?.type_name ?? typeName,
    error: result?.error,
  };
}

// ============================================================
// 上传类型共享图片到 Storage
// ============================================================

/**
 * 将文件上传到 equipment-images/types/ 目录
 * @returns publicUrl
 */
export async function uploadTypeSharedImage(
  file: File,
  typeName: string
): Promise<string> {
  const ext = file.name.split('.').pop() || 'jpg';
  const path = buildTypeImagePath(typeName, ext);

  const { error: uploadError } = await supabase.storage
    .from('equipment-images')
    .upload(path, file, {
      contentType: file.type,
      upsert: true,
    });

  if (uploadError) throw uploadError;

  const { data: urlData } = supabase.storage
    .from('equipment-images')
    .getPublicUrl(path);

  return urlData.publicUrl;
}
