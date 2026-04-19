'use client';

/**
 * مساعد رؤية — Roya Assistant (chat UI).
 *
 * Phase 1: context-aware Q&A over the platform. No tool execution yet; the
 * system prompt explicitly instructs the model not to fake tool calls.
 * History is kept client-side in state only (no DB persistence), so a page
 * reload starts a fresh conversation. DB persistence will land with the
 * Phase-2 tool catalogue.
 */

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import toast from 'react-hot-toast';
import { Loader2, Send, Sparkles, RotateCcw, ShieldCheck } from 'lucide-react';
import { useAuth } from '@/stores/auth';
import { agentApi } from '@/lib/api';
import { ROLE_LABELS } from '@/lib/utils';

interface Message {
  role: 'user' | 'assistant';
  content: string;
  at: number;
}

const SUGGESTIONS = [
  'ما هي المسارات التي أديرها؟',
  'لخّص أهم التحديات في منصة رؤية',
  'كيف أنشئ تقريراً جديداً؟',
  'ما الفرق بين مركز ذكاء التقارير والتقارير الذكية؟',
];

export default function AssistantPage() {
  const router = useRouter();
  const { user } = useAuth();
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState<Message[]>([]);
  const [sending, setSending] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Auto-scroll to newest message.
  useEffect(() => {
    scrollRef.current?.scrollTo({
      top: scrollRef.current.scrollHeight,
      behavior: 'smooth',
    });
  }, [messages, sending]);

  // Auto-focus textarea on mount.
  useEffect(() => {
    textareaRef.current?.focus();
  }, []);

  if (!user) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
      </div>
    );
  }

  async function handleSend(text?: string) {
    const content = (text ?? input).trim();
    if (!content || sending) return;

    const userMsg: Message = { role: 'user', content, at: Date.now() };
    const nextHistory = [...messages, userMsg];
    setMessages(nextHistory);
    setInput('');
    setSending(true);

    try {
      const { data } = await agentApi.chat(
        content,
        messages.map((m) => ({ role: m.role, content: m.content })),
      );
      setMessages([
        ...nextHistory,
        { role: 'assistant', content: data.reply, at: Date.now() },
      ]);
    } catch (e: any) {
      const status = e?.response?.status;
      if (status === 401) {
        toast.error('انتهت جلستك، يرجى إعادة تسجيل الدخول');
        router.push('/login');
      } else if (status === 429) {
        toast.error('تم تجاوز حد الطلبات، انتظر دقيقة ثم حاول');
      } else {
        toast.error(
          e?.response?.data?.message ||
            'تعذّر الاتصال بالمساعد. قد يكون مفتاح OpenAI غير مضبوط على الخادم.',
        );
      }
      // Revert the optimistic user message so the user can retry without dup.
      setMessages(messages);
      setInput(content);
    } finally {
      setSending(false);
    }
  }

  function handleReset() {
    if (messages.length === 0) return;
    if (!confirm('بدء محادثة جديدة؟ سيتم حذف السجل الحالي.')) return;
    setMessages([]);
  }

  return (
    <div className="flex flex-col h-[calc(100vh-120px)] gap-4" dir="rtl">
      {/* Header */}
      <div className="glass p-5 rounded-2xl border border-white/10 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-gradient-to-br from-violet-500/20 to-sky-500/20 border border-white/10">
            <Sparkles className="w-5 h-5 text-violet-300" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-white">مساعد رؤية</h1>
            <p className="text-xs text-gray-400 mt-0.5 flex items-center gap-2">
              <ShieldCheck className="w-3 h-3" />
              مرحباً {user.nameAr || user.name} · دورك: {ROLE_LABELS[user.role] || user.role}
            </p>
          </div>
        </div>
        {messages.length > 0 && (
          <button
            onClick={handleReset}
            className="px-3 py-2 text-xs rounded-xl bg-white/5 hover:bg-white/10 text-gray-300 flex items-center gap-1.5"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            محادثة جديدة
          </button>
        )}
      </div>

      {/* Messages */}
      <div
        ref={scrollRef}
        className="flex-1 glass rounded-2xl border border-white/10 p-5 overflow-y-auto"
      >
        {messages.length === 0 ? (
          <EmptyState onPick={(s) => handleSend(s)} disabled={sending} />
        ) : (
          <div className="space-y-4">
            {messages.map((m, i) => (
              <Bubble key={i} role={m.role} content={m.content} />
            ))}
            {sending && (
              <div className="flex items-center gap-2 text-gray-400 text-sm">
                <Loader2 className="w-4 h-4 animate-spin" />
                جارٍ التفكير...
              </div>
            )}
          </div>
        )}
      </div>

      {/* Composer */}
      <div className="glass rounded-2xl border border-white/10 p-3">
        <div className="flex items-end gap-2">
          <textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleSend();
              }
            }}
            placeholder="اكتب سؤالك... (Enter للإرسال، Shift+Enter لسطر جديد)"
            rows={2}
            disabled={sending}
            dir="auto"
            className="flex-1 bg-transparent border-0 resize-none text-sm text-gray-100 placeholder-gray-500 focus:outline-none px-2 py-1 min-h-[44px] max-h-[200px]"
          />
          <button
            onClick={() => handleSend()}
            disabled={!input.trim() || sending}
            className="p-3 rounded-xl bg-brand-500 hover:bg-brand-600 disabled:opacity-40 disabled:cursor-not-allowed text-white transition-colors"
            title="إرسال"
          >
            {sending ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Send className="w-4 h-4" />
            )}
          </button>
        </div>
        <p className="text-[10px] text-gray-500 mt-2 px-2">
          المساعد في المرحلة الأولى — يجيب اعتماداً على السياق ومعرفته بالمنصة، ولا ينفّذ أدوات حيّة بعد.
        </p>
      </div>
    </div>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────

function EmptyState({
  onPick,
  disabled,
}: {
  onPick: (s: string) => void;
  disabled: boolean;
}) {
  return (
    <div className="h-full flex flex-col items-center justify-center gap-6 text-center">
      <div className="p-4 rounded-2xl bg-gradient-to-br from-violet-500/20 to-sky-500/20 border border-white/10">
        <Sparkles className="w-8 h-8 text-violet-300" />
      </div>
      <div>
        <h2 className="text-lg font-semibold text-white mb-1">كيف يمكنني مساعدتك؟</h2>
        <p className="text-sm text-gray-400">ابدأ بسؤال أو اختر من الاقتراحات</p>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-2 max-w-2xl w-full">
        {SUGGESTIONS.map((s) => (
          <button
            key={s}
            onClick={() => onPick(s)}
            disabled={disabled}
            className="text-right px-4 py-3 rounded-xl border border-white/10 bg-white/[0.02] hover:bg-white/5 hover:border-white/20 text-sm text-gray-200 transition-colors disabled:opacity-50"
          >
            {s}
          </button>
        ))}
      </div>
    </div>
  );
}

function Bubble({ role, content }: { role: 'user' | 'assistant'; content: string }) {
  const isUser = role === 'user';
  return (
    <div className={`flex ${isUser ? 'justify-start' : 'justify-end'}`}>
      <div
        className={`rounded-2xl px-4 py-3 text-sm whitespace-pre-wrap max-w-[85%] leading-relaxed ${
          isUser
            ? 'bg-brand-500/20 border border-brand-500/30 text-white'
            : 'bg-white/5 border border-white/10 text-gray-100'
        }`}
        dir="auto"
      >
        {content}
      </div>
    </div>
  );
}
