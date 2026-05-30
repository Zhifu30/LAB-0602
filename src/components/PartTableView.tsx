import React, { useState } from 'react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Part, partCategories } from '@/types/parts';
import { TrendingUp, TrendingDown, AlertTriangle, Package } from 'lucide-react';

interface PartTableViewProps {
  parts: Part[];
  onStockIn: (partId: string) => void;
  onStockOut: (partId: string) => void;
}

const PartTableView: React.FC<PartTableViewProps> = ({ parts, onStockIn, onStockOut }) => {
  const [sortField, setSortField] = useState<keyof Part>('name');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');

  const handleSort = (field: keyof Part) => {
    if (sortField === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('asc');
    }
  };

  const sortedParts = [...parts].sort((a, b) => {
    const aValue = a[sortField];
    const bValue = b[sortField];
    
    if (aValue === undefined || bValue === undefined) return 0;
    if (aValue < bValue) return sortDirection === 'asc' ? -1 : 1;
    if (aValue > bValue) return sortDirection === 'asc' ? 1 : -1;
    return 0;
  });

  const getStockStatus = (part: Part) => {
    if (part.remainingStock === 0) {
      return { status: 'out', color: 'bg-red-100 text-red-800 border-red-200', icon: AlertTriangle };
    } else if (part.remainingStock <= (part.minStockLevel || 0)) {
      return { status: 'low', color: 'bg-yellow-100 text-yellow-800 border-yellow-200', icon: AlertTriangle };
    } else {
      return { status: 'normal', color: 'bg-green-100 text-green-800 border-green-200', icon: Package };
    }
  };

  return (
    <div className="bg-white rounded-xl shadow-sm border overflow-hidden">
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow className="bg-slate-50">
              <TableHead 
                className="cursor-pointer hover:bg-slate-100 font-medium"
                onClick={() => handleSort('id')}
              >
                配件编号 {sortField === 'id' && (sortDirection === 'asc' ? '↑' : '↓')}
              </TableHead>
              <TableHead 
                className="cursor-pointer hover:bg-slate-100 font-medium"
                onClick={() => handleSort('name')}
              >
                配件名称 {sortField === 'name' && (sortDirection === 'asc' ? '↑' : '↓')}
              </TableHead>
              <TableHead className="font-medium">分类</TableHead>
              <TableHead className="font-medium">序列号</TableHead>
              <TableHead className="font-medium">Quantity per Vial</TableHead>
              <TableHead 
                className="cursor-pointer hover:bg-slate-100 font-medium"
                onClick={() => handleSort('remainingStock')}
              >
                库存状态 {sortField === 'remainingStock' && (sortDirection === 'asc' ? '↑' : '↓')}
              </TableHead>
              <TableHead className="font-medium">存放位置</TableHead>
              <TableHead 
                className="cursor-pointer hover:bg-slate-100 font-medium"
                onClick={() => handleSort('unitPrice')}
              >
                单价 {sortField === 'unitPrice' && (sortDirection === 'asc' ? '↑' : '↓')}
              </TableHead>
              <TableHead className="font-medium text-center">操作</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sortedParts.map((part) => {
              const stockStatus = getStockStatus(part);
              const Icon = stockStatus.icon;
              
              return (
                <TableRow key={part.id} className="hover:bg-slate-50">
                  <TableCell className="font-mono text-sm font-medium">
                    {part.id}
                  </TableCell>
                  <TableCell className="font-medium">
                    <div className="flex items-center gap-2">
                      {part.imageUrl && (
                        <img 
                          src={part.imageUrl} 
                          alt={part.name}
                          className="w-8 h-8 rounded object-cover"
                        />
                      )}
                      <div>
                        <div>{part.name}</div>
                        {part.description && (
                          <div className="text-xs text-slate-500 mt-1">{part.description}</div>
                        )}
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className="text-xs">
                      {partCategories[part.category as keyof typeof partCategories] || part.category}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-sm text-slate-600">
                    {part.serialNumber || '-'}
                  </TableCell>
                  <TableCell className="text-sm text-slate-600">
                    {part.quantityPerVial || 1}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <Icon className="h-4 w-4" />
                      <Badge className={stockStatus.color}>
                        {part.remainingStock}/{part.totalStock}
                      </Badge>
                      {stockStatus.status === 'out' && (
                        <span className="text-xs text-red-600 font-medium">缺货</span>
                      )}
                      {stockStatus.status === 'low' && (
                        <span className="text-xs text-yellow-600 font-medium">告急</span>
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="text-sm text-slate-600">
                    {part.location || '-'}
                  </TableCell>
                  <TableCell className="text-sm">
                    {part.unitPrice ? `¥${part.unitPrice.toFixed(2)}` : '-'}
                  </TableCell>
                  <TableCell>
                    <div className="flex gap-1">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => onStockIn(part.id)}
                        className="h-7 px-2 text-xs bg-green-50 hover:bg-green-100 border-green-200 text-green-700"
                      >
                        <TrendingUp className="h-3 w-3 mr-1" />
                        入库
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => onStockOut(part.id)}
                        disabled={part.remainingStock === 0}
                        className="h-7 px-2 text-xs bg-blue-50 hover:bg-blue-100 border-blue-200 text-blue-700 disabled:opacity-50"
                      >
                        <TrendingDown className="h-3 w-3 mr-1" />
                        出库
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
      
      {parts.length === 0 && (
        <div className="text-center py-12">
          <Package className="h-12 w-12 text-slate-300 mx-auto mb-4" />
          <p className="text-slate-500">暂无配件数据</p>
        </div>
      )}
    </div>
  );
};

export default PartTableView;