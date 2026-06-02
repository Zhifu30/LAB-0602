/**
 * OCR 字段解析 + 设备匹配引擎
 * 将 PaddleOCR 原始文本 → 结构化字段 → 搜索数据库 → 逐字段对比
 */
import { Equipment, EquipmentStatus, statusLabels } from '@/types/equipment';

// ====================== 类型定义 ======================

/** OCR 检测到的单个文字区域（含位置坐标） */
export interface OCRDetail {
  text: string;
  confidence: number;
  box: { x: number; y: number; w: number; h: number };
}

// ====================== 自定义标签标注系统 ======================

/** 用户自定义的标签映射：铭牌上的缩写 → 标准字段 */
export interface CustomLabelMapping {
  id: string;
  pattern: string;       // 铭牌上的文字模式（如 "SN", "容SN", "出厂号"）
  field: keyof Equipment; // 映射到的标准字段
  confidence: 'high' | 'medium' | 'low';
  createdAt: string;
}

const CUSTOM_MAPPINGS_KEY = 'ocr_custom_mappings';

/** 获取所有自定义映射 */
export function getCustomMappings(): CustomLabelMapping[] {
  try {
    const raw = localStorage.getItem(CUSTOM_MAPPINGS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

/** 添加自定义映射 */
export function addCustomMapping(
  pattern: string,
  field: keyof Equipment,
  confidence: 'high' | 'medium' | 'low' = 'medium',
): CustomLabelMapping {
  const mappings = getCustomMappings();
  // 检查是否已存在
  const existing = mappings.find(m => m.pattern.toLowerCase() === pattern.toLowerCase() && m.field === field);
  if (existing) return existing;

  const newMapping: CustomLabelMapping = {
    id: `custom_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    pattern: pattern.trim(),
    field,
    confidence,
    createdAt: new Date().toISOString(),
  };
  mappings.push(newMapping);
  localStorage.setItem(CUSTOM_MAPPINGS_KEY, JSON.stringify(mappings));
  return newMapping;
}

/** 删除自定义映射 */
export function removeCustomMapping(id: string): void {
  const mappings = getCustomMappings().filter(m => m.id !== id);
  localStorage.setItem(CUSTOM_MAPPINGS_KEY, JSON.stringify(mappings));
}

/** 清除所有自定义映射 */
export function clearCustomMappings(): void {
  localStorage.removeItem(CUSTOM_MAPPINGS_KEY);
}

/** 导出映射为 JSON */
export function exportCustomMappings(): string {
  return JSON.stringify(getCustomMappings(), null, 2);
}

/** 从 JSON 导入映射 */
export function importCustomMappings(json: string): number {
  try {
    const imported = JSON.parse(json) as CustomLabelMapping[];
    const existing = getCustomMappings();
    let added = 0;
    for (const m of imported) {
      if (!existing.find(e => e.pattern.toLowerCase() === m.pattern.toLowerCase() && e.field === m.field)) {
        existing.push({ ...m, id: `custom_${Date.now()}_${Math.random().toString(36).slice(2, 6)}` });
        added++;
      }
    }
    localStorage.setItem(CUSTOM_MAPPINGS_KEY, JSON.stringify(existing));
    return added;
  } catch {
    return 0;
  }
}

/** 将自定义映射转为标签匹配正则列表 */
function customMappingsToPatterns(): [RegExp, keyof Equipment, 'high' | 'medium' | 'low'][] {
  return getCustomMappings().map(m => [
    new RegExp(m.pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'),
    m.field,
    m.confidence,
  ]);
}

export interface ParsedField {
  field: keyof Equipment;
  value: string;
  confidence: 'high' | 'medium' | 'low';
  rawMatch: string;
}

export type FieldMatchStatus = 'match' | 'mismatch' | 'ocr_only' | 'db_only';

export interface FieldComparison {
  field: keyof Equipment;
  label: string;
  ocrValue: string | null;
  dbValue: string | null;
  status: FieldMatchStatus;
  confidence: 'high' | 'medium' | 'low' | null;
}

export interface EquipmentMatch {
  equipment: Equipment;
  score: number;
  matchedBy: string[];
  fieldComparisons: FieldComparison[];
}

export interface OCRMatchResult {
  parsedFields: ParsedField[];
  matches: EquipmentMatch[];
  bestMatch: EquipmentMatch | null;
  isExactMatch: boolean;
  isMultipleMatches: boolean;
}

// ====================== 工具函数 ======================

/** 文本规范化：小写、去多余空格、去常用标点 */
export function normalizeText(text: string): string {
  return text
    .toLowerCase()
    .replace(/[\s\-_.,;:()（）【】\[\]]+/g, ' ')
    .trim();
}

/** 日期格式标准化 → YYYY-MM-DD */
export function normalizeDateString(raw: string): string | null {
  const cleaned = raw.trim();
  // YYYY-MM-DD 或 YYYY/MM/DD
  let m = cleaned.match(/(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
  if (m) return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;
  // DD/MM/YYYY 或 DD-MM-YYYY
  m = cleaned.match(/(\d{1,2})[-/](\d{1,2})[-/](\d{4})/);
  if (m) {
    const a = parseInt(m[1]), b = parseInt(m[2]);
    // 如果第一部分 > 12，则是 DD/MM
    if (a > 12) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
    // 否则假设 MM/DD
    return `${m[3]}-${m[1].padStart(2, '0')}-${m[2].padStart(2, '0')}`;
  }
  return null;
}

/** 状态中英文映射 */
const STATUS_MAP: Record<string, EquipmentStatus> = {
  '在用': 'in-use', '使用中': 'in-use', 'in use': 'in-use', 'inuse': 'in-use',
  '待用': 'available', '空闲': 'available', '可用': 'available', 'available': 'available', 'idle': 'available',
  '校正': 'calibration', '校准': 'calibration', '校准中': 'calibration', 'calibration': 'calibration',
  '故障': 'out-of-order', '损坏': 'out-of-order', '维修': 'out-of-order', 'out of order': 'out-of-order', 'broken': 'out-of-order',
  '报废': 'scrapped', '已报废': 'scrapped', 'scrapped': 'scrapped',
};

export function normalizeStatus(raw: string): string | null {
  const key = raw.trim().toLowerCase();
  for (const [pattern, canonical] of Object.entries(STATUS_MAP)) {
    if (key.includes(pattern.toLowerCase())) return canonical;
  }
  return null;
}

/** Levenshtein 编辑距离 */
export function levenshteinDistance(a: string, b: string): number {
  const m = a.length, n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = a[i - 1] === b[j - 1]
        ? dp[i - 1][j - 1]
        : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
    }
  }
  return dp[m][n];
}

// ====================== 字段标签（用于对比显示） ======================

const FIELD_LABELS: Record<string, string> = {
  name: '仪器名称', model: '型号', manufacturer: '厂商',
  serialNumber: '序列号', assetNumber: '资产编号',
  status: '状态', location: '位置', responsible: '负责人',
  nextCalibrationDate: '下次校正', lastCalibrationDate: '上次校正',
  maintenanceDate: '维护日期', type: '设备类型',
  purchasePrice: '采购价格', supplier: '供应商',
  warrantyExpiry: '保修到期', notes: '备注', description: '描述',
};

// 中文+英文+数字+常见标点的字符类（修复 \w 不匹配中文的 bug）
const C = `[\\w\\u4e00-\\u9fff\\u3400-\\u4dbf]`;
const CS = `[\\w\\u4e00-\\u9fff\\u3400-\\u4dbf\\s\\-/.()（）]+`;  // 含空格
const CN = `[\\w\\u4e00-\\u9fff\\u3400-\\u4dbf\\-/.()（）]+`;      // 不含空格

const COMPARE_FIELDS: (keyof Equipment)[] = [
  'name', 'type', 'model', 'manufacturer', 'serialNumber', 'assetNumber',
  'status', 'location', 'responsible', 'nextCalibrationDate',
  'lastCalibrationDate', 'maintenanceDate', 'notes',
];

// ====================== OCR 文本解析 ======================

/**
 * 从 OCR 原始文本中提取结构化设备字段
 * 支持中英文铭牌、校正标签、资产标签
 */
export function parseOCRText(rawText: string): ParsedField[] {
  const fields: ParsedField[] = [];
  const lines = rawText.split('\n').map(l => l.trim()).filter(l => l.length > 0);

  // 模式定义：[正则, 目标字段, 置信度, 值提取组索引]
  type Pattern = [RegExp, keyof Equipment, 'high' | 'medium' | 'low', number];
  const patterns: Pattern[] = [
    // ===== 高置信度：唯一标识符 =====
    [/serial\s*(?:no|number|#)?[:\s]*([\w\-/]+)/i, 'serialNumber', 'high', 1],
    [/S\/N[:\s]*([\w\-/]+)/i, 'serialNumber', 'high', 1],
    [/(?:序列号|出厂编号|机身编号)[:\s]*([\w\-/]+)/, 'serialNumber', 'high', 1],

    [/asset\s*(?:no|number|#|tag)?[:\s]*([\w\-/]+)/i, 'assetNumber', 'high', 1],
    [/(?:资产编号|固定资产编号|资产标签|财产编号)[:\s]*([\w\-/]+)/, 'assetNumber', 'high', 1],

    // ===== 型号 =====
    [/model\s*[:\s]*` + `(${CN})` + `/i, 'model', 'high', 1],
    [/(?:型号|规格型号|仪器型号|type\s*no)\s*[:\s]*` + `(${CN})` + `/, 'model', 'high', 1],

    // ===== 日期 =====
    [/(?:next\s*cal|下?次?校正|校准|检定)(?:日期)?[:\s]*((?:\d{4}[-/]\d{1,2}[-/]\d{1,2})|(?:\d{1,2}[-/]\d{1,2}[-/]\d{4}))/i, 'nextCalibrationDate', 'high', 1],
    [/(?:last\s*cal|上?次?校正|上次校准|上次检定)(?:日期)?[:\s]*((?:\d{4}[-/]\d{1,2}[-/]\d{1,2})|(?:\d{1,2}[-/]\d{1,2}[-/]\d{4}))/i, 'lastCalibrationDate', 'high', 1],
    [/(?:maintenance|维护)(?:日期)?[:\s]*((?:\d{4}[-/]\d{1,2}[-/]\d{1,2})|(?:\d{1,2}[-/]\d{1,2}[-/]\d{4}))/i, 'maintenanceDate', 'medium', 1],
    [/(?:cal\s*date|calibration\s*date|校正日期|校准日期|检定日期)[:\s]*((?:\d{4}[-/]\d{1,2}[-/]\d{1,2})|(?:\d{1,2}[-/]\d{1,2}[-/]\d{4}))/i, 'nextCalibrationDate', 'medium', 1],
    [/(?:warranty|保修|质保)(?:到期)?[:\s]*((?:\d{4}[-/]\d{1,2}[-/]\d{1,2})|(?:\d{1,2}[-/]\d{1,2}[-/]\d{4}))/i, 'warrantyExpiry', 'medium', 1],

    // ===== 文字型字段 — 使用 CS（含中文） =====
    [/(?:manufacturer|made\s*by|brand)\s*[:\s]*` + `(${CS})` + `/i, 'manufacturer', 'medium', 1],
    [/(?:厂商|制造商|生产厂家|品牌|生产商|厂家)\s*[:\s]*` + `(${CS})` + `/, 'manufacturer', 'medium', 1],

    [/(?:instrument\s*name|equipment\s*name|device\s*name)\s*[:\s]*` + `(${CS})` + `/i, 'name', 'medium', 1],
    [/(?:仪器名称|设备名称|名称|品名)\s*[:\s]*` + `(${CS})` + `/, 'name', 'medium', 1],

    [/(?:location|place|room|lab)\s*[:\s]*` + `(${CS})` + `/i, 'location', 'medium', 1],
    [/(?:位置|放置地点|安装地点|部门|实验室|房间|地点)\s*[:\s]*` + `(${CS})` + `/, 'location', 'medium', 1],

    [/(?:type|equipment\s*type|category)\s*[:\s]*` + `(${CS})` + `/i, 'type', 'medium', 1],
    [/(?:设备类型|仪器类型|类型|分类)\s*[:\s]*` + `(${CS})` + `/, 'type', 'medium', 1],

    // ===== 低置信度 =====
    [/(?:responsible|operator|user|keeper)\s*[:\s]*` + `(${CS})` + `/i, 'responsible', 'low', 1],
    [/(?:负责人|保管人|使用人|责任人|管理员)\s*[:\s]*` + `(${CS})` + `/, 'responsible', 'low', 1],

    [/(?:supplier|vendor)\s*[:\s]*` + `(${CS})` + `/i, 'supplier', 'low', 1],
    [/(?:供应商|经销商)\s*[:\s]*` + `(${CS})` + `/, 'supplier', 'low', 1],

    [/(?:status|state)[:\s]*(在用|闲置|报废|维修|正常|normal|in\s*use|idle|scrapped|broken|available)/i, 'status', 'medium', 1],
    [/(?:状态|使用状态|运行状态)[:\s]*(在用|闲置|报废|维修|正常|待用|使用中|故障)/, 'status', 'medium', 1],

    // 价格
    [/(?:price|cost|purchase)\s*(?:price)?[:\s]*(\d+(?:,\d{3})*(?:\.\d{2})?)/i, 'purchasePrice', 'low', 1],
    [/(?:价格|金额|采购价)[:\s]*(\d+(?:,\d{3})*(?:\.\d{2})?)/, 'purchasePrice', 'low', 1],
  ];

  // 逐行匹配
  for (const line of lines) {
    for (const [regex, field, confidence, groupIdx] of patterns) {
      const match = line.match(regex);
      if (match) {
        let value = match[groupIdx].trim();
        // 日期字段标准化
        if (field === 'nextCalibrationDate' || field === 'lastCalibrationDate'
            || field === 'maintenanceDate' || field === 'warrantyExpiry') {
          const norm = normalizeDateString(value);
          if (norm) value = norm;
        }
        // 状态标准化
        if (field === 'status') {
          const norm = normalizeStatus(value);
          if (norm) value = norm;
        }
        fields.push({ field, value, confidence, rawMatch: match[0] });
        break; // 一行只匹配一个模式
      }
    }
  }

  // === 回退启发式：无标签匹配时 ===
  const parsedFieldNames = new Set(fields.map(f => f.field));

  for (const line of lines) {
    // 跳过已匹配的行
    if (fields.some(f => f.rawMatch.includes(line))) continue;

    // 纯日期行 → 校正日期候选
    if (!parsedFieldNames.has('nextCalibrationDate')) {
      const dateMatch = line.match(/^(\d{4}[-/]\d{1,2}[-/]\d{1,2})$/);
      if (dateMatch) {
        const norm = normalizeDateString(dateMatch[1]);
        if (norm) {
          fields.push({ field: 'nextCalibrationDate', value: norm, confidence: 'low', rawMatch: line });
          parsedFieldNames.add('nextCalibrationDate');
          continue;
        }
      }
    }

    // 纯序列号模式（6位以上大写字母+数字）→ 序列号候选
    if (!parsedFieldNames.has('serialNumber')) {
      const snMatch = line.match(/^[A-Z0-9]{6,}$/);
      if (snMatch) {
        fields.push({ field: 'serialNumber', value: line, confidence: 'low', rawMatch: line });
        parsedFieldNames.add('serialNumber');
        continue;
      }
    }

    // 邮箱模式
    if (!parsedFieldNames.has('responsible_email')) {
      const emailMatch = line.match(/([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/);
      if (emailMatch) {
        fields.push({ field: 'responsible_email' as keyof Equipment, value: emailMatch[1], confidence: 'medium', rawMatch: line });
        continue;
      }
    }
  }

  // === 多行匹配：标签在一行，值在下一行 ===
  // 常见场景：OCR 把标签和值识别为两行
  const labelOnlyPatterns: [RegExp, keyof Equipment, 'high' | 'medium' | 'low'][] = [
    [/(?:仪器名称|设备名称|名称|品名|name)\s*[:：]?\s*$/, 'name', 'medium'],
    [/(?:型号|规格型号|型号规格|model)\s*[:：]?\s*$/, 'model', 'medium'],
    [/(?:序列号|出厂编号|机身编号|serial|S\/N)\s*[:：]?\s*$/, 'serialNumber', 'high'],
    [/(?:资产编号|固定资产编号|财产编号|asset)\s*[:：]?\s*$/, 'assetNumber', 'high'],
    [/(?:厂商|制造商|生产厂家|品牌|manufacturer)\s*[:：]?\s*$/, 'manufacturer', 'medium'],
    [/(?:位置|地点|部门|location)\s*[:：]?\s*$/, 'location', 'medium'],
    [/(?:负责人|保管人|使用人|responsible)\s*[:：]?\s*$/, 'responsible', 'low'],
    [/(?:校正日期|校准日期|检定日期|下次校正|calibration)\s*[:：]?\s*$/, 'nextCalibrationDate', 'medium'],
    [/(?:维护日期|maintenance)\s*[:：]?\s*$/, 'maintenanceDate', 'low'],
    [/(?:设备类型|仪器类型|类型|type)\s*[:：]?\s*$/, 'type', 'medium'],
  ];

  for (let i = 0; i < lines.length - 1; i++) {
    const thisLine = lines[i];
    const nextLine = lines[i + 1];

    // 跳过已匹配的行
    if (fields.some(f => f.rawMatch.includes(thisLine))) continue;
    if (fields.some(f => f.rawMatch.includes(nextLine))) continue;

    // 下一行不能是纯标签
    const nextIsLabel = labelOnlyPatterns.some(([r]) => r.test(nextLine));
    if (nextIsLabel) continue;

    for (const [regex, field, confidence] of labelOnlyPatterns) {
      if (regex.test(thisLine) && !parsedFieldNames.has(field)) {
        let value = nextLine.trim();
        if (field === 'nextCalibrationDate' || field === 'lastCalibrationDate' || field === 'maintenanceDate') {
          const norm = normalizeDateString(value);
          if (norm) value = norm;
          else continue; // 不是有效日期，跳过
        }
        if (value.length > 0 && value.length < 100) {
          fields.push({ field, value, confidence, rawMatch: thisLine + '\n' + nextLine });
          parsedFieldNames.add(field);
          break;
        }
      }
    }
  }

  // 如果仍未提取到名称，用第一行非空非标签行
  if (!parsedFieldNames.has('name') && lines.length > 0) {
    const firstLine = lines[0];
    const isLabel = labelOnlyPatterns.some(([r]) => r.test(firstLine));
    if (!isLabel && !patterns.some(([r]) => r.test(firstLine))) {
      fields.push({ field: 'name', value: firstLine, confidence: 'low', rawMatch: firstLine });
    }
  }

  return fields;
}

// ====================== 设备搜索匹配 ======================

/**
 * 多策略在设备列表中搜索匹配
 */
export function searchEquipment(
  parsedFields: ParsedField[],
  equipmentList: Equipment[],
): OCRMatchResult {
  if (!equipmentList.length) {
    return {
      parsedFields,
      matches: [],
      bestMatch: null,
      isExactMatch: false,
      isMultipleMatches: false,
    };
  }

  const getParsed = (field: keyof Equipment): string | null => {
    const f = parsedFields.find(p => p.field === field);
    return f ? f.value : null;
  };

  const serialNumber = getParsed('serialNumber');
  const assetNumber = getParsed('assetNumber');
  const name = getParsed('name');
  const model = getParsed('model');
  const manufacturer = getParsed('manufacturer');

  const matches: EquipmentMatch[] = [];
  const scored = new Map<string, { equipment: Equipment; score: number; matchedBy: string[] }>();

  const addScore = (eq: Equipment, score: number, strategy: string) => {
    if (!scored.has(eq.id)) scored.set(eq.id, { equipment: eq, score: 0, matchedBy: [] });
    const entry = scored.get(eq.id)!;
    entry.score = Math.max(entry.score, score);
    if (!entry.matchedBy.includes(strategy)) entry.matchedBy.push(strategy);
  };

  // 策略1：序列号精确匹配（权重 1.0）
  if (serialNumber) {
    const norm = normalizeText(serialNumber);
    const hits = equipmentList.filter(eq =>
      eq.serialNumber && normalizeText(eq.serialNumber) === norm
    );
    for (const eq of hits) addScore(eq, 1.0, 'serial_number');
  }

  // 策略2：资产编号精确匹配（权重 0.95）
  if (assetNumber) {
    const norm = normalizeText(assetNumber);
    const hits = equipmentList.filter(eq =>
      eq.assetNumber && normalizeText(eq.assetNumber) === norm
    );
    for (const eq of hits) addScore(eq, 0.95, 'asset_number');
  }

  // 策略3：名称模糊匹配（权重 0.7）
  if (name) {
    const normedOcr = normalizeText(name);
    for (const eq of equipmentList) {
      const normedDb = normalizeText(eq.name);
      const maxLen = Math.max(normedOcr.length, normedDb.length);
      if (maxLen === 0) continue;
      const dist = levenshteinDistance(normedOcr, normedDb);
      const similarity = 1 - dist / maxLen;
      if (similarity >= 0.5 || normedDb.includes(normedOcr) || normedOcr.includes(normedDb)) {
        addScore(eq, 0.5 + similarity * 0.5, 'name');
      }
    }
  }

  // 策略4：型号+厂商组合匹配（权重 0.8）
  if (model && manufacturer) {
    const normModel = normalizeText(model);
    const normMfr = normalizeText(manufacturer);
    for (const eq of equipmentList) {
      const eqModel = normalizeText(eq.model);
      const eqMfr = normalizeText(eq.manufacturer);
      const modelMatch = eqModel.includes(normModel) || normModel.includes(eqModel);
      const mfrMatch = eqMfr.includes(normMfr) || normMfr.includes(eqMfr);
      if (modelMatch && mfrMatch) {
        addScore(eq, 0.85, 'model+manufacturer');
      } else if (modelMatch || mfrMatch) {
        addScore(eq, 0.6, 'model_or_manufacturer');
      }
    }
  }

  // 策略5：多字段交集评分（权重 0.3-0.6）
  for (const eq of equipmentList) {
    if (scored.has(eq.id)) continue; // 已由更确信的策略匹配
    let intersection = 0;
    let total = 0;
    for (const pf of parsedFields) {
      if (pf.confidence === 'low') continue;
      total++;
      const eqValue = eq[pf.field as keyof Equipment]?.toString() || '';
      if (eqValue && normalizeText(eqValue) === normalizeText(pf.value)) {
        intersection++;
      }
    }
    if (total > 0 && intersection > 0) {
      addScore(eq, (intersection / total) * 0.6, 'field_intersection');
    }
  }

  // 构建结果
  const sorted = Array.from(scored.values())
    .sort((a, b) => b.score - a.score);

  // 过滤低分匹配
  const threshold = 0.3;
  const validMatches = sorted.filter(m => m.score >= threshold);

  const matchResults: EquipmentMatch[] = validMatches.map(m => ({
    equipment: m.equipment,
    score: m.score,
    matchedBy: m.matchedBy,
    fieldComparisons: compareFields(parsedFields, m.equipment),
  }));

  const isExactMatch = matchResults.length === 1 && matchResults[0].score >= 0.9;
  const isMultipleMatches = matchResults.length > 1;
  const bestMatch = matchResults.length > 0 ? matchResults[0] : null;

  return {
    parsedFields,
    matches: matchResults,
    bestMatch,
    isExactMatch,
    isMultipleMatches,
  };
}

// ====================== 字段逐项对比 ======================

/**
 * 将 OCR 解析字段与数据库设备逐字段对比，生成差异报告
 */
export function compareFields(
  parsedFields: ParsedField[],
  equipment: Equipment,
): FieldComparison[] {
  const parsedMap = new Map<keyof Equipment, ParsedField>();
  for (const pf of parsedFields) {
    parsedMap.set(pf.field, pf);
  }

  return COMPARE_FIELDS.map(field => {
    const pf = parsedMap.get(field);
    const ocrValue = pf ? pf.value : null;
    const dbValue = equipment[field]?.toString() || null;
    const label = FIELD_LABELS[field] || field;

    let status: FieldMatchStatus;
    if (ocrValue && dbValue) {
      const norm = normalizeText(ocrValue) === normalizeText(dbValue);
      status = norm ? 'match' : 'mismatch';
    } else if (ocrValue && !dbValue) {
      status = 'ocr_only';
    } else if (!ocrValue && dbValue) {
      status = 'db_only';
    } else {
      status = 'db_only'; // 都没值的字段忽略
    }

    return {
      field,
      label,
      ocrValue,
      dbValue,
      status,
      confidence: pf ? pf.confidence : null,
    };
  });
}

// ====================== 基于空间布局的智能解析 ======================

/**
 * 根据文字块的空间位置（左-右、上-下关系）智能匹配标签和值
 * 这才是"像人一样"理解铭牌——利用位置关系，而不只是正则
 */
export function parseOCRWithLayout(details: OCRDetail[]): ParsedField[] {
  if (!details || details.length === 0) return [];

  const fields: ParsedField[] = [];
  const used = new Set<number>();

  // 已知的标签关键词 → 字段映射（内置 + 用户自定义）
  const LABEL_MAP: [RegExp, keyof Equipment, 'high' | 'medium' | 'low'][] = [
    [/(?:仪器名称|设备名称|名称|品名|name)/i, 'name', 'medium'],
    [/(?:型号|规格型号|型号规格|model)/i, 'model', 'medium'],
    [/(?:序列号|出厂编号|机身编号|serial|S\/N|SN(?![a-z]))/i, 'serialNumber', 'high'],
    [/(?:资产编号|固定资产编号|财产编号|asset)/i, 'assetNumber', 'high'],
    [/(?:厂商|制造商|生产厂家|品牌|manufacturer)/i, 'manufacturer', 'medium'],
    [/(?:位置|地点|部门|location)/i, 'location', 'medium'],
    [/(?:负责人|保管人|使用人|responsible)/i, 'responsible', 'low'],
    [/(?:校正日期|校准日期|检定日期|下次校正|calibration|next\s*cal)/i, 'nextCalibrationDate', 'medium'],
    [/(?:上次校正|上次校准|last\s*cal)/i, 'lastCalibrationDate', 'medium'],
    [/(?:维护日期|maintenance)/i, 'maintenanceDate', 'low'],
    [/(?:设备类型|仪器类型|类型|type)/i, 'type', 'medium'],
    [/(?:状态|使用状态|status)/i, 'status', 'medium'],
    [/(?:供应商|经销商|supplier)/i, 'supplier', 'low'],
    [/(?:保修|质保|warranty)/i, 'warrantyExpiry', 'low'],
    // 用户自定义映射（从 localStorage 加载）
    ...customMappingsToPatterns(),
  ];

  /**
   * 判断两个文字块是否在同一行（Y 轴重叠超过 50%）
   */
  const sameRow = (a: OCRDetail, b: OCRDetail): boolean => {
    const aTop = a.box.y, aBot = a.box.y + a.box.h;
    const bTop = b.box.y, bBot = b.box.y + b.box.h;
    const overlap = Math.min(aBot, bBot) - Math.max(aTop, bTop);
    const minH = Math.min(a.box.h, b.box.h);
    return overlap > minH * 0.4; // Y 重叠超过 40% 视为同行
  };

  /**
   * 判断两个文字块是否在同一列（X 轴重叠超过 50%）
   */
  const sameCol = (a: OCRDetail, b: OCRDetail): boolean => {
    const aLeft = a.box.x, aRight = a.box.x + a.box.w;
    const bLeft = b.box.x, bRight = b.box.x + b.box.w;
    const overlap = Math.min(aRight, bRight) - Math.max(aLeft, bLeft);
    const minW = Math.min(a.box.w, b.box.w);
    return overlap > minW * 0.3;
  };

  /**
   * 在同行中找到标签右侧最接近的值块
   */
  const findRightValue = (label: OCRDetail, candidates: OCRDetail[]): { idx: number; detail: OCRDetail } | null => {
    let best: { idx: number; detail: OCRDetail; dist: number } | null = null;
    const labelRight = label.box.x + label.box.w;

    for (let i = 0; i < candidates.length; i++) {
      if (used.has(i)) continue;
      const c = candidates[i];
      // 必须在标签右侧
      if (c.box.x < labelRight + 2) continue;
      // 必须在同一行
      if (!sameRow(label, c)) continue;

      const dist = c.box.x - labelRight;
      if (!best || dist < best.dist) {
        best = { idx: i, detail: c, dist };
      }
    }
    return best ? { idx: best.idx, detail: best.detail } : null;
  };

  /**
   * 在下方找到标签最接近的值块
   */
  const findBelowValue = (label: OCRDetail, candidates: OCRDetail[]): { idx: number; detail: OCRDetail } | null => {
    let best: { idx: number; detail: OCRDetail; dist: number } | null = null;
    const labelBot = label.box.y + label.box.h;

    for (let i = 0; i < candidates.length; i++) {
      if (used.has(i)) continue;
      const c = candidates[i];
      // 必须在标签下方
      if (c.box.y < labelBot + 2) continue;
      // 必须在同一列（X 轴有重叠）
      if (!sameCol(label, c)) continue;

      const dist = c.box.y - labelBot;
      if (!best || dist < best.dist) {
        best = { idx: i, detail: c, dist };
      }
    }
    return best ? { idx: best.idx, detail: best.detail } : null;
  };

  // 遍历所有文字块，找到标签并匹配值
  for (let i = 0; i < details.length; i++) {
    if (used.has(i)) continue;
    const block = details[i];
    const txt = block.text.trim();

    // 检查是否为标签
    for (const [regex, field, confidence] of LABEL_MAP) {
      if (regex.test(txt)) {
        // 优先找右侧值（常见的 标签：值 水平排列）
        const rightVal = findRightValue(block, details);
        if (rightVal) {
          let value = rightVal.detail.text.trim();
          if (field === 'nextCalibrationDate' || field === 'lastCalibrationDate' || field === 'maintenanceDate' || field === 'warrantyExpiry') {
            const norm = normalizeDateString(value);
            if (!norm) continue; // 不是有效日期，跳过
            value = norm;
          }
          if (field === 'status') {
            const norm = normalizeStatus(value);
            if (norm) value = norm;
          }
          fields.push({ field, value, confidence, rawMatch: txt + ' | ' + value });
          used.add(i);
          used.add(rightVal.idx);
          break;
        }

        // 其次找下方值（标签在上，值在下，如竖排铭牌）
        const belowVal = findBelowValue(block, details);
        if (belowVal) {
          let value = belowVal.detail.text.trim();
          if (field === 'nextCalibrationDate' || field === 'lastCalibrationDate' || field === 'maintenanceDate' || field === 'warrantyExpiry') {
            const norm = normalizeDateString(value);
            if (!norm) continue;
            value = norm;
          }
          if (field === 'status') {
            const norm = normalizeStatus(value);
            if (norm) value = norm;
          }
          fields.push({ field, value, confidence, rawMatch: txt + ' | ' + value });
          used.add(i);
          used.add(belowVal.idx);
          break;
        }
      }
    }
  }

  // 未匹配的块：尝试作为遗漏的独立值（纯数字、纯日期、独立名称）
  const parsedFieldNames = new Set(fields.map(f => f.field));
  for (let i = 0; i < details.length; i++) {
    if (used.has(i)) continue;
    const txt = details[i].text.trim();

    // 日期
    if (!parsedFieldNames.has('nextCalibrationDate')) {
      const norm = normalizeDateString(txt);
      if (norm) {
        fields.push({ field: 'nextCalibrationDate', value: norm, confidence: 'low', rawMatch: txt });
        parsedFieldNames.add('nextCalibrationDate');
        continue;
      }
    }

    // 序列号
    if (!parsedFieldNames.has('serialNumber') && /^[A-Z0-9]{6,}$/.test(txt)) {
      fields.push({ field: 'serialNumber', value: txt, confidence: 'low', rawMatch: txt });
      parsedFieldNames.add('serialNumber');
      continue;
    }

    // 资产编号
    if (!parsedFieldNames.has('assetNumber') && /^(ZC|ASSET|FA|GD)[\-]?\d/i.test(txt)) {
      fields.push({ field: 'assetNumber', value: txt, confidence: 'low', rawMatch: txt });
      parsedFieldNames.add('assetNumber');
      continue;
    }
  }

  return fields;
}

// ====================== LLM 智能解析 ======================

/**
 * 使用 AI 大模型智能解析 OCR 原始文本
 * 支持 OpenAI 兼容接口（DeepSeek, OpenAI, etc.）
 *
 * @param rawText - OCR 原始识别文本
 * @param apiKey - API 密钥（DeepSeek 或 OpenAI 格式）
 * @param baseUrl - API 基础 URL，默认 DeepSeek
 */
export async function parseOCRWithLLM(
  rawText: string,
  apiKey: string,
  baseUrl: string = 'https://api.deepseek.com/v1',
): Promise<ParsedField[]> {
  const prompt = `你是一个实验室设备管理系统的数据提取助手。请从以下 OCR 识别的仪器铭牌/标签文字中，提取结构化信息。

OCR 原始文本：
"""
${rawText}
"""

请提取以下字段（如果文本中存在的话），以 JSON 格式返回。找不到的字段不要包含。
- name: 仪器名称
- model: 型号
- manufacturer: 厂商
- serialNumber: 序列号
- assetNumber: 资产编号
- location: 位置
- responsible: 负责人
- type: 设备类型
- nextCalibrationDate: 下次校正日期 (格式 YYYY-MM-DD)
- lastCalibrationDate: 上次校正日期 (格式 YYYY-MM-DD)
- maintenanceDate: 维护日期 (格式 YYYY-MM-DD)
- warrantyExpiry: 保修到期 (格式 YYYY-MM-DD)
- status: 状态 (available/in-use/calibration/out-of-order)
- supplier: 供应商
- notes: 备注

对于每个字段，同时给出置信度 (high/medium/low)。

直接返回纯 JSON，不要加任何解释或 markdown 标记。
格式示例：{"fields":[{"field":"name","value":"高效液相色谱仪","confidence":"high"},{"field":"model","value":"1260 Infinity II","confidence":"high"}]}`;

  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: 'deepseek-chat',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.1,
      max_tokens: 1024,
    }),
  });

  if (!response.ok) {
    throw new Error(`LLM API 调用失败: ${response.status} ${response.statusText}`);
  }

  const data = await response.json();
  const content = data.choices?.[0]?.message?.content || '';

  // 解析 JSON（处理可能的 markdown 包裹）
  let jsonStr = content.trim();
  if (jsonStr.startsWith('```')) {
    jsonStr = jsonStr.replace(/```\w*\n?/g, '').trim();
  }

  const parsed = JSON.parse(jsonStr);
  const fields = parsed.fields || [];

  return fields.map((f: any) => ({
    field: f.field as keyof Equipment,
    value: String(f.value || '').trim(),
    confidence: (['high', 'medium', 'low'].includes(f.confidence) ? f.confidence : 'medium') as 'high' | 'medium' | 'low',
    rawMatch: '',
  }));
}

// ====================== AI 对话助手 ======================

export interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

export interface ChatAction {
  type: 'annotate' | 'fill' | 'search' | 'none';
  params: Record<string, string>;
}

/**
 * 与 AI 对话，获取标注建议或字段填充帮助
 * AI 返回自然语言 + 可解析的操作指令
 */
export async function chatWithAI(
  messages: ChatMessage[],
  apiKey: string,
  baseUrl: string = 'https://api.deepseek.com/v1',
): Promise<{ reply: string; actions: ChatAction[] }> {
  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: 'deepseek-chat',
      messages,
      temperature: 0.3,
      max_tokens: 1024,
    }),
  });

  if (!response.ok) {
    throw new Error(`AI API 错误: ${response.status}`);
  }

  const data = await response.json();
  const content: string = data.choices?.[0]?.message?.content || '';

  // 解析 AI 回复中的操作指令
  const actions: ChatAction[] = [];
  const actionRegex = /\[(\w+):([^\]]+)\]/g;
  let match;
  while ((match = actionRegex.exec(content)) !== null) {
    const type = match[1] as ChatAction['type'];
    const paramsStr = match[2];
    const params: Record<string, string> = {};
    for (const pair of paramsStr.split(',')) {
      const [k, v] = pair.split('=').map(s => s.trim());
      if (k && v) params[k] = v;
    }
    if (['annotate', 'fill', 'search'].includes(type)) {
      actions.push({ type, params });
    }
  }

  // 清理指令标记，只留自然语言
  const cleanReply = content.replace(/\[(\w+):([^\]]+)\]/g, '').trim();

  return { reply: cleanReply, actions };
}

/**
 * 构建 AI 系统提示词（含当前 OCR 上下文）
 */
export function buildAIContext(
  rawText: string,
  details: OCRDetail[] | null,
  parsedFields: ParsedField[],
  customMappings: CustomLabelMapping[],
): string {
  const parsedInfo = parsedFields.map(f =>
    `${f.field}=${f.value} (${f.confidence})`
  ).join('\n');

  const unmatchedBlocks = details
    ? details.filter(d => !parsedFields.some(f => f.rawMatch.includes(d.text)))
        .map(d => `"${d.text}" at (${d.box.x},${d.box.y})`)
        .join('\n')
    : '';

  const customInfo = customMappings.map(m =>
    `"${m.pattern}" → ${m.field}`
  ).join('\n');

  return `你是一个实验室设备铭牌 OCR 辅助 AI。

当前 OCR 识别上下文：
--- 原始文字 ---
${rawText}

--- 已解析字段 ---
${parsedInfo || '(无)'}

--- 未匹配的文字块（位置坐标） ---
${unmatchedBlocks || '(无)'}

--- 用户自定义标注规则 ---
${customInfo || '(无)'}

你可以执行以下操作（用 [操作名:参数1=值1,参数2=值2] 格式）：
- [ANNOTATE:pattern=xxx,field=yyy] — 添加自定义标注
- [FILL:field=xxx,value=yyy] — 填充字段值
- [SEARCH:query=xxx] — 建议搜索匹配

回复要简短、直接。当用户描述需要标注或填充时，主动使用操作指令。`;
}

// ====================== 字段转 Equipment ======================

/**
 * 将 ParsedField[] 转为 Partial<Equipment>（用于预填表单或创建/更新）
 */
export function parsedFieldsToEquipment(parsedFields: ParsedField[]): Partial<Equipment> {
  const result: Partial<Equipment> = {};
  for (const pf of parsedFields) {
    const key = pf.field as keyof Equipment;
    // 数字字段
    if (pf.field === 'purchasePrice') {
      (result as any)[key] = parseFloat(pf.value.replace(/,/g, '')) || undefined;
    } else {
      (result as any)[key] = pf.value;
    }
  }
  return result;
}
