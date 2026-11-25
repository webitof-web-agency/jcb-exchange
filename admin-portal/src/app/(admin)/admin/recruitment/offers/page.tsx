'use client';

/* eslint-disable react-hooks/set-state-in-effect */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { PDFViewer, pdf } from '@react-pdf/renderer';
import api from '@/lib/api';
import BrandLoader from '@/components/ui/BrandLoader';
import OfferLetterPdfDocument from '@/components/recruitment/OfferLetterPdfDocument';
import OfferHrmFields, { useOfferHrmEditor, type OfferHrmEditor } from '@/components/recruitment/OfferHrmFields';
import OfferStatusActions from '@/components/recruitment/OfferStatusActions';
import { defaultOfferValidUntil, emptyOfferLetterData, type OfferLetterFormData } from '@/lib/offerLetter';
import {
  EMPLOYMENT_TYPE_LABELS,
  OFFER_STATUS_LABELS,
  apiErrorMessage,
  buildOfferMultipart,
  canDeleteOffer as offerCanBeDeleted,
  canEditOffer as offerCanBeEdited,
  describeOfferDispatch,
  formatInr,
  formatLakhsPerYear,
  hasSalaryBreakup,
  letterSalaryForPeriod,
  salaryBreakupForPdf,
  type OfferSendResponse,
  type OfferStatus,
  type StoredOfferPlacement,
  type StoredSalaryComponent,
} from '@/lib/offerHrm';
import type { StoredOfferAcceptance, StoredOfferHrm } from '@/lib/offerHrm';
import OfferAcceptanceSummary from '@/components/recruitment/OfferAcceptanceSummary';
import OfferHrmStatus, { OfferHrmBadge } from '@/components/recruitment/OfferHrmStatus';
import { useTranslation } from '@/hooks/useTranslation';
import { useAuthStore } from '@/store/authStore';
import { canUseRecruitmentPermission, recruitmentPermissions } from '@/lib/recruitmentPermissions';
import { useSiteLogo } from '@/hooks/useSiteLogo';
import { toast } from 'react-toastify';
import {
  Award,
  CheckCircle2,
  Plus,
  Search,
  Eye,
  ChevronRight,
  ChevronLeft,
  ChevronDown,
  Download,
  Loader2,
} from 'lucide-react';
import { buildPaginationItems } from '@/lib/paginationUtils';
import { confirmDelete } from '@/store/confirmDeleteStore';

interface OfferItem {
  id: string;
  offerRef: string;
  designation: string;
  department?: string | null;
  /** Always per year. */
  annualCtc: number;
  /** The amount printed on the letter, and its period. */
  salaryAmount?: number;
  salaryPeriod?: 'month' | 'annum';
  workLocation: string;
  joiningDate?: string | null;
  expiryDate?: string | null;
  offerLetterUrl?: string | null;
  offerLetterFileName?: string | null;
  offerLetterData?: Partial<OfferLetterFormData> | null;
  probationPeriod?: string | null;
  reportingManager?: string | null;
  additionalTerms?: string | null;
  placement?: StoredOfferPlacement | null;
  salaryComponents?: StoredSalaryComponent[];
  /** How the offer was accepted (only for accepted offers). */
  acceptance?: StoredOfferAcceptance | null;
  /** Where the accepted offer stands in HRM (only for accepted offers). */
  hrm?: StoredOfferHrm | null;
  status: OfferStatus;
  createdAt: string;
  application: {
    id: string;
    applicationRef: string;
    currentStage?: string;
    candidate: {
      fullName: string;
      email: string;
      mobile: string;
    };
    job: {
      title: string;
      jobCode: string;
    };
  };
}

interface ApplicationOption {
  id: string;
  applicationRef: string;
  candidate?: {
    fullName?: string | null;
    address?: string | null;
    currentCity?: string | null;
    state?: string | null;
  };
  job?: {
    title?: string | null;
    locationCity?: string | null;
    locationState?: string | null;
    locationAddress?: string | null;
    department?: { name?: string | null } | null;
  };
}

interface OfferApplicationDetails extends ApplicationOption {
  applicationRef: string;
  candidate: NonNullable<ApplicationOption['candidate']>;
  job: NonNullable<ApplicationOption['job']> & { title: string; locationCity: string; locationState: string };
}

function formatDateDDMMYYYY(dateStr?: string | null): string {
  if (!dateStr) return 'TBD';
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return 'TBD';
  const day = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const year = d.getFullYear();
  return `${day}/${month}/${year}`;
}

const STATUS_BADGE: Record<OfferStatus, string> = {
  DRAFT: 'border-amber-200 bg-amber-50 text-amber-800',
  SENT: 'border-blue-200 bg-blue-50 text-blue-800',
  ACCEPTED: 'border-emerald-200 bg-emerald-50 text-emerald-800',
  DECLINED: 'border-rose-200 bg-rose-50 text-rose-800',
  EXPIRED: 'border-gray-200 bg-gray-100 text-gray-700',
  WITHDRAWN: 'border-orange-200 bg-orange-50 text-orange-800',
};

interface OfferLetterEditorModalProps {
  open: boolean;
  editingOfferId: string | null;
  selectedApplication: ApplicationOption | undefined;
  onApplicationChange: (application: ApplicationOption) => void;
  loadingOfferDetails: boolean;
  saving: boolean;
  offerForm: OfferLetterFormData;
  updateOfferField: (field: keyof OfferLetterFormData, value: string) => void;
  patchOfferForm: (patch: Partial<OfferLetterFormData>) => void;
  hrmEditor: OfferHrmEditor;
  logoUrl: string | null;
  submitError: string;
  onClose: () => void;
  onSubmit: React.FormEventHandler<HTMLFormElement>;
  canSubmit: boolean;
}

