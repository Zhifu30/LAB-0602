import React from 'react';
import { X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface GlassModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  maxWidth?: string;
  className?: string;
}

const GlassModal: React.FC<GlassModalProps> = ({
  open, onClose, title, description, children, footer, maxWidth = 'max-w-md', className
}) => {
  if (!open) return null;
  return (
    <>
      <div className="fixed inset-0 z-[100] bg-black/20 backdrop-blur-sm pointer-events-none" />
      <div className={cn(
        "fixed left-[50%] top-[50%] z-[100] translate-x-[-50%] translate-y-[-50%] w-full",
        "bg-black/40 backdrop-blur-md border border-white/20 text-white rounded-lg p-6 shadow-lg",
        "max-h-[90vh] overflow-y-auto",
        maxWidth, className
      )}>
        <button className="absolute right-4 top-4 text-white/60 hover:text-white" onClick={onClose}>
          <X className="h-4 w-4" />
        </button>
        <div className="flex flex-col space-y-1.5 text-center sm:text-left mb-4">
          <h2 className="text-lg font-semibold leading-none tracking-tight">{title}</h2>
          {description && <p className="text-sm text-white/60">{description}</p>}
        </div>
        {children}
        {footer && (
          <div className="flex flex-col-reverse sm:flex-row sm:justify-end sm:space-x-2 mt-6">
            {footer}
          </div>
        )}
      </div>
    </>
  );
};

export default GlassModal;
