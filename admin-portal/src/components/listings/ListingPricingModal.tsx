'use client';

import { useMemo, useState } from 'react';
import axios from 'axios';
import { Check, IndianRupee, X } from 'lucide-react';
import api from '@/lib/api';
import {
  createEmptyExpenseBreakdown,
  normalizeExpenseBreakdown,
  SELL_ACCOUNT_EXPENSE_FIELDS,
  sumExpenseBreakdown,
} from '@/lib/sellAccountFinance.mjs';

export type ListingPricing = {
  sellerPrice: number;
  marginAmount: number;
  expenseAmount: number;
  expenseBreakdown: Record<string, number | string> | null;
  finalPrice: number;
};

type ExpenseKey = 'transport' | 'paperwork' | 'rtoWork' | 'other';
type ExpenseForm = Record<ExpenseKey, string> & { otherLabel: string };

type PricingListing = {
  id: string;
  title: string;
  price: string | number;
  dealer?: string;
  pricing?: ListingPricing | null;
};

const inr = (value: number) => `₹${Math.round(value).toLocaleString('en-IN')}`;
const digits = (value: string) => value.replace(/\D/g, '').slice(0, 10);
const asText = (value: unknown) => (Number(value) > 0 ? String(Math.round(Number(value))) : '');

const inputClass = 'h-9 w-full rounded-lg border border-gray-200 bg-[#F8FAFC] px-3 text-sm font-semibold text-gray-900 outline-none transition focus:border-[#FFC107]';

/**
 * Admin sets the JCB Exchange margin and expenses on a partner/customer listing.
 * Buyers see seller price + margin + expenses; the expenses are shown to them, the margin is not.
 * mode "approve" publishes the listing with this pricing; mode "edit" only changes the pricing.
 */
