
export type EquipmentStatus = 'available' | 'in-use' | 'calibration' | 'out-of-order' | 'scrapped';

// 设备类型定义 - 支持预定义类型和自定义类型
export type EquipmentType = 'microscope' | 'centrifuge' | 'hplc' | 'spectrophotometer' | 'incubator' | 'autoclave' | 'balance' | 'pcr' | 'other' | string;

export interface Equipment {
  id: string;
  name: string;
  model: string;
  manufacturer: string;
  status: EquipmentStatus;
  location: string;
  maintenanceDate: string;
  description: string;
  responsible: string;
  responsible_email?: string;
  type?: string; // 设备类型 - 支持自定义类型名称
  serialNumber?: string; // 序列号
  // 图片和文档
  imageUrl?: string; // 设备图片URL
  sopFileUrl?: string; // SOP文件URL
  sopFileName?: string; // SOP文件名
  notes?: string; // 添加 notes 字段
  // 财务相关信息
  assetNumber?: string;
  purchasePrice?: number;
  depreciationRate?: number;
  currentValue?: number;
  supplier?: string;
  warrantyExpiry?: string;
  // 技术参数
  specifications?: string;
  operatingRange?: string;
  accuracy?: string;
  calibrationCycle?: string;
  lastCalibrationDate?: string;
  nextCalibrationDate?: string;
  calibrationDate?: string; // Legacy field for compatibility
  sopFiles?: string; // JSON string of multiple SOP files
  // 使用记录
  usageHours?: number;
  maintenanceHistory?: string;
  repairHistory?: string;
}

export const statusLabels: Record<EquipmentStatus, string> = {
  available: '待用',
  'in-use': '使用中',
  calibration: '校正',
  'out-of-order': '故障',
  scrapped: '已报废'
};

export const statusColors: Record<EquipmentStatus, string> = {
  available: 'bg-emerald-500 text-white shadow-emerald-200',
  'in-use': 'bg-blue-500 text-white shadow-blue-200',
  calibration: 'bg-amber-500 text-white shadow-amber-200',
  'out-of-order': 'bg-red-500 text-white shadow-red-200',
  scrapped: 'bg-amber-900 text-white shadow-amber-900'
};

// 状态图标
export const statusIcons: Record<EquipmentStatus, string> = {
  available: '✅',
  'in-use': '🔄',
  calibration: '⚙️',
  'out-of-order': '⚠️',
  scrapped: '🗑️'
};

// 设备类型标签
export const equipmentTypeLabels: Record<EquipmentType, string> = {
  microscope: '显微镜',
  centrifuge: '离心机',
  hplc: 'HPLC',
  spectrophotometer: '分光光度计',
  incubator: '培养箱',
  autoclave: '高压灭菌器',
  balance: '天平',
  pcr: 'PCR仪',
  other: '其他'
};

// 设备类型图标 - 使用 Lucide React 图标名称
export const equipmentTypeIcons: Record<EquipmentType, string> = {
  microscope: 'microscope',
  centrifuge: 'rotate-3d',
  hplc: 'flask-conical',
  spectrophotometer: 'scan-line',
  incubator: 'thermometer',
  autoclave: 'flame',
  balance: 'scale',
  pcr: 'dna',
  other: 'package'
};

// 表格导出配置
export interface TableExportConfig {
  id: string;
  name: string;
  columns: (keyof Equipment)[];
  description: string;
}

// 列配置接口
export interface ColumnConfig {
  key: keyof Equipment;
  label: string;
  type: 'text' | 'number' | 'date' | 'status' | 'equipment-type';
  required: boolean;
  editable: boolean;
}

