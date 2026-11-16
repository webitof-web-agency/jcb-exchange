'use client';

import type { ChangeEvent, FormEvent } from 'react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import Image from 'next/image';
import { useParams } from 'next/navigation';
import { AlertCircle, CheckCircle2, Loader2, MapPin, Settings2, ShieldCheck, Truck, Upload, WalletCards } from 'lucide-react';
import ListingRtoFields from '@/components/listings/ListingRtoFields';
import SearchableSelect, { type Option } from '@/components/ui/SearchableSelect';
import api, { API_BASE_URL } from '@/lib/api';
import { getListingCompletionMediaError } from '@/lib/listingCompletionForm';
import { isListingCompletionSlotUploading, setListingCompletionSlotUploading, type ListingCompletionUploadState } from '@/lib/listingCompletionMedia';
import { emptyListingRtoForm, type ListingRtoFormState } from '@/lib/listingRtoForm';
import {
  getAbsoluteFileUrl,
  MAX_IMAGE_INPUT_SIZE,
  MAX_LISTING_VIDEO_DURATION_SECONDS,
  MAX_LISTING_VIDEO_INPUT_SIZE,
  prepareListingMediaForUpload,
  validateListingMediaFile,
  type ListingMediaKind,
} from '@/lib/fileUpload';
import { getSellVehicleSampleMedia } from '@/lib/sellVehicleSampleMedia.mjs';

type MediaItem = { id: string; fileUrl?: string; url?: string; fileName?: string; mimeType?: string; mediaType?: string; type?: string; slot?: string | null };
type RtoRecord = Partial<ListingRtoFormState> & { vehicleNumber?: string | null; vehicleType?: string | null; vehicleModel?: string | null; hourRunning?: number | null; insuranceValidUntil?: string | null };
type Listing = {
  id: string;
  title: string;
  ownerName: string | null;
  price: string | number;
  isNegotiable?: boolean;
  manufacturingYear: number;
  operatingHours?: number | null;
  locationState: string;
  locationCity: string;
  address: string | null;
  condition: string | null;
  description: string | null;
  additionalDescription: string | null;
  grossPower: string | null;
  engineNumber: string | null;
  category?: { id: string; name: string } | null;
  brand?: { id: string; name: string } | null;
  model?: { id: string; name: string } | null;
  rtoRecords?: RtoRecord[];
  media: MediaItem[];
};
type FormState = {
  title: string; ownerName: string; price: string; manufacturingYear: string; variant: string;
  registrationDate: string; registrationUpto: string; registrationNo: string; chassisOrSerialNo: string;
  engineNumber: string; previousOwners: string; condition: string; operatingHours: string; fuelType: string;
  transmission: string; locationState: string; locationCity: string; address: string; pinCode: string;
  nearbyLandmark: string; description: string; additionalDescription: string; grossPower: string;
  isNegotiable: boolean; insuranceExpiry: string; rtoDetails: ListingRtoFormState; selectedStateId: string; selectedCityId: string;
};
type MediaSlotKey = 'front-view' | 'rear-view' | 'left-side' | 'right-side' | 'front-left-angle' | 'front-right-angle' | 'rear-left-angle' | 'rear-right-angle' | 'chassis-number' | 'meter-reading' | 'dashboard-front' | 'dashboard-left' | 'dashboard-right' | 'walkaround-video';
type MediaSlotConfig = { key: MediaSlotKey; label: string; kind: ListingMediaKind };

