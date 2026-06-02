import { useState, useCallback } from 'react';

interface AIMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  action?: string;
}

export function useAI() {
  const [messages, setMessages] = useState<AIMessage[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const callAI = async (prompt: string, systemContext: string): Promise<string> => {
    const apiKey = localStorage.getItem('ocr_llm_api_key');
    if (!apiKey) throw new Error('请先配置 AI API 密钥');

    const response = await fetch('https://api.deepseek.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: 'deepseek-chat',
        messages: [
          { role: 'system', content: systemContext },
          { role: 'user', content: prompt },
        ],
        temperature: 0.3,
        max_tokens: 2048,
      }),
    });

    if (!response.ok) throw new Error(`AI API 错误: ${response.status}`);
    const data = await response.json();
    return data.choices?.[0]?.message?.content || '';
  };

  const addMessage = (role: 'user' | 'assistant', content: string, action?: string) => {
    const msg: AIMessage = { id: Date.now().toString(), role, content, action };
    setMessages(prev => [...prev, msg]);
    return msg;
  };

  const sendMessage = useCallback(async (message: string, action: string, context?: any) => {
    addMessage('user', message, action);
    setIsLoading(true);
    try {
      const systemContext = JSON.stringify(context || {}, null, 2);
      const reply = await callAI(message, systemContext);
      addMessage('assistant', reply, action);
    } catch (err: any) {
      addMessage('assistant', `抱歉，AI 请求失败：${err.message}`);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const searchWithAI = useCallback(async (message: string, context?: any) => {
    addMessage('user', message, 'search');
    setIsLoading(true);
    try {
      const systemContext = `你是一个实验室设备搜索助手。根据以下数据回答问题：\n${JSON.stringify(context, null, 2)}`;
      const reply = await callAI(message, systemContext);
      addMessage('assistant', reply, 'search');
    } catch (err: any) {
      addMessage('assistant', `搜索失败：${err.message}`);
    } finally { setIsLoading(false); }
  }, []);

  const analyzeWithAI = useCallback(async (context: any, message: string) => {
    addMessage('user', message, 'analyze');
    setIsLoading(true);
    try {
      const systemContext = `你是一个实验室数据分析助手。分析以下数据并回答问题：\n${JSON.stringify(context, null, 2)}`;
      const reply = await callAI(message, systemContext);
      addMessage('assistant', reply, 'analyze');
    } catch (err: any) {
      addMessage('assistant', `分析失败：${err.message}`);
    } finally { setIsLoading(false); }
  }, []);

  const organizeWithAI = useCallback(async (context: any, message: string) => {
    addMessage('user', message, 'organize');
    setIsLoading(true);
    try {
      const systemContext = `你是一个实验室数据整理助手。根据以下数据生成报告：\n${JSON.stringify(context, null, 2)}`;
      const reply = await callAI(message, systemContext);
      addMessage('assistant', reply, 'organize');
    } catch (err: any) {
      addMessage('assistant', `整理失败：${err.message}`);
    } finally { setIsLoading(false); }
  }, []);

  const clearMessages = useCallback(() => setMessages([]), []);

  return { messages, isLoading, sendMessage, searchWithAI, analyzeWithAI, organizeWithAI, clearMessages };
}
