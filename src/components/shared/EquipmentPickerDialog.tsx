import React, { useMemo, useState } from 'react';
import { Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import GlassModal from '@/components/GlassModal';

export interface PickerItem {
  id: string;
  name: string;
  subtitle?: string;
  meta?: string;
  disabled?: boolean;
  badge?: string;
  badgeClassName?: string;
}

interface EquipmentPickerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  items: PickerItem[];
  selectedIds: Set<string>;
  onSelectionChange: (ids: Set<string>) => void;
  onConfirm: () => void | Promise<void>;
  confirmLabel?: string;
  searchable?: boolean;
  searchPlaceholder?: string;
  headerExtra?: React.ReactNode;
  footerExtra?: React.ReactNode;
  variant?: 'glass' | 'default';
  maxHeight?: string;
}

export const EquipmentPickerDialog: React.FC<EquipmentPickerDialogProps> = ({
  open,
  onOpenChange,
  title,
  description,
  items,
  selectedIds,
  onSelectionChange,
  onConfirm,
  confirmLabel = '确认',
  searchable = true,
  searchPlaceholder = '搜索设备 (名称/ID/型号)',
  headerExtra,
  footerExtra,
  variant = 'default',
  maxHeight = 'h-48',
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const filteredItems = useMemo(() => {
    if (!searchQuery.trim()) return items;
    const q = searchQuery.toLowerCase();
    return items.filter(
      (item) =>
        item.name.toLowerCase().includes(q) ||
        item.id.toLowerCase().includes(q) ||
        (item.subtitle && item.subtitle.toLowerCase().includes(q)),
    );
  }, [items, searchQuery]);

  const toggle = (id: string) => {
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    onSelectionChange(next);
  };

  const handleConfirm = async () => {
    setSubmitting(true);
    try {
      await onConfirm();
    } finally {
      setSubmitting(false);
    }
  };

  const listContent = (
    <>
      {searchable && variant === 'default' && (
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder={searchPlaceholder}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-8"
          />
        </div>
      )}
      {searchable && variant === 'glass' && (
        <div className="relative mb-2">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-white/50" />
          <Input
            placeholder={searchPlaceholder}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-8 bg-white/10 border-white/20 text-white placeholder:text-white/50"
          />
        </div>
      )}
      {headerExtra}
      <ScrollArea className={`${maxHeight} border ${variant === 'glass' ? 'border-white/20' : ''} rounded-md p-2`}>
        {filteredItems.length === 0 ? (
          <p className={`text-center text-sm p-4 ${variant === 'glass' ? 'text-white/60' : 'text-muted-foreground'}`}>
            {searchQuery ? '无匹配项' : '暂无数据'}
          </p>
        ) : (
          filteredItems.map((item) => (
            <div
              key={item.id}
              className={`flex items-center gap-2 p-1.5 rounded ${
                variant === 'glass' ? 'hover:bg-white/10' : 'hover:bg-muted/50 cursor-pointer'
              } ${item.disabled ? 'opacity-50' : ''}`}
              onClick={() => !item.disabled && toggle(item.id)}
            >
              <Checkbox
                id={`picker-${item.id}`}
                checked={selectedIds.has(item.id)}
                disabled={item.disabled}
                onCheckedChange={() => !item.disabled && toggle(item.id)}
              />
              <Label
                htmlFor={`picker-${item.id}`}
                className={`text-sm flex-1 cursor-pointer ${variant === 'glass' ? 'text-white' : ''}`}
              >
                <span className="font-medium">{item.name}</span>
                {item.subtitle && (
                  <span className={variant === 'glass' ? 'text-white/60 ml-2 text-xs' : 'text-muted-foreground ml-2 text-xs'}>
                    {item.subtitle}
                  </span>
                )}
                {item.meta && <span className="block text-xs text-muted-foreground mt-0.5">{item.meta}</span>}
                {item.badge && (
                  <span className={`ml-2 text-xs ${item.badgeClassName || (variant === 'glass' ? 'text-green-400' : 'text-green-600')}`}>
                    {item.badge}
                  </span>
                )}
              </Label>
            </div>
          ))
        )}
      </ScrollArea>
      {footerExtra}
    </>
  );

  const footer = (
    <>
      <Button
        variant="outline"
        className={variant === 'glass' ? 'bg-white/10 border-white/20 text-white hover:bg-white/20' : ''}
        onClick={() => onOpenChange(false)}
        disabled={submitting}
      >
        取消
      </Button>
      <Button onClick={handleConfirm} disabled={submitting || selectedIds.size === 0}>
        {submitting ? '处理中...' : confirmLabel}
      </Button>
    </>
  );

  if (variant === 'glass') {
    return (
      <GlassModal open={open} onClose={() => onOpenChange(false)} title={title} description={description} footer={footer}>
        {listContent}
      </GlassModal>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description && <DialogDescription>{description}</DialogDescription>}
        </DialogHeader>
        {listContent}
        <DialogFooter>{footer}</DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default EquipmentPickerDialog;
