import React, { useState, useRef, useCallback } from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { GripVertical } from 'lucide-react';
import { TableHead } from '@/components/ui/table';
import { Equipment } from '@/types/equipment';

interface ResizableTableHeaderProps {
  column: keyof Equipment;
  label: string;
  width: number;
  onResize: (column: keyof Equipment, width: number) => void;
  isDragging?: boolean;
}

const ResizableTableHeader: React.FC<ResizableTableHeaderProps> = ({
  column,
  label,
  width,
  onResize,
  isDragging
}) => {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
  } = useSortable({ id: column });

  const [isResizing, setIsResizing] = useState(false);
  const startXRef = useRef(0);
  const startWidthRef = useRef(0);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsResizing(true);
    startXRef.current = e.clientX;
    startWidthRef.current = width;

    const handleMouseMove = (moveEvent: MouseEvent) => {
      const diff = moveEvent.clientX - startXRef.current;
      const newWidth = Math.max(80, startWidthRef.current + diff);
      onResize(column, newWidth);
    };

    const handleMouseUp = () => {
      setIsResizing(false);
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  }, [column, width, onResize]);

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    width: `${width}px`,
    minWidth: `${width}px`,
    maxWidth: `${width}px`,
  };

  return (
    <TableHead
      ref={setNodeRef}
      style={style}
      className={`relative select-none whitespace-nowrap group ${
        isDragging ? 'opacity-50 bg-primary/10' : ''
      } ${isResizing ? 'cursor-col-resize' : ''}`}
    >
      <div className="flex items-center gap-1">
        <span
          {...attributes}
          {...listeners}
          className="cursor-grab active:cursor-grabbing p-1 hover:bg-muted rounded opacity-0 group-hover:opacity-100 transition-opacity"
        >
          <GripVertical className="h-3 w-3 text-muted-foreground" />
        </span>
        <span className="truncate">{label}</span>
      </div>
      
      {/* 调整宽度的拖拽条 */}
      <div
        className={`absolute right-0 top-0 h-full w-1 cursor-col-resize hover:bg-primary/50 ${
          isResizing ? 'bg-primary' : 'bg-transparent'
        }`}
        onMouseDown={handleMouseDown}
      />
    </TableHead>
  );
};

export default ResizableTableHeader;