function OfferLetterEditorModal({
  open,
  editingOfferId,
  selectedApplication,
  onApplicationChange,
  loadingOfferDetails,
  saving,
  offerForm,
  updateOfferField,
  patchOfferForm,
  hrmEditor,
  logoUrl,
  submitError,
  onClose,
  onSubmit,
  canSubmit,
}: OfferLetterEditorModalProps) {
  if (!open) return null;
  const field = (name: keyof OfferLetterFormData) => (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => updateOfferField(name, event.target.value);
  const breakupUsed = hasSalaryBreakup(hrmEditor.form.salaryComponents);
  const salaryBreakup = salaryBreakupForPdf(hrmEditor.form.salaryComponents);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-gray-950/60 p-3 backdrop-blur-sm sm:p-5">
      <div className="flex h-[94vh] w-full max-w-[1500px] flex-col overflow-hidden rounded-3xl bg-white shadow-2xl">
        <div className="flex shrink-0 items-center justify-between border-b border-gray-200 px-5 py-4 sm:px-7">
          <div>
            <h3 className="text-base font-bold text-gray-900">{editingOfferId ? 'Edit Employment Offer' : 'Generate Employment Offer'}</h3>
            <p className="mt-1 text-xs text-gray-500">The preview is the exact PDF that will be saved to Drive and sent to the selected candidate.</p>
          </div>
          <button type="button" onClick={onClose} disabled={saving} className="rounded-lg px-3 py-2 text-xl text-gray-500 hover:bg-gray-100 disabled:opacity-50" aria-label="Close offer editor">X</button>
        </div>
        <div className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-[minmax(0,0.95fr)_minmax(420px,1.05fr)]">
          <form onSubmit={onSubmit} noValidate={false} className="min-h-0 space-y-4 overflow-y-auto p-5 text-xs sm:p-7 [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
            <label className="block font-semibold text-gray-700">
              Candidate application *
              <span className="mt-1 block"><ApplicationSelectDropdown selected={selectedApplication} disabled={Boolean(editingOfferId)} onChange={onApplicationChange} /></span>
            </label>
            {loadingOfferDetails && <p className="rounded-lg bg-amber-50 px-3 py-2 text-[11px] font-semibold text-amber-700">Loading candidate details...</p>}
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <label className="font-semibold text-gray-700">Letter date *<input required type="date" value={offerForm.letterDate} onChange={field('letterDate')} className="mt-1 w-full rounded-xl border border-gray-200 bg-gray-50 p-2.5 text-gray-900" /></label>
              <label className="font-semibold text-gray-700">Offer letter no. *<input required value={offerForm.offerLetterNo} onChange={field('offerLetterNo')} className="mt-1 w-full rounded-xl border border-gray-200 bg-gray-50 p-2.5 text-gray-900" /></label>
              <label className="font-semibold text-gray-700">Employee name *<input required value={offerForm.employeeName} onChange={field('employeeName')} className="mt-1 w-full rounded-xl border border-gray-200 bg-gray-50 p-2.5 text-gray-900" /></label>
              <label className="font-semibold text-gray-700">Company name *<input required value={offerForm.companyName} onChange={field('companyName')} className="mt-1 w-full rounded-xl border border-gray-200 bg-gray-50 p-2.5 text-gray-900" /></label>
              <label className="font-semibold text-gray-700">Employee address<textarea rows={2} value={offerForm.employeeAddress} onChange={field('employeeAddress')} className="mt-1 w-full rounded-xl border border-gray-200 bg-gray-50 p-2.5 text-gray-900" /></label>
              <label className="font-semibold text-gray-700">Company address<textarea rows={2} value={offerForm.companyAddress} onChange={field('companyAddress')} className="mt-1 w-full rounded-xl border border-gray-200 bg-gray-50 p-2.5 text-gray-900" /></label>
            </div>
            <OfferHrmFields editor={hrmEditor} letter={offerForm} onLetterChange={patchOfferForm} disabled={saving} idPrefix="offers-page-hrm" />
            <div className="rounded-2xl border border-amber-200 bg-amber-50/50 p-4">
              <p className="mb-3 text-[11px] font-extrabold uppercase tracking-wider text-amber-700">Employment details</p>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <label className="font-semibold text-gray-700">Department (on the letter)<input readOnly value={offerForm.department} placeholder="Chosen above" className="mt-1 w-full rounded-xl border border-gray-200 bg-gray-100 p-2.5 text-gray-700" /></label>
                <label className="font-semibold text-gray-700">Place of posting *{/* With an HRM placement the letter states exactly that place. */}<input required readOnly={Boolean(hrmEditor.form.locationType)} value={offerForm.placeOfPosting} onChange={field('placeOfPosting')} className={`mt-1 w-full rounded-xl border border-gray-200 p-2.5 text-gray-900 ${hrmEditor.form.locationType ? 'bg-gray-100' : 'bg-white'}`} /></label>
                <label className="font-semibold text-gray-700">
                  Salary / CTC *
                  <input required inputMode="decimal" placeholder="e.g. 850000" readOnly={breakupUsed} value={offerForm.salaryAmount} onChange={field('salaryAmount')} className={`mt-1 w-full rounded-xl border border-gray-200 p-2.5 text-gray-900 ${breakupUsed ? 'bg-gray-100' : 'bg-white'}`} />
                  {breakupUsed && <span className="mt-1 block text-[11px] font-normal text-gray-500">Taken from the salary breakup total.</span>}
                </label>
                <label className="font-semibold text-gray-700">Salary period<select value={offerForm.salaryPeriod} onChange={field('salaryPeriod')} className="mt-1 w-full rounded-xl border border-gray-200 bg-white p-2.5 text-gray-900"><option value="month">Month</option><option value="annum">Annum</option></select></label>
                <label className="font-semibold text-gray-700">Date of joining *<input required type="date" value={offerForm.joiningDate} onChange={field('joiningDate')} className="mt-1 w-full rounded-xl border border-gray-200 bg-white p-2.5 text-gray-900" /></label>
                <label className="font-semibold text-gray-700">
                  Offer valid until
                  <input type="date" value={offerForm.offerValidUntil} onChange={field('offerValidUntil')} className="mt-1 w-full rounded-xl border border-gray-200 bg-white p-2.5 text-gray-900" />
                  <span className="mt-1 block text-[11px] font-normal text-gray-500">Printed on the letter. The offer is closed only when you mark it expired.</span>
                </label>
                <label className="font-semibold text-gray-700">Probation (months) *<input required value={offerForm.probationPeriod} onChange={field('probationPeriod')} className="mt-1 w-full rounded-xl border border-gray-200 bg-white p-2.5 text-gray-900" /></label>
                <label className="font-semibold text-gray-700">Notice period (days) *<input required value={offerForm.noticePeriod} onChange={field('noticePeriod')} className="mt-1 w-full rounded-xl border border-gray-200 bg-white p-2.5 text-gray-900" /></label>
              </div>
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <label className="font-semibold text-gray-700">Signatory name *<input required value={offerForm.signatoryName} onChange={field('signatoryName')} className="mt-1 w-full rounded-xl border border-gray-200 bg-gray-50 p-2.5 text-gray-900" /></label>
              <label className="font-semibold text-gray-700">Signatory designation *<input required value={offerForm.signatoryDesignation} onChange={field('signatoryDesignation')} className="mt-1 w-full rounded-xl border border-gray-200 bg-gray-50 p-2.5 text-gray-900" /></label>
              <label className="font-semibold text-gray-700">Signatory date<input type="date" value={offerForm.signatoryDate} onChange={field('signatoryDate')} className="mt-1 w-full rounded-xl border border-gray-200 bg-gray-50 p-2.5 text-gray-900" /></label>
              <label className="font-semibold text-gray-700">Signatory place<input value={offerForm.signatoryPlace} onChange={field('signatoryPlace')} className="mt-1 w-full rounded-xl border border-gray-200 bg-gray-50 p-2.5 text-gray-900" /></label>
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <label className="font-semibold text-gray-700">Acceptance date<textarea rows={1} value={offerForm.acceptanceDate} onChange={field('acceptanceDate')} placeholder="Leave blank for candidate" className="mt-1 w-full rounded-xl border border-gray-200 bg-gray-50 p-2.5 text-gray-900" /></label>
              <label className="font-semibold text-gray-700">Acceptance place<textarea rows={1} value={offerForm.acceptancePlace} onChange={field('acceptancePlace')} placeholder="Leave blank for candidate" className="mt-1 w-full rounded-xl border border-gray-200 bg-gray-50 p-2.5 text-gray-900" /></label>
            </div>
            <label className="block font-semibold text-gray-700">Additional terms (one per line)<textarea rows={4} value={offerForm.additionalTerms} onChange={field('additionalTerms')} className="mt-1 w-full rounded-xl border border-gray-200 bg-gray-50 p-2.5 text-gray-900" /></label>
            {submitError && <p role="alert" className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-[11px] font-semibold text-rose-700">{submitError}</p>}
            <div className="flex justify-end gap-2 border-t border-gray-200 pt-4">
              <button type="button" onClick={onClose} disabled={saving} className="rounded-xl bg-gray-100 px-4 py-2.5 font-bold text-gray-700 hover:bg-gray-200 disabled:opacity-50">Cancel</button>
              <button type="submit" disabled={loadingOfferDetails || saving || !canSubmit} className="rounded-xl bg-[#FFC107] px-4 py-2.5 font-extrabold text-black shadow-md hover:bg-[#e5ad06] disabled:opacity-50">{saving ? 'Saving…' : loadingOfferDetails ? 'Loading...' : editingOfferId ? 'Save & resend offer' : 'Generate & send offer'}</button>
            </div>
          </form>
          <div className="min-h-0 border-t border-gray-200 bg-gray-100 p-3 lg:border-l lg:border-t-0 sm:p-5"><div className="h-full overflow-hidden rounded-2xl border border-gray-300 bg-white shadow-inner"><PDFViewer showToolbar={false} className="h-full w-full border-0"><OfferLetterPdfDocument data={offerForm} logoUrl={logoUrl} salaryBreakup={salaryBreakup} /></PDFViewer></div></div>
        </div>
      </div>
    </div>
  );
}

const applicationLabel = (app: ApplicationOption) => `${app.candidate?.fullName || 'Candidate'} - ${app.job?.title || 'Job'} (${app.applicationRef})`;

/** Search-as-you-type over all applications (server side), so any number of applications can be chosen. */
function ApplicationSelectDropdown({
  selected,
  onChange,
  disabled = false,
}: {
  selected: ApplicationOption | undefined;
  onChange: (application: ApplicationOption) => void;
  disabled?: boolean;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<ApplicationOption[]>([]);
  const [searching, setSearching] = useState(false);
  const [failed, setFailed] = useState(false);
  const latest = useRef(0);
  const dropdownRef = React.useRef<HTMLDivElement>(null);
  const { t } = useTranslation();

  useEffect(() => {
    function handleClickOutside(event: MouseEvent | TouchEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) setIsOpen(false);
    }
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      document.addEventListener('touchstart', handleClickOutside, { passive: true });
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('touchstart', handleClickOutside);
    };
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return undefined;
    const ticket = latest.current + 1;
    latest.current = ticket;
    const timer = window.setTimeout(() => {
      setSearching(true);
      api.get('/recruitment/admin/applications', { params: { compact: 'true', limit: 20, ...(query.trim() ? { q: query.trim() } : {}) } })
        .then((response) => {
          if (latest.current !== ticket) return;
          const list = response.data?.applications || response.data?.data;
          setResults(Array.isArray(list) ? list as ApplicationOption[] : []);
          setFailed(false);
        })
        .catch(() => { if (latest.current === ticket) setFailed(true); })
        .finally(() => { if (latest.current === ticket) setSearching(false); });
    }, 300);
    return () => window.clearTimeout(timer);
  }, [isOpen, query]);

  const displayLabel = selected ? applicationLabel(selected) : t('recruitment.selectCandidateApp', 'Select candidate application...');

  return (
    <div className="relative inline-block w-full text-left" ref={dropdownRef} onClick={(e) => e.stopPropagation()}>
      <button
        type="button"
        disabled={disabled}
        onClick={() => !disabled && setIsOpen((prev) => !prev)}
        aria-expanded={isOpen}
        className={`flex w-full items-center justify-between gap-2 rounded-2xl border border-gray-200 bg-white px-4 py-3 text-xs font-semibold text-gray-900 hover:border-gray-300 focus:outline-none transition-all cursor-pointer shadow-sm ${disabled ? 'opacity-60 cursor-not-allowed' : ''}`}
      >
        <span className={selected ? 'text-gray-900 font-semibold truncate' : 'text-gray-400 font-medium truncate'}>
          {displayLabel}
        </span>
        <ChevronDown className={`h-4 w-4 shrink-0 text-gray-400 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {isOpen && !disabled && (
        <div className="absolute left-0 top-full z-[100] mt-2 w-full min-w-[220px] overflow-hidden rounded-3xl border border-gray-200/90 bg-white p-3 shadow-[0_16px_50px_-10px_rgba(0,0,0,0.18)] animate-in fade-in zoom-in-95 duration-100">
          <div className="mb-2 flex items-center gap-2 rounded-xl border border-gray-200 bg-gray-50 px-3">
            <Search size={14} className="shrink-0 text-gray-400" />
            <input
              type="search"
              autoFocus
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              onKeyDown={(event) => { if (event.key === 'Escape') { event.stopPropagation(); setIsOpen(false); } }}
              placeholder="Search candidate name, email, mobile or ref"
              className="w-full bg-transparent py-2 text-xs text-gray-900 outline-none"
            />
            {searching && <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-gray-400" />}
          </div>
          <div className="max-h-60 overflow-y-auto space-y-1 p-1 [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
            {failed ? (
              <div className="py-3 px-4 text-xs text-rose-600">The applications could not be loaded. Type again to retry.</div>
            ) : results.length === 0 ? (
              <div className="py-3 px-4 text-xs text-gray-400 italic">{searching ? 'Searching…' : 'No applications found'}</div>
            ) : (
              results.map((app) => {
                const isSelected = app.id === selected?.id;
                return (
                  <button
                    key={app.id}
                    type="button"
                    onClick={() => {
                      onChange(app);
                      setIsOpen(false);
                    }}
                    className={`flex w-full items-center justify-between gap-3 rounded-2xl px-4 py-3 text-left text-xs transition-all duration-150 cursor-pointer ${
                      isSelected
                        ? 'bg-amber-50/90 font-bold text-gray-950 shadow-2xs'
                        : 'text-gray-700 font-medium hover:bg-gray-50 hover:text-gray-950'
                    }`}
                  >
                    <span className="leading-relaxed text-[13px] text-gray-800">{applicationLabel(app)}</span>
                    {isSelected && <CheckCircle2 className="h-4 w-4 shrink-0 text-[#E5A700] stroke-[2.5]" />}
                  </button>
                );
              })
            )}
          </div>
          {results.length >= 20 && <p className="px-3 pt-2 text-[11px] text-gray-400">Showing the first 20 matches. Type to narrow the list.</p>}
        </div>
      )}
    </div>
  );
}

export default function AdminOffersPage() {
  const { t } = useTranslation();
  const currentUser = useAuthStore((state) => state.user);
  const canCreateOffer = canUseRecruitmentPermission(currentUser, recruitmentPermissions.offersCreate);
  const canUpdateOffer = canUseRecruitmentPermission(currentUser, recruitmentPermissions.offersUpdate);
  const canDeleteOffer = canUseRecruitmentPermission(currentUser, recruitmentPermissions.offersDelete);
  const canChangeOfferStatus = canUseRecruitmentPermission(currentUser, recruitmentPermissions.offersChangeStatus);
  const { darkLogoUrl } = useSiteLogo();
  const [offers, setOffers] = useState<OfferItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  // The list is paged, filtered and searched by the server: any number of offers.
  const [searchTerm, setSearchTerm] = useState('');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<OfferStatus | ''>('');
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [pagination, setPagination] = useState({ total: 0, totalPages: 1 });
  const [statusCounts, setStatusCounts] = useState<Partial<Record<OfferStatus, number>>>({});
  const offersRequest = useRef(0);
  const [selectedOffer, setSelectedOffer] = useState<OfferItem | null>(null);
  const [downloadingOfferId, setDownloadingOfferId] = useState<string | null>(null);
  const [deletingOfferId, setDeletingOfferId] = useState<string | null>(null);

  const handleDownloadOfferPdf = async (offer: OfferItem) => {
    try {
      setDownloadingOfferId(offer.id);
      toast.info(t('recruitment.downloadingOffer', 'Downloading offer letter PDF...'));

      const response = await api.get(`/recruitment/admin/offers/${offer.id}/pdf`, {
        responseType: 'blob',
      });

      const blob = new Blob([response.data], { type: 'application/pdf' });
      const downloadUrl = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = downloadUrl;
      const candidateName = offer.application?.candidate?.fullName?.replace(/[^a-z0-9]+/gi, '_') || 'Candidate';
      link.download = offer.offerLetterFileName || `Offer_Letter_${offer.offerRef}_${candidateName}.pdf`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(downloadUrl);
      toast.success(t('recruitment.downloadSuccess', 'Offer letter downloaded successfully.'));
    } catch {
      toast.error(t('recruitment.downloadFailed', 'Unable to download offer letter PDF.'));
    } finally {
      setDownloadingOfferId(null);
    }
  };

  // Create / edit offer
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [applications, setApplications] = useState<ApplicationOption[]>([]);
  const [selectedApplicationId, setSelectedApplicationId] = useState('');
  const [editingOfferId, setEditingOfferId] = useState<string | null>(null);
  const [offerForm, setOfferForm] = useState<OfferLetterFormData>(emptyOfferLetterData);
  const [loadingOfferDetails, setLoadingOfferDetails] = useState(false);
  const [savingOffer, setSavingOffer] = useState(false);
  const [submitError, setSubmitError] = useState('');
  // The HRM form options need offers.create / .update: a read-only viewer does not request them.
  const hrmEditor = useOfferHrmEditor(canCreateOffer || canUpdateOffer);
  const { reset: resetHrm } = hrmEditor;

  const fetchOffers = useCallback(async () => {
    const request = ++offersRequest.current;
    try {
      setLoading(true);
      setLoadError('');
      const res = await api.get('/recruitment/admin/offers', {
        params: { page: currentPage, limit: pageSize, ...(statusFilter ? { status: statusFilter } : {}), ...(search ? { search } : {}) },
      });
      if (request !== offersRequest.current) return;
      const offerList = res.data?.offers || res.data?.data;
      if (res.data?.success && Array.isArray(offerList)) {
        const total = Number(res.data?.pagination?.total ?? offerList.length);
        const totalPages = Math.max(1, Number(res.data?.pagination?.totalPages ?? 1));
        // The page shrank under us (an offer was deleted elsewhere): go to the last page that exists.
        if (currentPage > totalPages) {
          setCurrentPage(totalPages);
          return;
        }
        setOffers(offerList);
        setPagination({ total, totalPages });
        setStatusCounts((res.data?.statusCounts ?? {}) as Partial<Record<OfferStatus, number>>);
      } else {
        setLoadError('The offers could not be loaded.');
      }
    } catch (err: unknown) {
      if (request === offersRequest.current) setLoadError(apiErrorMessage(err, 'The offers could not be loaded.'));
    } finally {
      if (request === offersRequest.current) setLoading(false);
    }
  }, [currentPage, pageSize, statusFilter, search]);

  useEffect(() => {
    void fetchOffers();
  }, [fetchOffers]);

  // Search is sent to the server after a short pause in typing, and starts again at page 1.
  useEffect(() => {
    const next = searchTerm.trim();
    if (next === search) return undefined;
    const timer = window.setTimeout(() => {
      setSearch(next);
      setCurrentPage(1);
    }, 300);
    return () => window.clearTimeout(timer);
  }, [searchTerm, search]);

  const patchOfferForm = useCallback((patch: Partial<OfferLetterFormData>) => {
    setOfferForm((previous) => ({ ...previous, ...patch }));
  }, []);

  const updateOfferField = (field: keyof OfferLetterFormData, value: string) => {
    setOfferForm((previous) => {
      const next = { ...previous, [field]: value };
      // The letter amount follows the breakup when the period changes.
      if (field === 'salaryPeriod') {
        const amount = letterSalaryForPeriod(hrmEditor.form.salaryComponents, value);
        if (amount !== null) next.salaryAmount = amount;
      }
      if (field === 'letterDate' && (!previous.offerValidUntil || previous.offerValidUntil === defaultOfferValidUntil(previous.letterDate))) {
        next.offerValidUntil = defaultOfferValidUntil(value);
      }
      return next;
    });
  };

  const getOfferDefaults = (application?: ApplicationOption | OfferApplicationDetails | null): OfferLetterFormData => {
    const today = new Date().toISOString().slice(0, 10);
    const location = [application?.job?.locationCity, application?.job?.locationState].filter(Boolean).join(', ');
    const candidate = application?.candidate || null;
    const job = application?.job || null;
    return {
      ...emptyOfferLetterData,
      letterDate: today,
      offerLetterNo: `JCB/OFFER/${new Date().getFullYear()}/${application?.applicationRef || ''}`,
      employeeName: candidate?.fullName || '',
      employeeAddress: [candidate?.address, candidate?.currentCity, candidate?.state].filter(Boolean).join(', '),
      companyAddress: job?.locationAddress || location,
      // Department and designation come from the HRM lists chosen in the form.
      designation: '',
      department: '',
      placeOfPosting: location,
      joiningDate: '',
      offerValidUntil: defaultOfferValidUntil(today),
      employmentType: EMPLOYMENT_TYPE_LABELS.FULL_TIME,
      signatoryName: currentUser?.name || '',
      signatoryDesignation: 'Authorized Signatory',
      signatoryDate: today,
      signatoryPlace: job?.locationCity || '',
    };
  };

  /** A new offer: the letter starts from the application's candidate and job. */
  const loadOfferApplication = async (applicationId: string, chosen?: ApplicationOption) => {
    setSelectedApplicationId(applicationId);
    setSubmitError('');
    setOfferForm(getOfferDefaults(chosen ?? applications.find((application) => application.id === applicationId)));
    if (!applicationId) return;
    try {
      setLoadingOfferDetails(true);
      const response = await api.get(`/recruitment/admin/applications/${applicationId}`);
      const details = response.data?.application as OfferApplicationDetails | undefined;
      // Only fill what the person has not typed yet: candidate / company details from the full record.
      if (details) {
        const defaults = getOfferDefaults(details);
        setOfferForm((current) => ({
          ...current,
          employeeName: current.employeeName || defaults.employeeName,
          employeeAddress: current.employeeAddress || defaults.employeeAddress,
          companyAddress: current.companyAddress || defaults.companyAddress,
          offerLetterNo: defaults.offerLetterNo,
          signatoryPlace: current.signatoryPlace || defaults.signatoryPlace,
        }));
      }
    } catch (error) {
      console.warn('Unable to load complete application details for offer preview:', error);
    } finally {
      setLoadingOfferDetails(false);
    }
  };

  useEffect(() => {
    const refreshOffers = () => void fetchOffers();
    window.addEventListener('recruitment_offers_updated', refreshOffers);
    return () => window.removeEventListener('recruitment_offers_updated', refreshOffers);
  }, [fetchOffers]);

  const handleCreateOffer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (savingOffer) return;
    if (editingOfferId ? !canUpdateOffer : !canCreateOffer) return;
    setSubmitError('');
    const targetApplicationId = selectedApplicationId || offers.find((offer) => offer.id === editingOfferId)?.application?.id;
    if (!targetApplicationId) {
      setSubmitError('Choose the candidate application.');
      return;
    }
    const hrmOk = hrmEditor.validate(offerForm.designation);
    if (!hrmOk) {
      setSubmitError('Check the HRM placement and salary fields marked above.');
      return;
    }
    if (!offerForm.employeeName.trim() || !offerForm.department.trim() || !offerForm.salaryAmount.trim() || Number(offerForm.salaryAmount.replace(/,/g, '')) <= 0 || !offerForm.joiningDate) {
      setSubmitError('Employee name, department, a salary amount and the joining date are required.');
      return;
    }

    try {
      setSavingOffer(true);
      const pdfBlob = await pdf(<OfferLetterPdfDocument data={offerForm} logoUrl={darkLogoUrl} salaryBreakup={salaryBreakupForPdf(hrmEditor.form.salaryComponents)} />).toBlob();
      const payload = buildOfferMultipart({ applicationId: targetApplicationId, letter: offerForm, hrm: hrmEditor.form, pdfBlob });
      const response = editingOfferId
        ? await api.patch<OfferSendResponse>(`/recruitment/admin/offers/${editingOfferId}`, payload, { headers: { 'Content-Type': 'multipart/form-data' } })
        : await api.post<OfferSendResponse>('/recruitment/admin/offers', payload, { headers: { 'Content-Type': 'multipart/form-data' } });
      // Saved and sent: what each channel did (never an error from here on, a retry would close the link just sent).
      const dispatch = describeOfferDispatch(response.data?.communications);
      if (dispatch.tone === 'success') toast.success(`${editingOfferId ? 'Offer updated and resent.' : 'Offer sent.'} ${dispatch.summary}`);
      else toast.warning(`Offer saved. ${dispatch.summary}`);
      setShowCreateModal(false);
      setEditingOfferId(null);
      await fetchOffers();
      window.dispatchEvent(new Event('recruitment_applications_updated'));
    } catch (error) {
      setSubmitError(apiErrorMessage(error, 'The offer could not be saved. Check the form and try again.'));
    } finally {
      setSavingOffer(false);
    }
  };

  const openCreateOffer = () => {
    if (!canCreateOffer) return;
    setEditingOfferId(null);
    setSelectedApplicationId('');
    setSubmitError('');
    setOfferForm(getOfferDefaults());
    resetHrm();
    setShowCreateModal(true);
  };

  /** Edit starts from what was saved: the letter data, the HRM placement and the breakup. */
  const openEditOffer = (offer: OfferItem) => {
    if (!canUpdateOffer || !offerCanBeEdited(offer.status)) return;
    setEditingOfferId(offer.id);
    setSelectedApplicationId(offer.application?.id || '');
    setSubmitError('');
    const defaults = getOfferDefaults({ id: offer.application.id, applicationRef: offer.application.applicationRef, candidate: offer.application.candidate, job: offer.application.job });
    const saved = offer.offerLetterData || {};
    setOfferForm({
      ...defaults,
      ...saved,
      designation: saved.designation || offer.designation || '',
      department: saved.department || offer.department || '',
      placeOfPosting: saved.placeOfPosting || offer.workLocation || '',
      salaryAmount: saved.salaryAmount || (offer.salaryAmount ? String(offer.salaryAmount) : ''),
      salaryPeriod: saved.salaryPeriod || offer.salaryPeriod || 'annum',
      joiningDate: saved.joiningDate || (offer.joiningDate ? new Date(offer.joiningDate).toISOString().slice(0, 10) : ''),
      offerValidUntil: offer.expiryDate ? new Date(offer.expiryDate).toISOString().slice(0, 10) : defaults.offerValidUntil,
      employmentType: offer.placement?.employmentType && offer.placement.employmentType in EMPLOYMENT_TYPE_LABELS
        ? EMPLOYMENT_TYPE_LABELS[offer.placement.employmentType as keyof typeof EMPLOYMENT_TYPE_LABELS]
        : defaults.employmentType,
      reportingManager: offer.placement?.reportingManagerEmployeeId ? offer.reportingManager || '' : '',
    });
    resetHrm({ placement: offer.placement ?? null, components: offer.salaryComponents ?? [], reportingManagerName: offer.reportingManager ?? null });

    if (offer.application && !applications.some((a) => a.id === offer.application.id)) {
      setApplications((prev) => [
        ...prev,
        {
          id: offer.application.id,
          applicationRef: offer.application.applicationRef,
          candidate: offer.application.candidate,
          job: offer.application.job,
        },
      ]);
    }
    setShowCreateModal(true);
  };

  const handleDeleteOffer = async (offer: OfferItem) => {
    if (!canDeleteOffer || !offerCanBeDeleted(offer.status) || deletingOfferId) return;
    if (!(await confirmDelete({ title: 'Delete this offer?' }))) return;
    try {
      setDeletingOfferId(offer.id);
      await api.delete(`/recruitment/admin/offers/${offer.id}`);
      toast.success('Offer deleted.');
      await fetchOffers();
      window.dispatchEvent(new Event('recruitment_applications_updated'));
    } catch (error) {
      toast.error(apiErrorMessage(error, 'The offer could not be deleted.'));
    } finally {
      setDeletingOfferId(null);
    }
  };

  const onStatusChanged = async () => {
    setSelectedOffer(null);
    await fetchOffers();
    window.dispatchEvent(new Event('recruitment_applications_updated'));
  };

  const safeOffers = useMemo(() => (Array.isArray(offers) ? offers : []), [offers]);

  const statusChips = useMemo(() => {
    const statuses = (Object.keys(OFFER_STATUS_LABELS) as OfferStatus[]).filter((status) => status !== 'DRAFT' || (statusCounts.DRAFT ?? 0) > 0);
    const all = statuses.reduce((sum, status) => sum + (statusCounts[status] ?? 0), 0);
    return [{ value: '' as const, label: 'All', count: all }, ...statuses.map((status) => ({ value: status, label: OFFER_STATUS_LABELS[status], count: statusCounts[status] ?? 0 }))];
  }, [statusCounts]);

  const [openPageSizeDropdown, setOpenPageSizeDropdown] = useState(false);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent | TouchEvent) {
      const target = event.target as HTMLElement;
      if (!target?.closest?.('.rows-per-page-dropdown-container')) {
        setOpenPageSizeDropdown(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('touchstart', handleClickOutside, { passive: true });
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('touchstart', handleClickOutside);
    };
  }, []);

  const totalPages = pagination.totalPages;
  const paginatedOffers = safeOffers;
  const startItemIndex = pagination.total > 0 && safeOffers.length > 0 ? (currentPage - 1) * pageSize + 1 : 0;
  const endItemIndex = pagination.total > 0 ? Math.min(startItemIndex + safeOffers.length - 1, pagination.total) : 0;

  const salaryLine = (offer: OfferItem) => offer.salaryAmount && offer.salaryPeriod === 'month'
    ? `₹${formatInr(offer.salaryAmount)} / month on the letter`
    : null;

  return (
    <div className="min-h-screen bg-gray-50/50 flex flex-col">
      <main className="max-w-7xl mx-auto px-0 pt-0 pb-6 w-full space-y-4 flex-grow">
        {/* Filter Bar */}
        <div className="bg-white rounded-2xl p-3 sm:p-4 border border-gray-200/80 shadow-sm flex flex-col gap-3">
          <div className="relative flex items-center w-full">
            <Search size={16} className="absolute left-3 text-gray-400" />
            <input
              type="text"
              placeholder={t('recruitment.searchApplications', 'Search candidate name, job title, or ref...')}
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-9 pr-3 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-xs text-gray-900 placeholder-gray-400 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-[#FFC107] focus:bg-white hover:bg-gray-100/70 transition-all font-medium"
            />
          </div>

          <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
            <div role="group" aria-label="Filter by status" className="flex flex-wrap items-center gap-1.5">
              {statusChips.map((chip) => (
                <button
                  key={chip.value || 'ALL'}
                  type="button"
                  aria-pressed={statusFilter === chip.value}
                  onClick={() => { setStatusFilter(chip.value); setCurrentPage(1); }}
                  className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[11px] font-bold transition ${statusFilter === chip.value ? 'border-[#FFC107] bg-[#FFC107]/20 text-gray-900' : 'border-gray-200 bg-white text-gray-600 hover:bg-gray-50'}`}
                >
                  {chip.label}
                  <span className="rounded-full bg-white/80 px-1.5 text-[10px] text-gray-500 ring-1 ring-gray-200">{chip.count}</span>
                </button>
              ))}
            </div>

            {canCreateOffer && <button
                onClick={() => {
                  openCreateOffer();
                }}
                className="px-4 py-2.5 bg-[#FFC107] hover:bg-[#e5ad06] text-black font-extrabold text-xs rounded-xl shadow-sm transition flex items-center gap-2 shrink-0 ml-auto sm:ml-0"
              >
                <Plus size={16} />
                <span>{t('recruitment.newOffer', 'New Offer')}</span>
              </button>}
          </div>
        </div>

        {/* Offers Table Container */}
        {loading ? (
          <BrandLoader variant="section" size="sm" bg="light" text={t('recruitment.analyticsLoading', 'Loading candidate offer records...')} className="rounded-2xl border border-gray-200 bg-white p-12 text-center" />
        ) : loadError ? (
          <div role="alert" className="bg-white rounded-2xl border border-rose-200 p-12 text-center">
            <h4 className="text-lg font-bold text-gray-900">The offers could not be loaded</h4>
            <p className="text-sm text-rose-700 mt-1">{loadError}</p>
            <button type="button" onClick={() => void fetchOffers()} className="mt-4 rounded-xl bg-[#FFC107] px-4 py-2 text-xs font-extrabold text-black hover:bg-[#e5ad06]">Try again</button>
          </div>
        ) : safeOffers.length === 0 ? (
          <div className="bg-white rounded-2xl border border-gray-200 p-12 text-center">
            <Award className="mx-auto text-gray-300 mb-3" size={48} />
            <h4 className="text-lg font-bold text-gray-900">{t('recruitment.noOffersFound', 'No offers found')}</h4>
            <p className="text-sm text-gray-500 mt-1">Generate a new offer letter or clear active filters.</p>
          </div>
        ) : (
          <div className="bg-white rounded-2xl border border-gray-200/80 shadow-sm overflow-hidden flex flex-col">
            <div className="overflow-x-auto max-h-[calc(100vh-320px)] overflow-y-auto [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
              <table className="w-full text-left border-collapse" style={{minWidth: '760px'}}>
                <thead className="sticky top-0 bg-gray-50 z-10">
                  <tr className="border-b border-gray-200 text-[11px] font-bold text-gray-500 uppercase tracking-wider">
                    <th className="py-3.5 px-4 whitespace-nowrap">{t('recruitment.offerDetails', 'Offer Details')}</th>
                    <th className="py-3.5 px-4 whitespace-nowrap">{t('recruitment.designationRole', 'Designation & Role')}</th>
                    <th className="py-3.5 px-4 whitespace-nowrap">{t('recruitment.offeredAnnualCtc', 'Offered Annual CTC')}</th>
                    <th className="py-3.5 px-4 whitespace-nowrap">{t('recruitment.joiningDate', 'Joining Date')}</th>
                    <th className="py-3.5 px-4 whitespace-nowrap">{t('recruitment.offerStatus', 'Offer Status')}</th>
                    <th className="py-3.5 px-4 text-right whitespace-nowrap">{t('recruitment.actions', 'Actions')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 text-sm">
                  {paginatedOffers.map((item) => (
                    <tr key={item.id} className="hover:bg-amber-50/20 transition align-top">
                      <td className="py-4 px-4">
                        <div>
                          <p className="font-extrabold text-gray-900 text-xs">{item.application?.candidate?.fullName || 'N/A'}</p>
                          <p className="text-xs font-semibold text-gray-500 font-mono mt-0.5">{item.offerRef}</p>
                        </div>
                      </td>

                      <td className="py-4 px-4">
                        <div>
                          <p className="font-extrabold text-gray-900 text-xs">{item.designation}</p>
                          <p className="text-xs text-gray-500">{item.department || item.application?.job?.title}</p>
                          {!item.placement && <p className="mt-0.5 text-[10px] font-semibold text-amber-700">No HRM placement (older offer)</p>}
                        </div>
                      </td>

                      <td className="py-4 px-4 text-xs">
                        <p className="font-black text-gray-900">{formatLakhsPerYear(item.annualCtc)}</p>
                        {salaryLine(item) && <p className="text-[11px] text-gray-500">{salaryLine(item)}</p>}
                      </td>

                      <td className="py-4 px-4">
                        <p className="text-xs font-bold text-gray-900">
                          {formatDateDDMMYYYY(item.joiningDate)}
                        </p>
                      </td>

                      <td className="py-4 px-4">
                        <span className={`rounded-xl border px-3 py-1.5 text-xs font-extrabold ${STATUS_BADGE[item.status] ?? STATUS_BADGE.EXPIRED}`}>
                          {OFFER_STATUS_LABELS[item.status] ?? item.status}
                        </span>
                        {item.application?.currentStage === 'HIRED' && <p className="mt-1 text-[10px] font-bold text-emerald-700">Hired</p>}
                        {item.status === 'ACCEPTED' ? <div><OfferHrmBadge hrm={item.hrm} /></div> : null}
                      </td>

                      <td className="py-4 px-4 text-right">
                        <div className="flex flex-col items-end gap-2">
                          <div className="flex justify-end gap-2">
                            <button
                              type="button"
                              disabled={downloadingOfferId === item.id}
                              onClick={() => void handleDownloadOfferPdf(item)}
                              title={t('recruitment.downloadOfferLetter', 'Download Offer Letter PDF')}
                              aria-label="Download offer letter PDF"
                              className="px-3 py-1.5 bg-amber-50 hover:bg-amber-100 text-amber-900 border border-amber-200/80 font-bold text-xs rounded-xl transition flex items-center gap-1 shadow-2xs disabled:opacity-50"
                            >
                              {downloadingOfferId === item.id ? (
                                <Loader2 size={14} className="animate-spin text-amber-700" />
                              ) : (
                                <Download size={14} className="text-amber-700" />
                              )}
                            </button>
                            <button type="button" aria-label="View offer" onClick={() => setSelectedOffer(item)} className="px-3 py-1.5 bg-gray-100 hover:bg-gray-200 text-gray-800 font-bold text-xs rounded-xl transition"><Eye size={14} /></button>
                            {canUpdateOffer && offerCanBeEdited(item.status) && <button type="button" onClick={() => openEditOffer(item)} className="px-3 py-1.5 bg-blue-50 hover:bg-blue-100 text-blue-700 font-bold text-xs rounded-xl transition">{t('roleManagement.edit', 'Edit')}</button>}
                            {canDeleteOffer && offerCanBeDeleted(item.status) && <button type="button" disabled={deletingOfferId === item.id} onClick={() => void handleDeleteOffer(item)} className="px-3 py-1.5 bg-rose-50 hover:bg-rose-100 text-rose-700 font-bold text-xs rounded-xl transition disabled:opacity-50">{t('recruitment.deleteOffer', 'Delete')}</button>}
                          </div>
                          <OfferStatusActions
                            offerId={item.id}
                            status={item.status}
                            candidateName={item.application?.candidate?.fullName || ''}
                            canChangeStatus={canChangeOfferStatus}
                            onChanged={onStatusChanged}
                            defaultPlace={item.workLocation}
                          />
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Pagination Footer - Matches Jobs/Listings module */}
            {safeOffers.length > 0 && (
              <div className="flex flex-col gap-4 border-t border-gray-100 bg-white px-6 py-3.5 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex flex-wrap items-center justify-between gap-4 text-xs font-medium text-gray-500 sm:justify-start">
                  <div>
                    Showing <span className="font-bold text-gray-900">{startItemIndex}</span> to{' '}
                    <span className="font-bold text-gray-900">{endItemIndex}</span> of{' '}
                    <span className="font-bold text-gray-900">{pagination.total}</span> entries
                  </div>

                  <div className="flex items-center gap-2">
                    <span>Rows per page:</span>
                    <div className="relative rows-per-page-dropdown-container">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          setOpenPageSizeDropdown((prev) => !prev);
                        }}
                        className="flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-2.5 py-1 text-xs font-bold text-gray-800 shadow-2xs transition hover:bg-gray-50 focus:border-[#FFC107] focus:ring-1 focus:ring-[#FFC107]"
                      >
                        <span>{pageSize}</span>
                        <ChevronDown className="h-3.5 w-3.5 text-gray-400" />
                      </button>

                      {openPageSizeDropdown && (
                        <div className="absolute bottom-full left-0 z-50 mb-1.5 w-20 origin-bottom-left rounded-xl border border-gray-100 bg-white p-1 shadow-lg">
                          {[10, 20, 50, 100].map((size) => (
                            <button
                              key={size}
                              type="button"
                              onClick={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                setPageSize(size);
                                setCurrentPage(1);
                                setOpenPageSizeDropdown(false);
                              }}
                              className={`block w-full rounded-lg px-2.5 py-1.5 text-left text-xs transition-colors hover:bg-gray-100 ${
                                pageSize === size ? 'bg-[#FFC107]/20 font-extrabold text-gray-900' : 'font-medium text-gray-700'
                              }`}
                            >
                              {size}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                <div className="flex items-center justify-center gap-1 sm:justify-end">
                  <button
                    type="button"
                    onClick={() => setCurrentPage((prev) => Math.max(prev - 1, 1))}
                    disabled={currentPage === 1}
                    className="inline-flex items-center gap-1 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-semibold text-gray-700 shadow-2xs transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    <ChevronLeft className="h-4 w-4" />
                    <span className="hidden sm:inline">Previous</span>
                  </button>

                  <div className="flex items-center gap-1 px-1">
                    {buildPaginationItems(currentPage, totalPages).map((item, idx) =>
                      typeof item === 'number' ? (
                        <button
                          key={item}
                          type="button"
                          onClick={() => setCurrentPage(item)}
                          className={`h-8 w-8 rounded-lg text-xs font-bold transition ${
                            currentPage === item ? 'bg-[#FFC107] text-black shadow-2xs' : 'text-gray-600 hover:bg-gray-100'
                          }`}
                        >
                          {item}
                        </button>
                      ) : (
                        <span key={`ellipsis-${idx}`} className="px-1 text-xs font-bold text-gray-400">
                          ...
                        </span>
                      )
                    )}
                  </div>

                  <button
                    type="button"
                    onClick={() => setCurrentPage((prev) => Math.min(prev + 1, totalPages))}
                    disabled={currentPage === totalPages || totalPages === 1}
                    className="inline-flex items-center gap-1 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-semibold text-gray-700 shadow-2xs transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    <span className="hidden sm:inline">Next</span>
                    <ChevronRight className="h-4 w-4" />
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </main>

      {/* View Offer Modal */}
      {selectedOffer && (
        <div className="fixed inset-0 z-50 bg-gray-900/50 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl max-w-xl w-full p-5 sm:p-6 shadow-2xl space-y-5 my-4 max-h-[90vh] overflow-y-auto [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
            <div className="flex items-center justify-between border-b border-gray-200 pb-3">
              <div>
                <h3 className="text-lg font-extrabold text-gray-900">{t('recruitment.offerLetterDetails', 'Offer Letter Details')}</h3>
                <p className="text-xs text-gray-500 font-mono">Ref: {selectedOffer.offerRef}</p>
              </div>
              <button
                onClick={() => setSelectedOffer(null)}
                aria-label="Close"
                className="text-gray-400 hover:text-gray-600 font-bold text-lg"
              >
                ✕
              </button>
            </div>

            <div className="bg-amber-50/60 rounded-2xl p-4 border border-amber-200 space-y-2 text-xs">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1">
                <span className="text-gray-500">{t('recruitment.candidateName', 'Candidate Name:')}</span>
                <span className="font-bold text-gray-900">{selectedOffer.application.candidate.fullName}</span>
              </div>
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1">
                <span className="text-gray-500">{t('recruitment.offeredPosition', 'Offered Position:')}</span>
                <span className="font-bold text-gray-900">{selectedOffer.designation}</span>
              </div>
              {selectedOffer.department && (
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1">
                  <span className="text-gray-500">Department:</span>
                  <span className="font-bold text-gray-900">{selectedOffer.department}</span>
                </div>
              )}
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1">
                <span className="text-gray-500">{t('recruitment.workLocation', 'Work Location:')}</span>
                <span className="font-bold text-gray-900">{selectedOffer.workLocation}</span>
              </div>
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1">
                <span className="text-gray-500">{t('recruitment.annualCtc', 'Annual CTC:')}</span>
                <span className="font-black text-gray-900 text-sm">₹{formatInr(selectedOffer.annualCtc)} / year</span>
              </div>
              {selectedOffer.reportingManager && (
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1">
                  <span className="text-gray-500">Reporting to:</span>
                  <span className="font-bold text-gray-900">{selectedOffer.reportingManager}</span>
                </div>
              )}
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1">
                <span className="text-gray-500">Status:</span>
                <span className="font-bold text-gray-900">{OFFER_STATUS_LABELS[selectedOffer.status] ?? selectedOffer.status}</span>
              </div>
            </div>

            {(selectedOffer.salaryComponents?.length ?? 0) > 0 && (
              <div className="rounded-2xl border border-gray-200 p-4 text-xs">
                <p className="mb-2 font-bold text-gray-900">Salary breakup (monthly)</p>
                <ul className="space-y-1">
                  {selectedOffer.salaryComponents!.map((component) => (
                    <li key={component.code} className="flex justify-between gap-2"><span className="text-gray-600">{component.name}</span><span className="font-semibold text-gray-900">₹{formatInr(component.monthlyAmount)}</span></li>
                  ))}
                </ul>
              </div>
            )}

            {selectedOffer.status === 'ACCEPTED' && selectedOffer.acceptance ? (
              <OfferAcceptanceSummary offerId={selectedOffer.id} applicationRef={selectedOffer.application.applicationRef} acceptance={selectedOffer.acceptance} />
            ) : null}

            {selectedOffer.status === 'ACCEPTED' ? (
              <OfferHrmStatus offerId={selectedOffer.id} hrm={selectedOffer.hrm} canRun={canChangeOfferStatus} onChanged={onStatusChanged} />
            ) : null}

            <OfferStatusActions
              offerId={selectedOffer.id}
              status={selectedOffer.status}
              candidateName={selectedOffer.application.candidate.fullName}
              canChangeStatus={canChangeOfferStatus}
              onChanged={onStatusChanged}
              defaultPlace={selectedOffer.workLocation}
              compact
            />

            <div className="pt-4 border-t border-gray-200 flex items-center justify-between gap-3">
              <button
                type="button"
                disabled={downloadingOfferId === selectedOffer.id}
                onClick={() => void handleDownloadOfferPdf(selectedOffer)}
                className="px-4 py-2 bg-amber-400 hover:bg-amber-500 text-black font-extrabold text-xs rounded-xl transition flex items-center gap-1.5 shadow-xs disabled:opacity-50"
              >
                {downloadingOfferId === selectedOffer.id ? (
                  <Loader2 size={14} className="animate-spin text-black" />
                ) : (
                  <Download size={14} className="text-black" />
                )}
                <span>{t('recruitment.downloadOfferPdf', 'Download Offer Letter')}</span>
              </button>
              <button
                onClick={() => setSelectedOffer(null)}
                className="px-4 py-2 bg-gray-100 text-gray-700 font-bold text-xs rounded-xl hover:bg-gray-200 transition"
              >
                {t('listingDetails.close', 'Close')}
              </button>
            </div>
          </div>
        </div>
      )}

      <OfferLetterEditorModal
        open={showCreateModal}
        editingOfferId={editingOfferId}
        selectedApplication={applications.find((application) => application.id === selectedApplicationId)}
        onApplicationChange={(application) => {
          setApplications((previous) => (previous.some((item) => item.id === application.id) ? previous : [...previous, application]));
          void loadOfferApplication(application.id, application);
        }}
        loadingOfferDetails={loadingOfferDetails}
        saving={savingOffer}
        offerForm={offerForm}
        updateOfferField={updateOfferField}
        patchOfferForm={patchOfferForm}
        hrmEditor={hrmEditor}
        logoUrl={darkLogoUrl}
        submitError={submitError}
        onClose={() => { if (!savingOffer) setShowCreateModal(false); }}
        onSubmit={handleCreateOffer}
        canSubmit={editingOfferId ? canUpdateOffer : canCreateOffer}
      />
    </div>
  );
}
