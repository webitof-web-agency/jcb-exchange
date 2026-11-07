'use client';

import { FormEvent, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import { AlertCircle, ArrowRight, CheckCircle2, Eye, EyeOff, Loader2, Lock, Mail, Phone, User } from 'lucide-react';
import api from '@/lib/api';
import { useAuthStore } from '@/store/authStore';
import { sanitizeEmail, sanitizeMobile, sanitizeName, sanitizePassword, isValidIndianMobile } from '@/lib/authSanitization';

type LocationOption = { id: string | number; name: string };
type GstState = {
  status: 'idle' | 'loading' | 'verified' | 'error';
  claimToken?: string;
  businessName?: string | null;
  legalName?: string | null;
  maskedGstin?: string | null;
  message?: string;
};

const GSTIN_PATTERN = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][A-Z0-9]Z[A-Z0-9]$/;
const CONSUMER_EMAIL_DOMAINS = new Set(['aol.com', 'gmx.com', 'gmail.com', 'gmail.in', 'googlemail.com', 'hotmail.com', 'icloud.com', 'live.com', 'mail.com', 'me.com', 'msn.com', 'outlook.com', 'proton.me', 'protonmail.com', 'rediffmail.com', 'yahoo.com', 'yahoo.co.in', 'ymail.com']);
const fieldClass = 'h-11 w-full rounded-xl border border-zinc-200 bg-zinc-50/70 px-3.5 text-sm text-zinc-900 outline-none transition focus:border-amber-500 focus:bg-white focus:ring-4 focus:ring-amber-500/15';

const isBusinessEmail = (value: string) => {
  const normalized = value.trim().toLowerCase();
  const [, domain = ''] = normalized.split('@');
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized) && Boolean(domain) && !CONSUMER_EMAIL_DOMAINS.has(domain);
};

const apiError = (error: unknown, fallback: string) => {
  if (error && typeof error === 'object' && 'response' in error) {
    const response = (error as { response?: { data?: { error?: string; message?: string } } }).response;
    return response?.data?.error || response?.data?.message || fallback;
  }
  return fallback;
};

