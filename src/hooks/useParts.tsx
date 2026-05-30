import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Part, PartTransaction, PartUsage } from '@/types/parts';
import { toast } from 'sonner';

export const useParts = () => {
  const [parts, setParts] = useState<Part[]>([]);
  const [transactions, setTransactions] = useState<PartTransaction[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchParts = async () => {
    try {
      const { data, error } = await supabase
        .from('parts')
        .select('*')
        .order('name');
      
      if (error) throw error;
      
      const formattedParts: Part[] = (data || []).map(item => ({
        id: item.id,
        name: item.name,
        barcode: item.barcode,
        description: item.description,
        category: item.category,
        supplier: item.supplier,
        totalStock: item.total_stock,
        remainingStock: item.remaining_stock,
        unitPrice: item.unit_price,
        location: item.location,
        minStockLevel: item.min_stock_level,
        serialNumber: item.serial_number,
        quantityPerVial: item.quantity_per_vial,
        imageUrl: item.image_url,
        createdAt: item.created_at,
        updatedAt: item.updated_at
      }));
      
      setParts(formattedParts);
    } catch (error) {
      console.error('Error fetching parts:', error);
      toast.error('获取配件数据失败');
    }
  };

  const fetchTransactions = async () => {
    try {
      const { data, error } = await supabase
        .from('part_transactions')
        .select('*')
        .order('transaction_date', { ascending: false });
      
      if (error) throw error;
      
      const formattedTransactions: PartTransaction[] = (data || []).map(item => ({
        id: item.id,
        partId: item.part_id,
        type: item.type as 'in' | 'out',
        quantity: item.quantity,
        equipmentId: item.equipment_id,
        userId: item.user_id,
        userName: item.user_name,
        signature: item.signature,
        notes: item.notes,
        transactionDate: item.transaction_date,
        createdAt: item.created_at
      }));
      
      setTransactions(formattedTransactions);
    } catch (error) {
      console.error('Error fetching transactions:', error);
      toast.error('获取交易记录失败');
    }
  };

  const addPart = async (part: Omit<Part, 'createdAt' | 'updatedAt'>) => {
    try {
      const { data, error } = await supabase
        .from('parts')
        .insert([{
          id: part.id,
          name: part.name,
          barcode: part.barcode,
          description: part.description,
          category: part.category,
          supplier: part.supplier,
          total_stock: part.totalStock,
          remaining_stock: part.remainingStock,
          unit_price: part.unitPrice,
          location: part.location,
          min_stock_level: part.minStockLevel,
          serial_number: part.serialNumber,
          quantity_per_vial: part.quantityPerVial,
          image_url: part.imageUrl
        }])
        .select()
        .single();

      if (error) throw error;
      
      await fetchParts();
      toast.success('配件添加成功');
    } catch (error) {
      console.error('Error adding part:', error);
      toast.error('配件添加失败');
      throw error;
    }
  };

  const updatePartStock = async (partId: string, newStock: number) => {
    try {
      const { error } = await supabase
        .from('parts')
        .update({ remaining_stock: newStock })
        .eq('id', partId);

      if (error) throw error;
      
      await fetchParts();
    } catch (error) {
      console.error('Error updating part stock:', error);
      throw error;
    }
  };

  const addTransaction = async (transaction: Omit<PartTransaction, 'id' | 'createdAt'>) => {
    try {
      const { data, error } = await supabase
        .from('part_transactions')
        .insert([{
          part_id: transaction.partId,
          type: transaction.type,
          quantity: transaction.quantity,
          equipment_id: transaction.equipmentId,
          user_id: transaction.userId,
          user_name: transaction.userName,
          signature: transaction.signature,
          notes: transaction.notes,
          transaction_date: transaction.transactionDate
        }])
        .select()
        .single();

      if (error) throw error;

      // 更新库存
      const part = parts.find(p => p.id === transaction.partId);
      if (part) {
        const newStock = transaction.type === 'in' 
          ? part.remainingStock + transaction.quantity
          : part.remainingStock - transaction.quantity;
        
        if (newStock < 0) {
          throw new Error('库存不足');
        }
        
        await updatePartStock(transaction.partId, newStock);
      }
      
      await fetchTransactions();
      toast.success(transaction.type === 'in' ? '入库成功' : '出库成功');
    } catch (error) {
      console.error('Error adding transaction:', error);
      toast.error(error instanceof Error ? error.message : '操作失败');
      throw error;
    }
  };

  useEffect(() => {
    const loadData = async () => {
      setLoading(true);
      await Promise.all([fetchParts(), fetchTransactions()]);
      setLoading(false);
    };

    loadData();
  }, []);

  const addBatchParts = async (newParts: Omit<Part, 'createdAt' | 'updatedAt'>[]) => {
    try {
      const partsToInsert = newParts.map(part => ({
        id: part.id,
        name: part.name,
        barcode: part.barcode,
        description: part.description,
        category: part.category,
        supplier: part.supplier,
        total_stock: part.totalStock,
        remaining_stock: part.remainingStock,
        unit_price: part.unitPrice,
        location: part.location,
        min_stock_level: part.minStockLevel,
        serial_number: part.serialNumber,
        quantity_per_vial: part.quantityPerVial,
        image_url: part.imageUrl
      }));

      const { data, error } = await supabase
        .from('parts')
        .insert(partsToInsert)
        .select();

      if (error) throw error;
      
      await fetchParts();
      toast.success(`成功添加 ${newParts.length} 个配件`);
    } catch (error) {
      console.error('Error adding batch parts:', error);
      toast.error('批量添加配件失败');
      throw error;
    }
  };

  return {
    parts,
    transactions,
    loading,
    addPart,
    addBatchParts,
    addTransaction,
    fetchParts,
    fetchTransactions
  };
};