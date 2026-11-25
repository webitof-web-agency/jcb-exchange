'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  Award,
  Briefcase,
  CheckCircle2,
  ChevronDown,
  Download,
  ExternalLink,
  FileText,
  Loader2,
  PenLine,
  Type,
  Upload,
  XCircle,
} from 'lucide-react';
import api, { API_BASE_URL } from '@/lib/api';
import { getApiErrorMessage } from '@/lib/apiError.mjs';
import SignaturePad from '@/components/offer/SignaturePad';
import {
  ACCEPTANCE_METHOD_LABELS,
  EMPLOYMENT_TYPE_LABELS,
  checkSignedCopyFile,
  describeDays,
  describeMonths,
  formatDate,
  formatDateTime,
  formatInr,
  salaryBreakupTotals,
  validateAcceptanceForm,
  validateDeclineReason,
} from '@/lib/offerResponse.mjs';

type OfferStatus = 'DRAFT' | 'SENT' | 'ACCEPTED' | 'DECLINED' | 'EXPIRED' | 'WITHDRAWN';
type SignMethod = 'TYPED' | 'DRAWN' | 'UPLOADED_SCAN';

type PublicOffer = {
  id: string;
  status: OfferStatus;
  companyName: string;
  letterNo: string | null;
  letterDate: string | null;
  candidateName: string;
  jobTitle: string;
  designation: string;
  department: string;
  placeOfPosting: string;
  employmentType: string | null;
  reportingManager: string | null;
  joiningDate: string | null;
  offerValidUntil: string | null;
  probationPeriod: string | null;
  noticePeriod: string | null;
  salary: {
    amount: number;
    period: 'month' | 'annum';
    annualCtc: number;
    components: Array<{ code: string; name: string; componentType: 'EARNING' | 'EMPLOYER_CONTRIBUTION'; monthlyAmount: number }>;
  };
  additionalTerms: string | null;
  application: {
    applicationRef: string;
    appliedAt: string;
    jobLocation: string;
    /** Null once the offer is answered or closed (personal details are only shown while it is open). */
    details: Record<string, string | number | null> | null;
    answers: Array<{ question: string; answer: string }>;
  };
  offerLetterFileName: string | null;
  offerLetterAvailable: boolean;
  acceptance: null | { method: string | null; name: string | null; place: string | null; acceptedAt: string | null; certificateAvailable: boolean };
};

type LoadState = { kind: 'loading' } | { kind: 'missing' } | { kind: 'error'; message: string } | { kind: 'ready'; offer: PublicOffer };

const SIGNATURE_FONT = "'Segoe Script', 'Brush Script MT', 'Lucida Handwriting', 'Apple Chancery', cursive";

const STATUS_BADGES: Record<OfferStatus, { label: string; className: string }> = {
  DRAFT: { label: 'Draft', className: 'bg-gray-100 text-gray-700' },
  SENT: { label: 'Awaiting your response', className: 'bg-amber-100 text-amber-800' },
  ACCEPTED: { label: 'Accepted', className: 'bg-emerald-100 text-emerald-800' },
  DECLINED: { label: 'Declined', className: 'bg-rose-100 text-rose-800' },
  EXPIRED: { label: 'Expired', className: 'bg-gray-200 text-gray-700' },
  WITHDRAWN: { label: 'Withdrawn', className: 'bg-gray-200 text-gray-700' },
};

const DETAIL_LABELS: Array<[string, string]> = [
  ['fullName', 'Full name'],
  ['email', 'Email'],
  ['mobile', 'Mobile'],
  ['address', 'Address'],
  ['city', 'City'],
  ['state', 'State'],
  ['currentCompany', 'Current company'],
  ['currentDesignation', 'Current designation'],
  ['totalExperience', 'Total experience (years)'],
  ['relevantExperience', 'Relevant experience (years)'],
  ['noticePeriod', 'Notice period'],
];

