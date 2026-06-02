import { useState, useRef, useEffect } from 'react';
import { SidebarProvider, SidebarInset, SidebarTrigger } from '@/components/ui/sidebar';
import { AppSidebar } from './AppSidebar';
import { AIAssistant } from './AIAssistant';
import { Button } from '@/components/ui/button';
import { Sparkles } from 'lucide-react';

interface AppLayoutProps { children: React.ReactNode; }

export function AppLayout({ children }: AppLayoutProps) {
  const [position, setPosition] = useState({ x: 16, y: 16 });
  const [isDragging, setIsDragging] = useState(false);
  const [aiAssistantOpen, setAiAssistantOpen] = useState(false);
  const dragRef = useRef<HTMLDivElement>(null);
  const offsetRef = useRef({ x: 0, y: 0 });

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isDragging) return;
      const maxX = window.innerWidth - 48, maxY = window.innerHeight - 48;
      setPosition({ x: Math.max(8, Math.min(e.clientX - offsetRef.current.x, maxX)), y: Math.max(8, Math.min(e.clientY - offsetRef.current.y, maxY)) });
    };
    if (isDragging) { document.addEventListener('mousemove', handleMouseMove); document.addEventListener('mouseup', () => setIsDragging(false)); }
    return () => { document.removeEventListener('mousemove', handleMouseMove); };
  }, [isDragging]);

  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full">
        <AppSidebar />
        <SidebarInset className="flex-1 relative">
          <div ref={dragRef} className="fixed z-50 select-none" style={{ left: position.x, top: position.y }}
            onMouseDown={(e) => { if (dragRef.current) { const r = dragRef.current.getBoundingClientRect(); offsetRef.current = { x: e.clientX - r.left, y: e.clientY - r.top }; setIsDragging(true); }}}>
            <SidebarTrigger className="h-12 w-12 rounded-2xl bg-gradient-to-br from-blue-500 to-teal-500 text-white border-0 shadow-lg hover:shadow-xl hover:scale-105 transition-all" />
          </div>
          {!aiAssistantOpen && (
            <Button onClick={() => setAiAssistantOpen(true)} className="fixed bottom-4 right-4 z-40 h-14 w-14 rounded-full bg-gradient-to-br from-violet-500 to-purple-600 text-white border-0 shadow-lg hover:shadow-xl hover:scale-105 transition-all">
              <Sparkles className="h-6 w-6" />
            </Button>
          )}
          <main className="flex-1">{children}</main>
        </SidebarInset>
      </div>
      <AIAssistant isOpen={aiAssistantOpen} onClose={() => setAiAssistantOpen(false)} />
    </SidebarProvider>
  );
}
