'use client';

import Link from 'next/link';
import { useEffect, useState, useCallback } from 'react';
import { toast } from 'react-toastify';
import {
  AlertTriangle,
  UserCheck,
  User,
  Phone,
  Mail,
  MapPin,
  Tag,
  Truck,
  CalendarClock,
  X,
  ArrowRight,
  Sparkles,
} from 'lucide-react';
import api from '@/lib/api';
import { emptyNextStep, type NextStep } from './CrmModals';
import {
  crmError,
  crmErrorCode,
  crmErrorDetails,
  fromLocalInput,
  toLocalInput,
  quickTimes,
  label,
  LEAD_TYPE_LABELS,
  leadHref,
  useCrmBase,
  useCrmMeta,
  type ContactLite,
} from './crmShared';

type Option = { id: string; name: string };

/** Categories / brands, and models for the chosen brand (master data). */
export const useCatalog = (brandId: string) => {
  const [categories, setCategories] = useState<Option[]>([]);
  const [brands, setBrands] = useState<Option[]>([]);
  const [models, setModels] = useState<Option[]>([]);

  useEffect(() => {
    let cancelled = false;
    Promise.all([api.get('/master/categories'), api.get('/master/brands')])
      .then(([c, b]) => {
        if (!cancelled) {
          setCategories(c.data?.data || []);
          setBrands(b.data?.data || []);
        }
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    if (!brandId) return () => { cancelled = true; };
    api
      .get(`/master/models/${brandId}`)
      .then((r) => {
        if (!cancelled) setModels(r.data?.data || []);
      })
      .catch(() => {
        if (!cancelled) setModels([]);
      });
    return () => {
      cancelled = true;
    };
  }, [brandId]);

  return { categories, brands, models: brandId ? models : [] };
};

export type RequirementState = {
  categoryId: string;
  brandId: string;
  modelId: string;
  yearFrom: string;
  yearTo: string;
  budgetMin: string;
  budgetMax: string;
  requirementCity: string;
  requirementState: string;
  requirementNotes: string;
};

export const emptyRequirement = (): RequirementState => ({
  categoryId: '',
  brandId: '',
  modelId: '',
  yearFrom: '',
  yearTo: '',
  budgetMin: '',
  budgetMax: '',
  requirementCity: '',
  requirementState: '',
  requirementNotes: '',
});

export const requirementPayload = (r: RequirementState) => ({
  categoryId: r.categoryId || null,
  brandId: r.brandId || null,
  modelId: r.modelId || null,
  yearFrom: r.yearFrom ? Number(r.yearFrom) : null,
  yearTo: r.yearTo ? Number(r.yearTo) : null,
  budgetMin: r.budgetMin ? Number(r.budgetMin) : null,
  budgetMax: r.budgetMax ? Number(r.budgetMax) : null,
  requirementCity: r.requirementCity || null,
  requirementState: r.requirementState || null,
  requirementNotes: r.requirementNotes || null,
});

/** Reusable compact requirement fields */
export function RequirementFields({
  value,
  onChange,
  compact = false,
}: {
  value: RequirementState;
  onChange: (next: RequirementState) => void;
  compact?: boolean;
}) {
  const { categories, brands, models } = useCatalog(value.brandId);
  const set = (patch: Partial<RequirementState>) => onChange({ ...value, ...patch });

  return (
    <div className="space-y-2.5">
      {/* Category, Brand, Model */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
        <div>
          <label className="text-[11px] font-semibold text-slate-700 block mb-1">Category</label>
          <select
            value={value.categoryId}
            onChange={(e) => set({ categoryId: e.target.value })}
            className="h-8.5 w-full rounded-lg border border-slate-200/90 bg-white px-2 text-xs font-medium text-slate-800 transition focus:border-amber-500 focus:outline-none focus:ring-2 focus:ring-amber-500/15"
          >
            <option value="">Any Category</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </div>

        <div>
          <label className="text-[11px] font-semibold text-slate-700 block mb-1">Brand</label>
          <select
            value={value.brandId}
            onChange={(e) => set({ brandId: e.target.value, modelId: '' })}
            className="h-8.5 w-full rounded-lg border border-slate-200/90 bg-white px-2 text-xs font-medium text-slate-800 transition focus:border-amber-500 focus:outline-none focus:ring-2 focus:ring-amber-500/15"
          >
            <option value="">Any Brand</option>
            {brands.map((b) => (
              <option key={b.id} value={b.id}>{b.name}</option>
            ))}
          </select>
        </div>

        <div>
          <label className="text-[11px] font-semibold text-slate-700 block mb-1">Model</label>
          <select
            value={value.modelId}
            onChange={(e) => set({ modelId: e.target.value })}
            disabled={!value.brandId}
            className="h-8.5 w-full rounded-lg border border-slate-200/90 bg-white px-2 text-xs font-medium text-slate-800 transition focus:border-amber-500 focus:outline-none focus:ring-2 focus:ring-amber-500/15 disabled:bg-slate-50 disabled:text-slate-400"
          >
            <option value="">Any Model</option>
            {models.map((m) => (
              <option key={m.id} value={m.id}>{m.name}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Year Range & Budget Range */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
        <div>
          <label className="text-[11px] font-semibold text-slate-700 block mb-1">Year Range</label>
          <div className="grid grid-cols-2 gap-1.5">
            <input
              type="number"
              value={value.yearFrom}
              onChange={(e) => set({ yearFrom: e.target.value })}
              className="h-8.5 w-full rounded-lg border border-slate-200/90 bg-white px-2.5 text-xs text-slate-900 placeholder:text-slate-400 focus:border-amber-500 focus:outline-none focus:ring-2 focus:ring-amber-500/15"
              placeholder="From (e.g. 2018)"
            />
            <input
              type="number"
              value={value.yearTo}
              onChange={(e) => set({ yearTo: e.target.value })}
              className="h-8.5 w-full rounded-lg border border-slate-200/90 bg-white px-2.5 text-xs text-slate-900 placeholder:text-slate-400 focus:border-amber-500 focus:outline-none focus:ring-2 focus:ring-amber-500/15"
              placeholder="To (e.g. 2024)"
            />
          </div>
        </div>

        <div>
          <label className="text-[11px] font-semibold text-slate-700 block mb-1">Budget Range (₹)</label>
          <div className="grid grid-cols-2 gap-1.5">
            <input
              type="number"
              min={0}
              value={value.budgetMin}
              onChange={(e) => set({ budgetMin: e.target.value })}
              className="h-8.5 w-full rounded-lg border border-slate-200/90 bg-white px-2.5 text-xs text-slate-900 placeholder:text-slate-400 focus:border-amber-500 focus:outline-none focus:ring-2 focus:ring-amber-500/15"
              placeholder="Min ₹"
            />
            <input
              type="number"
              min={0}
              value={value.budgetMax}
              onChange={(e) => set({ budgetMax: e.target.value })}
              className="h-8.5 w-full rounded-lg border border-slate-200/90 bg-white px-2.5 text-xs text-slate-900 placeholder:text-slate-400 focus:border-amber-500 focus:outline-none focus:ring-2 focus:ring-amber-500/15"
              placeholder="Max ₹"
            />
          </div>
        </div>
      </div>

      {/* Required Location */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
        <div>
          <label className="text-[11px] font-semibold text-slate-700 block mb-1">Required in City</label>
          <input
            value={value.requirementCity}
            onChange={(e) => set({ requirementCity: e.target.value })}
            className="h-8.5 w-full rounded-lg border border-slate-200/90 bg-white px-2.5 text-xs text-slate-900 placeholder:text-slate-400 focus:border-amber-500 focus:outline-none focus:ring-2 focus:ring-amber-500/15"
            placeholder="Preferred city"
          />
        </div>
        <div>
          <label className="text-[11px] font-semibold text-slate-700 block mb-1">Required in State</label>
          <input
            value={value.requirementState}
            onChange={(e) => set({ requirementState: e.target.value })}
            className="h-8.5 w-full rounded-lg border border-slate-200/90 bg-white px-2.5 text-xs text-slate-900 placeholder:text-slate-400 focus:border-amber-500 focus:outline-none focus:ring-2 focus:ring-amber-500/15"
            placeholder="Preferred state"
          />
        </div>
      </div>

      {/* Requirement Notes */}
      <div>
        <label className="text-[11px] font-semibold text-slate-700 block mb-1">Requirement Notes</label>
        <textarea
          rows={compact ? 2 : 2}
          value={value.requirementNotes}
          onChange={(e) => set({ requirementNotes: e.target.value })}
          className="w-full rounded-lg border border-slate-200/90 bg-white p-2 text-xs text-slate-900 placeholder:text-slate-400 focus:border-amber-500 focus:outline-none focus:ring-2 focus:ring-amber-500/15 resize-none"
          placeholder="Condition, attachments, work hours limit, or specific machinery needs..."
        />
      </div>
    </div>
  );
}

type Lookup = {
  mobile: string | null;
  contact: ContactLite | null;
  openLeads: Array<{
    id: string;
    status: string;
    leadType: string;
    listingTitleSnapshot: string | null;
    owner: { name: string | null } | null;
  }>;
};

export default function LeadForm({
  onClose,
  onCreated,
  presetContact,
}: {
  onClose: () => void;
  onCreated: (leadId: string) => void;
  presetContact?: ContactLite;
}) {
  const { meta } = useCrmMeta();
  const { base } = useCrmBase();

  const [contact, setContact] = useState({
    mobile: presetContact?.mobile || '',
    name: presetContact?.name || '',
    city: presetContact?.city || '',
    state: presetContact?.state || '',
    email: presetContact?.email || '',
    whatsappNumber: presetContact?.whatsappNumber || '',
  });

  const [lookup, setLookup] = useState<Lookup | null>(null);
  const [leadType, setLeadType] = useState('BUY');
  const [source, setSource] = useState('PHONE');
  const [priority, setPriority] = useState('MEDIUM');
  const [message, setMessage] = useState('');
  const [expectedValue, setExpectedValue] = useState('');
  const [ownerId, setOwnerId] = useState(meta?.access.canAssign ? 'none' : '');
  const [requirement, setRequirement] = useState<RequirementState>(emptyRequirement());
  const [followUp, setFollowUp] = useState<NextStep>(emptyNextStep());
  const [duplicateId, setDuplicateId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const isPartner = Boolean(meta?.access.isPartner);

  const checkMobile = useCallback(async () => {
    const digits = contact.mobile.replace(/\D/g, '');
    if (digits.length < 10) {
      setLookup(null);
      return;
    }
    try {
      const result = (
        await api.get('/crm/contacts/lookup', { params: { mobile: contact.mobile } })
      ).data as Lookup;
      setLookup(result);
      if (result.contact) {
        setContact((c) => ({
          ...c,
          name: c.name || result.contact?.name || '',
          city: c.city || result.contact?.city || '',
          state: c.state || result.contact?.state || '',
          email: c.email || result.contact?.email || '',
          whatsappNumber: c.whatsappNumber || result.contact?.whatsappNumber || '',
        }));
      }
    } catch {
      setLookup(null);
    }
  }, [contact.mobile]);

  const submit = useCallback(
    async (allowDuplicate = false) => {
      setBusy(true);
      try {
        const response = await api.post('/crm/leads', {
          contact,
          leadType,
          source,
          priority,
          message: message || undefined,
          expectedValue: expectedValue ? Number(expectedValue) : undefined,
          ...(ownerId ? { ownerId } : {}),
          ...requirementPayload({
            ...requirement,
            requirementCity: requirement.requirementCity || contact.city,
            requirementState: requirement.requirementState || contact.state,
          }),
          ...(followUp.dueAt
            ? {
                followUp: {
                  type: followUp.type,
                  dueAt: fromLocalInput(followUp.dueAt),
                  notes: followUp.notes || undefined,
                },
              }
            : {}),
          ...(allowDuplicate ? { allowDuplicate: true } : {}),
        });

        toast.success('Lead created.');
        onCreated(response.data.lead.id);
      } catch (error) {
        if (crmErrorCode(error) === 'DUPLICATE_LEAD') {
          setDuplicateId(crmErrorDetails(error)?.leadId || null);
        }
        toast.error(crmError(error, 'Could not create the lead.'));
      } finally {
        setBusy(false);
      }
    },
    [contact, leadType, source, priority, message, expectedValue, ownerId, requirement, followUp, onCreated]
  );

  // Keyboard shortcut listeners (Esc = close, Ctrl+Enter / Cmd+Enter = submit)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      } else if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
        e.preventDefault();
        const digits = contact.mobile.replace(/\D/g, '');
        if (digits.length >= 10 && !busy) {
          void submit(false);
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose, contact.mobile, busy, submit]);

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center overflow-y-auto bg-slate-950/60 backdrop-blur-[2px] p-2 sm:p-4 md:p-6"
      role="presentation"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="w-full max-w-5xl max-h-[94vh] flex flex-col bg-white rounded-2xl shadow-2xl border border-slate-200/90 overflow-hidden animate-in fade-in zoom-in-95 duration-150"
        role="dialog"
        aria-modal="true"
        aria-label="New lead"
      >
        {/* Subtle Top JCB Brand Stripe */}
        <div className="h-1 w-full bg-gradient-to-r from-amber-400 via-amber-500 to-yellow-400 shrink-0" />

        {/* Modal Header */}
        <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3 sm:px-6 bg-slate-50/60 shrink-0">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-8 h-8 rounded-lg bg-amber-500/15 border border-amber-500/25 flex items-center justify-center text-amber-700 shrink-0">
              <Sparkles className="h-4 w-4" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold text-slate-900 leading-tight">New Lead</h2>
                <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-bold bg-amber-100 text-amber-800 border border-amber-200 uppercase tracking-wide">
                  Quick Entry
                </span>
              </div>
              <p className="text-xs text-slate-500 truncate mt-0.5">
                Walk-in, phone call, referral, or incoming customer inquiry
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <span className="hidden sm:inline-flex items-center text-[10px] font-medium text-slate-400 bg-white px-2 py-0.5 rounded border border-slate-200">
              Esc to close
            </span>
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
              aria-label="Close"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Modal Scrollable Body */}
        <div className="flex-1 overflow-y-auto p-3.5 sm:p-5 [scrollbar-width:thin] space-y-4">
          {/* Main 2-Column Responsive Grid on Desktop */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-3.5">
            {/* ════════ LEFT COLUMN: Customer & Deal Details (6 cols) ════════ */}
            <div className="lg:col-span-6 space-y-3.5">
              {/* 1. Customer Details Card */}
              <div className="rounded-xl border border-slate-200/90 bg-white p-3.5 shadow-xs">
                <div className="flex items-center justify-between mb-2.5 pb-2 border-b border-slate-100">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-slate-700 flex items-center gap-1.5">
                    <User className="h-3.5 w-3.5 text-amber-500" />
                    Customer Details
                  </span>
                  <span className="text-[10px] text-slate-400 font-medium">
                    <span className="text-red-500 font-bold">*</span> Required fields
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  {/* Mobile Number */}
                  <div>
                    <label className="text-[11px] font-semibold text-slate-700 block mb-1">
                      Mobile Number <span className="text-red-500">*</span>
                    </label>
                    <div className="relative flex">
                      <span className="inline-flex items-center px-2.5 rounded-l-lg border border-r-0 border-slate-200 bg-slate-50 text-slate-600 text-xs font-semibold select-none h-8.5">
                        +91
                      </span>
                      <input
                        value={contact.mobile}
                        onChange={(e) => {
                          const val = e.target.value.replace(/\D/g, '').slice(0, 10);
                          setContact({ ...contact, mobile: val });
                        }}
                        onBlur={checkMobile}
                        className="h-8.5 w-full rounded-r-lg border border-slate-200/90 bg-white px-2.5 text-xs text-slate-900 placeholder:text-slate-400 focus:border-amber-500 focus:outline-none focus:ring-2 focus:ring-amber-500/15 transition-all"
                        placeholder="10-digit mobile"
                        inputMode="tel"
                      />
                    </div>
                  </div>

                  {/* Customer Name */}
                  <div>
                    <label className="text-[11px] font-semibold text-slate-700 block mb-1">
                      Customer Name
                    </label>
                    <input
                      value={contact.name}
                      onChange={(e) => setContact({ ...contact, name: e.target.value })}
                      className="h-8.5 w-full rounded-lg border border-slate-200/90 bg-white px-2.5 text-xs text-slate-900 placeholder:text-slate-400 focus:border-amber-500 focus:outline-none focus:ring-2 focus:ring-amber-500/15 transition-all"
                      placeholder="Full name"
                    />
                  </div>

                  {/* WhatsApp */}
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="text-[11px] font-semibold text-slate-700">WhatsApp</label>
                      {contact.mobile.length >= 10 && contact.whatsappNumber !== contact.mobile && (
                        <button
                          type="button"
                          onClick={() => setContact({ ...contact, whatsappNumber: contact.mobile })}
                          className="text-[10px] text-amber-600 hover:text-amber-700 font-semibold cursor-pointer"
                        >
                          Same as mobile
                        </button>
                      )}
                    </div>
                    <input
                      value={contact.whatsappNumber}
                      onChange={(e) =>
                        setContact({
                          ...contact,
                          whatsappNumber: e.target.value.replace(/\D/g, '').slice(0, 10),
                        })
                      }
                      className="h-8.5 w-full rounded-lg border border-slate-200/90 bg-white px-2.5 text-xs text-slate-900 placeholder:text-slate-400 focus:border-amber-500 focus:outline-none focus:ring-2 focus:ring-amber-500/15 transition-all"
                      placeholder="WhatsApp (if different)"
                      inputMode="tel"
                    />
                  </div>

                  {/* Email */}
                  <div>
                    <label className="text-[11px] font-semibold text-slate-700 block mb-1">
                      Email Address
                    </label>
                    <input
                      type="email"
                      value={contact.email}
                      onChange={(e) => setContact({ ...contact, email: e.target.value })}
                      className="h-8.5 w-full rounded-lg border border-slate-200/90 bg-white px-2.5 text-xs text-slate-900 placeholder:text-slate-400 focus:border-amber-500 focus:outline-none focus:ring-2 focus:ring-amber-500/15 transition-all"
                      placeholder="name@company.com"
                    />
                  </div>

                  {/* City */}
                  <div>
                    <label className="text-[11px] font-semibold text-slate-700 block mb-1">City</label>
                    <input
                      value={contact.city}
                      onChange={(e) => setContact({ ...contact, city: e.target.value })}
                      className="h-8.5 w-full rounded-lg border border-slate-200/90 bg-white px-2.5 text-xs text-slate-900 placeholder:text-slate-400 focus:border-amber-500 focus:outline-none focus:ring-2 focus:ring-amber-500/15 transition-all"
                      placeholder="e.g. Pune"
                    />
                  </div>

                  {/* State */}
                  <div>
                    <label className="text-[11px] font-semibold text-slate-700 block mb-1">State</label>
                    <input
                      value={contact.state}
                      onChange={(e) => setContact({ ...contact, state: e.target.value })}
                      className="h-8.5 w-full rounded-lg border border-slate-200/90 bg-white px-2.5 text-xs text-slate-900 placeholder:text-slate-400 focus:border-amber-500 focus:outline-none focus:ring-2 focus:ring-amber-500/15 transition-all"
                      placeholder="e.g. Maharashtra"
                    />
                  </div>
                </div>

                {/* Existing Customer Lookup Notification */}
                {lookup?.contact ? (
                  <div className="mt-2.5 rounded-lg border border-blue-200 bg-blue-50/80 p-2.5 text-xs text-blue-900">
                    <div className="flex items-center gap-1.5 font-bold">
                      <UserCheck className="h-3.5 w-3.5 text-blue-600 shrink-0" />
                      <span>
                        Existing Contact: {lookup.contact.name || lookup.contact.mobile}
                      </span>
                    </div>
                    {lookup.openLeads.length ? (
                      <div className="mt-1.5 text-[11px] text-blue-800">
                        <span className="font-semibold">Active Leads for this customer:</span>
                        <ul className="mt-1 space-y-0.5">
                          {lookup.openLeads.map((l) => (
                            <li key={l.id} className="flex items-center gap-1.5">
                              <span className="w-1 h-1 rounded-full bg-blue-500" />
                              <Link
                                className="font-semibold underline hover:text-blue-950"
                                href={leadHref(base, l.id)}
                              >
                                {LEAD_TYPE_LABELS[l.leadType] || l.leadType} · {label(l.status)}
                              </Link>
                              {l.listingTitleSnapshot ? (
                                <span className="truncate max-w-[180px] text-slate-600">
                                  ({l.listingTitleSnapshot})
                                </span>
                              ) : null}
                              {l.owner?.name ? (
                                <span className="text-blue-700">[{l.owner.name}]</span>
                              ) : null}
                            </li>
                          ))}
                        </ul>
                      </div>
                    ) : (
                      <p className="mt-1 text-[11px] text-blue-700">No active leads currently open.</p>
                    )}
                  </div>
                ) : null}
              </div>

              {/* 2. Lead Classification & Notes Card */}
              <div className="rounded-xl border border-slate-200/90 bg-white p-3.5 shadow-xs">
                <div className="flex items-center justify-between mb-2.5 pb-2 border-b border-slate-100">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-slate-700 flex items-center gap-1.5">
                    <Tag className="h-3.5 w-3.5 text-amber-500" />
                    Classification & Notes
                  </span>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {/* Lead Type */}
                  <div>
                    <label className="text-[11px] font-semibold text-slate-700 block mb-1">
                      Lead Type
                    </label>
                    <select
                      value={leadType}
                      onChange={(e) => setLeadType(e.target.value)}
                      className="h-8.5 w-full rounded-lg border border-slate-200/90 bg-white px-2 text-xs font-semibold text-slate-800 focus:border-amber-500 focus:outline-none focus:ring-2 focus:ring-amber-500/15"
                    >
                      {(meta?.enums.leadTypes || Object.keys(LEAD_TYPE_LABELS)).map((t) => (
                        <option key={t} value={t}>
                          {LEAD_TYPE_LABELS[t] || label(t)}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Source */}
                  <div>
                    <label className="text-[11px] font-semibold text-slate-700 block mb-1">
                      Source
                    </label>
                    <select
                      value={source}
                      onChange={(e) => setSource(e.target.value)}
                      className="h-8.5 w-full rounded-lg border border-slate-200/90 bg-white px-2 text-xs font-semibold text-slate-800 focus:border-amber-500 focus:outline-none focus:ring-2 focus:ring-amber-500/15"
                    >
                      {(meta?.config.sources || ['PHONE']).map((s) => (
                        <option key={s} value={s}>
                          {label(s)}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Priority */}
                  <div>
                    <label className="text-[11px] font-semibold text-slate-700 block mb-1">
                      Priority
                    </label>
                    <select
                      value={priority}
                      onChange={(e) => setPriority(e.target.value)}
                      className="h-8.5 w-full rounded-lg border border-slate-200/90 bg-white px-2 text-xs font-semibold text-slate-800 focus:border-amber-500 focus:outline-none focus:ring-2 focus:ring-amber-500/15"
                    >
                      {(meta?.enums.priorities || ['LOW', 'MEDIUM', 'HIGH', 'URGENT']).map((p) => (
                        <option key={p} value={p}>
                          {label(p)}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Owner */}
                  {!isPartner ? (
                    <div>
                      <label className="text-[11px] font-semibold text-slate-700 block mb-1">
                        Owner
                      </label>
                      <select
                        value={ownerId}
                        onChange={(e) => setOwnerId(e.target.value)}
                        disabled={!meta?.access.canAssign}
                        className="h-8.5 w-full rounded-lg border border-slate-200/90 bg-white px-2 text-xs font-semibold text-slate-800 focus:border-amber-500 focus:outline-none focus:ring-2 focus:ring-amber-500/15 disabled:bg-slate-50 disabled:text-slate-400"
                      >
                        {meta?.access.canAssign ? (
                          <option value="none">Auto-assign</option>
                        ) : (
                          <option value="">Me</option>
                        )}
                        {meta?.access.canAssign
                          ? meta.staff.map((s) => (
                              <option key={s.id} value={s.id}>
                                {s.name}
                              </option>
                            ))
                          : null}
                      </select>
                    </div>
                  ) : null}
                </div>

                {/* Expected Deal Value & Enquiry Notes */}
                <div className="mt-2.5 grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                  <div className="sm:col-span-1">
                    <label className="text-[11px] font-semibold text-slate-700 block mb-1">
                      Expected Value (₹)
                    </label>
                    <div className="relative">
                      <span className="absolute inset-y-0 left-0 pl-2.5 flex items-center pointer-events-none text-slate-400 text-xs font-bold">
                        ₹
                      </span>
                      <input
                        type="number"
                        min={0}
                        value={expectedValue}
                        onChange={(e) => setExpectedValue(e.target.value)}
                        className="h-8.5 w-full pl-6 pr-2.5 rounded-lg border border-slate-200/90 bg-white text-xs text-slate-900 placeholder:text-slate-400 focus:border-amber-500 focus:outline-none focus:ring-2 focus:ring-amber-500/15"
                        placeholder="Deal amount"
                      />
                    </div>
                  </div>

                  <div className="sm:col-span-2">
                    <label className="text-[11px] font-semibold text-slate-700 block mb-1">
                      Enquiry / Discussion Notes
                    </label>
                    <textarea
                      rows={2}
                      value={message}
                      onChange={(e) => setMessage(e.target.value)}
                      className="w-full rounded-lg border border-slate-200/90 bg-white p-2 text-xs text-slate-900 placeholder:text-slate-400 focus:border-amber-500 focus:outline-none focus:ring-2 focus:ring-amber-500/15 resize-none"
                      placeholder="Customer timeline, discussion points, special terms..."
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* ════════ RIGHT COLUMN: Requirement & Follow-up (6 cols) ════════ */}
            <div className="lg:col-span-6 space-y-3.5">
              {/* 3. Machine Requirement Card */}
              <div className="rounded-xl border border-slate-200/90 bg-white p-3.5 shadow-xs">
                <div className="flex items-center justify-between mb-2.5 pb-2 border-b border-slate-100">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-slate-700 flex items-center gap-1.5">
                    <Truck className="h-3.5 w-3.5 text-amber-500" />
                    {leadType === 'SELL'
                      ? 'Machine Customer is Selling'
                      : 'Equipment Requirement'}
                  </span>
                </div>

                <RequirementFields value={requirement} onChange={setRequirement} compact />
              </div>

              {/* 4. First Follow-up Plan Card */}
              <div className="rounded-xl border border-amber-200/90 bg-gradient-to-br from-amber-50/40 via-amber-50/15 to-white p-3.5 shadow-xs">
                <div className="flex items-center justify-between mb-2 pb-1.5 border-b border-amber-200/60">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-amber-900 flex items-center gap-1.5">
                    <CalendarClock className="h-3.5 w-3.5 text-amber-600" />
                    First Follow-up Plan
                  </span>
                  <span className="text-[10px] text-amber-700/80 font-medium">
                    Auto-scheduled if empty
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  <div>
                    <label className="text-[11px] font-semibold text-slate-700 block mb-1">
                      Action Type
                    </label>
                    <select
                      value={followUp.type}
                      onChange={(e) => setFollowUp({ ...followUp, type: e.target.value })}
                      className="h-8.5 w-full rounded-lg border border-slate-200/90 bg-white px-2 text-xs font-semibold text-slate-800 focus:border-amber-500 focus:outline-none focus:ring-2 focus:ring-amber-500/15"
                    >
                      {(
                        meta?.enums.followUpTypes || [
                          'CALL',
                          'WHATSAPP',
                          'VISIT',
                          'INSPECTION',
                          'MEETING',
                        ]
                      ).map((t) => (
                        <option key={t} value={t}>
                          {label(t)}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="text-[11px] font-semibold text-slate-700 block mb-1">
                      Scheduled When
                    </label>
                    <input
                      type="datetime-local"
                      value={followUp.dueAt}
                      min={toLocalInput(new Date())}
                      onChange={(e) => setFollowUp({ ...followUp, dueAt: e.target.value })}
                      className="h-8.5 w-full rounded-lg border border-slate-200/90 bg-white px-2 text-xs text-slate-900 focus:border-amber-500 focus:outline-none focus:ring-2 focus:ring-amber-500/15"
                    />
                  </div>
                </div>

                {/* Quick Scheduling Pills */}
                <div className="mt-2 flex flex-wrap items-center gap-1.5">
                  <span className="text-[10px] font-medium text-slate-400">Quick set:</span>
                  {quickTimes().map((q) => (
                    <button
                      key={q.label}
                      type="button"
                      onClick={() => setFollowUp({ ...followUp, dueAt: q.value })}
                      className={`rounded-md border px-2 py-0.5 text-[10px] font-semibold transition-all cursor-pointer ${
                        followUp.dueAt === q.value
                          ? 'border-amber-500 bg-amber-500 text-white shadow-xs'
                          : 'border-slate-200 bg-white text-slate-600 hover:border-amber-300 hover:bg-amber-50/50'
                      }`}
                    >
                      {q.label}
                    </button>
                  ))}
                </div>

                {/* Follow-up Note */}
                <div className="mt-2.5">
                  <input
                    value={followUp.notes}
                    onChange={(e) => setFollowUp({ ...followUp, notes: e.target.value })}
                    className="h-8.5 w-full rounded-lg border border-slate-200/90 bg-white px-2.5 text-xs text-slate-900 placeholder:text-slate-400 focus:border-amber-500 focus:outline-none focus:ring-2 focus:ring-amber-500/15"
                    placeholder="Agenda / note (e.g. Call to discuss pricing and send machine options)"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Duplicate Lead Warning Alert */}
          {duplicateId ? (
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-amber-300 bg-amber-50 px-3.5 py-2.5 text-xs text-amber-900 shadow-xs animate-in fade-in">
              <div className="flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0" />
                <span>
                  This customer already has an active {LEAD_TYPE_LABELS[leadType] || leadType} deal.
                </span>
              </div>
              <div className="flex items-center gap-3">
                <Link
                  href={leadHref(base, duplicateId)}
                  className="font-bold underline hover:text-amber-950"
                >
                  Open Existing Deal
                </Link>
                <button
                  type="button"
                  onClick={() => submit(true)}
                  className="font-bold underline text-amber-800 hover:text-amber-950 cursor-pointer"
                >
                  Create Separate Deal Anyway
                </button>
              </div>
            </div>
          ) : null}
        </div>

        {/* Modal Sticky Footer */}
        <div className="border-t border-slate-200/90 bg-slate-50/90 px-4 py-3 sm:px-6 flex items-center justify-between gap-3 shrink-0">
          <div className="text-[11px] text-slate-500 hidden sm:flex items-center gap-2">
            <span className="inline-block w-2 h-2 rounded-full bg-emerald-500" />
            <span>
              Press{' '}
              <kbd className="px-1.5 py-0.5 rounded bg-white border border-slate-200 font-mono text-[10px] text-slate-600 shadow-2xs">
                Ctrl + Enter
              </kbd>{' '}
              to save
            </span>
          </div>

          <div className="flex items-center gap-2.5 ml-auto">
            <button
              type="button"
              onClick={onClose}
              disabled={busy}
              className="h-9 px-4 rounded-lg border border-slate-200 bg-white text-xs font-semibold text-slate-700 hover:bg-slate-50 active:bg-slate-100 transition-colors cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => submit(false)}
              disabled={busy || contact.mobile.replace(/\D/g, '').length < 10}
              className="h-9 px-5 rounded-lg bg-amber-400 hover:bg-amber-500 active:scale-[0.99] text-slate-950 font-bold text-xs shadow-sm transition-all flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
            >
              {busy ? (
                <>
                  <div className="w-3.5 h-3.5 border-2 border-slate-950 border-t-transparent rounded-full animate-spin" />
                  <span>Creating...</span>
                </>
              ) : (
                <>
                  <span>Create Lead</span>
                  <ArrowRight className="h-3.5 w-3.5" />
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
