'use client';

import { useState } from 'react';
import axios from 'axios';
import { AlertCircle, CheckCircle2, Loader2, Sparkles } from 'lucide-react';
import api from '@/lib/api';
import {
  normalizeListingCopilotResult,
  type ListingAiAssistDraft,
  type ListingAiSuggestionPatch,
  type ListingCopilotResult,
} from '@/lib/listingAiAssist';

type ListingAiImproveBarProps = {
  draft: ListingAiAssistDraft;
  onApply: (patch: ListingAiSuggestionPatch) => void;
};

type ListingAiAssistResponse = {
  success?: boolean;
  copilot?: unknown;
  error?: string;
};

const getErrorMessage = (error: unknown) => {
  if (axios.isAxiosError(error)) {
    const responseError = error.response?.data as { error?: unknown } | undefined;
    if (typeof responseError?.error === 'string' && responseError.error.trim()) return responseError.error;
  }
  return error instanceof Error && error.message ? error.message : 'AI improvement is temporarily unavailable. Please try again.';
};

const warningClassName = {
  REQUIRED: 'border-red-200 bg-red-50 text-red-800',
  WARNING: 'border-amber-200 bg-amber-50 text-amber-800',
  INFO: 'border-sky-200 bg-sky-50 text-sky-800',
} as const;

export default function ListingAiImproveBar({ draft, onApply }: ListingAiImproveBarProps) {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ListingCopilotResult | null>(null);
  const [error, setError] = useState('');
  const [applied, setApplied] = useState('');

  const improveListing = async () => {
    setLoading(true);
    setError('');
    setApplied('');
    try {
      const response = await api.post<ListingAiAssistResponse>('/listings/ai-assist', draft);
      const normalized = normalizeListingCopilotResult(response.data.copilot);
      if (!normalized) throw new Error('AI returned an incomplete listing improvement response.');
      setResult(normalized);
    } catch (assistError) {
      setResult(null);
      setError(getErrorMessage(assistError));
    } finally {
      setLoading(false);
    }
  };

  const apply = (patch: ListingAiSuggestionPatch, label: string) => {
    onApply(patch);
    setApplied(label);
  };

  return (
    <section className="mb-4 rounded-xl border border-amber-200 bg-[#FFF9E8] px-3 py-2.5 shadow-2xs sm:px-4" aria-label="AI listing improvement">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-start gap-2.5 text-sm text-amber-900">
          <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" aria-hidden="true" />
          <div>
            <p className="font-medium">AI can improve your title, description and listing quality checklist.</p>
            <p className="mt-0.5 text-xs text-amber-800/80">Uses the details already entered in this form and never changes fields without your confirmation.</p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => void improveListing()}
          disabled={loading}
          aria-busy={loading}
          className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl bg-slate-950 px-4 py-2.5 text-sm font-bold text-white shadow-sm transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {loading ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Sparkles className="h-4 w-4 text-amber-300" aria-hidden="true" />}
          {loading ? 'Improving...' : 'Improve with AI'}
        </button>
      </div>

      {error ? (
        <div role="alert" className="mt-3 flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs font-medium text-red-700">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          <span>{error}</span>
        </div>
      ) : null}

      {result ? (
        <div className="mt-3 space-y-3 border-t border-amber-200 pt-3" aria-live="polite">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-xs font-bold text-slate-900">
              <CheckCircle2 className="h-4 w-4 text-emerald-600" aria-hidden="true" />
              Listing quality score: <span className="text-amber-700">{result.qualityScore}/100</span>
            </div>
            {result.priceGuidance ? <span className="text-[11px] font-medium text-slate-500">Based on {result.priceGuidance.comparableCount} comparable listing{result.priceGuidance.comparableCount === 1 ? '' : 's'}</span> : null}
          </div>

          {result.warnings.length ? (
            <div className="grid gap-1.5 sm:grid-cols-2">
              {result.warnings.map((warning) => (
                <div key={warning.code} className={`rounded-lg border px-2.5 py-2 text-xs ${warningClassName[warning.severity]}`}>
                  {warning.message}
                </div>
              ))}
            </div>
          ) : (
            <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-2.5 py-2 text-xs font-medium text-emerald-800">All current listing quality checks passed.</p>
          )}

          <div className="grid gap-2 md:grid-cols-2">
            <div className="rounded-lg border border-slate-200 bg-white p-2.5">
              <p className="text-[10px] font-bold uppercase tracking-wide text-slate-500">Suggested title</p>
              <p className="mt-1 text-xs font-semibold text-slate-900">{result.suggestedTitle}</p>
              <button type="button" onClick={() => apply({ title: result.suggestedTitle }, 'Title applied')} className="mt-2 rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs font-bold text-slate-700 transition hover:border-slate-950 hover:text-slate-950">Apply title</button>
            </div>
            <div className="rounded-lg border border-slate-200 bg-white p-2.5">
              <p className="text-[10px] font-bold uppercase tracking-wide text-slate-500">Suggested description</p>
              <p className="mt-1 line-clamp-3 text-xs text-slate-700">{result.suggestedDescription}</p>
              <button type="button" onClick={() => apply({ description: result.suggestedDescription }, 'Description applied')} className="mt-2 rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs font-bold text-slate-700 transition hover:border-slate-950 hover:text-slate-950">Apply description</button>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button type="button" onClick={() => apply({ title: result.suggestedTitle, description: result.suggestedDescription }, 'Title and description applied')} className="inline-flex items-center gap-1.5 rounded-lg bg-[#FFC107] px-3 py-2 text-xs font-bold text-slate-950 shadow-sm transition hover:bg-[#e5b100]">Apply both improvements</button>
            {applied ? <span className="text-xs font-semibold text-emerald-700" role="status">{applied}</span> : null}
          </div>
        </div>
      ) : null}
    </section>
  );
}
