'use client';

import Link from 'next/link';
import { useEffect, useState, type FormEvent } from 'react';
import { CheckCircle2, Loader2, PhoneCall } from 'lucide-react';
import api from '@/lib/api';
import { useTranslation } from '@/hooks/useTranslation';
import { useToastStore } from '@/store/toastStore';

type Option = { id: string; name: string };
type Mode = 'REQUIREMENT' | 'SELL';

const inputClass = 'w-full rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm text-gray-900 outline-none transition focus:border-[#F0C85C] focus:ring-2 focus:ring-[#F0C85C]/30';
const labelClass = 'mb-1.5 block text-xs font-semibold text-gray-600';

const errorMessage = (error: unknown, fallback: string) =>
  (error as { response?: { data?: { error?: string } } })?.response?.data?.error || fallback;

/**
 * Website lead forms (backend: POST /crm/public/requirement and /crm/public/sell-machine).
 * Submissions become CRM leads; the team calls back.
 */
export default function LeadCaptureForm({ mode }: { mode: Mode }) {
  const { t } = useTranslation();
  const showToast = useToastStore((state) => state.showToast);
  const [categories, setCategories] = useState<Option[]>([]);
  const [brands, setBrands] = useState<Option[]>([]);
  const [models, setModels] = useState<Option[]>([]);
  const [form, setForm] = useState({
    name: '', mobile: '', city: '', state: '', categoryId: '', brandId: '', modelId: '',
    yearFrom: '', yearTo: '', budgetMax: '', year: '', expectedPrice: '', operatingHours: '', registrationNumber: '', message: '', website: '',
  });
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    let cancelled = false;
    api.get('/crm/public/catalog')
      .then((r) => { if (!cancelled) { setCategories(r.data?.categories || []); setBrands(r.data?.brands || []); } })
      .catch(() => undefined);
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    let cancelled = false;
    if (!form.brandId) return () => { cancelled = true; };
    api.get(`/master/models/${form.brandId}`)
      .then((r) => { if (!cancelled) setModels(r.data?.data || []); })
      .catch(() => { if (!cancelled) setModels([]); });
    return () => { cancelled = true; };
  }, [form.brandId]);

  const set = (key: keyof typeof form, value: string) => setForm((f) => ({ ...f, [key]: value, ...(key === 'brandId' ? { modelId: '' } : {}) }));

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    try {
      const common = { name: form.name, mobile: form.mobile, city: form.city, state: form.state, categoryId: form.categoryId, brandId: form.brandId, modelId: form.modelId, message: form.message, website: form.website };
      if (mode === 'REQUIREMENT') {
        await api.post('/crm/public/requirement', { ...common, yearFrom: form.yearFrom, yearTo: form.yearTo, budgetMax: form.budgetMax });
      } else {
        await api.post('/crm/public/sell-machine', { ...common, year: form.year, expectedPrice: form.expectedPrice, operatingHours: form.operatingHours, registrationNumber: form.registrationNumber });
      }
      setDone(true);
    } catch (error) {
      showToast({ title: t('crmForms.submitFailed', 'Could not submit'), description: errorMessage(error, t('crmForms.tryAgain', 'Please check the details and try again.')), variant: 'error' });
    } finally {
      setBusy(false);
    }
  };

  if (done) {
    return (
      <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-8 text-center">
        <CheckCircle2 className="mx-auto h-12 w-12 text-emerald-600" />
        <h2 className="mt-3 text-xl font-bold text-gray-900">{t('crmForms.thanksTitle', 'Thank you! We have received your details.')}</h2>
        <p className="mt-2 text-sm text-gray-600">
          {mode === 'REQUIREMENT'
            ? t('crmForms.thanksRequirement', 'Our team will call you with matching machines. We will also let you know when a new matching machine is listed.')
            : t('crmForms.thanksSell', 'Our team will call you shortly to understand your machine and share an offer.')}
        </p>
        <Link href="/machines" className="mt-5 inline-flex rounded-xl bg-[#111827] px-5 py-3 text-sm font-bold text-white hover:bg-black">{t('crmForms.browseMachines', 'Browse machines')}</Link>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="space-y-5 rounded-2xl border border-gray-100 bg-white p-5 shadow-sm sm:p-8">
      {/* Honeypot: hidden from people, filled by bots. */}
      <input type="text" name="website" value={form.website} onChange={(e) => set('website', e.target.value)} tabIndex={-1} autoComplete="off" className="hidden" aria-hidden="true" />
      <div className="grid gap-4 sm:grid-cols-2">
        <div><label className={labelClass} htmlFor="crm-name">{t('crmForms.name', 'Your name')} *</label><input id="crm-name" required value={form.name} onChange={(e) => set('name', e.target.value)} className={inputClass} autoComplete="name" /></div>
        <div><label className={labelClass} htmlFor="crm-mobile">{t('crmForms.mobile', 'Mobile number')} *</label><input data-sanitize="mobile" id="crm-mobile" required inputMode="tel" pattern="[0-9+\s-]{10,15}" value={form.mobile} onChange={(e) => set('mobile', e.target.value)} className={inputClass} autoComplete="tel" placeholder="98765 43210" /></div>
        <div><label className={labelClass} htmlFor="crm-city">{t('crmForms.city', 'City')} *</label><input id="crm-city" required value={form.city} onChange={(e) => set('city', e.target.value)} className={inputClass} autoComplete="address-level2" /></div>
        <div><label className={labelClass} htmlFor="crm-state">{t('crmForms.state', 'State')}</label><input id="crm-state" value={form.state} onChange={(e) => set('state', e.target.value)} className={inputClass} autoComplete="address-level1" /></div>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <div>
          <label className={labelClass} htmlFor="crm-category">{t('crmForms.machineType', 'Machine type')}</label>
          <select id="crm-category" value={form.categoryId} onChange={(e) => set('categoryId', e.target.value)} className={inputClass}>
            <option value="">{t('crmForms.any', 'Any')}</option>
            {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
        <div>
          <label className={labelClass} htmlFor="crm-brand">{t('crmForms.brand', 'Brand')}</label>
          <select id="crm-brand" value={form.brandId} onChange={(e) => set('brandId', e.target.value)} className={inputClass}>
            <option value="">{t('crmForms.any', 'Any')}</option>
            {brands.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
        </div>
        <div>
          <label className={labelClass} htmlFor="crm-model">{t('crmForms.model', 'Model')}</label>
          <select id="crm-model" value={form.modelId} onChange={(e) => set('modelId', e.target.value)} disabled={!form.brandId} className={inputClass}>
            <option value="">{t('crmForms.any', 'Any')}</option>
            {models.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
          </select>
        </div>
      </div>

      {mode === 'REQUIREMENT' ? (
        <div className="grid gap-4 sm:grid-cols-3">
          <div><label className={labelClass} htmlFor="crm-yf">{t('crmForms.yearFrom', 'Year from')}</label><input id="crm-yf" type="number" min={1980} max={2100} value={form.yearFrom} onChange={(e) => set('yearFrom', e.target.value)} className={inputClass} placeholder="2018" /></div>
          <div><label className={labelClass} htmlFor="crm-yt">{t('crmForms.yearTo', 'Year to')}</label><input id="crm-yt" type="number" min={1980} max={2100} value={form.yearTo} onChange={(e) => set('yearTo', e.target.value)} className={inputClass} /></div>
          <div><label className={labelClass} htmlFor="crm-budget">{t('crmForms.budget', 'Budget up to (₹)')}</label><input id="crm-budget" type="number" min={0} value={form.budgetMax} onChange={(e) => set('budgetMax', e.target.value)} className={inputClass} placeholder="2000000" /></div>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-4">
          <div><label className={labelClass} htmlFor="crm-year">{t('crmForms.year', 'Manufacturing year')}</label><input id="crm-year" type="number" min={1980} max={2100} value={form.year} onChange={(e) => set('year', e.target.value)} className={inputClass} /></div>
          <div><label className={labelClass} htmlFor="crm-hours">{t('crmForms.hours', 'Hours run')}</label><input id="crm-hours" type="number" min={0} value={form.operatingHours} onChange={(e) => set('operatingHours', e.target.value)} className={inputClass} /></div>
          <div><label className={labelClass} htmlFor="crm-reg">{t('crmForms.registration', 'Registration no.')}</label><input data-sanitize="vehicle" id="crm-reg" value={form.registrationNumber} onChange={(e) => set('registrationNumber', e.target.value.toUpperCase())} className={inputClass} placeholder="CG04AB1234" /></div>
          <div><label className={labelClass} htmlFor="crm-price">{t('crmForms.expectedPrice', 'Expected price (₹)')}</label><input id="crm-price" type="number" min={0} value={form.expectedPrice} onChange={(e) => set('expectedPrice', e.target.value)} className={inputClass} /></div>
        </div>
      )}

      <div>
        <label className={labelClass} htmlFor="crm-message">{mode === 'REQUIREMENT' ? t('crmForms.requirementNotes', 'Anything else? (work type, attachments, finance needed…)') : t('crmForms.sellNotes', 'Condition, attachments, documents…')}</label>
        <textarea id="crm-message" rows={3} value={form.message} onChange={(e) => set('message', e.target.value)} className={inputClass} />
      </div>

      <button type="submit" disabled={busy} className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-[#F0C85C] px-5 py-3.5 text-sm font-bold text-gray-900 transition hover:bg-[#e8bb3f] disabled:opacity-60">
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <PhoneCall className="h-4 w-4" />}
        {mode === 'REQUIREMENT' ? t('crmForms.submitRequirement', 'Send my requirement') : t('crmForms.submitSell', 'Get a call back with an offer')}
      </button>
      <p className="text-center text-[11px] text-gray-400">{t('crmForms.consent', 'By submitting you agree to be contacted by JCB Exchange on call / WhatsApp about this enquiry.')}</p>
    </form>
  );
}
