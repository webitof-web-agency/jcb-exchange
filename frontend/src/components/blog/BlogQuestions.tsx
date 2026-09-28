'use client';

import { FormEvent, useEffect, useState } from 'react';
import {
  CheckCircle2,
  HelpCircle,
  Loader2,
  MessageSquare,
  Send,
  ShieldCheck,
  Sparkles,
  UserCheck,
} from 'lucide-react';
import { useAuthStore } from '@/store/authStore';
import api from '@/lib/api';

type BlogQuestion = {
  id: string;
  question: string;
  answer: string;
  answeredAt: string | null;
  createdAt: string;
};

const formatDate = (value: string) =>
  new Intl.DateTimeFormat('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(new Date(value));

const getErrorMessage = (error: unknown, fallback: string) => {
  const response = (error as { response?: { data?: { error?: string } } })?.response;
  return response?.data?.error || fallback;
};

export default function BlogQuestions({ slug }: { slug: string }) {
  const { hasHydrated, isAuthenticated, user, setAuthModalOpen } = useAuthStore();
  const [questions, setQuestions] = useState<BlogQuestion[]>([]);
  const [question, setQuestion] = useState('');
  const [loadedSlug, setLoadedSlug] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    api
      .get<{ data: BlogQuestion[] }>(`/blogs/${encodeURIComponent(slug)}/questions`)
      .then((response) => {
        if (!cancelled) {
          setQuestions(response.data.data || []);
          setLoadedSlug(slug);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setQuestions([]);
          setLoadedSlug(slug);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [slug]);

  const loading = loadedSlug !== slug;

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError('');

    if (!isAuthenticated) {
      setAuthModalOpen(true);
      return;
    }

    const trimmedQuestion = question.trim();
    if (trimmedQuestion.length < 10) {
      setError('Please write at least 10 characters so our experts can provide a helpful answer.');
      return;
    }

    setSubmitting(true);
    try {
      await api.post(`/blogs/${encodeURIComponent(slug)}/questions`, { question: trimmedQuestion });
      setQuestion('');
      setSubmitted(true);
    } catch (requestError) {
      setError(getErrorMessage(requestError, 'Unable to submit your question. Please try again.'));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <section id="community-questions" className="mt-16 scroll-mt-24 border-t border-gray-100 pt-12">
      {/* Section Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="inline-flex items-center gap-1.5 rounded-full bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-800 ring-1 ring-inset ring-amber-500/20">
            <Sparkles className="h-3.5 w-3.5 text-amber-600" />
            Community Q&amp;A
          </div>
          <h2 className="mt-3 text-2xl font-bold tracking-tight text-gray-900 sm:text-3xl">
            Ask a Question
          </h2>
          <p className="mt-1.5 max-w-xl text-sm leading-relaxed text-gray-500">
            Have questions about machines, maintenance, or applications? Ask our team of industry experts.
          </p>
        </div>
        <div className="flex items-center gap-2 self-start rounded-full bg-gray-50 px-3.5 py-1.5 text-xs font-medium text-gray-600 ring-1 ring-inset ring-gray-200/80 sm:self-auto">
          <ShieldCheck className="h-4 w-4 text-emerald-600" />
          <span>Verified Expert Responses</span>
        </div>
      </div>

      {/* Ask Question Box */}
      <div className="mt-8 overflow-hidden rounded-2xl border border-gray-200/80 bg-white shadow-xs transition-all hover:border-gray-300">
        {submitted ? (
          <div className="flex flex-col items-center justify-center p-8 text-center sm:p-10">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-emerald-100 text-emerald-600">
              <CheckCircle2 className="h-6 w-6" />
            </div>
            <h3 className="mt-3 text-lg font-bold text-gray-900">Question Submitted!</h3>
            <p className="mt-1 max-w-md text-sm text-gray-500">
              Thank you for asking. Our technical team will review your question and post an expert answer shortly.
            </p>
            <button
              type="button"
              onClick={() => setSubmitted(false)}
              className="mt-5 inline-flex items-center gap-1.5 text-xs font-bold text-amber-700 hover:text-amber-800 hover:underline"
            >
              Ask another question &rarr;
            </button>
          </div>
        ) : hasHydrated && isAuthenticated ? (
          <form onSubmit={handleSubmit} className="p-5 sm:p-6">
            <div className="mb-3 flex items-center gap-3">
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-amber-100 text-xs font-semibold text-amber-800">
                {(user?.name || user?.ownerName) ? (user?.name || user?.ownerName)!.charAt(0).toUpperCase() : 'U'}
              </div>
              <div>
                <p className="text-xs font-semibold text-gray-900">{user?.name || user?.ownerName || 'Community Member'}</p>
                <p className="text-[11px] text-gray-400">Ask a specific question about this article</p>
              </div>
            </div>

            <div className="group relative">
              <textarea
                id="blog-question"
                value={question}
                onChange={(event) => setQuestion(event.target.value)}
                maxLength={1000}
                rows={3}
                placeholder="Write your question here... e.g., Which machine is best for heavy excavation in muddy soil?"
                className="w-full resize-none rounded-xl border border-gray-200 bg-gray-50/50 px-4 py-3 text-sm leading-relaxed text-gray-900 outline-none transition-all placeholder:text-gray-400 focus:border-amber-500 focus:bg-white focus:ring-4 focus:ring-amber-500/10"
              />
            </div>

            <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <span className="text-xs text-gray-400">
                {question.length}/1000 · Questions are reviewed before publishing
              </span>
              <button
                type="submit"
                disabled={submitting || question.trim().length < 10}
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-amber-500 px-5 py-2.5 text-xs font-bold text-gray-950 shadow-xs transition-all hover:bg-amber-400 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50"
              >
                {submitting ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Send className="h-3.5 w-3.5" />
                )}
                {submitting ? 'Submitting...' : 'Post Question'}
              </button>
            </div>
            {error && (
              <p className="mt-2 text-xs font-medium text-red-600" role="alert">
                {error}
              </p>
            )}
          </form>
        ) : hasHydrated ? (
          <div className="flex flex-col items-center justify-between gap-4 p-6 sm:flex-row sm:p-7">
            <div className="flex items-center gap-3.5 text-left">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-50 text-amber-700">
                <HelpCircle className="h-5 w-5" />
              </div>
              <div>
                <h4 className="text-sm font-bold text-gray-900">Have a question about this guide?</h4>
                <p className="mt-0.5 text-xs text-gray-500">Sign in to submit your question and get expert answers.</p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setAuthModalOpen(true)}
              className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-gray-900 px-5 py-2.5 text-xs font-bold text-white shadow-xs transition-all hover:bg-gray-800 active:scale-[0.98] sm:w-auto"
            >
              <UserCheck className="h-3.5 w-3.5" />
              Sign in to Ask
            </button>
          </div>
        ) : (
          <div className="h-24 animate-pulse bg-gray-50/50" />
        )}
      </div>

      {/* Questions List */}
      <div className="mt-8">
        {loading ? (
          <div className="flex items-center justify-center gap-2 py-8 text-xs text-gray-400">
            <Loader2 className="h-4 w-4 animate-spin text-amber-500" />
            Loading community Q&amp;A...
          </div>
        ) : questions.length > 0 ? (
          <div className="space-y-4">
            <h3 className="text-xs font-bold uppercase tracking-wider text-gray-400">
              Answered Questions ({questions.length})
            </h3>
            {questions.map((item) => (
              <article
                key={item.id}
                className="group rounded-2xl border border-gray-200/80 bg-white p-5 shadow-xs transition-all hover:border-gray-300 sm:p-6"
              >
                {/* Question */}
                <div className="flex items-start gap-3">
                  <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-amber-50 text-xs font-bold text-amber-700">
                    Q
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline justify-between gap-2">
                      <p className="text-sm font-bold text-gray-900">{item.question}</p>
                      <span className="shrink-0 text-[11px] text-gray-400">{formatDate(item.createdAt)}</span>
                    </div>

                    {/* Answer Box */}
                    <div className="mt-4 rounded-xl border border-amber-200/60 bg-gradient-to-br from-amber-50/40 via-amber-50/10 to-transparent p-4">
                      <div className="flex items-center gap-2">
                        <span className="inline-flex items-center gap-1 rounded-md bg-amber-500/10 px-2 py-0.5 text-[10px] font-bold text-amber-800">
                          <ShieldCheck className="h-3 w-3 text-amber-600" />
                          JCB Exchange Expert Response
                        </span>
                        {item.answeredAt && (
                          <span className="text-[10px] text-gray-400">
                            • Answered {formatDate(item.answeredAt)}
                          </span>
                        )}
                      </div>
                      <p className="mt-2.5 whitespace-pre-line text-xs leading-relaxed text-gray-700">
                        {item.answer}
                      </p>
                    </div>
                  </div>
                </div>
              </article>
            ))}
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-gray-200 bg-gray-50/50 py-9 text-center">
            <MessageSquare className="h-8 w-8 text-gray-300" />
            <p className="mt-2 text-xs font-medium text-gray-500">No questions asked yet</p>
            <p className="mt-0.5 text-[11px] text-gray-400">Be the first to ask our experts about this article.</p>
          </div>
        )}
      </div>
    </section>
  );
}
