import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Equipment } from '@/types/equipment';
import { mapEquipmentListFromDb } from '@/utils/equipmentMapper';

interface EquipmentContextType {
  equipment: Equipment[];
  loading: boolean;
  fetchEquipment: () => Promise<void>;
}

const EquipmentContext = createContext<EquipmentContextType>({ equipment: [], loading: true, fetchEquipment: async () => {} });

export const useSharedEquipment = () => useContext(EquipmentContext);

export const EquipmentProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [equipment, setEquipment] = useState<Equipment[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchEquipment = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.from('equipment').select('*').order('created_at', { ascending: false });
      if (error) throw error;
      try {
        setEquipment(mapEquipmentListFromDb(data || []));
      } catch (mapErr) {
        console.error('映射设备数据失败，回退到原始映射:', mapErr);
        // 回退：直接使用 snakeToCamel 映射
        const { snakeToCamel } = await import('@/types/equipment');
        const fallback = (data || []).map((item: any) => {
          const m: any = {};
          for (const k of Object.keys(item)) m[snakeToCamel(k)] = item[k] ?? '';
          if (!m.description) m.description = m.notes || '';
          m.calibrationDate = m.nextCalibrationDate || m.calibrationDate || '';
          return m as Equipment;
        });
        setEquipment(fallback);
      }
    } catch (err) { console.error('获取设备数据失败:', err);
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchEquipment(); }, [fetchEquipment]);

  // 监听全局刷新事件
  useEffect(() => {
    const handler = () => fetchEquipment();
    window.addEventListener('equipment-updated', handler);
    return () => window.removeEventListener('equipment-updated', handler);
  }, [fetchEquipment]);

  return (
    <EquipmentContext.Provider value={{ equipment, loading, fetchEquipment }}>
      {children}
    </EquipmentContext.Provider>
  );
};