export default function PartnerSignupPage() {
  const router = useRouter();
  const setAuth = useAuthStore((state) => state.setAuth);
  const [name, setName] = useState('');
  const [mobile, setMobile] = useState('');
  const [whatsappSameAsMobile, setWhatsappSameAsMobile] = useState(true);
  const [whatsappNumber, setWhatsappNumber] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [countries, setCountries] = useState<LocationOption[]>([]);
  const [states, setStates] = useState<LocationOption[]>([]);
  const [cities, setCities] = useState<LocationOption[]>([]);
  const [countryId, setCountryId] = useState('');
  const [stateId, setStateId] = useState('');
  const [cityId, setCityId] = useState('');
  const [gstin, setGstin] = useState('');
  const [gst, setGst] = useState<GstState>({ status: 'idle' });
  const [loadingLocations, setLoadingLocations] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    api.get<LocationOption[]>('/locations/countries')
      .then((response) => {
        if (cancelled) return;
        const options = Array.isArray(response.data) ? response.data : [];
        setCountries(options);
        const india = options.find((option) => option.name.trim().toLowerCase() === 'india');
        if (india) setCountryId(String(india.id));
      })
      .catch(() => { if (!cancelled) setError('Country list could not be loaded. Please refresh.'); })
      .finally(() => { if (!cancelled) setLoadingLocations(false); });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!countryId) return;
    let cancelled = false;
    api.get<LocationOption[]>(`/locations/states/${countryId}`)
      .then((response) => { if (!cancelled) setStates(Array.isArray(response.data) ? response.data : []); })
      .catch(() => { if (!cancelled) setError('State list could not be loaded. Please try again.'); });
    return () => { cancelled = true; };
  }, [countryId]);

  useEffect(() => {
    if (!stateId) return;
    let cancelled = false;
    api.get<LocationOption[]>(`/locations/cities/${stateId}`)
      .then((response) => { if (!cancelled) setCities(Array.isArray(response.data) ? response.data : []); })
      .catch(() => { if (!cancelled) setError('City list could not be loaded. Please try again.'); });
    return () => { cancelled = true; };
  }, [stateId]);

  const verifyGst = async () => {
    setError('');
    const cleanGstin = gstin.replace(/\s/g, '').toUpperCase();
    const cleanEmail = sanitizeEmail(email);
    const cleanMobile = sanitizeMobile(mobile);
    if (!GSTIN_PATTERN.test(cleanGstin)) return setGst({ status: 'error', message: 'Enter a valid 15-character GSTIN.' });
    if (!isBusinessEmail(cleanEmail)) return setGst({ status: 'error', message: 'Use your dealership/company email. Gmail and other personal email providers are not accepted.' });
    if (!isValidIndianMobile(cleanMobile)) return setGst({ status: 'error', message: 'Enter a valid 10-digit mobile number first.' });
    if (!countryId || !stateId || !cityId) return setGst({ status: 'error', message: 'Select country, state and city first.' });
    setGst({ status: 'loading' });
    try {
      const response = await api.post('/auth/partner/signup/verify-gstin', {
        gstin: cleanGstin, email: cleanEmail, mobile: cleanMobile,
        countryId: Number(countryId), stateId: Number(stateId), cityId: Number(cityId),
      });
      const result = response.data as { claimToken?: string; status?: string; businessName?: string | null; legalName?: string | null; maskedGstin?: string | null };
      if (!result.claimToken || result.status !== 'SUCCESS') throw new Error('GST verification did not return a valid claim.');
      setGstin(cleanGstin);
      setGst({ status: 'verified', claimToken: result.claimToken, businessName: result.businessName, legalName: result.legalName, maskedGstin: result.maskedGstin });
    } catch (verificationError) {
      setGst({ status: 'error', message: apiError(verificationError, 'GST verification could not be completed.') });
    }
  };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError('');
    const cleanName = sanitizeName(name);
    const cleanEmail = sanitizeEmail(email);
    const cleanMobile = sanitizeMobile(mobile);
    const cleanWhatsapp = whatsappSameAsMobile ? cleanMobile : sanitizeMobile(whatsappNumber);
    const cleanPassword = sanitizePassword(password);
    const cleanConfirm = sanitizePassword(confirmPassword);
    if (!cleanName) return setError('Please enter the dealer name.');
    if (!isValidIndianMobile(cleanMobile)) return setError('Please enter a valid 10-digit mobile number.');
    if (!isValidIndianMobile(cleanWhatsapp)) return setError('Please enter a valid WhatsApp number.');
    if (!isBusinessEmail(cleanEmail)) return setError('Use your dealership/company email. Gmail and other personal email providers are not accepted.');
    if (!countryId || !stateId || !cityId) return setError('Please select country, state and city.');
    if (gst.status !== 'verified' || !gst.claimToken) return setError('Please verify the dealer GSTIN before registering.');
    if (cleanPassword.length < 8) return setError('Password must be at least 8 characters.');
    if (cleanPassword !== cleanConfirm) return setError('Passwords do not match.');
    setLoading(true);
    try {
      const response = await api.post('/auth/register', {
        name: cleanName, dealerName: cleanName, email: cleanEmail, mobile: cleanMobile,
        whatsappSameAsMobile, whatsappNumber: cleanWhatsapp, password: cleanPassword,
        registrationType: 'PARTNER', gstClaimToken: gst.claimToken,
        countryId: Number(countryId), stateId: Number(stateId), cityId: Number(cityId),
      });
      setAuth(response.data.token, response.data.user);
      router.replace('/profile?tab=listings');
    } catch (registrationError) {
      setError(apiError(registrationError, 'Partner registration could not be completed.'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="min-h-screen bg-zinc-950 px-4 py-8 text-zinc-900">
      <div className="fixed inset-0 bg-[url('/jcb-bg.webp')] bg-cover bg-center opacity-35" aria-hidden="true" />
      <section className="relative mx-auto w-full max-w-2xl overflow-hidden rounded-3xl bg-white shadow-2xl">
        <div className="h-1.5 bg-gradient-to-r from-amber-400 via-yellow-400 to-amber-500" />
        <div className="p-6 sm:p-9">
          <div className="mb-7 text-center">
            <Link href="/" className="inline-block"><Image src="/Logo-black.webp" alt="JCB Exchange" width={220} height={80} priority className="mx-auto h-14 w-auto object-contain" /></Link>
            <p className="mt-3 inline-flex rounded-full border border-zinc-200 bg-zinc-100 px-3 py-1 text-xs font-semibold text-zinc-700">Partner Registration</p>
            <h1 className="mt-4 text-2xl font-bold">Register as a verified dealer partner</h1>
            <p className="mt-2 text-sm text-zinc-500">Verify your GSTIN first. Your partner ID will be generated from state, city and dealer name.</p>
          </div>
          {error && <div className="mb-5 flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 p-3 text-sm font-medium text-red-700"><AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />{error}</div>}
          <form onSubmit={submit} className="space-y-4">
            <label className="block text-sm font-semibold">Dealer name<div className="relative mt-1.5"><User className="absolute left-3 top-3 h-4 w-4 text-zinc-400" /><input value={name} onChange={(e) => setName(e.target.value)} className={`${fieldClass} pl-10`} placeholder="Enter dealer name" required /></div></label>
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="block text-sm font-semibold">Mobile number<div className="relative mt-1.5"><Phone className="absolute left-3 top-3 h-4 w-4 text-zinc-400" /><input value={mobile} onChange={(e) => setMobile(e.target.value.replace(/\D/g, '').slice(0, 10))} className={`${fieldClass} pl-10`} placeholder="10-digit mobile number" inputMode="numeric" required /></div></label>
              <label className="block text-sm font-semibold">Business email<div className="relative mt-1.5"><Mail className="absolute left-3 top-3 h-4 w-4 text-zinc-400" /><input type="email" value={email} onChange={(e) => { setEmail(e.target.value); setGst({ status: 'idle' }); }} className={`${fieldClass} pl-10`} placeholder="dealer@yourcompany.in" required /></div><p className="mt-1 text-xs text-zinc-500">Use your dealership/company domain. Gmail, Yahoo, Outlook and other personal email providers are not accepted.</p></label>
            </div>
            <label className="flex items-center gap-2 text-sm text-zinc-700"><input type="checkbox" checked={whatsappSameAsMobile} onChange={(e) => setWhatsappSameAsMobile(e.target.checked)} className="h-4 w-4 rounded border-zinc-300 text-amber-500" />Mobile number is also my WhatsApp number</label>
            {!whatsappSameAsMobile && <label className="block text-sm font-semibold">WhatsApp number<input value={whatsappNumber} onChange={(e) => setWhatsappNumber(e.target.value.replace(/\D/g, '').slice(0, 10))} className={`${fieldClass} mt-1.5`} placeholder="10-digit WhatsApp number" required /></label>}
            <div className="grid gap-3 sm:grid-cols-3">
              <select value={countryId} onChange={(e) => { setCountryId(e.target.value); setStates([]); setCities([]); setStateId(''); setCityId(''); setGst({ status: 'idle' }); }} className={fieldClass} required disabled={loadingLocations}><option value="">Select country</option>{countries.map((option) => <option key={option.id} value={option.id}>{option.name}</option>)}</select>
              <select value={stateId} onChange={(e) => { setStateId(e.target.value); setCities([]); setCityId(''); setGst({ status: 'idle' }); }} className={fieldClass} required disabled={!countryId || !states.length}><option value="">Select state</option>{states.map((option) => <option key={option.id} value={option.id}>{option.name}</option>)}</select>
              <select value={cityId} onChange={(e) => { setCityId(e.target.value); setGst({ status: 'idle' }); }} className={fieldClass} required disabled={!stateId || !cities.length}><option value="">Select city</option>{cities.map((option) => <option key={option.id} value={option.id}>{option.name}</option>)}</select>
            </div>
            <div className="rounded-2xl border border-amber-200 bg-amber-50/60 p-4">
              <div className="flex items-center justify-between gap-3"><label className="text-sm font-semibold">GSTIN verification</label>{gst.status === 'verified' && <span className="inline-flex items-center gap-1 text-xs font-bold text-emerald-700"><CheckCircle2 className="h-4 w-4" />Verified</span>}</div>
              <div className="mt-2 flex gap-2"><input value={gstin} onChange={(e) => { setGstin(e.target.value.replace(/\s/g, '').toUpperCase().slice(0, 15)); setGst({ status: 'idle' }); }} className={`${fieldClass} min-w-0 flex-1 bg-white`} placeholder="15-character GSTIN" required /><button type="button" onClick={() => void verifyGst()} disabled={gst.status === 'loading' || loading} className="h-11 shrink-0 rounded-xl bg-amber-400 px-4 text-sm font-bold text-zinc-900 disabled:opacity-60">{gst.status === 'loading' ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Verify'}</button></div>
              {gst.status === 'verified' && <p className="mt-2 text-xs font-medium text-emerald-700">{gst.businessName || gst.legalName || gst.maskedGstin || 'GSTIN verified successfully.'}</p>}
              {gst.status === 'error' && <p className="mt-2 text-xs font-medium text-red-700">{gst.message}</p>}
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="block text-sm font-semibold">Password<div className="relative mt-1.5"><Lock className="absolute left-3 top-3 h-4 w-4 text-zinc-400" /><input type={showPassword ? 'text' : 'password'} value={password} onChange={(e) => setPassword(e.target.value)} className={`${fieldClass} pl-10 pr-10`} placeholder="Minimum 8 characters" required /><button type="button" onClick={() => setShowPassword((value) => !value)} className="absolute right-3 top-3 text-zinc-400" aria-label="Toggle password visibility">{showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}</button></div></label>
              <label className="block text-sm font-semibold">Confirm password<div className="relative mt-1.5"><Lock className="absolute left-3 top-3 h-4 w-4 text-zinc-400" /><input type={showConfirmPassword ? 'text' : 'password'} value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} className={`${fieldClass} pl-10 pr-10`} placeholder="Re-enter password" required /><button type="button" onClick={() => setShowConfirmPassword((value) => !value)} className="absolute right-3 top-3 text-zinc-400" aria-label="Toggle confirm password visibility">{showConfirmPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}</button></div></label>
            </div>
            <button type="submit" disabled={loading || gst.status !== 'verified'} className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-amber-400 text-base font-bold text-zinc-950 shadow-sm transition hover:bg-amber-300 disabled:cursor-not-allowed disabled:opacity-60">{loading ? <Loader2 className="h-5 w-5 animate-spin" /> : <>Register as Partner <ArrowRight className="h-5 w-5" /></>}</button>
          </form>
          <p className="mt-6 text-center text-sm text-zinc-500">Already have an account? <Link href="/login" className="font-bold text-zinc-900 hover:underline">Sign in</Link></p>
        </div>
      </section>
    </main>
  );
}
