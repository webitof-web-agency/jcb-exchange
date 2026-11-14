'use client';

import { useEffect, useRef, useState } from 'react';
import { Bot, ExternalLink, Loader2, Send, Sparkles, X } from 'lucide-react';
import api from '@/lib/api';

type AssistantMatch = {
  title: string;
  price: number;
  manufacturingYear: number | null;
  operatingHours: number | null;
  location: string | null;
  condition: string | null;
  category: string | null;
  brand: string | null;
  model: string | null;
  listingPath: string;
};

type AssistantReply = {
  message: string;
  mode?: 'SEARCH' | 'COMPARE' | 'RECOMMENDATION' | 'CLARIFICATION';
  nextQuestion?: string;
  matches?: AssistantMatch[];
  found?: boolean;
  handoffRecommended?: boolean;
  sources?: Array<{
    title: string;
    category: string;
    content: string;
    sourceUrl: string | null;
  }>;
};

type ConversationMessage = {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  matches?: AssistantMatch[];
  sources?: AssistantReply['sources'];
};

const formatPrice = (value: number) => new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  maximumFractionDigits: 0,
}).format(value);

const starter: ConversationMessage = {
  id: 'welcome',
  role: 'assistant',
  content: 'Namaste! Aap machine ka model, budget, year ya location bataiye. Main live marketplace me matching machines dhoondhunga.',
};

