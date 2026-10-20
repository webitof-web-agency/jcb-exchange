'use client';

import axios from 'axios';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Pencil, Trash2 } from 'lucide-react';
import api from '@/lib/api';
import { useAuthStore } from '@/store/authStore';
import PortalBrand from '@/components/layout/PortalBrand';
import PortalActionDropdown from '@/components/ui/PortalActionDropdown';

const AGREEMENT_TYPES = [
  'MARKETPLACE_TERMS',
  'PARTNER_TERMS',
  'LISTING_AUTHENTICITY',
  'MEDIA_OWNERSHIP',
  'SECURITY_DEPOSIT_POLICY',
  'REFUND_POLICY',
  'CUSTOMER_DATA_USAGE',
  'CONTACT_VISIBILITY_POLICY',
  'FRAUD_POLICY',
  'LISTING_SUSPENSION_POLICY',
  'SOLD_MEDIA_DELETION_POLICY',
  'FEATURED_IMAGE_RETENTION_CONSENT',
  'COMMISSION_POLICY',
  'LEAD_OWNERSHIP_POLICY',
] as const;

type Agreement = {
  id: string;
  agreementType: string;
  title: string;
  summary: string;
  content: string;
  version: string;
  applicablePartnerTypes: string[];
  isRequired: boolean;
  status: 'DRAFT' | 'PUBLISHED' | 'ARCHIVED';
  effectiveFrom: string | null;
  displayOrder: number;
};

type FormState = Omit<Agreement, 'id' | 'effectiveFrom' | 'status'> & { effectiveFrom: string };

const emptyForm: FormState = {
  agreementType: AGREEMENT_TYPES[0],
  title: '',
  summary: '',
  content: '',
  version: 'v1.0',
  applicablePartnerTypes: ['SHOWROOM'],
  isRequired: true,
  effectiveFrom: '',
  displayOrder: 0,
};

const labelForType = (value: string) => value.replaceAll('_', ' ').toLowerCase().replace(/\b\w/g, (letter) => letter.toUpperCase());

