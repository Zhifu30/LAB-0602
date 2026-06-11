/**
 * useEquipmentTypes — 唯一数据源的设备类型列表
 * 从 equipment_templates 表读取类型定义（与 EquipmentTypeManager 数据源一致）。
 * 同时合并 equipment 表中的实际使用类型，确保不遗漏任何类型。
 */
import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';

interface EquipmentTypeOption {
  id: string;
  name: string;
}

const TYPE_SENTINEL = '__TYPE__';

/**
 * 获取所有设备类型。
 * 以 equipment_templates 表中 model/manufacturer = '__TYPE__' 的行为主数据源（设备类型管理），
 * 同时合并 equipment 表中实际使用的类型作为补充。
 */
export function useEquipmentTypes() {
  const [types, setTypes] = useState<EquipmentTypeOption[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchTypes = useCallback(async () => {
    setLoading(true);
    try {
      // 1. 从 equipment_templates 表获取类型定义（与 EquipmentTypeManager 同一数据源）
      const { data: templateTypes, error: templateError } = await supabase
        .from('equipment_templates')
        .select('equipment_type')
        .eq('model', TYPE_SENTINEL)
        .eq('manufacturer', TYPE_SENTINEL)
        .order('equipment_type');

      if (templateError) throw templateError;

      // 2. 从 equipment 表获取实际使用的类型（作为补充，避免遗漏）
      const { data: eqTypes, error: eqError } = await supabase
        .from('equipment')
        .select('type')
        .not('type', 'is', null)
        .neq('type', '')
        .order('type');

      if (eqError) throw eqError;

      // 合并两个来源，优先使用模板表定义的名称
      const templateNames = (templateTypes || []).map((r: any) => r.equipment_type).filter(Boolean) as string[];
      const eqNames = (eqTypes || []).map((r: any) => r.type).filter(Boolean) as string[];
      const allNames = [...new Set([...templateNames, ...eqNames])] as string[];

      const options: EquipmentTypeOption[] = allNames.map((name, i) => ({
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
    .from('equipment_templates')
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
