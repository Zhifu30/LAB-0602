/**
 * useEquipmentTypes — 唯一数据源的设备类型列表
 * 直接从 equipment 表读取 DISTINCT type，不再依赖 localStorage 或 equipment_types
 */
import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';

interface EquipmentTypeOption {
  id: string;
  name: string;
}

/**
 * 获取所有设备类型。类型名以 equipment.type 为准（唯一数据源）。
 * templates 表只存共享资源（图片/SOP），不作为类型名权威来源。
 */
export function useEquipmentTypes() {
  const [types, setTypes] = useState<EquipmentTypeOption[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchTypes = useCallback(async () => {
    setLoading(true);
    try {
      // 从 equipment 表去重获取所有类型名（唯一数据源）
      const { data, error } = await supabase
        .from('equipment')
        .select('type')
        .not('type', 'is', null)
        .neq('type', '')
        .order('type');

      if (error) throw error;

      // 去重并转为选项列表
      const unique = [...new Set((data || []).map((r: any) => r.type).filter(Boolean))] as string[];
      const options: EquipmentTypeOption[] = unique.map((name, i) => ({
        id: `type_${i}`,
        name,
      }));
      setTypes(options);
    } catch (error) {
      console.error('Error fetching equipment types:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchTypes(); }, [fetchTypes]);

  return { types, loading, refetch: fetchTypes };
}

/**
 * 获取某个类型的共享资源（图片、SOP）
 * templates 表只用来存这些资源
 */
export async function fetchTypeResource(typeName: string): Promise<{
  sharedImageUrl: string | null;
  sharedSopFiles: { url: string; name: string }[] | null;
}> {
  const { data } = await supabase
    .from('equipment_types')
    .select('shared_image_url, shared_sop_files')
    .eq('equipment_type', typeName)
    .eq('model', '__TYPE__')
    .eq('manufacturer', '__TYPE__')
    .maybeSingle();

  return {
    sharedImageUrl: data?.shared_image_url || null,
    sharedSopFiles: (data?.shared_sop_files as any) || null,
  };
}