export default function ListingPricingModal({
  listing,
  mode,
  onClose,
  onSaved,
}: {
  listing: PricingListing;
  mode: 'approve' | 'edit';
  onClose: () => void;
  onSaved: (result: { message: string; listing: Record<string, unknown> }) => void;
}) {
  const sellerPrice = Number(listing.pricing?.sellerPrice ?? listing.price ?? 0) || 0;
  const [margin, setMargin] = useState(asText(listing.pricing?.marginAmount));
  const [expenses, setExpenses] = useState<ExpenseForm>(() => {
    const stored = normalizeExpenseBreakdown(listing.pricing?.expenseBreakdown) || {
      ...createEmptyExpenseBreakdown(),
      other: Number(listing.pricing?.expenseAmount || 0),
    };
    return {
      transport: asText(stored.transport),
      paperwork: asText(stored.paperwork),
      rtoWork: asText(stored.rtoWork),
      other: asText(stored.other),
      otherLabel: stored.otherLabel || '',
    };
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const expenseTotal = useMemo(() => sumExpenseBreakdown(expenses), [expenses]);
  const marginAmount = Number(margin || 0);
  const finalPrice = sellerPrice + marginAmount + expenseTotal;

  const submit = async () => {
    setSaving(true);
    setError('');
    const payload = {
      adminMarginAmount: marginAmount,
      adminExpenseBreakdown: {
        transport: Number(expenses.transport || 0),
        paperwork: Number(expenses.paperwork || 0),
        rtoWork: Number(expenses.rtoWork || 0),
        other: Number(expenses.other || 0),
        otherLabel: expenses.otherLabel.trim(),
      },
    };
    try {
      const response = mode === 'approve'
        ? await api.patch<{ listing: Record<string, unknown>; message: string }>(`/listings/${listing.id}/status`, { status: 'PUBLISHED', ...payload })
        : await api.patch<{ listing: Record<string, unknown>; message: string }>(`/listings/${listing.id}/pricing`, payload);
      onSaved({ message: response.data.message, listing: response.data.listing });
    } catch (saveError) {
      setError(
        axios.isAxiosError(saveError)
          ? saveError.response?.data?.error || saveError.response?.data?.message || 'Unable to save pricing.'
          : 'Unable to save pricing.',
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-2xl bg-white p-5 shadow-xl">
        <div className="mb-4 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="flex items-center gap-1.5 text-base font-bold text-gray-900">
              <IndianRupee className="h-4 w-4 text-amber-500" />
              {mode === 'approve' ? 'Approve & set price' : 'Edit pricing'}
            </h3>
            <p className="mt-0.5 truncate text-xs text-gray-500">
              {listing.title}{listing.dealer ? ` · ${listing.dealer}` : ''}
            </p>
          </div>
          <button type="button" onClick={onClose} disabled={saving} className="rounded-lg p-1 text-gray-400 transition hover:bg-gray-100 hover:text-gray-700">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-3">
          <div className="flex items-center justify-between rounded-lg border border-gray-200 bg-gray-50 px-3 py-2">
            <span className="text-xs font-semibold text-gray-500">Seller price (partner / customer)</span>
            <span className="text-sm font-extrabold tabular-nums text-gray-900">{inr(sellerPrice)}</span>
          </div>

          <label className="block">
            <span className="mb-1 block text-[11px] font-semibold text-gray-700">JCB Exchange margin (₹)</span>
            <input className={inputClass} inputMode="numeric" value={margin} onChange={(event) => setMargin(digits(event.target.value))} placeholder="0" />
            <span className="mt-0.5 block text-[10.5px] text-gray-400">Not shown to buyers.</span>
          </label>

          <div>
            <span className="mb-1 block text-[11px] font-semibold text-gray-700">Expenses (₹) · shown to buyers</span>
            <div className="grid grid-cols-2 gap-2">
              {SELL_ACCOUNT_EXPENSE_FIELDS.map((field) => (
                <label key={field.key} className="block">
                  <span className="mb-0.5 block text-[10.5px] font-medium text-gray-500">{field.label}</span>
                  <input
                    className={inputClass}
                    inputMode="numeric"
                    value={expenses[field.key as ExpenseKey]}
                    onChange={(event) => setExpenses((current) => ({ ...current, [field.key]: digits(event.target.value) }))}
                    placeholder="0"
                  />
                </label>
              ))}
            </div>
            {Number(expenses.other || 0) > 0 ? (
              <input
                className={`${inputClass} mt-2`}
                value={expenses.otherLabel}
                maxLength={120}
                onChange={(event) => setExpenses((current) => ({ ...current, otherLabel: event.target.value }))}
                placeholder="What is the other expense for?"
              />
            ) : null}
          </div>

          <div className="space-y-1 rounded-lg border border-amber-200 bg-amber-50/60 px-3 py-2 text-xs">
            <div className="flex justify-between"><span className="text-gray-600">Seller price</span><span className="font-semibold tabular-nums">{inr(sellerPrice)}</span></div>
            <div className="flex justify-between"><span className="text-gray-600">+ Margin</span><span className="font-semibold tabular-nums">{inr(marginAmount)}</span></div>
            <div className="flex justify-between"><span className="text-gray-600">+ Expenses</span><span className="font-semibold tabular-nums">{inr(expenseTotal)}</span></div>
            <div className="flex justify-between border-t border-amber-200 pt-1 text-sm">
              <span className="font-bold text-gray-900">Final price for buyers</span>
              <span className="font-extrabold tabular-nums text-gray-950">{inr(finalPrice)}</span>
            </div>
          </div>

          {error ? <p className="rounded-lg bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-700">{error}</p> : null}
        </div>

        <div className="mt-5 flex gap-3">
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="flex-1 rounded-lg border border-gray-200 px-4 py-2 text-sm font-semibold text-gray-700 transition hover:bg-gray-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => void submit()}
            disabled={saving}
            className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-emerald-700 disabled:opacity-60"
          >
            <Check className="h-4 w-4" />
            {saving ? 'Saving...' : mode === 'approve' ? 'Approve & publish' : 'Save pricing'}
          </button>
        </div>
      </div>
    </div>
  );
}