export default function PartnerAgreementsSettings() {
  const user = useAuthStore((state) => state.user);
  const [agreements, setAgreements] = useState<Agreement[]>([]);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const isSuperAdmin = user?.role === 'SUPER_ADMIN';
  const permissions = user?.permissions || [];
  const canView = isSuperAdmin || permissions.includes('ALL_ACCESS') || permissions.includes('partner.agreements.read') || permissions.includes('partner.agreements.manage');
  const canManage = isSuperAdmin || permissions.includes('ALL_ACCESS') || permissions.includes('partner.agreements.manage');
  const activeAgreements = useMemo(
    () => agreements.filter((agreement) => agreement.status !== 'ARCHIVED'),
    [agreements],
  );

  const availableTypes = useMemo(() => {
    if (editingId) return AGREEMENT_TYPES;
    const used = new Set(activeAgreements.map((agreement) => agreement.agreementType));
    return AGREEMENT_TYPES.filter((type) => !used.has(type));
  }, [activeAgreements, editingId]);

  const loadAgreements = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const response = await api.get<{ agreements: Agreement[] }>('/superadmin/partner-agreements');
      setAgreements(response.data.agreements || []);
    } catch (requestError: unknown) {
      setError(axios.isAxiosError(requestError) ? requestError.response?.data?.error || 'Unable to load partner agreements.' : 'Unable to load partner agreements.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // This effect intentionally synchronizes the remote catalogue into local UI state.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (canView) void loadAgreements();
  }, [canView, loadAgreements]);

  if (!canView) {
    return <div className="rounded-xl border border-slate-200 bg-white p-8 text-slate-700">You do not have permission to view partner agreements.</div>;
  }

  const openCreate = () => {
    setEditingId(null);
    setForm({ ...emptyForm, agreementType: availableTypes[0] || AGREEMENT_TYPES[0] });
    setError('');
    setNotice('');
    setIsFormOpen(true);
  };

  const openEdit = (agreement: Agreement) => {
    setEditingId(agreement.id);
    setForm({
      agreementType: agreement.agreementType,
      title: agreement.title,
      summary: agreement.summary || '',
      content: agreement.content,
      version: agreement.version,
      applicablePartnerTypes: agreement.applicablePartnerTypes || [],
      isRequired: agreement.isRequired,
      effectiveFrom: agreement.effectiveFrom ? agreement.effectiveFrom.slice(0, 16) : '',
      displayOrder: agreement.displayOrder,
    });
    setError('');
    setNotice('');
    setIsFormOpen(true);
  };

  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setError('');
    setNotice('');
    try {
      const payload = { ...form, status: 'PUBLISHED' as const, effectiveFrom: form.effectiveFrom || null };
      if (editingId) {
        await api.put(`/superadmin/partner-agreements/${editingId}`, payload);
      } else {
        await api.post('/superadmin/partner-agreements', payload);
      }
      setIsFormOpen(false);
      setNotice('Agreement saved and published successfully.');
      await loadAgreements();
    } catch (requestError: unknown) {
      setError(axios.isAxiosError(requestError) ? requestError.response?.data?.error || 'Unable to save partner agreement.' : 'Unable to save partner agreement.');
    } finally {
      setSaving(false);
    }
  };

  const removeAgreement = async (agreement: Agreement) => {
    if (!window.confirm(`Remove “${agreement.title}” from the catalogue? Existing acceptances will remain available for audit.`)) return;
    setError('');
    setNotice('');
    try {
      await api.delete(`/superadmin/partner-agreements/${agreement.id}`);
      setNotice('Agreement removed from the active catalogue.');
      await loadAgreements();
    } catch (requestError: unknown) {
      setError(axios.isAxiosError(requestError) ? requestError.response?.data?.error || 'Unable to delete partner agreement.' : 'Unable to delete partner agreement.');
    }
  };

  const togglePublished = async (agreement: Agreement) => {
    const nextStatus = agreement.status === 'PUBLISHED' ? 'DRAFT' : 'PUBLISHED';
    setError('');
    setNotice('');

    try {
      await api.put(`/superadmin/partner-agreements/${agreement.id}`, {
        agreementType: agreement.agreementType,
        title: agreement.title,
        summary: agreement.summary,
        content: agreement.content,
        version: agreement.version,
        applicablePartnerTypes: agreement.applicablePartnerTypes,
        isRequired: agreement.isRequired,
        displayOrder: agreement.displayOrder,
        status: nextStatus,
        effectiveFrom: agreement.effectiveFrom,
      });
      setNotice(nextStatus === 'PUBLISHED' ? 'Agreement published.' : 'Agreement unpublished and hidden from onboarding.');
      await loadAgreements();
    } catch (requestError: unknown) {
      setError(axios.isAxiosError(requestError) ? requestError.response?.data?.error || 'Unable to update agreement visibility.' : 'Unable to update agreement visibility.');
    }
  };

  const updateForm = <K extends keyof FormState>(key: K, value: FormState[K]) => setForm((current) => ({ ...current, [key]: value }));
  const togglePartnerType = (type: string) => updateForm('applicablePartnerTypes', form.applicablePartnerTypes.includes(type)
    ? form.applicablePartnerTypes.filter((item) => item !== type)
    : [...form.applicablePartnerTypes, type]);

  return (
    <main className="space-y-6 p-4 md:p-8">
      <section className="overflow-hidden rounded-2xl bg-slate-950 px-6 py-5 text-white shadow-sm md:px-8">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex min-w-0 items-center gap-4">
            <div className="flex h-12 w-24 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-white/5 px-2">
              <PortalBrand href="/employee/partner-agreements" showSubtitle={false} logoSrc="/Logo-white.webp" />
            </div>
            <div>
              <h1 className="text-2xl font-bold tracking-tight">Partner Agreements</h1>
            </div>
          </div>
          {canManage && (
            <button
              type="button"
              onClick={openCreate}
              className="rounded-lg bg-amber-400 px-4 py-2 text-sm font-bold text-slate-950 transition hover:bg-amber-300 shadow-sm"
            >
              + Create agreement
            </button>
          )}
        </div>
      </section>

      {error && <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>}
      {notice && <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700">{notice}</div>}

      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-100 px-5 py-3.5 flex items-center justify-between">
          <h2 className="text-sm font-bold text-slate-900">
            Agreement catalogue ({activeAgreements.length})
          </h2>
        </div>
        {loading ? (
          <div className="p-6 text-slate-500">Loading agreements…</div>
        ) : activeAgreements.length === 0 ? (
          <div className="p-6 text-slate-500">No active agreements configured.</div>
        ) : (
          <div className="divide-y divide-slate-100">
            {activeAgreements.map((agreement) => (
              <article key={agreement.id} className="flex flex-col gap-4 p-5 transition-colors hover:bg-slate-50/60 lg:flex-row lg:items-start lg:justify-between">
                <div className="min-w-0 flex-1 space-y-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="font-bold text-slate-900 text-base">{agreement.title}</h3>
                    <span className="rounded-md bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-600 font-mono">
                      {agreement.version}
                    </span>
                    {agreement.isRequired && (
                      <span className="rounded-md bg-red-50 text-red-700 ring-1 ring-red-200 px-2 py-0.5 text-xs font-semibold">
                        Required
                      </span>
                    )}
                    {agreement.applicablePartnerTypes.length > 0 && (
                      <span className="rounded-md bg-amber-50 text-amber-800 ring-1 ring-amber-200 px-2 py-0.5 text-xs font-medium">
                        {agreement.applicablePartnerTypes.join(', ')}
                      </span>
                    )}
                  </div>

                  {agreement.summary && (
                    <p className="text-sm text-slate-600 leading-relaxed">
                      {agreement.summary}
                    </p>
                  )}

                  <details className="text-xs text-slate-500 pt-0.5">
                    <summary className="cursor-pointer font-medium text-slate-600 hover:text-slate-900 select-none">
                      View full agreement
                    </summary>
                    <p className="mt-2 whitespace-pre-wrap rounded-lg bg-slate-50 p-3.5 text-sm text-slate-700 leading-relaxed border border-slate-100">
                      {agreement.content}
                    </p>
                  </details>
                </div>

                {canManage && (
                  <div className="flex shrink-0 items-center gap-2 pt-0.5">
                    <button
                      type="button"
                      role="switch"
                      aria-checked={agreement.status === 'PUBLISHED'}
                      onClick={() => void togglePublished(agreement)}
                      className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
                      aria-label={`${agreement.status === 'PUBLISHED' ? 'Unpublish' : 'Publish'} ${agreement.title}`}
                    >
                      <span
                        className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors ${
                          agreement.status === 'PUBLISHED' ? 'bg-emerald-500' : 'bg-slate-300'
                        }`}
                      >
                        <span
                          className={`h-4 w-4 rounded-full bg-white shadow-sm transition-transform ${
                            agreement.status === 'PUBLISHED' ? 'translate-x-4' : 'translate-x-0.5'
                          }`}
                        />
                      </span>
                      <span className="text-xs font-semibold">
                        {agreement.status === 'PUBLISHED' ? 'Published' : 'Draft'}
                      </span>
                    </button>
                    <PortalActionDropdown
                      items={[
                        { label: 'Edit', icon: <Pencil className="h-4 w-4" />, onClick: () => openEdit(agreement) },
                        { label: 'Delete', icon: <Trash2 className="h-4 w-4" />, variant: 'danger', onClick: () => void removeAgreement(agreement) },
                      ]}
                    />
                  </div>
                )}
              </article>
            ))}
          </div>
        )}
      </section>

      {isFormOpen && canManage && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-950/50 p-4">
          <div className="mx-auto my-8 max-w-3xl rounded-2xl bg-white p-6 shadow-xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-lg font-bold text-slate-900">
                  {editingId ? 'Edit partner agreement' : 'Create partner agreement'}
                </h2>
              </div>
              <button type="button" onClick={() => setIsFormOpen(false)} className="text-2xl leading-none text-slate-400 hover:text-slate-600" aria-label="Close">×</button>
            </div>
            <form onSubmit={save} className="mt-6 grid gap-4 md:grid-cols-2">
              <label className="text-sm font-medium text-slate-700">
                Agreement type
                <select value={form.agreementType} onChange={(event) => updateForm('agreementType', event.target.value)} disabled={!!editingId} className="mt-1 w-full rounded-lg border border-slate-300 p-2.5 text-sm" required>
                  {availableTypes.map((type) => (
                    <option key={type} value={type}>{labelForType(type)}</option>
                  ))}
                </select>
              </label>
              <label className="text-sm font-medium text-slate-700">
                Title
                <input value={form.title} onChange={(event) => updateForm('title', event.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 p-2.5 text-sm" required />
              </label>
              <label className="text-sm font-medium text-slate-700 md:col-span-2">
                Summary
                <input value={form.summary} onChange={(event) => updateForm('summary', event.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 p-2.5 text-sm" />
              </label>
              <label className="text-sm font-medium text-slate-700 md:col-span-2">
                Agreement content
                <textarea value={form.content} onChange={(event) => updateForm('content', event.target.value)} rows={7} className="mt-1 w-full rounded-lg border border-slate-300 p-2.5 text-sm" required />
              </label>
              <label className="text-sm font-medium text-slate-700">
                Display order
                <input type="number" min="0" value={form.displayOrder} onChange={(event) => updateForm('displayOrder', Number(event.target.value))} className="mt-1 w-full rounded-lg border border-slate-300 p-2.5 text-sm" />
              </label>
              <fieldset className="md:col-span-2">
                <legend className="text-sm font-medium text-slate-700">Applicable partner type</legend>
                <div className="mt-2">
                  <label className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 text-sm text-slate-700">
                    <input type="checkbox" checked={form.applicablePartnerTypes.includes('SHOWROOM')} onChange={() => togglePartnerType('SHOWROOM')} />
                    SHOWROOM
                  </label>
                </div>
              </fieldset>
              <label className="flex items-center gap-2 text-sm text-slate-700 md:col-span-2">
                <input type="checkbox" checked={form.isRequired} onChange={(event) => updateForm('isRequired', event.target.checked)} />
                Required for partner onboarding
              </label>
              <div className="flex justify-end gap-3 border-t border-slate-200 pt-4 md:col-span-2">
                <button type="button" onClick={() => setIsFormOpen(false)} className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700">Cancel</button>
                <button type="submit" disabled={saving} className="rounded-lg bg-slate-950 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">{saving ? 'Saving…' : 'Save agreement'}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </main>
  );
}
