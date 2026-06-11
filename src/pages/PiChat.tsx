import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Send, Bot, User, Settings, Trash2, Plus, Download, Zap, Wrench, X, Check, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import { cn } from '@/lib/utils';

// Types
interface Message {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: number;
  tokens?: number;
}

interface ModelConfig {
  provider: string;
  model: string;
  apiKey: string;
  temperature: number;
  maxTokens: number;
}

interface SkillExtension {
  id: string;
  name: string;
  description: string;
  enabled: boolean;
  source: string;
}

interface TokenUsage {
  prompt: number;
  completion: number;
  total: number;
  cost: number;
}

interface ProviderDef {
  name: string;
  models: string[];
  endpoint: string;
  headers: (apiKey: string) => Record<string, string>;
  body: (model: string, messages: Message[], maxTokens: number, temperature: number) => any;
}

const providers: Record<string, ProviderDef> = {
  deepseek: {
    name: 'DeepSeek',
    models: ['deepseek-chat', 'deepseek-reasoner'],
    endpoint: 'https://api.deepseek.com/v1/chat/completions',
    headers: (key) => ({ 'Content-Type': 'application/json', 'Authorization': `Bearer ${key}` }),
    body: (m, msgs, mt, t) => ({
      model: m, messages: msgs.map(msg => ({ role: msg.role, content: msg.content })),
      max_tokens: mt, temperature: t, stream: true,
    }),
  },
  openai: {
    name: 'OpenAI',
    models: ['gpt-4o', 'gpt-4o-mini', 'o3-mini'],
    endpoint: 'https://api.openai.com/v1/chat/completions',
    headers: (key) => ({ 'Content-Type': 'application/json', 'Authorization': `Bearer ${key}` }),
    body: (m, msgs, mt, t) => ({
      model: m, messages: msgs.map(msg => ({ role: msg.role, content: msg.content })),
      max_tokens: mt, temperature: t, stream: true,
    }),
  },
  anthropic: {
    name: 'Anthropic',
    models: ['claude-sonnet-4-6', 'claude-opus-4-8', 'claude-haiku-4-5'],
    endpoint: 'https://api.anthropic.com/v1/messages',
    headers: (key) => ({ 'Content-Type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01' }),
    body: (m, msgs, mt, t) => ({
      model: m, max_tokens: mt, temperature: t, stream: true,
      system: msgs.filter(x => x.role === 'system').map(x => ({ type: 'text', text: x.content })),
      messages: msgs.filter(x => x.role !== 'system').map(msg => ({
        role: msg.role === 'assistant' ? 'assistant' : 'user',
        content: msg.content,
      })),
    }),
  },
  google: {
    name: 'Google',
    models: ['gemini-2.5-pro', 'gemini-2.5-flash'],
    endpoint: (m: string) => `https://generativelanguage.googleapis.com/v1beta/models/${m}:streamGenerateContent?alt=sse&key=`,
    headers: () => ({ 'Content-Type': 'application/json' }),
    body: (_m, msgs, mt, t) => ({
      contents: msgs.filter(x => x.role !== 'system').map(msg => ({
        role: msg.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: msg.content }],
      })),
      systemInstruction: msgs.filter(x => x.role === 'system').map(x => ({ parts: [{ text: x.content }] }))[0],
      generationConfig: { maxOutputTokens: mt, temperature: t },
    }),
  },
};