const mediaSlots: MediaSlotConfig[] = [
  { key: 'front-view', label: 'Front View (Image)', kind: 'image' }, { key: 'rear-view', label: 'Rear View (Image)', kind: 'image' },
  { key: 'left-side', label: 'Left Side (Image)', kind: 'image' }, { key: 'right-side', label: 'Right Side (Image)', kind: 'image' },
  { key: 'front-left-angle', label: 'Front-Left Angle', kind: 'image' }, { key: 'front-right-angle', label: 'Front-Right Angle', kind: 'image' },
  { key: 'rear-left-angle', label: 'Rear-Left Angle', kind: 'image' }, { key: 'rear-right-angle', label: 'Rear-Right Angle', kind: 'image' },
  { key: 'chassis-number', label: 'Chassis Number', kind: 'image' }, { key: 'meter-reading', label: 'Meter Reading', kind: 'image' },
  { key: 'dashboard-front', label: 'Dashboard Front', kind: 'image' }, { key: 'dashboard-left', label: 'Dashboard Left', kind: 'image' },
  { key: 'dashboard-right', label: 'Dashboard Right', kind: 'image' }, { key: 'walkaround-video', label: 'Video (Max 1)', kind: 'video' },
];
const conditions = ['Excellent', 'Good', 'Fair', 'Needs Repair'];
const fuelTypes = ['Diesel', 'Electric', 'Petrol', 'Hybrid', 'Other'];
const transmissionTypes = ['Manual', 'Automatic', 'Semi-Automatic', 'Other'];
const mediaImageHelper = `Auto-compressed before upload. Max ${Math.round(MAX_IMAGE_INPUT_SIZE / (1024 * 1024))}MB input`;
const mediaVideoHelper = `Auto-compressed video (muted). Max ${Math.round(MAX_LISTING_VIDEO_INPUT_SIZE / (1024 * 1024))}MB and ${MAX_LISTING_VIDEO_DURATION_SECONDS} seconds`;
const apiUrl = (token: string, suffix = '') => `${API_BASE_URL}/listing-completion/${encodeURIComponent(token)}${suffix}`;
const inputClass = 'mt-1 w-full rounded-lg border border-gray-200 bg-[#F8FAFC] px-2.5 py-1.5 text-xs text-gray-900 outline-none transition placeholder:text-gray-400 focus:border-[#FFC107] focus:bg-white focus:ring-1 focus:ring-[#FFC107] h-[34px]';
const readOnlyClass = `${inputClass} bg-gray-100 text-gray-600`;
const toDateInput = (value: unknown) => { if (!value) return ''; const date = new Date(String(value)); return Number.isNaN(date.getTime()) ? String(value).slice(0, 10) : date.toISOString().slice(0, 10); };

type ParsedDescription = { rawDescription: string; variant: string; registrationDate: string; registrationUpto: string; registrationNo: string; ownerName: string; chassisOrSerialNo: string; previousOwners: string; fuelType: string; transmission: string; pinCode: string; nearbyLandmark: string; insuranceExpiry: string };
const parseStoredDescription = (description: string | null): ParsedDescription => {
  const result: ParsedDescription = { rawDescription: '', variant: '', registrationDate: '', registrationUpto: '', registrationNo: '', ownerName: '', chassisOrSerialNo: '', previousOwners: '', fuelType: '', transmission: '', pinCode: '', nearbyLandmark: '', insuranceExpiry: '' };
  const raw: string[] = [];
  const labels: Record<string, keyof ParsedDescription> = { variant: 'variant', 'registration date': 'registrationDate', 'registration upto': 'registrationUpto', 'registration no': 'registrationNo', 'registration number': 'registrationNo', owner: 'ownerName', 'owner name': 'ownerName', 'chassis / serial': 'chassisOrSerialNo', 'chassis/serial': 'chassisOrSerialNo', owners: 'previousOwners', fuel: 'fuelType', transmission: 'transmission', pin: 'pinCode', landmark: 'nearbyLandmark', 'insurance expiry': 'insuranceExpiry' };
  for (const line of String(description || '').split(/\r?\n/).map((item) => item.trim()).filter(Boolean)) {
    const separator = line.indexOf(':');
    if (separator < 0) { raw.push(line); continue; }
    const field = labels[line.slice(0, separator).trim().toLowerCase()];
    if (field) result[field] = line.slice(separator + 1).trim(); else raw.push(line);
  }
  result.rawDescription = raw.join('\n');
  return result;
};
const asRtoForm = (record?: RtoRecord): ListingRtoFormState => ({
  ...emptyListingRtoForm,
  hirePurchaseStatus: record?.hirePurchaseStatus === 'ACTIVE' || record?.hirePurchaseStatus === 'NOT_APPLICABLE' || record?.hirePurchaseStatus === 'TERMINATED' ? record.hirePurchaseStatus : 'PENDING',
  financerName: String(record?.financerName || ''),
  taxStatus: record?.taxStatus === 'VALID' || record?.taxStatus === 'EXPIRED' || record?.taxStatus === 'LIFETIME' ? record.taxStatus : 'NOT_AVAILABLE',
  taxValidUntil: toDateInput(record?.taxValidUntil), fitnessStatus: record?.fitnessStatus === 'VALID' || record?.fitnessStatus === 'EXPIRED' ? record.fitnessStatus : 'NOT_AVAILABLE',
  fitnessValidUntil: toDateInput(record?.fitnessValidUntil), insuranceStatus: record?.insuranceStatus === 'VALID' || record?.insuranceStatus === 'EXPIRED' ? record.insuranceStatus : 'NOT_AVAILABLE',
  pucStatus: record?.pucStatus === 'VALID' || record?.pucStatus === 'EXPIRED' ? record.pucStatus : 'NOT_AVAILABLE', pucValidUntil: toDateInput(record?.pucValidUntil),
  hsrpStatus: record?.hsrpStatus === 'YES' || record?.hsrpStatus === 'NO' || record?.hsrpStatus === 'NOT_APPLICABLE' ? record.hsrpStatus : 'PENDING',
  hsrpNumber: String(record?.hsrpNumber || ''), rtoOffice: String(record?.rtoOffice || ''), rtoAgentName: String(record?.rtoAgentName || ''),
  rtoExpenses: record?.rtoExpenses == null ? '' : String(record.rtoExpenses), vehicleMaintenanceCost: record?.vehicleMaintenanceCost == null ? '' : String(record.vehicleMaintenanceCost),
});
const compactObject = (value: Record<string, unknown>) => Object.fromEntries(Object.entries(value).filter(([, item]) => item !== '' && item !== undefined));