const card = 'rounded-2xl border border-gray-200 bg-white p-5 shadow-sm sm:p-6';
const input = 'w-full rounded-xl border border-gray-200 bg-gray-50/80 px-3.5 py-2.5 text-sm font-medium text-gray-900 outline-none transition focus:border-[#FFC107] focus:bg-white focus:ring-2 focus:ring-[#FFC107]/20';

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5 border-b border-gray-100 py-2.5 last:border-b-0 sm:flex-row sm:gap-4">
      <dt className="text-xs font-bold uppercase tracking-wide text-gray-500 sm:w-48 sm:shrink-0 sm:pt-0.5">{label}</dt>
      <dd className="text-sm font-semibold text-gray-900">{value || '-'}</dd>
    </div>
  );
}

function FieldError({ id, message }: { id: string; message?: string | undefined }) {
  if (!message) return null;
  return <p id={id} className="mt-1.5 text-xs font-semibold text-red-600">{message}</p>;
}

export default function OfferResponseClient({ token }: { token: string }) {
  const [state, setState] = useState<LoadState>({ kind: 'loading' });
  const encodedToken = encodeURIComponent(token);
  const baseUrl = `${API_BASE_URL}/recruitment/public/offers/${encodedToken}`;
  const requestId = useRef(0);

  const fetchOffer = useCallback(async (): Promise<LoadState> => {
    try {
      const response = await api.get<{ success: boolean; offer: PublicOffer }>(`/recruitment/public/offers/${encodedToken}`);
      return { kind: 'ready', offer: response.data.offer };
    } catch (error) {
      const status = (error as { response?: { status?: number } })?.response?.status;
      if (status === 404) return { kind: 'missing' };
      return { kind: 'error', message: getApiErrorMessage(error, 'We could not load your offer. Please check your connection and try again.') };
    }
  }, [encodedToken]);

  // Only the newest request may update the screen.
  const load = useCallback(async (quiet = false) => {
    const id = ++requestId.current;
    if (!quiet) setState({ kind: 'loading' });
    const next = await fetchOffer();
    if (id === requestId.current) setState(next);
  }, [fetchOffer]);

  useEffect(() => {
    const id = ++requestId.current;
    void fetchOffer().then((next) => {
      if (id === requestId.current) setState(next);
    });
  }, [fetchOffer]);

  if (state.kind === 'loading') {
    return (
      <div className="flex min-h-[60vh] items-center justify-center" role="status">
        <Loader2 className="h-8 w-8 animate-spin text-[#FFC107]" aria-hidden="true" />
        <span className="sr-only">Loading your offer…</span>
      </div>
    );
  }
  if (state.kind === 'missing') {
    return (
      <Shell>
        <div className={`${card} text-center`}>
          <AlertCircle className="mx-auto h-10 w-10 text-gray-400" aria-hidden="true" />
          <h1 className="mt-3 text-xl font-extrabold text-gray-900">This offer link is not valid</h1>
          <p className="mt-2 text-sm text-gray-600">The link may be incomplete, or HR has sent you a newer one (a new link replaces the old one). Please use the latest link in your email, WhatsApp or SMS, or contact HR.</p>
        </div>
      </Shell>
    );
  }
  if (state.kind === 'error') {
    return (
      <Shell>
        <div className={`${card} text-center`} role="alert">
          <AlertCircle className="mx-auto h-10 w-10 text-red-500" aria-hidden="true" />
          <p className="mt-3 text-sm font-semibold text-gray-800">{state.message}</p>
          <button type="button" onClick={() => void load()} className="mt-4 rounded-xl bg-gray-900 px-5 py-2.5 text-sm font-bold text-white">Try again</button>
        </div>
      </Shell>
    );
  }

  const { offer } = state;
  return (
    <Shell>
      <OfferHeader offer={offer} />
      <StatusPanel offer={offer} baseUrl={baseUrl} />
      <OfferDetails offer={offer} />
      <LetterPanel offer={offer} baseUrl={baseUrl} />
      <ApplicationDetails offer={offer} />
      {offer.status === 'SENT' ? <RespondPanel offer={offer} token={encodedToken} onDone={() => void load(true)} /> : null}
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="bg-gray-50">
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-5 px-4 py-6 sm:py-10">{children}</div>
    </div>
  );
}