export default function PiChat() {
  // Chat state
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Model config
  const [config, setConfig] = useState<ModelConfig>(() => {
    const saved = localStorage.getItem('pi-chat-config');
    return saved ? JSON.parse(saved) : {
      provider: 'deepseek',
      model: 'deepseek-v4-pro',
      apiKey: '',
      temperature: 0.7,
      maxTokens: 4096,
    };
  });

  // Token usage
  const [tokenUsage, setTokenUsage] = useState<TokenUsage>(() => {
    const saved = localStorage.getItem('pi-chat-tokens');
    return saved ? JSON.parse(saved) : { prompt: 0, completion: 0, total: 0, cost: 0 };
  });

  // Skills/extensions
  const [skills, setSkills] = useState<SkillExtension[]>(() => {
    const saved = localStorage.getItem('pi-chat-skills');
    return saved ? JSON.parse(saved) : [
      { id: '1', name: '代码审查', description: 'Review code changes for bugs and improvements', enabled: true, source: 'builtin' },
      { id: '2', name: '安全审计', description: 'Security review of code changes', enabled: false, source: 'builtin' },
      { id: '3', name: '文档生成', description: 'Generate documentation from code', enabled: true, source: 'builtin' },
    ];
  });

  // Sidebar panels
  const [showSettings, setShowSettings] = useState(false);
  const [showSkills, setShowSkills] = useState(false);
  const [activeTab, setActiveTab] = useState<string>('chat');
  const [newSkillUrl, setNewSkillUrl] = useState('');
  const [newSkillName, setNewSkillName] = useState('');

  // Save to localStorage
  useEffect(() => { localStorage.setItem('pi-chat-config', JSON.stringify(config)); }, [config]);
  useEffect(() => { localStorage.setItem('pi-chat-tokens', JSON.stringify(tokenUsage)); }, [tokenUsage]);
  useEffect(() => { localStorage.setItem('pi-chat-skills', JSON.stringify(skills)); }, [skills]);

  // Auto-scroll
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  // Send message with real API streaming
  const handleSend = useCallback(async () => {
    const content = input.trim();
    if (!content || isStreaming) return;
    const provider = providers[config.provider];
    if (!provider) return;

    const userMsg: Message = {
      id: Date.now().toString(),
      role: 'user',
      content,
      timestamp: Date.now(),
    };

    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setIsStreaming(true);

    const assistantId = (Date.now() + 1).toString();
    const assistantMsg: Message = {
      id: assistantId,
      role: 'assistant',
      content: '',
      timestamp: Date.now(),
    };
    setMessages(prev => [...prev, assistantMsg]);

    try {
      const allMessages = messages.concat(userMsg);
      const endpoint = typeof provider.endpoint === 'function'
        ? provider.endpoint(config.model) + config.apiKey
        : provider.endpoint;
      const reqBody = provider.body(config.model, allMessages, config.maxTokens, config.temperature);
      const headers = provider.headers(config.apiKey);

      const response = await fetch(endpoint, {
        method: 'POST',
        headers,
        body: JSON.stringify(reqBody),
      });

      if (!response.ok) {
        const errText = await response.text();
        throw new Error(`${response.status}: ${errText.slice(0, 200)}`);
      }

      const reader = response.body?.getReader();
      if (!reader) throw new Error('No response stream');

      const decoder = new TextDecoder();
      let currentContent = '';
      let promptTokens = 0;
      let completionTokens = 0;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const text = decoder.decode(value, { stream: true });
        const lines = text.split('\n').filter(l => l.startsWith('data: '));

        for (const line of lines) {
          const json = line.slice(6);
          if (json === '[DONE]') continue;

          try {
            const data = JSON.parse(json);

            // OpenAI/DeepSeek format
            if (data.choices?.[0]?.delta?.content) {
              currentContent += data.choices[0].delta.content;
            }
            // Anthropic format
            if (data.type === 'content_block_delta' && data.delta?.text) {
              currentContent += data.delta.text;
            }
            // Google format
            if (data.candidates?.[0]?.content?.parts?.[0]?.text) {
              currentContent = data.candidates[0].content.parts[0].text;
            }

            // Usage info from final chunk
            if (data.usage) {
              promptTokens = data.usage.prompt_tokens || data.usage.input_tokens || 0;
              completionTokens = data.usage.completion_tokens || data.usage.output_tokens || 0;
            }

            setMessages(prev => prev.map(m =>
              m.id === assistantId ? { ...m, content: currentContent } : m
            ));
          } catch { /* skip malformed chunks */ }
        }
      }

      // Fallback token estimation
      if (!promptTokens) {
        promptTokens = allMessages.reduce((s, m) => s + m.content.length, 0) * 0.6;
        completionTokens = currentContent.length * 0.8;
      }

      // Cost calculation
      const costRates: Record<string, { prompt: number; completion: number }> = {
        'deepseek-chat': { prompt: 0.27, completion: 1.10 },
        'deepseek-reasoner': { prompt: 0.55, completion: 2.19 },
        'gpt-4o': { prompt: 2.50, completion: 10 },
        'gpt-4o-mini': { prompt: 0.15, completion: 0.60 },
        'claude-sonnet-4-6': { prompt: 3, completion: 15 },
        'claude-haiku-4-5': { prompt: 1, completion: 5 },
        'gemini-2.5-pro': { prompt: 1.25, completion: 10 },
        'gemini-2.5-flash': { prompt: 0.15, completion: 0.60 },
      };
      const rate = costRates[config.model] || { prompt: 1, completion: 5 };
      const cost = (promptTokens / 1_000_000) * rate.prompt + (completionTokens / 1_000_000) * rate.completion;

      setTokenUsage(prev => ({
        prompt: prev.prompt + promptTokens,
        completion: prev.completion + completionTokens,
        total: prev.total + promptTokens + completionTokens,
        cost: prev.cost + cost,
      }));
    } catch (err: any) {
      const errorMsg = err.message || 'Unknown error';
      setMessages(prev => prev.map(m =>
        m.id === assistantId ? { ...m, content: `❌ 出错: ${errorMsg}\n\n请检查 API Key 和网络连接` } : m
      ));
    } finally {
      setIsStreaming(false);
    }
  }, [input, isStreaming, config, messages]);

  // Keyboard shortcut
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const clearChat = () => setMessages([]);

  const toggleSkill = (id: string) => {
    setSkills(prev => prev.map(s => s.id === id ? { ...s, enabled: !s.enabled } : s));
  };

  const addSkill = () => {
    if (!newSkillName.trim()) return;
    const skill: SkillExtension = {
      id: Date.now().toString(),
      name: newSkillName.trim(),
      description: newSkillUrl.trim() || 'Custom extension',
      enabled: true,
      source: newSkillUrl.trim() || 'manual',
    };
    setSkills(prev => [...prev, skill]);
    setNewSkillName('');
    setNewSkillUrl('');
  };

  const removeSkill = (id: string) => {
    setSkills(prev => prev.filter(s => s.id !== id));
  };

  return (
    <div className="flex h-[calc(100vh-4rem)] gap-0">
      {/* Main Chat Area */}
      <div className={cn(
        "flex flex-col flex-1 min-w-0 transition-all duration-300",
        showSettings || showSkills ? 'mr-80' : ''
      )}>
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-2 border-b bg-card/50 shrink-0">
          <div className="flex items-center gap-3">
            <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-purple-500 to-blue-600 flex items-center justify-center">
              <Zap className="h-4 w-4 text-white" />
            </div>
            <div>
              <h2 className="text-sm font-semibold">Pi Chat</h2>
              <p className="text-xs text-muted-foreground">
                {providers[config.provider]?.name} · {config.model}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-1">
            <Badge variant="outline" className="text-xs">
              总计: {tokenUsage.total.toFixed(0)} tokens · ${tokenUsage.cost.toFixed(4)}
            </Badge>
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={clearChat} title="清空对话">
              <Trash2 className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className={cn("h-8 w-8", showSkills && "bg-purple-100 dark:bg-purple-900/30")}
              onClick={() => { setShowSkills(!showSkills); setShowSettings(false); }}
              title="技能扩展"
            >
              <Wrench className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className={cn("h-8 w-8", showSettings && "bg-blue-100 dark:bg-blue-900/30")}
              onClick={() => { setShowSettings(!showSettings); setShowSkills(false); }}
              title="模型配置"
            >
              <Settings className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* Messages */}
        <ScrollArea className="flex-1 p-4" ref={scrollRef}>
          {messages.length === 0 ? (
            <div className="flex items-center justify-center h-full">
              <div className="text-center space-y-3 max-w-md">
                <div className="h-16 w-16 rounded-2xl bg-gradient-to-br from-purple-500 to-blue-600 flex items-center justify-center mx-auto">
                  <Zap className="h-8 w-8 text-white" />
                </div>
                <h3 className="text-lg font-semibold">Pi Coding Assistant</h3>
                <p className="text-sm text-muted-foreground">
                  选择模型，配置技能，开始编程对话
                </p>
                <div className="flex flex-wrap gap-2 justify-center text-xs text-muted-foreground">
                  <Badge variant="secondary">Shift+Enter 换行</Badge>
                  <Badge variant="secondary">Enter 发送</Badge>
                  <Badge variant="secondary">支持流式响应</Badge>
                </div>
              </div>
            </div>
          ) : (
            <div className="space-y-4 max-w-3xl mx-auto">
              {messages.map(msg => (
                <div
                  key={msg.id}
                  className={cn(
                    "flex gap-3",
                    msg.role === 'user' ? 'justify-end' : 'justify-start'
                  )}
                >
                  {msg.role === 'assistant' && (
                    <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-purple-500 to-blue-600 flex items-center justify-center shrink-0 mt-1">
                      <Bot className="h-4 w-4 text-white" />
                    </div>
                  )}
                  <div className={cn(
                    "rounded-xl px-4 py-2.5 max-w-[80%]",
                    msg.role === 'user'
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-muted'
                  )}>
                    <div className="text-sm whitespace-pre-wrap break-words">
                      {msg.content}
                      {msg.role === 'assistant' && isStreaming && msg.content === messages[messages.length - 1]?.content && (
                        <span className="inline-block w-2 h-4 bg-current ml-0.5 animate-pulse" />
                      )}
                    </div>
                    {msg.tokens && (
                      <p className="text-[10px] opacity-50 mt-1">{msg.tokens} tokens</p>
                    )}
                  </div>
                  {msg.role === 'user' && (
                    <div className="h-8 w-8 rounded-lg bg-primary/20 flex items-center justify-center shrink-0 mt-1">
                      <User className="h-4 w-4" />
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </ScrollArea>

        {/* Input */}
        <div className="p-3 border-t bg-card/30 shrink-0">
          <div className="flex gap-2 max-w-3xl mx-auto">
            <Textarea
              ref={inputRef}
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="输入消息... (Enter 发送, Shift+Enter 换行)"
              className="min-h-[44px] max-h-[120px] resize-none"
              rows={1}
              disabled={isStreaming}
            />
            <Button
              onClick={handleSend}
              disabled={!input.trim() || isStreaming}
              size="icon"
              className="h-11 w-11 shrink-0"
            >
              <Send className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>

      {/* Settings Panel */}
      {showSettings && (
        <div className="w-80 border-l bg-card shrink-0 overflow-hidden flex flex-col">
          <div className="flex items-center justify-between px-4 py-3 border-b shrink-0">
            <h3 className="text-sm font-semibold flex items-center gap-2">
              <Settings className="h-4 w-4" />
              模型配置
            </h3>
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setShowSettings(false)}>
              <X className="h-4 w-4" />
            </Button>
          </div>
          <ScrollArea className="flex-1 p-4">
            <div className="space-y-4">
              {/* Provider */}
              <div className="space-y-2">
                <Label className="text-xs">提供商</Label>
                <Select value={config.provider} onValueChange={v => setConfig(prev => ({ ...prev, provider: v, model: providers[v]?.models[0] || '' }))}>
                  <SelectTrigger className="h-8 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(providers).map(([key, val]) => (
                      <SelectItem key={key} value={key}>{val.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Model */}
              <div className="space-y-2">
                <Label className="text-xs">模型</Label>
                <Select value={config.model} onValueChange={v => setConfig(prev => ({ ...prev, model: v }))}>
                  <SelectTrigger className="h-8 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {providers[config.provider]?.models.map(m => (
                      <SelectItem key={m} value={m}>{m}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* API Key */}
              <div className="space-y-2">
                <Label className="text-xs">API Key</Label>
                <Input
                  type="password"
                  value={config.apiKey}
                  onChange={e => setConfig(prev => ({ ...prev, apiKey: e.target.value }))}
                  placeholder="sk-..."
                  className="h-8 text-xs"
                />
              </div>

              {/* Temperature */}
              <div className="space-y-2">
                <div className="flex justify-between">
                  <Label className="text-xs">温度</Label>
                  <span className="text-xs text-muted-foreground">{config.temperature.toFixed(1)}</span>
                </div>
                <Slider
                  value={[config.temperature * 10]}
                  onValueChange={([v]) => setConfig(prev => ({ ...prev, temperature: v / 10 }))}
                  max={20}
                  step={1}
                  className="h-4"
                />
              </div>

              {/* Max Tokens */}
              <div className="space-y-2">
                <div className="flex justify-between">
                  <Label className="text-xs">最大 Tokens</Label>
                  <span className="text-xs text-muted-foreground">{config.maxTokens}</span>
                </div>
                <Slider
                  value={[config.maxTokens]}
                  onValueChange={([v]) => setConfig(prev => ({ ...prev, maxTokens: v }))}
                  min={256}
                  max={32768}
                  step={256}
                  className="h-4"
                />
              </div>
            </div>
          </ScrollArea>
        </div>
      )}

      {/* Skills Panel */}
      {showSkills && (
        <div className="w-80 border-l bg-card shrink-0 overflow-hidden flex flex-col">
          <div className="flex items-center justify-between px-4 py-3 border-b shrink-0">
            <h3 className="text-sm font-semibold flex items-center gap-2">
              <Wrench className="h-4 w-4" />
              技能扩展
            </h3>
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setShowSkills(false)}>
              <X className="h-4 w-4" />
            </Button>
          </div>
          <ScrollArea className="flex-1 p-4">
            <div className="space-y-3">
              {/* Add new skill */}
              <div className="space-y-2 p-3 border rounded-lg bg-muted/30">
                <Label className="text-xs font-medium">安装新扩展</Label>
                <Input
                  value={newSkillName}
                  onChange={e => setNewSkillName(e.target.value)}
                  placeholder="技能名称"
                  className="h-8 text-xs"
                />
                <Input
                  value={newSkillUrl}
                  onChange={e => setNewSkillUrl(e.target.value)}
                  placeholder="源地址 (URL 或 npm 包名)"
                  className="h-8 text-xs"
                />
                <Button size="sm" className="w-full h-7 text-xs" onClick={addSkill}>
                  <Download className="h-3 w-3 mr-1" />
                  安装
                </Button>
              </div>

              {/* Skill list */}
              <div className="space-y-2">
                <Label className="text-xs font-medium">已安装 ({skills.length})</Label>
                {skills.map(skill => (
                  <div key={skill.id} className="flex items-center justify-between p-2 border rounded-lg">
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium truncate">{skill.name}</p>
                      <p className="text-[10px] text-muted-foreground truncate">{skill.description}</p>
                      {skill.source !== 'builtin' && (
                        <Badge variant="outline" className="text-[9px] h-4 mt-0.5">{skill.source}</Badge>
                      )}
                    </div>
                    <div className="flex items-center gap-1 ml-2 shrink-0">
                      <Switch
                        checked={skill.enabled}
                        onCheckedChange={() => toggleSkill(skill.id)}
                        className="scale-75"
                      />
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6"
                        onClick={() => removeSkill(skill.id)}
                      >
                        <Trash2 className="h-3 w-3 text-muted-foreground" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </ScrollArea>
        </div>
      )}

      {/* Token Usage Footer */}
      <Card className="fixed bottom-16 right-4 w-48 shadow-lg border z-40">
        <CardContent className="p-3 space-y-1">
          <div className="flex justify-between text-[10px]">
            <span className="text-muted-foreground">Prompt</span>
            <span>{tokenUsage.prompt.toFixed(0)}</span>
          </div>
          <div className="flex justify-between text-[10px]">
            <span className="text-muted-foreground">Completion</span>
            <span>{tokenUsage.completion.toFixed(0)}</span>
          </div>
          <div className="flex justify-between text-[10px] font-semibold border-t pt-1">
            <span>总用量</span>
            <span>{tokenUsage.total.toFixed(0)}</span>
          </div>
          <div className="flex justify-between text-[10px] text-green-500 font-medium">
            <span>费用</span>
            <span>${tokenUsage.cost.toFixed(6)}</span>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