export default function ListingCompletionPage() {
  const params = useParams<{ token: string }>();
  const token = params.token;
  const [listing, setListing] = useState<Listing | null>(null); const [uploads, setUploads] = useState<MediaItem[]>([]); const [form, setForm] = useState<FormState | null>(null);
  const [expiresAt, setExpiresAt] = useState(''); const [loading, setLoading] = useState(true); const [saving, setSaving] = useState(false); const [error, setError] = useState(''); const [submitted, setSubmitted] = useState(false);
  const [activeTab, setActiveTab] = useState<'equipment' | 'rto' | 'media' | 'pricing' | 'all'>('equipment'); const [states, setStates] = useState<Option[]>([]); const [cities, setCities] = useState<Option[]>([]);
  const [uploadingSlots, setUploadingSlots] = useState<ListingCompletionUploadState>({}); const [mediaPreviews, setMediaPreviews] = useState<Partial<Record<MediaSlotKey, string>>>({});

  const loadInvite = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch(apiUrl(token), { headers: { Accept: 'application/json' }, cache: 'no-store' }); const body = await response.json();
      if (!response.ok) throw new Error(body.error || 'This completion link is unavailable.');
      const nextListing = body.listing as Listing; const parsed = parseStoredDescription(nextListing.description); const latestRto = nextListing.rtoRecords?.[0]; const price = Number(nextListing.price);
      setListing(nextListing); setUploads(body.uploads || []); setExpiresAt(body.expiresAt || '');
      setForm({ title: nextListing.title || '', ownerName: nextListing.ownerName || parsed.ownerName, price: Number.isFinite(price) && price > 0 ? String(price) : '', manufacturingYear: String(nextListing.manufacturingYear || ''), variant: parsed.variant, registrationDate: parsed.registrationDate, registrationUpto: parsed.registrationUpto, registrationNo: latestRto?.vehicleNumber || parsed.registrationNo, chassisOrSerialNo: parsed.chassisOrSerialNo, engineNumber: nextListing.engineNumber || '', previousOwners: parsed.previousOwners, condition: nextListing.condition || '', operatingHours: String(nextListing.operatingHours ?? latestRto?.hourRunning ?? ''), fuelType: parsed.fuelType, transmission: parsed.transmission, locationState: nextListing.locationState || '', locationCity: nextListing.locationCity || '', address: nextListing.address || '', pinCode: parsed.pinCode, nearbyLandmark: parsed.nearbyLandmark, description: parsed.rawDescription, additionalDescription: nextListing.additionalDescription || '', grossPower: nextListing.grossPower || '', isNegotiable: Boolean(nextListing.isNegotiable), insuranceExpiry: toDateInput(latestRto?.insuranceValidUntil || parsed.insuranceExpiry), rtoDetails: asRtoForm(latestRto), selectedStateId: '', selectedCityId: '' });
      setError('');
    } catch (loadError) { setError(loadError instanceof Error ? loadError.message : 'This completion link is unavailable.'); } finally { setLoading(false); }
  }, [token]);
  const locationState = form?.locationState || '';
  useEffect(() => { const timer = window.setTimeout(() => { void loadInvite(); }, 0); return () => window.clearTimeout(timer); }, [loadInvite]);
  useEffect(() => {
    let cancelled = false;
    const loadLocations = async () => { try { const countries = await api.get<Option[]>('/locations/countries'); const india = countries.data.find((item) => item.name.toLowerCase() === 'india'); if (!india) return; const stateResponse = await api.get<Option[]>(`/locations/states/${india.id}`); if (cancelled) return; setStates(stateResponse.data || []); const state = stateResponse.data.find((item) => item.name.toLowerCase() === locationState.toLowerCase()); if (!state) return; const cityResponse = await api.get<Option[]>(`/locations/cities/${state.id}`); if (cancelled) return; setCities(cityResponse.data || []); setForm((current) => current ? { ...current, selectedStateId: String(state.id), selectedCityId: String(cityResponse.data.find((item) => item.name.toLowerCase() === current.locationCity.toLowerCase())?.id || '') } : current); } catch { /* text fallback remains available */ } };
    if (locationState) void loadLocations(); return () => { cancelled = true; };
  }, [locationState]);
  const update = <K extends keyof FormState>(key: K, value: FormState[K]) => setForm((current) => current ? { ...current, [key]: value } : current);
  const updateRto = <K extends keyof ListingRtoFormState>(key: K, value: ListingRtoFormState[K]) => setForm((current) => current ? { ...current, rtoDetails: { ...current.rtoDetails, [key]: value } } : current);
  const loadCities = async (state: Option) => { update('locationState', state.name); update('locationCity', ''); update('selectedStateId', String(state.id)); update('selectedCityId', ''); try { const response = await api.get<Option[]>(`/locations/cities/${state.id}`); setCities(response.data || []); } catch { setCities([]); } };
  const slotMedia = useMemo(() => {
    const result: Partial<Record<MediaSlotKey, MediaItem>> = {}; const unassignedImages: MediaItem[] = [];
    const addMedia = (media: MediaItem) => { const slot = media.slot as MediaSlotKey | null | undefined; const isVideo = String(media.mediaType || media.type || media.mimeType || '').toUpperCase().includes('VIDEO'); if (slot && mediaSlots.some((item) => item.key === slot)) result[slot] = media; else if (isVideo) result['walkaround-video'] = media; else unassignedImages.push(media); };
    listing?.media.forEach(addMedia); uploads.forEach(addMedia); const remaining = mediaSlots.filter((item) => item.kind === 'image' && !result[item.key]).map((item) => item.key); unassignedImages.forEach((media, index) => { const slot = remaining[index]; if (slot && !result[slot]) result[slot] = media; }); return result;
  }, [listing?.media, uploads]);
  const uploadSlotFile = async (slot: MediaSlotConfig, file: File) => {
    if (slotMedia[slot.key]) { setError(`${slot.label} already has a file. Clear the existing slot before uploading another file.`); return; }
    setUploadingSlots((current) => setListingCompletionSlotUploading(current, slot.key, true)); setError('');
    try { await validateListingMediaFile(file, slot.kind); const prepared = await prepareListingMediaForUpload(file, slot.kind); const body = new FormData(); body.append('file', prepared); body.append('slot', slot.key); const response = await fetch(apiUrl(token, '/media'), { method: 'POST', body }); const result = await response.json(); if (!response.ok) throw new Error(result.error || 'Upload failed.'); setUploads((current) => [...current, result.media]); setMediaPreviews((current) => ({ ...current, [slot.key]: URL.createObjectURL(file) })); } catch (uploadError) { setError(uploadError instanceof Error ? uploadError.message : 'Upload failed.'); } finally { setUploadingSlots((current) => setListingCompletionSlotUploading(current, slot.key, false)); }
  };
  const submit = async (event: FormEvent) => {
    event.preventDefault(); if (!form || !listing) return; const media = Object.values(slotMedia); const validationError = getListingCompletionMediaError({ imageCount: media.filter((item) => !String(item?.mediaType || item?.type || item?.mimeType || '').toUpperCase().includes('VIDEO')).length, hasFrontPhoto: Boolean(slotMedia['front-view']), hasVideo: Boolean(slotMedia['walkaround-video']) }); if (validationError) { setError(validationError); return; }
    setSaving(true); setError('');
    try {
      const { insuranceExpiry, rtoDetails } = form;
      const completionForm = Object.fromEntries(
        Object.entries(form).filter(([key]) => !['insuranceExpiry', 'rtoDetails', 'selectedStateId', 'selectedCityId'].includes(key)),
      );
      const numeric = (value: string) => value.trim() ? Number(value) : undefined;
      const response = await fetch(apiUrl(token), { method: 'PUT', headers: { 'Content-Type': 'application/json', Accept: 'application/json' }, body: JSON.stringify({ ...completionForm, price: numeric(form.price), manufacturingYear: numeric(form.manufacturingYear), operatingHours: numeric(form.operatingHours), rtoDetails: compactObject({ ...rtoDetails, registrationNo: form.registrationNo, vehicleType: listing.category?.name || '', vehicleModel: listing.model?.name || listing.title, operatingHours: numeric(form.operatingHours), insuranceValidUntil: insuranceExpiry }) }) });
      const body = await response.json(); if (!response.ok) throw new Error(body.error || 'Unable to submit vehicle details.'); setSubmitted(true);
    } catch (submitError) { setError(submitError instanceof Error ? submitError.message : 'Unable to submit vehicle details.'); } finally { setSaving(false); }
  };
  const anyUploading = Object.values(uploadingSlots).some(Boolean); const expiresLabel = expiresAt ? new Date(expiresAt).toLocaleString() : 'the expiry time';
  if (submitted) return <main className="flex min-h-screen items-center justify-center bg-slate-50 px-4 py-10"><section className="w-full max-w-lg rounded-3xl border border-emerald-100 bg-white p-8 text-center shadow-xl"><CheckCircle2 className="mx-auto h-14 w-14 text-emerald-500" /><h1 className="mt-4 text-2xl font-bold text-slate-900">Details submitted successfully</h1><p className="mt-2 text-sm text-slate-600">The partner will review this listing and then send it for admin approval. This link is now invalid and cannot be reused.</p></section></main>;
  if (loading) return <main className="flex min-h-screen items-center justify-center bg-slate-50"><Loader2 className="h-8 w-8 animate-spin text-amber-500" /></main>;
  if (!listing || !form) return <main className="flex min-h-screen items-center justify-center bg-slate-50 px-4"><section className="max-w-md rounded-3xl border border-red-100 bg-white p-8 text-center shadow-xl"><AlertCircle className="mx-auto h-12 w-12 text-red-500" /><h1 className="mt-4 text-xl font-bold text-slate-900">Link unavailable</h1><p className="mt-2 text-sm text-red-600">{error || 'This vehicle completion link has expired or is no longer valid.'}</p></section></main>;
  const tabs = [['equipment', 'Equipment & Specs', Truck], ['rto', 'RTO Compliance', ShieldCheck], ['media', 'Media Uploads', Upload], ['pricing', 'Price & Location', MapPin] ] as const;
  return <main className="min-h-screen bg-slate-50 px-4 py-6 sm:py-10"><div className="mx-auto max-w-5xl">
    <header className="rounded-3xl bg-slate-950 px-6 py-7 text-white shadow-xl sm:px-8"><div className="flex items-center gap-3"><ShieldCheck className="h-7 w-7 text-amber-400" /><span className="text-sm font-semibold tracking-wide text-amber-300">JCB Exchange secure vehicle form</span></div><h1 className="mt-4 text-2xl font-bold sm:text-3xl">Complete vehicle listing details</h1><p className="mt-2 max-w-3xl text-sm text-slate-300">This private link is restricted to one vehicle, expires {expiresLabel}, and becomes invalid after successful submission. Existing values are prefilled; complete the missing fields and media.</p><div className="mt-4 flex flex-wrap gap-2 text-xs text-slate-300"><span className="rounded-full bg-white/10 px-3 py-1">{listing.brand?.name || 'Brand pending'}</span><span className="rounded-full bg-white/10 px-3 py-1">{listing.model?.name || 'Model pending'}</span><span className="rounded-full bg-white/10 px-3 py-1">{listing.category?.name || 'Vehicle listing'}</span></div></header>
    <div className="mt-5 flex items-center justify-between gap-2 overflow-x-auto rounded-2xl border border-gray-200 bg-white p-2 shadow-sm [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"><div className="flex items-center gap-1">{tabs.map(([key, label, Icon]) => <button key={key} type="button" onClick={() => setActiveTab(key)} className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-lg px-3 py-2 text-xs font-semibold transition ${activeTab === key ? 'bg-gray-900 text-white shadow-sm' : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'}`}><Icon className={`h-3.5 w-3.5 ${activeTab === key ? 'text-[#FFC107]' : 'text-gray-400'}`} />{label}{key === 'media' ? <span className="rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] text-amber-800">{Object.keys(slotMedia).length}/14</span> : null}</button>)}</div><button type="button" onClick={() => setActiveTab(activeTab === 'all' ? 'equipment' : 'all')} className={`hidden shrink-0 items-center gap-1 rounded-lg border px-2.5 py-2 text-xs font-semibold sm:inline-flex ${activeTab === 'all' ? 'border-amber-300 bg-amber-100 text-amber-900' : 'border-gray-200 bg-white text-gray-500 hover:bg-gray-100 hover:text-gray-900'}`}>{activeTab === 'all' ? 'Tab View' : 'View All'}</button></div>
    <form onSubmit={submit} noValidate className="mt-5 space-y-5">{error ? <div role="alert" className="flex items-start gap-2 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700"><AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />{error}</div> : null}
      <section className={`${activeTab !== 'equipment' && activeTab !== 'all' ? 'hidden' : ''} rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-7`}><SectionTitle icon={Truck} title="Equipment & specs" description="Same listing form fields. Existing values are prefilled; fill any missing information." /><div className="mt-5 grid gap-4 sm:grid-cols-2">
        <label className="sm:col-span-2 text-sm font-semibold text-slate-700">Vehicle title<input className={inputClass} value={form.title} onChange={(e) => update('title', e.target.value)} /></label>
        <label className="text-sm font-semibold text-slate-700">Category<SearchableSelect options={listing.category ? [{ id: listing.category.id, name: listing.category.name }] : []} value={listing.category?.id || ''} displayValue={listing.category?.name || ''} onChange={() => undefined} disabled searchable={false} size="sm" className="mt-1 bg-[#F8FAFC]" /></label>
        <label className="text-sm font-semibold text-slate-700">Brand<SearchableSelect options={listing.brand ? [{ id: listing.brand.id, name: listing.brand.name }] : []} value={listing.brand?.id || ''} displayValue={listing.brand?.name || ''} onChange={() => undefined} disabled searchable={false} size="sm" className="mt-1 bg-[#F8FAFC]" /></label>
        <label className="text-sm font-semibold text-slate-700">Model<input readOnly className={readOnlyClass} value={listing.model?.name || ''} /></label><label className="text-sm font-semibold text-slate-700">Owner name<input className={inputClass} value={form.ownerName} onChange={(e) => update('ownerName', e.target.value)} /></label>
        <label className="text-sm font-semibold text-slate-700">Variant<input className={inputClass} value={form.variant} onChange={(e) => update('variant', e.target.value)} /></label><label className="text-sm font-semibold text-slate-700">Manufacturing year<input type="number" min="1950" max={new Date().getFullYear() + 1} className={inputClass} value={form.manufacturingYear} onChange={(e) => update('manufacturingYear', e.target.value)} /></label>
        <label className="text-sm font-semibold text-slate-700">Condition<SearchableSelect options={conditions.map((item) => ({ id: item, name: item }))} value={form.condition} onChange={(option) => update('condition', String(option.id))} placeholder="Select condition" searchable={false} size="sm" className="mt-1 bg-[#F8FAFC]" /></label>
        <label className="text-sm font-semibold text-slate-700">Registration number<input className={inputClass} value={form.registrationNo} onChange={(e) => update('registrationNo', e.target.value.toUpperCase())} /></label><label className="text-sm font-semibold text-slate-700">Chassis / serial number<input className={inputClass} value={form.chassisOrSerialNo} onChange={(e) => update('chassisOrSerialNo', e.target.value.toUpperCase())} /></label>
        <label className="text-sm font-semibold text-slate-700">Engine number<input className={inputClass} value={form.engineNumber} onChange={(e) => update('engineNumber', e.target.value.toUpperCase())} /></label><label className="text-sm font-semibold text-slate-700">Horsepower / gross power<input className={inputClass} value={form.grossPower} onChange={(e) => update('grossPower', e.target.value)} /></label>
        <label className="text-sm font-semibold text-slate-700">Registration date<input type="date" className={inputClass} value={form.registrationDate} onChange={(e) => update('registrationDate', e.target.value)} /></label><label className="text-sm font-semibold text-slate-700">Registration valid upto<input type="date" className={inputClass} value={form.registrationUpto} onChange={(e) => update('registrationUpto', e.target.value)} /></label>
        <label className="text-sm font-semibold text-slate-700">Previous owners<input className={inputClass} value={form.previousOwners} onChange={(e) => update('previousOwners', e.target.value)} /></label><label className="text-sm font-semibold text-slate-700">Operating hours<input type="number" min="0" className={inputClass} value={form.operatingHours} onChange={(e) => update('operatingHours', e.target.value)} /></label>
        <label className="text-sm font-semibold text-slate-700">Fuel type<SearchableSelect options={fuelTypes.map((item) => ({ id: item, name: item }))} value={form.fuelType} onChange={(option) => update('fuelType', String(option.id))} placeholder="Select fuel type" searchable={false} size="sm" className="mt-1 bg-[#F8FAFC]" /></label><label className="text-sm font-semibold text-slate-700">Transmission<SearchableSelect options={transmissionTypes.map((item) => ({ id: item, name: item }))} value={form.transmission} onChange={(option) => update('transmission', String(option.id))} placeholder="Select transmission" searchable={false} size="sm" className="mt-1 bg-[#F8FAFC]" /></label>
      </div></section>
      <section className={`${activeTab !== 'rto' && activeTab !== 'all' ? 'hidden' : ''} rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-7`}><SectionTitle icon={Settings2} title="RTO & vehicle compliance" description="Complete compliance information; partner will perform the final review." /><div className="mt-5"><ListingRtoFields value={form.rtoDetails} onChange={updateRto} insuranceExpiry={form.insuranceExpiry} onInsuranceExpiryChange={(value) => update('insuranceExpiry', value)} required={false} manufacturingYear={form.manufacturingYear} /></div></section>
      <section className={`${activeTab !== 'pricing' && activeTab !== 'all' ? 'hidden' : ''} rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-7`}><SectionTitle icon={MapPin} title="Price & location" description="Complete the remaining listing information. Partner reviews before admin approval." /><div className="mt-5 grid gap-4 sm:grid-cols-2">
        <label className="text-sm font-semibold text-slate-700">Price<input type="number" min="1" className={inputClass} value={form.price} onChange={(e) => update('price', e.target.value)} /></label><label className="flex items-center gap-3 self-end rounded-xl border border-slate-200 px-3 py-3 text-sm font-semibold text-slate-700"><input type="checkbox" checked={form.isNegotiable} onChange={(e) => update('isNegotiable', e.target.checked)} className="h-4 w-4 accent-amber-500" />Price is negotiable</label>
        <label className="text-sm font-semibold text-slate-700">State<SearchableSelect options={states.length ? states : (form.locationState ? [{ id: form.locationState, name: form.locationState }] : [])} value={form.selectedStateId || form.locationState} displayValue={form.locationState} onChange={(option) => void loadCities(option)} placeholder="Select state" size="sm" className="mt-1 bg-[#F8FAFC]" /></label><label className="text-sm font-semibold text-slate-700">City<SearchableSelect options={cities.length ? cities : (form.locationCity ? [{ id: form.locationCity, name: form.locationCity }] : [])} value={form.selectedCityId || form.locationCity} displayValue={form.locationCity} onChange={(option) => { update('locationCity', option.name); update('selectedCityId', String(option.id)); }} placeholder="Select city" disabled={!form.selectedStateId && !form.locationState} size="sm" className="mt-1 bg-[#F8FAFC]" /></label>
        <label className="sm:col-span-2 text-sm font-semibold text-slate-700">Address<input className={inputClass} value={form.address} onChange={(e) => update('address', e.target.value)} /></label><label className="text-sm font-semibold text-slate-700">PIN code<input className={inputClass} value={form.pinCode} onChange={(e) => update('pinCode', e.target.value.replace(/\D/g, '').slice(0, 6))} /></label><label className="text-sm font-semibold text-slate-700">Nearby landmark<input className={inputClass} value={form.nearbyLandmark} onChange={(e) => update('nearbyLandmark', e.target.value)} /></label>
        <label className="sm:col-span-2 text-sm font-semibold text-slate-700">Description<textarea rows={4} className={inputClass} value={form.description} onChange={(e) => update('description', e.target.value)} /></label><label className="sm:col-span-2 text-sm font-semibold text-slate-700">Additional details<textarea rows={3} className={inputClass} value={form.additionalDescription} onChange={(e) => update('additionalDescription', e.target.value)} /></label>
      </div></section>
      <section className={`${activeTab !== 'media' && activeTab !== 'all' ? 'hidden' : ''} rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-7`}><div className="flex flex-wrap items-center justify-between gap-2 border-b border-gray-100 pb-3"><div className="flex items-center gap-2"><Upload className="h-5 w-5 text-amber-500" /><div><h2 className="text-lg font-bold text-slate-900">Media Gallery (14 slots)</h2><p className="mt-1 text-xs text-slate-500">One front photo and one walkaround video are required before submission.</p></div></div><span className="rounded-full border border-amber-200 bg-amber-50 px-2 py-1 text-[10px] font-bold text-amber-800">{Object.keys(slotMedia).length} of 14 uploaded</span></div><div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-7">{mediaSlots.map((slot) => <CompletionMediaSlot key={slot.key} slot={slot} media={slotMedia[slot.key]} previewUrl={mediaPreviews[slot.key] || ''} uploading={isListingCompletionSlotUploading(uploadingSlots, slot.key)} onUpload={(file) => void uploadSlotFile(slot, file)} />)}</div></section>
      <button type="submit" disabled={saving || anyUploading} className="flex w-full items-center justify-center gap-2 rounded-2xl bg-slate-950 px-5 py-3.5 text-sm font-bold text-white shadow-lg transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50">{saving ? <Loader2 className="h-5 w-5 animate-spin" /> : <WalletCards className="h-5 w-5" />}Submit vehicle details</button><p className="pb-4 text-center text-xs text-slate-500">After successful submission, the partner reviews this draft and then sends it to the admin approval queue. This secure link cannot be reused.</p>
    </form>
  </div></main>;
}

function SectionTitle({ icon: Icon, title, description }: { icon: typeof Truck; title: string; description: string }) { return <div className="flex items-center gap-3"><Icon className="h-6 w-6 text-amber-500" /><div><h2 className="text-lg font-bold text-slate-900">{title}</h2><p className="text-xs text-slate-500">{description}</p></div></div>; }
function CompletionMediaSlot({ slot, media, previewUrl, uploading, onUpload }: { slot: MediaSlotConfig; media?: MediaItem; previewUrl: string; uploading: boolean; onUpload: (file: File) => void }) {
  const source = previewUrl || media?.fileUrl || media?.url || ''; const sampleMedia = getSellVehicleSampleMedia(slot.key); const sourceUrl = source && !source.startsWith('blob:') ? getAbsoluteFileUrl(source) : source;
  return <div className="space-y-1.5"><label className="relative flex min-h-[154px] cursor-pointer flex-col items-center justify-center overflow-hidden rounded-xl border-2 border-dashed border-gray-300 bg-gray-50/60 p-3 transition hover:border-[#FFC107] hover:bg-[#FFC107]/5">{sourceUrl && slot.kind === 'image' ? <Image src={sourceUrl} alt={slot.label} fill unoptimized className="object-cover" /> : null}{sourceUrl && slot.kind === 'video' ? <video src={sourceUrl} muted controls playsInline preload="metadata" className="absolute inset-0 h-full w-full object-cover" /> : null}{!sourceUrl && sampleMedia?.kind === 'image' ? <Image src={sampleMedia.src} alt={`Example ${slot.label}`} fill unoptimized aria-hidden className="object-cover opacity-45" /> : null}{!sourceUrl && sampleMedia?.kind === 'video' ? <video src={sampleMedia.src} muted loop autoPlay playsInline preload="metadata" aria-hidden className="pointer-events-none absolute inset-0 h-full w-full object-cover opacity-45" /> : null}<div className={`relative z-10 flex flex-col items-center text-center ${sourceUrl || sampleMedia ? 'rounded-lg bg-white/90 px-2 py-1.5 shadow-sm' : ''}`}>{sourceUrl ? <CheckCircle2 className="mb-1 h-5 w-5 text-emerald-600" /> : <Upload className="mb-1 h-5 w-5 text-gray-400" />}<span className="text-[11px] font-semibold text-gray-700">{slot.label}</span>{sourceUrl ? <span className="mt-1 text-[10px] text-emerald-700">Uploaded</span> : null}{uploading ? <span className="mt-1 text-[10px] text-amber-700">Optimizing &amp; uploading...</span> : null}</div><input type="file" accept={slot.kind === 'video' ? 'video/mp4,video/webm,video/quicktime,.mp4,.webm,.mov' : 'image/jpeg,image/png,image/webp'} className="absolute inset-0 h-full w-full cursor-pointer opacity-0" disabled={uploading || Boolean(media)} onChange={(event: ChangeEvent<HTMLInputElement>) => { const file = event.target.files?.[0]; if (file) onUpload(file); event.currentTarget.value = ''; }} /></label><p className="min-h-7 text-[10px] leading-snug text-gray-500">{slot.kind === 'video' ? mediaVideoHelper : mediaImageHelper}</p></div>;
}