// 默认列配置 — 仅包含数据库中实际存在的列
export const defaultColumnConfigs: ColumnConfig[] = [
  { key: 'id', label: '仪器编号', type: 'text', required: true, editable: false },
  { key: 'name', label: '仪器名称', type: 'text', required: true, editable: true },
  { key: 'type', label: '设备类型', type: 'equipment-type', required: false, editable: true },
  { key: 'model', label: '型号', type: 'text', required: true, editable: true },
  { key: 'serialNumber', label: '序列号', type: 'text', required: false, editable: true },
  { key: 'assetNumber', label: '资产编号', type: 'text', required: false, editable: true },
  { key: 'manufacturer', label: '厂商', type: 'text', required: true, editable: true },
  { key: 'status', label: '状态', type: 'status', required: true, editable: true },
  { key: 'location', label: '位置', type: 'text', required: true, editable: true },
  { key: 'responsible', label: '负责人', type: 'text', required: true, editable: true },
  { key: 'responsible_email', label: '负责人邮箱', type: 'text', required: false, editable: true },
  { key: 'maintenanceDate', label: '维护日期', type: 'date', required: false, editable: true },
  { key: 'nextCalibrationDate', label: '下次校正', type: 'date', required: false, editable: true },
  { key: 'lastCalibrationDate', label: '上次校正', type: 'date', required: false, editable: true },
  { key: 'notes', label: '备注', type: 'text', required: false, editable: true },
];

// dynamic column labels now come from DB schema (DB_COLUMN_LABELS) or useEquipmentTypes()

// ====== 动态列同步工具 ======

/** snake_case → camelCase */
export const snakeToCamel = (str: string): string =>
  str.replace(/_([a-z])/g, (_, c) => c.toUpperCase());

/** camelCase → snake_case */
export const camelToSnake = (str: string): string =>
  str.replace(/[A-Z]/g, c => '_' + c.toLowerCase());

/** snake_case 数据库列名 → 中文标签 */
export const DB_COLUMN_LABELS: Record<string, string> = {
  id: '仪器编号', name: '仪器名称', model: '型号',
  manufacturer: '厂商', type: '设备类型', status: '状态',
  location: '位置', responsible: '负责人',
  responsible_email: '负责人邮箱', serial_number: '序列号',
  asset_number: '资产编号', maintenance_date: '维护日期',
  next_calibration_date: '下次校正', calibration_date: '上次校正',
  image_url: '设备图片', sop_file_url: 'SOP文件',
  sop_file_name: 'SOP文件名', sop_files: 'SOP文件',
  notes: '备注', is_scrapped: '报废', scrapped_at: '报废时间',
  scrapped_by: '报废人', calibration_reminder_sent: '校正提醒',
  created_at: '创建时间', updated_at: '更新时间',
};

/** 推断列类型（用于内联编辑） */
export const inferColumnType = (camelKey: string): ColumnConfig['type'] => {
  if (camelKey === 'status') return 'status';
  if (camelKey === 'type') return 'equipment-type';
  if (camelKey === 'responsible') return 'text'; // 下拉在 InlineEditCell 处理
  const lower = camelKey.toLowerCase();
  if (lower.includes('date') || camelKey === 'scrappedAt' || camelKey === 'createdAt' || camelKey === 'updatedAt') return 'date';
  return 'text';
};

/** 从数据库列名列表自动构建列配置 */
export const buildColumnConfigs = (dbKeys: string[]): ColumnConfig[] => {
  return dbKeys
    .filter(k => !['created_at','updated_at','calibration_reminder_sent'].includes(k)) // 隐藏系统列
    .map(dbKey => {
      const camelKey = snakeToCamel(dbKey) as keyof Equipment;
      const label = DB_COLUMN_LABELS[dbKey] ?? dbKey;
      const type = inferColumnType(camelKey);
      return {
        key: camelKey,
        label,
        type,
        required: dbKey === 'id' || dbKey === 'name',
        editable: !['id','is_scrapped','scrapped_at','scrapped_by'].includes(dbKey),
      };
    });
};

// 获取所有可用列 — 支持动态传入，否则回退硬编码
export const getAllColumns = (dynamicKeys?: (keyof Equipment)[]): (keyof Equipment)[] => {
  if (dynamicKeys && dynamicKeys.length > 0) return dynamicKeys;
  return ['id', 'name', 'type', 'model', 'manufacturer', 'serialNumber', 'assetNumber', 'status', 'location', 'responsible', 'responsible_email', 'maintenanceDate', 'nextCalibrationDate', 'lastCalibrationDate', 'notes'];
};

// 获取列配置
export const getColumnConfigs = (customConfigs?: ColumnConfig[]): ColumnConfig[] => {
  return customConfigs || defaultColumnConfigs;
};

// export configs dynamically managed via TableConfigModal
