export interface Part {
  id: string;
  name: string;
  barcode: string;
  description?: string;
  category: string;
  supplier?: string;
  totalStock: number;
  remainingStock: number;
  unitPrice?: number;
  location?: string;
  minStockLevel?: number;
  serialNumber?: string;
  quantityPerVial?: number;
  imageUrl?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface PartTransaction {
  id: string;
  partId: string;
  type: 'in' | 'out';
  quantity: number;
  equipmentId?: string;
  userId: string;
  userName: string;
  signature?: string;
  notes?: string;
  transactionDate: string;
  createdAt?: string;
}

export interface PartUsage {
  id: string;
  partId: string;
  equipmentId: string;
  userId: string;
  userName: string;
  quantity: number;
  usageDate: string;
  signature?: string;
  notes?: string;
  createdAt?: string;
}

export const partCategories = {
  'filters': '过滤器',
  'sensors': '传感器',
  'cables': '电缆',
  'pumps': '泵',
  'valves': '阀门',
  'reagents': '试剂',
  'consumables': '耗材',
  'spare-parts': '备件',
  'tools': '工具',
  'other': '其他'
} as const;

export type PartCategory = keyof typeof partCategories;