function OfferHeader({ offer }: { offer: PublicOffer }) {
  const badge = STATUS_BADGES[offer.status] ?? STATUS_BADGES.SENT;
  return (
    <header className={`${card} border-t-4 border-t-[#FFC107]`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-extrabold uppercase tracking-[0.18em] text-amber-600">{offer.companyName}</p>
          <h1 className="mt-1 text-2xl font-extrabold text-gray-900">Offer of employment</h1>
          <p className="mt-1 text-sm text-gray-600">For {offer.candidateName} · {offer.designation}</p>
          {offer.letterNo ? <p className="mt-1 text-xs text-gray-500">Letter no. {offer.letterNo}{offer.letterDate ? ` · ${formatDate(offer.letterDate)}` : ''}</p> : null}
        </div>
        <span className={`rounded-full px-3 py-1 text-xs font-extrabold ${badge.className}`}>{badge.label}</span>
      </div>
      <p className="mt-4 rounded-xl bg-amber-50 px-3.5 py-2.5 text-xs leading-5 text-amber-900">This link is personal to you. Please do not forward it.</p>
    </header>
  );
}

function StatusPanel({ offer, baseUrl }: { offer: PublicOffer; baseUrl: string }) {
  if (offer.status === 'ACCEPTED') {
    const acceptance = offer.acceptance;
    return (
      <section className={`${card} border-emerald-200 bg-emerald-50/60`} aria-labelledby="offer-accepted">
        <div className="flex items-start gap-3">
          <CheckCircle2 className="mt-0.5 h-7 w-7 shrink-0 text-emerald-600" aria-hidden="true" />
          <div className="min-w-0">
            <h2 id="offer-accepted" className="text-lg font-extrabold text-emerald-900">Thank you! Your acceptance is recorded.</h2>
            <p className="mt-1 text-sm text-emerald-900/80">Our HR team will contact you about joining formalities{offer.joiningDate ? ` before ${formatDate(offer.joiningDate)}` : ''}.</p>
            {acceptance ? (
              <dl className="mt-3 text-sm text-emerald-950">
                <Row label="Accepted by" value={acceptance.name} />
                <Row label="How" value={acceptance.method ? ACCEPTANCE_METHOD_LABELS[acceptance.method as keyof typeof ACCEPTANCE_METHOD_LABELS] ?? acceptance.method : '-'} />
                <Row label="Place" value={acceptance.place} />
                <Row label="When" value={formatDateTime(acceptance.acceptedAt)} />
              </dl>
            ) : null}
            <div className="mt-4 flex flex-wrap gap-2">
              {acceptance?.certificateAvailable ? (
                <a href={`${baseUrl}/certificate`} rel="noreferrer" className="inline-flex items-center gap-2 rounded-xl bg-emerald-700 px-4 py-2.5 text-sm font-bold text-white hover:bg-emerald-800">
                  <Award className="h-4 w-4" aria-hidden="true" /> Download acceptance certificate
                </a>
              ) : null}
              {offer.offerLetterAvailable ? (
                <a href={`${baseUrl}/pdf?download=1`} rel="noreferrer" className="inline-flex items-center gap-2 rounded-xl border border-emerald-300 bg-white px-4 py-2.5 text-sm font-bold text-emerald-800 hover:bg-emerald-50">
                  <Download className="h-4 w-4" aria-hidden="true" /> Download offer letter
                </a>
              ) : null}
            </div>
          </div>
        </div>
      </section>
    );
  }
  const closed: Partial<Record<OfferStatus, { title: string; text: string }>> = {
    DECLINED: { title: 'You declined this offer', text: 'Thank you for letting us know. If this was a mistake, please contact HR.' },
    EXPIRED: { title: 'This offer has expired', text: 'This offer has expired. Contact HR if you still want to join.' },
    WITHDRAWN: { title: 'This offer was withdrawn', text: 'This offer was withdrawn by JCB Exchange. Please contact HR if you have questions.' },
    DRAFT: { title: 'This offer is not ready yet', text: 'HR has not sent this offer yet.' },
  };
  const message = closed[offer.status];
  if (!message) return null;
  return (
    <section className={`${card} bg-gray-50`} role="status">
      <div className="flex items-start gap-3">
        <XCircle className="mt-0.5 h-7 w-7 shrink-0 text-gray-500" aria-hidden="true" />
        <div>
          <h2 className="text-lg font-extrabold text-gray-900">{message.title}</h2>
          <p className="mt-1 text-sm text-gray-600">{message.text}</p>
        </div>
      </div>
    </section>
  );
}

function OfferDetails({ offer }: { offer: PublicOffer }) {
  const { salary } = offer;
  const totals = salaryBreakupTotals(salary.components);
  return (
    <section className={card} aria-labelledby="offer-details">
      <h2 id="offer-details" className="flex items-center gap-2 text-lg font-extrabold text-gray-900"><Briefcase className="h-5 w-5 text-amber-500" aria-hidden="true" /> Your offer</h2>
      <dl className="mt-3">
        <Row label="Designation" value={offer.designation} />
        <Row label="Department" value={offer.department} />
        <Row label="Place of posting" value={offer.placeOfPosting} />
        <Row label="Employment type" value={offer.employmentType ? EMPLOYMENT_TYPE_LABELS[offer.employmentType as keyof typeof EMPLOYMENT_TYPE_LABELS] ?? offer.employmentType : '-'} />
        {offer.reportingManager ? <Row label="Reporting to" value={offer.reportingManager} /> : null}
        <Row label="Date of joining" value={offer.joiningDate ? formatDate(offer.joiningDate) : 'As discussed'} />
        <Row label="Probation" value={describeMonths(offer.probationPeriod)} />
        <Row label="Notice period" value={describeDays(offer.noticePeriod)} />
        <Row label="Salary" value={`${formatInr(salary.amount)} per ${salary.period === 'month' ? 'month' : 'year'}`} />
        <Row label="Yearly CTC" value={formatInr(salary.annualCtc)} />
        {offer.offerValidUntil ? <Row label="Please respond by" value={formatDate(offer.offerValidUntil)} /> : null}
      </dl>
      {salary.components.length ? (
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[420px] text-left text-sm">
            <caption className="mb-2 text-left text-xs font-extrabold uppercase tracking-wide text-gray-500">Salary breakup</caption>
            <thead>
              <tr className="border-b border-gray-200 text-xs uppercase text-gray-500">
                <th scope="col" className="py-2 pr-3 font-bold">Component</th>
                <th scope="col" className="py-2 pr-3 text-right font-bold">Monthly</th>
                <th scope="col" className="py-2 text-right font-bold">Yearly</th>
              </tr>
            </thead>
            <tbody>
              {salary.components.map((component) => (
                <tr key={component.code} className="border-b border-gray-100">
                  <th scope="row" className="py-2 pr-3 font-semibold text-gray-800">{component.name}{component.componentType === 'EMPLOYER_CONTRIBUTION' ? <span className="ml-1 text-xs font-normal text-gray-500">(employer)</span> : null}</th>
                  <td className="py-2 pr-3 text-right tabular-nums">{formatInr(component.monthlyAmount)}</td>
                  <td className="py-2 text-right tabular-nums">{formatInr(component.monthlyAmount * 12)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="font-bold text-gray-900">
                <th scope="row" className="py-2 pr-3">Gross salary</th>
                <td className="py-2 pr-3 text-right tabular-nums">{formatInr(totals.grossMonthly)}</td>
                <td className="py-2 text-right tabular-nums">{formatInr(totals.grossYearly)}</td>
              </tr>
              <tr className="font-extrabold text-gray-900">
                <th scope="row" className="py-2 pr-3">Cost to company (CTC)</th>
                <td className="py-2 pr-3 text-right tabular-nums">{formatInr(totals.ctcMonthly)}</td>
                <td className="py-2 text-right tabular-nums">{formatInr(totals.ctcYearly)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      ) : null}
      {offer.additionalTerms?.trim() ? (
        <div className="mt-4">
          <p className="text-xs font-extrabold uppercase tracking-wide text-gray-500">Additional terms</p>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-gray-700">
            {offer.additionalTerms.split(/\r?\n+/).map((term) => term.trim()).filter(Boolean).map((term, index) => <li key={index}>{term}</li>)}
          </ul>
        </div>
      ) : null}
    </section>
  );
}

function LetterPanel({ offer, baseUrl }: { offer: PublicOffer; baseUrl: string }) {
  if (!offer.offerLetterAvailable) return null;
  return (
    <section className={card} aria-labelledby="offer-letter">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id="offer-letter" className="flex items-center gap-2 text-lg font-extrabold text-gray-900"><FileText className="h-5 w-5 text-amber-500" aria-hidden="true" /> Offer letter</h2>
        <div className="flex flex-wrap gap-2">
          <a href={`${baseUrl}/pdf`} target="_blank" rel="noreferrer noopener" className="inline-flex items-center gap-1.5 rounded-xl border border-gray-200 px-3.5 py-2 text-sm font-bold text-gray-800 hover:bg-gray-50">
            <ExternalLink className="h-4 w-4" aria-hidden="true" /> Open
          </a>
          <a href={`${baseUrl}/pdf?download=1`} rel="noreferrer" className="inline-flex items-center gap-1.5 rounded-xl bg-gray-900 px-3.5 py-2 text-sm font-bold text-white hover:bg-gray-800">
            <Download className="h-4 w-4" aria-hidden="true" /> Download
          </a>
        </div>
      </div>
      {/* Inline preview on larger screens; phones open or download the PDF instead. */}
      <div className="mt-4 hidden overflow-hidden rounded-xl border border-gray-200 md:block">
        <iframe src={`${baseUrl}/pdf`} title="Offer letter PDF" className="h-[720px] w-full" referrerPolicy="no-referrer" />
      </div>
    </section>
  );
}

function ApplicationDetails({ offer }: { offer: PublicOffer }) {
  const { application } = offer;
  const details = DETAIL_LABELS
    .map(([key, label]) => [label, application.details?.[key]] as const)
    .filter(([, value]) => value !== null && value !== undefined && String(value).trim() !== '');
  return (
    <section className={card}>
      <details className="group">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-3">
          <span>
            <span className="block text-lg font-extrabold text-gray-900">Your application</span>
            <span className="block text-sm text-gray-600">{offer.jobTitle} · Ref {application.applicationRef} · Applied {formatDate(application.appliedAt)}</span>
          </span>
          <ChevronDown className="h-5 w-5 shrink-0 text-gray-500 transition group-open:rotate-180" aria-hidden="true" />
        </summary>
        <dl className="mt-3">
          <Row label="Job" value={offer.jobTitle} />
          {application.jobLocation ? <Row label="Job location" value={application.jobLocation} /> : null}
          {details.map(([label, value]) => <Row key={label} label={label} value={String(value)} />)}
        </dl>
        {application.answers.length ? (
          <div className="mt-3">
            <p className="text-xs font-extrabold uppercase tracking-wide text-gray-500">Your answers</p>
            <dl className="mt-1">
              {application.answers.map((answer, index) => <Row key={index} label={answer.question} value={answer.answer} />)}
            </dl>
          </div>
        ) : null}
      </details>
    </section>
  );
}

const METHOD_TABS: Array<{ value: SignMethod; label: string; icon: React.ComponentType<{ className?: string }> }> = [
  { value: 'TYPED', label: 'Type', icon: Type },
  { value: 'DRAWN', label: 'Draw', icon: PenLine },
  { value: 'UPLOADED_SCAN', label: 'Upload signed copy', icon: Upload },
];

function RespondPanel({ offer, token, onDone }: { offer: PublicOffer; token: string; onDone: () => void }) {
  const [mode, setMode] = useState<'accept' | 'decline'>('accept');
  const [method, setMethod] = useState<SignMethod>('TYPED');
  const [fullName, setFullName] = useState(offer.candidateName);
  const [place, setPlace] = useState('');
  const [consent, setConsent] = useState(false);
  const [drawnSignature, setDrawnSignature] = useState<string | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [declineReason, setDeclineReason] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [serverError, setServerError] = useState('');
  const [sending, setSending] = useState(false);
  const errorRef = useRef<HTMLDivElement | null>(null);

  const typedPreview = useMemo(() => fullName.trim() || offer.candidateName, [fullName, offer.candidateName]);

  const showServerError = (message: string) => {
    setServerError(message);
    window.setTimeout(() => errorRef.current?.focus(), 0);
  };

  const submitAccept = async () => {
    if (sending) return;
    const found = validateAcceptanceForm({ method, fullName, place, consent, drawnSignature, file }, offer.candidateName);
    setErrors(found);
    setServerError('');
    if (Object.keys(found).length) return;
    const payload = new FormData();
    payload.append('action', 'ACCEPT');
    payload.append('method', method);
    payload.append('fullName', fullName.trim().replace(/\s+/g, ' '));
    payload.append('place', place.trim());
    payload.append('consent', 'true');
    if (method === 'DRAWN' && drawnSignature) payload.append('drawnSignature', drawnSignature);
    if (method === 'UPLOADED_SCAN' && file) payload.append('signedCopy', file);
    setSending(true);
    try {
      // A scan on a slow mobile connection can take a while: allow up to 2 minutes.
      await api.post(`/recruitment/public/offers/${token}/respond`, payload, { headers: { 'Content-Type': 'multipart/form-data' }, timeout: 120_000 });
      onDone();
    } catch (error) {
      const status = (error as { response?: { status?: number } })?.response?.status;
      if (!status) {
        // No answer (timeout / network): the acceptance may have been saved. Check the offer again instead of
        // telling the candidate it failed.
        showServerError('The connection was interrupted. Checking whether your acceptance was recorded…');
        onDone();
        return;
      }
      showServerError(getApiErrorMessage(error, 'Your acceptance could not be recorded. Please try again.'));
      if (status === 409 || status === 410) onDone();
    } finally {
      setSending(false);
    }
  };

  const submitDecline = async () => {
    if (sending) return;
    const reasonError = validateDeclineReason(declineReason);
    setErrors(reasonError ? { declineReason: reasonError } : {});
    setServerError('');
    if (reasonError) return;
    const payload = new FormData();
    payload.append('action', 'DECLINE');
    payload.append('declineReason', declineReason.trim());
    setSending(true);
    try {
      await api.post(`/recruitment/public/offers/${token}/respond`, payload, { headers: { 'Content-Type': 'multipart/form-data' } });
      onDone();
    } catch (error) {
      showServerError(getApiErrorMessage(error, 'Your answer could not be recorded. Please try again.'));
      const status = (error as { response?: { status?: number } })?.response?.status;
      if (status === 409 || status === 410) onDone();
    } finally {
      setSending(false);
    }
  };

  const fileError = file ? checkSignedCopyFile(file) : null;

  return (
    <section className={`${card} border-[#FFC107]/60`} aria-labelledby="respond-heading">
      <h2 id="respond-heading" className="text-lg font-extrabold text-gray-900">Your response</h2>
      <div className="mt-3 grid grid-cols-2 gap-2" role="tablist" aria-label="Accept or decline">
        <button type="button" role="tab" aria-selected={mode === 'accept'} onClick={() => { setMode('accept'); setErrors({}); setServerError(''); }} className={`rounded-xl px-3 py-2.5 text-sm font-extrabold ${mode === 'accept' ? 'bg-[#FFC107] text-gray-900' : 'bg-gray-100 text-gray-700'}`}>Accept &amp; sign</button>
        <button type="button" role="tab" aria-selected={mode === 'decline'} onClick={() => { setMode('decline'); setErrors({}); setServerError(''); }} className={`rounded-xl px-3 py-2.5 text-sm font-extrabold ${mode === 'decline' ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-700'}`}>Decline</button>
      </div>

      {mode === 'accept' ? (
        <form className="mt-5 space-y-5" noValidate onSubmit={(event) => { event.preventDefault(); void submitAccept(); }}>
          <fieldset>
            <legend className="mb-2 text-sm font-bold text-gray-800">How would you like to sign?</legend>
            <div className="grid grid-cols-3 gap-2">
              {METHOD_TABS.map((tab) => {
                const Icon = tab.icon;
                const active = method === tab.value;
                return (
                  <label key={tab.value} className={`flex cursor-pointer flex-col items-center gap-1 rounded-xl border px-2 py-3 text-center text-xs font-bold sm:text-sm ${active ? 'border-[#FFC107] bg-amber-50 text-gray-900' : 'border-gray-200 text-gray-600 hover:bg-gray-50'}`}>
                    <input type="radio" name="sign-method" value={tab.value} checked={active} onChange={() => { setMethod(tab.value); setErrors({}); }} className="sr-only" />
                    <Icon className="h-5 w-5" aria-hidden="true" />
                    {tab.label}
                  </label>
                );
              })}
            </div>
            <FieldError id="err-method" message={errors.method} />
          </fieldset>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="offer-full-name" className="mb-1.5 block text-sm font-bold text-gray-800">Full name <span className="text-red-500">*</span></label>
              <input id="offer-full-name" value={fullName} onChange={(event) => setFullName(event.target.value)} className={input} autoComplete="name" aria-invalid={Boolean(errors.fullName)} aria-describedby="err-full-name" maxLength={160} />
              <FieldError id="err-full-name" message={errors.fullName} />
            </div>
            <div>
              <label htmlFor="offer-place" className="mb-1.5 block text-sm font-bold text-gray-800">Place (city) <span className="text-red-500">*</span></label>
              <input id="offer-place" value={place} onChange={(event) => setPlace(event.target.value)} className={input} autoComplete="address-level2" aria-invalid={Boolean(errors.place)} aria-describedby="err-place" maxLength={120} />
              <FieldError id="err-place" message={errors.place} />
            </div>
          </div>

          {method === 'TYPED' ? (
            <div>
              <p className="mb-1.5 text-sm font-bold text-gray-800">Your signature</p>
              <div className="flex h-28 items-center justify-center overflow-hidden rounded-xl border-2 border-dashed border-gray-300 bg-white px-4">
                <span className="truncate text-4xl text-gray-900" style={{ fontFamily: SIGNATURE_FONT }} aria-label={`Typed signature: ${typedPreview}`}>{typedPreview}</span>
              </div>
              <p className="mt-1.5 text-xs text-gray-500">Your full name above is used as your signature.</p>
            </div>
          ) : null}

          {method === 'DRAWN' ? (
            <div>
              <p id="draw-help" className="mb-1.5 text-sm font-bold text-gray-800">Draw your signature</p>
              <SignaturePad onChange={setDrawnSignature} disabled={sending} invalid={Boolean(errors.signature)} describedBy="draw-help err-signature" />
              <FieldError id="err-signature" message={errors.signature} />
            </div>
          ) : null}

          {method === 'UPLOADED_SCAN' ? (
            <div>
              <ol className="mb-3 list-decimal space-y-1 pl-5 text-sm text-gray-700">
                <li>Download the offer letter above and print it.</li>
                <li>Sign it (and write the date and place).</li>
                <li>Scan it or take a clear photo, then upload it here (PDF, JPG, PNG or WEBP, up to 5 MB).</li>
              </ol>
              <label htmlFor="offer-signed-copy" className="mb-1.5 block text-sm font-bold text-gray-800">Signed offer letter <span className="text-red-500">*</span></label>
              <input
                id="offer-signed-copy"
                type="file"
                accept="application/pdf,image/jpeg,image/png,image/webp,.pdf,.jpg,.jpeg,.png,.webp"
                onChange={(event) => setFile(event.target.files?.[0] ?? null)}
                className="block w-full text-sm text-gray-700 file:mr-3 file:rounded-lg file:border-0 file:bg-gray-900 file:px-3 file:py-2 file:text-sm file:font-bold file:text-white"
                aria-invalid={Boolean(errors.file || fileError)}
                aria-describedby="err-file"
              />
              {file && !fileError ? <p className="mt-1.5 text-xs text-gray-600">{file.name} · {(file.size / 1024 / 1024).toFixed(2)} MB</p> : null}
              <FieldError id="err-file" message={errors.file ?? fileError ?? undefined} />
            </div>
          ) : null}

          <div>
            <label className="flex items-start gap-3 text-sm text-gray-800">
              <input type="checkbox" checked={consent} onChange={(event) => setConsent(event.target.checked)} className="mt-0.5 h-5 w-5 shrink-0 rounded border-gray-300 accent-[#FFC107]" aria-describedby="err-consent" />
              <span>I have read the offer letter and accept the offer on these terms.</span>
            </label>
            <FieldError id="err-consent" message={errors.consent} />
          </div>

          {serverError ? <div ref={errorRef} tabIndex={-1} role="alert" className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">{serverError}</div> : null}

          <button type="submit" disabled={sending} className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#FFC107] px-5 py-3.5 text-base font-extrabold text-gray-900 shadow-sm hover:bg-[#ffb300] disabled:opacity-60">
            {sending ? <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" /> : <CheckCircle2 className="h-5 w-5" aria-hidden="true" />}
            {sending ? 'Recording your acceptance…' : 'Accept offer'}
          </button>
          <p className="text-center text-xs text-gray-500">We record your name, signature, place, time, IP address and browser with your acceptance.</p>
        </form>
      ) : (
        <form className="mt-5 space-y-4" noValidate onSubmit={(event) => { event.preventDefault(); void submitDecline(); }}>
          <div>
            <label htmlFor="offer-decline-reason" className="mb-1.5 block text-sm font-bold text-gray-800">Reason for declining <span className="text-red-500">*</span></label>
            <textarea id="offer-decline-reason" rows={4} value={declineReason} onChange={(event) => setDeclineReason(event.target.value)} maxLength={1000} className={`${input} resize-none`} aria-invalid={Boolean(errors.declineReason)} aria-describedby="err-decline" />
            <FieldError id="err-decline" message={errors.declineReason} />
          </div>
          {serverError ? <div ref={errorRef} tabIndex={-1} role="alert" className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">{serverError}</div> : null}
          <button type="submit" disabled={sending} className="flex w-full items-center justify-center gap-2 rounded-xl bg-gray-900 px-5 py-3.5 text-base font-extrabold text-white disabled:opacity-60">
            {sending ? <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" /> : <XCircle className="h-5 w-5" aria-hidden="true" />}
            {sending ? 'Sending…' : 'Decline offer'}
          </button>
        </form>
      )}
    </section>
  );
}
