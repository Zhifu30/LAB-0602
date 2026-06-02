import { useState, useRef, useEffect } from 'react';
import { Bot, Send, X, MessageSquare, Search, BarChart3, FileText, Trash2, Minimize2, Maximize2, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useAI } from '@/hooks/useAI';
import { useEquipment } from '@/hooks/useEquipment';
import { cn } from '@/lib/utils';
import ReactMarkdown from 'react-markdown';

interface AIAssistantProps { isOpen: boolean; onClose: () => void; }

export function AIAssistant({ isOpen, onClose }: AIAssistantProps) {
  const [input, setInput] = useState('');
  const [activeTab, setActiveTab] = useState<'chat' | 'search' | 'analyze' | 'organize'>('chat');
  const [isMinimized, setIsMinimized] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const { messages, isLoading, sendMessage, clearMessages, searchWithAI, analyzeWithAI, organizeWithAI } = useAI();
  const { equipment } = useEquipment();

  useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isLoading) return;
    const context = { equipments: equipment };
    const message = input; setInput('');
    switch (activeTab) {
      case 'search': await searchWithAI(message, context); break;
      case 'analyze': await analyzeWithAI(context, message); break;
      case 'organize': await organizeWithAI(context, message); break;
      default: await sendMessage(message, 'chat', context); break;
    }
  };

  const getPlaceholder = () => {
    switch (activeTab) {
      case 'search': return '搜索设备、配件或维护记录...';
      case 'analyze': return '输入分析需求...';
      case 'organize': return '输入整理需求...';
      default: return '输入问题或指令...';
    }
  };

  if (!isOpen) return null;

  return (
    <div className={cn("fixed bottom-4 right-4 bg-background border rounded-xl shadow-2xl z-50 transition-all", isMinimized ? "w-72 h-14" : "w-[420px] h-[600px]")}>
      <div className="flex items-center justify-between px-4 py-3 border-b bg-gradient-to-r from-primary/10 to-primary/5 rounded-t-xl">
        <div className="flex items-center gap-2"><div className="h-8 w-8 rounded-lg bg-primary/20 flex items-center justify-center"><Sparkles className="h-4 w-4 text-primary" /></div><div><h3 className="font-semibold text-sm">AI 智能助手</h3>{!isMinimized && <p className="text-[10px] text-muted-foreground">Powered by DeepSeek</p>}</div></div>
        <div className="flex items-center gap-1">
          {!isMinimized && messages.length > 0 && <Button variant="ghost" size="icon" className="h-7 w-7" onClick={clearMessages}><Trash2 className="h-3.5 w-3.5" /></Button>}
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setIsMinimized(!isMinimized)}>{isMinimized ? <Maximize2 className="h-3.5 w-3.5" /> : <Minimize2 className="h-3.5 w-3.5" />}</Button>
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onClose}><X className="h-3.5 w-3.5" /></Button>
        </div>
      </div>
      {!isMinimized && (
        <>
          <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as any)} className="px-3 pt-2">
            <TabsList className="grid w-full grid-cols-4 h-8">
              <TabsTrigger value="chat" className="text-xs gap-1"><MessageSquare className="h-3 w-3" />对话</TabsTrigger>
              <TabsTrigger value="search" className="text-xs gap-1"><Search className="h-3 w-3" />搜索</TabsTrigger>
              <TabsTrigger value="analyze" className="text-xs gap-1"><BarChart3 className="h-3 w-3" />分析</TabsTrigger>
              <TabsTrigger value="organize" className="text-xs gap-1"><FileText className="h-3 w-3" />整理</TabsTrigger>
            </TabsList>
          </Tabs>
          <ScrollArea className="flex-1 h-[420px] px-3 py-2">
            {messages.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-center px-4">
                <div className="h-16 w-16 rounded-full bg-primary/10 flex items-center justify-center mb-4"><Bot className="h-8 w-8 text-primary" /></div>
                <h4 className="font-medium mb-2">欢迎使用 AI 助手</h4>
                <p className="text-sm text-muted-foreground mb-4">我可以帮助您查询设备信息、分析维护数据</p>
                <div className="grid grid-cols-2 gap-2 w-full">
                  <Button variant="outline" size="sm" className="text-xs h-auto py-2 px-3" onClick={() => { setInput('显示所有需要维护的设备'); setActiveTab('search'); }}>🔍 查询待维护设备</Button>
                  <Button variant="outline" size="sm" className="text-xs h-auto py-2 px-3" onClick={() => { setInput('分析本月维护情况'); setActiveTab('analyze'); }}>📊 分析维护情况</Button>
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                {messages.map((message: any) => (
                  <div key={message.id} className={cn("flex gap-2", message.role === 'user' ? "justify-end" : "justify-start")}>
                    {message.role === 'assistant' && <div className="h-6 w-6 rounded-full bg-primary/20 flex-shrink-0 flex items-center justify-center"><Bot className="h-3.5 w-3.5 text-primary" /></div>}
                    <div className={cn("max-w-[85%] rounded-lg px-3 py-2 text-sm", message.role === 'user' ? "bg-primary text-primary-foreground" : "bg-muted")}>
                      {message.role === 'assistant' ? <div className="prose prose-sm dark:prose-invert max-w-none"><ReactMarkdown>{message.content}</ReactMarkdown></div> : message.content}
                      {message.action && <Badge variant="secondary" className="mt-1 text-[10px]">{message.action}</Badge>}
                    </div>
                  </div>
                ))}
                {isLoading && <div className="flex gap-2"><div className="h-6 w-6 rounded-full bg-primary/20 flex items-center justify-center"><Bot className="h-3.5 w-3.5 text-primary animate-pulse" /></div><div className="bg-muted rounded-lg px-3 py-2"><div className="flex gap-1"><div className="w-2 h-2 bg-primary/50 rounded-full animate-bounce" /></div></div></div>}
                <div ref={messagesEndRef} />
              </div>
            )}
          </ScrollArea>
          <form onSubmit={handleSubmit} className="p-3 border-t">
            <div className="flex gap-2"><Input value={input} onChange={(e) => setInput(e.target.value)} placeholder={getPlaceholder()} disabled={isLoading} className="flex-1 h-9 text-sm" /><Button type="submit" size="sm" disabled={isLoading || !input.trim()} className="h-9 px-3"><Send className="h-4 w-4" /></Button></div>
          </form>
        </>
      )}
    </div>
  );
}