export default function PublicAiAssistant() {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [messages, setMessages] = useState<ConversationMessage[]>([starter]);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open) endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }, [messages, open]);

  const submit = async (event?: React.FormEvent) => {
    event?.preventDefault();
    const message = draft.trim();
    if (!message || loading) return;
    setDraft('');
    setError(null);
    setMessages((current) => [...current, { id: `user-${Date.now()}`, role: 'user', content: message }]);
    setLoading(true);
    try {
      const isSupportQuestion = /\b(?:support|policy|faq|kyc|rto|payment|account|help|how\s+(?:do|can)\s+i|document|verification)\b/iu.test(message);
      const endpoint = isSupportQuestion ? '/public/ai/support' : '/public/ai/buyer-search';
      const response = await api.post<{ success: boolean; assistant: AssistantReply }>(endpoint, { message });
      const reply = response.data.assistant;
      setMessages((current) => [...current, {
        id: `assistant-${Date.now()}`,
        role: 'assistant',
        content: reply.nextQuestion ? `${reply.message} ${reply.nextQuestion}` : reply.message,
        matches: reply.matches,
        sources: reply.sources,
      }]);
    } catch (requestError) {
      const responseMessage = (requestError as { response?: { data?: { error?: string } } }).response?.data?.error;
      setError(responseMessage || 'Assistant is temporarily unavailable. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      {open ? (
        <section
          className="fixed bottom-24 right-4 z-[100] flex h-[min(680px,calc(100vh-7rem))] w-[min(420px,calc(100vw-2rem))] flex-col overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-2xl"
          role="dialog"
          aria-modal="false"
          aria-label="JCB Exchange machine assistant"
        >
          <header className="flex items-center justify-between bg-slate-950 px-5 py-4 text-white">
            <div className="flex items-center gap-3">
              <span className="grid h-10 w-10 place-items-center rounded-2xl bg-amber-400 text-slate-950"><Sparkles className="h-5 w-5" /></span>
              <div>
                <h2 className="text-sm font-bold">JCB Machine Assistant</h2>
                <p className="text-xs text-slate-300">Live marketplace search</p>
              </div>
            </div>
            <button type="button" onClick={() => setOpen(false)} className="rounded-full p-2 text-slate-300 transition hover:bg-white/10 hover:text-white" aria-label="Close assistant">
              <X className="h-5 w-5" />
            </button>
          </header>

          <div className="min-h-0 flex-1 space-y-4 overflow-y-auto bg-slate-50 p-4" aria-live="polite">
            {messages.map((message) => (
              <div key={message.id} className={message.role === 'user' ? 'ml-8' : 'mr-4'}>
                <div className={message.role === 'user' ? 'rounded-2xl rounded-br-md bg-slate-900 px-4 py-3 text-sm text-white' : 'rounded-2xl rounded-bl-md border border-slate-200 bg-white px-4 py-3 text-sm leading-6 text-slate-700'}>
                  {message.role === 'assistant' ? <Bot className="mb-1 mr-1 inline h-4 w-4 text-amber-500" /> : null}
                  {message.content}
                </div>
                {message.matches?.length ? (
                  <div className="mt-2 space-y-2">
                    {message.matches.map((match) => (
                      <a key={`${match.listingPath}-${match.title}`} href={match.listingPath} className="block rounded-2xl border border-slate-200 bg-white p-3 transition hover:border-amber-400 hover:shadow-sm">
                        <div className="flex items-start justify-between gap-2">
                          <p className="text-sm font-bold text-slate-900">{match.title}</p>
                          <ExternalLink className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
                        </div>
                        <p className="mt-1 text-sm font-semibold text-amber-700">{formatPrice(match.price)}</p>
                        <p className="mt-1 text-xs text-slate-500">{[match.manufacturingYear, match.operatingHours ? `${match.operatingHours.toLocaleString('en-IN')} hrs` : null, match.location].filter(Boolean).join(' · ')}</p>
                      </a>
                    ))}
                  </div>
                ) : null}
                {message.sources?.length ? (
                  <div className="mt-2 space-y-2">
                    {message.sources.map((source) => (
                      <article key={`${source.category}-${source.title}`} className="rounded-2xl border border-slate-200 bg-white p-3 text-xs text-slate-600">
                        <div className="flex items-start justify-between gap-2">
                          <p className="font-bold text-slate-900">{source.title}</p>
                          {source.sourceUrl ? <a href={source.sourceUrl} target="_blank" rel="noreferrer" className="shrink-0 text-amber-700 underline">Source</a> : null}
                        </div>
                        <p className="mt-1 whitespace-pre-wrap leading-5">{source.content}</p>
                      </article>
                    ))}
                  </div>
                ) : null}
              </div>
            ))}
            {loading ? <div className="mr-16 rounded-2xl rounded-bl-md border border-slate-200 bg-white px-4 py-3 text-sm text-slate-500"><Loader2 className="mr-2 inline h-4 w-4 animate-spin" />Live listings check kar raha hoon…</div> : null}
            {error ? <p className="rounded-xl bg-red-50 px-3 py-2 text-xs text-red-700">{error}</p> : null}
            <div ref={endRef} />
          </div>

          <form onSubmit={submit} className="border-t border-slate-200 bg-white p-3">
            <div className="flex items-end gap-2 rounded-2xl border border-slate-300 bg-slate-50 p-2 focus-within:border-amber-400 focus-within:ring-2 focus-within:ring-amber-100">
              <textarea value={draft} onChange={(event) => setDraft(event.target.value.slice(0, 800))} onKeyDown={(event) => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); void submit(); } }} rows={2} placeholder="e.g. 2021 ke baad JCB 3DX, 30 lakh ke andar Gujarat me" className="min-h-10 flex-1 resize-none bg-transparent px-2 py-1 text-sm text-slate-900 outline-none placeholder:text-slate-400" aria-label="Describe the machine you need" />
              <button type="submit" disabled={loading || !draft.trim()} className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-amber-400 text-slate-950 transition hover:bg-amber-300 disabled:cursor-not-allowed disabled:opacity-50" aria-label="Search machines">
                <Send className="h-4 w-4" />
              </button>
            </div>
            <p className="mt-2 text-[11px] text-slate-400">Only public marketplace information is used. Prices are indicative marketplace prices.</p>
          </form>
        </section>
      ) : null}

      <button type="button" onClick={() => setOpen((current) => !current)} className="fixed bottom-5 right-5 z-[99] flex items-center gap-2 rounded-full bg-slate-950 px-4 py-3 text-sm font-bold text-white shadow-xl transition hover:bg-slate-800" aria-label={open ? 'Close machine assistant' : 'Open machine assistant'}>
        {open ? <X className="h-5 w-5" /> : <Sparkles className="h-5 w-5 text-amber-300" />}
        <span className="hidden sm:inline">{open ? 'Close' : 'Ask AI'}</span>
      </button>
    </>
  );
}
