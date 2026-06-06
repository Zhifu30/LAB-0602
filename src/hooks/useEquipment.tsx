import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Equipment, snakeToCamel, camelToSnake, buildColumnConfigs, ColumnConfig } from '@/types/equipment';
import { useToast } from '@/hooks/use-toast';

export const useEquipment = (includeScrapped = false) => {
  const [equipment, setEquipment] = useState<Equipment[]>([]);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  // === 动态 Schema 发现 ===
  const [tableSchema, setTableSchema] = useState<{
    dbColumns: string[];
    columnConfigs: ColumnConfig[];
    frontendColumns: (keyof Equipment)[];
  }>({ dbColumns: [], columnConfigs: [], frontendColumns: [] });

  useEffect(() => {
    supabase.from('equipment').select('*').limit(1).then(({ data }) => {
      if (data && data.length > 0) {
        const dbCols = Object.keys(data[0]);
        const configs = buildColumnConfigs(dbCols);
        const frontend = configs.map(c => c.key);
        setTableSchema({ dbColumns: dbCols, columnConfigs: configs, frontendColumns: frontend });
      }
    });
  }, []);

  /** 将前端 Equipment 对象转为数据库行（自动 snake_case + 过滤无效列） */
  const toDbRow = (obj: Partial<Equipment>): Record<string, any> => {
    const row: Record<string, any> = {};
    const uuidCols: string[] = []; // UUID 列（当前无）
    for (const [camelKey, value] of Object.entries(obj)) {
      const dbKey = camelToSnake(camelKey);
      if (tableSchema.dbColumns.length === 0 || tableSchema.dbColumns.includes(dbKey)) {
        const cleanValue = (value === '' && uuidCols.includes(dbKey)) ? null : (value ?? null);
        row[dbKey] = cleanValue;
      }
    }
    // 确保基本字段存在
    if (!row.id) row.id = obj.id;
    return row;
  };

  // 获取所有设备
  const fetchEquipment = async () => {
    try {
      setLoading(true);
      // 默认排除报废设备，includeScrapped=true 时包含所有设备
      let query = supabase
        .from('equipment')
        .select('*');
      if (!includeScrapped) {
        query = query.or('is_scrapped.eq.false,is_scrapped.is.null');
      }
      const { data, error } = await query.order('created_at', { ascending: false });

      if (error) {
        throw error;
      }

      // 动态映射：DB列自动转camelCase
      const uuidCols = ['scrapped_by'];
      const formattedData: Equipment[] = (data || []).map((item: any) => {
        const mapped: any = {};
        for (const dbKey of Object.keys(item)) {
          const value = item[dbKey];
          // UUID列保持 null，不放空字符串
          mapped[snakeToCamel(dbKey)] = (value === null && uuidCols.includes(dbKey)) ? null : (value ?? '');
        }
        // 兼容：description 和 notes 同源
        if (!mapped.description) mapped.description = mapped.notes || '';
        // 兼容：calibrationDate 遗留字段
        if (!mapped.calibrationDate) mapped.calibrationDate = mapped.nextCalibrationDate || mapped.calibrationDate || '';
        return mapped as Equipment;
      });

      setEquipment(formattedData);
    } catch (error) {
      console.error('Error fetching equipment:', error);
      toast({
        title: "加载失败",
        description: "无法加载设备数据",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  // 添加设备
  const addEquipment = async (newEquipment: Equipment) => {
    try {
      // 上传图片到 Supabase Storage（如果有的话）
      let imageUrl = newEquipment.imageUrl;
      if (newEquipment.imageUrl && newEquipment.imageUrl.startsWith('data:')) {
        imageUrl = await uploadImage(newEquipment.imageUrl, newEquipment.id);
      }

      // 上传SOP文件到 Supabase Storage（如果有的话）
      let sopFileUrl = newEquipment.sopFileUrl;
      if (newEquipment.sopFileUrl && newEquipment.sopFileUrl.startsWith('data:')) {
        sopFileUrl = await uploadSOPFile(newEquipment.sopFileUrl, newEquipment.sopFileName || 'sop.pdf');
      }

      const insertRow = toDbRow(newEquipment);
      if (imageUrl) insertRow.image_url = imageUrl;
      if (sopFileUrl) insertRow.sop_file_url = sopFileUrl;
      const { data, error } = await supabase
        .from('equipment')
        .insert([insertRow])
        .select()
        .single();

      if (error) {
        throw error;
      }

      toast({
        title: "添加成功",
        description: "设备已成功添加到数据库",
      });

      // 重新获取数据
      await fetchEquipment();
      return data;
    } catch (error) {
      console.error('Error adding equipment:', error);
      toast({
        title: "添加失败",
        description: "无法添加设备到数据库",
        variant: "destructive",
      });
      throw error;
    }
  };

  // 更新设备
  const updateEquipment = async (id: string, updates: Partial<Equipment>) => {
    try {
      // 处理图片上传
      let imageUrl = updates.imageUrl;
      if (updates.imageUrl && updates.imageUrl.startsWith('data:')) {
        imageUrl = await uploadImage(updates.imageUrl, id);
      }

      // 处理SOP文件上传
      let sopFileUrl = updates.sopFileUrl;
      if (updates.sopFileUrl && updates.sopFileUrl.startsWith('data:')) {
        sopFileUrl = await uploadSOPFile(updates.sopFileUrl, updates.sopFileName || 'sop.pdf');
      }

      const updateRow = toDbRow(updates);
      if (imageUrl) updateRow.image_url = imageUrl;
      if (sopFileUrl) updateRow.sop_file_url = sopFileUrl;
      console.log('🔧 UPDATE id:', id, 'row:', JSON.stringify(updateRow));
      const { data: updatedData, error } = await supabase
        .from('equipment')
        .update(updateRow)
        .eq('id', id)
        .select();
      console.log('🔧 RESULT:', error ? error.message : 'OK', updatedData);

      if (error) {
        throw error;
      }

      toast({
        title: "更新成功",
        description: "设备信息已更新",
      });

      // 重新获取数据
      await fetchEquipment();
    } catch (error) {
      console.error('Error updating equipment:', error);
      toast({
        title: "更新失败",
        description: "无法更新设备信息",
        variant: "destructive",
      });
      throw error;
    }
  };

  // 删除设备
  const deleteEquipment = async (id: string) => {
    try {
      const { error } = await supabase
        .from('equipment')
        .delete()
        .eq('id', id);

      if (error) {
        throw error;
      }

      toast({
        title: "删除成功",
        description: "设备已从数据库中删除",
      });

      // 重新获取数据
      await fetchEquipment();
    } catch (error) {
      console.error('Error deleting equipment:', error);
      toast({
        title: "删除失败",
        description: "无法删除设备",
        variant: "destructive",
      });
      throw error;
    }
  };

  // 上传图片到 Supabase Storage
  const uploadImage = async (imageData: string, equipmentId: string): Promise<string> => {
    try {
      // 将 base64 转换为 blob
      const response = await fetch(imageData);
      const blob = await response.blob();
      
      const fileName = `${equipmentId}_${Date.now()}.jpg`;
      const { data, error } = await supabase.storage
        .from('equipment-images')
        .upload(fileName, blob, {
          contentType: 'image/jpeg',
          upsert: true
        });

      if (error) {
        throw error;
      }

      // 获取公共URL
      const { data: urlData } = supabase.storage
        .from('equipment-images')
        .getPublicUrl(data.path);

      return urlData.publicUrl;
    } catch (error) {
      console.error('Error uploading image:', error);
      return imageData; // 如果上传失败，返回原始数据
    }
  };

  // 上传SOP文件到 Supabase Storage
  const uploadSOPFile = async (fileData: string, fileName: string): Promise<string> => {
    try {
      // 将 base64 转换为 blob
      const response = await fetch(fileData);
      const blob = await response.blob();
      
      const uniqueFileName = `${Date.now()}_${fileName}`;
      const { data, error } = await supabase.storage
        .from('sop-files')
        .upload(uniqueFileName, blob, {
          upsert: true
        });

      if (error) {
        throw error;
      }

      // 获取公共URL
      const { data: urlData } = supabase.storage
        .from('sop-files')
        .getPublicUrl(data.path);

      return urlData.publicUrl;
    } catch (error) {
      console.error('Error uploading SOP file:', error);
      return fileData; // 如果上传失败，返回原始数据
    }
  };

  // 批量导入设备
  const importEquipment = async (equipmentList: Equipment[]) => {
    try {
      console.log('开始批量导入设备:', equipmentList.length);
      
      // 获取现有设备ID列表
      const { data: existingEquipment } = await supabase
        .from('equipment')
        .select('id');
      
      const existingIds = new Set(existingEquipment?.map(eq => eq.id) || []);
      console.log('现有设备ID数量:', existingIds.size);
      
      // 创建一个Set来跟踪即将插入的ID，避免批次内重复
      const usedIds = new Set(existingIds);
      
      // 处理每个设备，确保ID唯一
      const processedEquipment = equipmentList.map((eq, index) => {
        let finalId = eq.id;
        
        // 如果ID为空、undefined或已存在，生成新ID
        if (!finalId || finalId.trim() === '' || usedIds.has(finalId)) {
          // 生成唯一ID直到不重复
          do {
            const timestamp = Date.now();
            const randomNum = Math.floor(Math.random() * 9999).toString().padStart(4, '0');
            finalId = `IMP-${timestamp}-${randomNum}`;
          } while (usedIds.has(finalId));
          
          console.log(`${eq.id ? '重复' : '空'}ID ${eq.id || '(空)'} 已更改为 ${finalId}`);
        }
        
        // 将新ID加入已使用列表
        usedIds.add(finalId);
        
        return {
          ...eq,
          id: finalId
        };
      });

      const insertData = processedEquipment.map(eq => toDbRow(eq));

      console.log('准备插入数据:', insertData);

      const { data, error } = await supabase
        .from('equipment')
        .insert(insertData)
        .select();

      if (error) {
        console.error('插入数据库失败:', error);
        throw error;
      }

      console.log('成功插入数据库:', data?.length);

      toast({
        title: "导入成功",
        description: `成功导入 ${processedEquipment.length} 台设备到数据库`,
      });

      // 重新获取数据
      await fetchEquipment();
      
      return data;
    } catch (error) {
      console.error('Error importing equipment:', error);
      toast({
        title: "导入失败",
        description: error instanceof Error ? error.message : "无法导入设备数据",
        variant: "destructive",
      });
      throw error;
    }
  };

  useEffect(() => {
    fetchEquipment();
  }, []);

  // 报废设备
  const scrapEquipment = async (id: string, reason: string) => {
    try {
      const { error } = await supabase
        .from('equipment')
        .update({
          is_scrapped: true,
          status: 'scrapped', // 同步设置状态为报废，兼容 status 字段过滤
          scrapped_at: new Date().toISOString(),
          scrapped_by: (await supabase.auth.getUser()).data.user?.id,
          type: null, // 自动解除类型关联，不再参与任何管理活动
          notes: reason
        })
        .eq('id', id);

      if (error) {
        throw error;
      }

      // 停用该设备的所有维护计划
      await supabase.from('maintenance_schedules').update({ is_active: false }).eq('equipment_id', id);

      toast({
        title: "设备已报废",
        description: "设备已标记为报废状态，相关维护计划已停用",
      });

      // 重新获取数据
      await fetchEquipment();
    } catch (error) {
      console.error('Error scrapping equipment:', error);
      toast({
        title: "报废失败",
        description: "无法标记设备为报废状态",
        variant: "destructive",
      });
      throw error;
    }
  };

  return {
    equipment,
    loading,
    tableSchema,
    addEquipment,
    updateEquipment,
    deleteEquipment,
    scrapEquipment,
    importEquipment,
    fetchEquipment
  };
};