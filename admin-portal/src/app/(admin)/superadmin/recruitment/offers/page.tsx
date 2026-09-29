'use client';

/* eslint-disable react-hooks/set-state-in-effect */

import React, { useDeferredValue, useEffect, useMemo, useState } from 'react';
import { PDFViewer, pdf } from '@react-pdf/renderer';
import api from '@/lib/api';
import BrandLoader from '@/components/ui/BrandLoader';
import OfferLetterPdfDocument from '@/components/recruitment/OfferLetterPdfDocument';
import { emptyOfferLetterData, type OfferLetterFormData } from '@/lib/offerLetter';
import { useTranslation } from '@/hooks/useTranslation';
import { useAuthStore } from '@/store/authStore';
import { canUseRecruitmentPermission, recruitmentPermissions } from '@/lib/recruitmentPermissions';
import { useSiteLogo } from '@/hooks/useSiteLogo';
import {
  Award,
  CheckCircle2,
  Plus,
  Search,
  Eye,
  ChevronRight,
  ChevronLeft,
  ChevronDown,
  Check,
} from 'lucide-react';
import { buildPaginationItems } from '@/lib/paginationUtils';
import type { OfferStatus } from '@/components/recruitment/OfferStatusDropdown';

interface OfferItem {
  id: string;
  offerRef: string;
  designation: string;
  annualCtc: number;
  workLocation: string;
  joiningDate?: string | null;
  expiryDate?: string | null;
  status: OfferStatus;
  createdAt: string;
  application: {
    id: string;
    applicationRef: string;
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

interface OfferLetterEditorModalProps {
  open: boolean;
  editingOfferId: string | null;
  applications: ApplicationOption[];
  selectedApplicationId: string;
  onApplicationChange: (applicationId: string) => void;
  loadingOfferDetails: boolean;
  offerForm: OfferLetterFormData;
  updateOfferField: (field: keyof OfferLetterFormData, value: string) => void;
  designationOptions: string[];
  onClose: () => void;
  onSubmit: React.FormEventHandler<HTMLFormElement>;
  canSubmit: boolean;
}

function OfferLetterEditorModal({
  open,
  editingOfferId,
  applications,
  selectedApplicationId,
  onApplicationChange,
  loadingOfferDetails,
  offerForm,
  updateOfferField,
  designationOptions,
  onClose,
  onSubmit,
  canSubmit,
}: OfferLetterEditorModalProps) {
  if (!open) return null;
  const field = (name: keyof OfferLetterFormData) => (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => updateOfferField(name, event.target.value);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-gray-950/60 p-3 backdrop-blur-sm sm:p-5">
      <div className="flex h-[94vh] w-full max-w-[1500px] flex-col overflow-hidden rounded-3xl bg-white shadow-2xl">
        <div className="flex shrink-0 items-center justify-between border-b border-gray-200 px-5 py-4 sm:px-7">
          <div>
            <h3 className="text-base font-bold text-gray-900">{editingOfferId ? 'Edit Employment Offer' : 'Generate Employment Offer'}</h3>
            <p className="mt-1 text-xs text-gray-500">The preview is the exact PDF that will be saved to Drive and sent to the selected candidate.</p>
          </div>
          <button type="button" onClick={onClose} className="rounded-lg px-3 py-2 text-xl text-gray-500 hover:bg-gray-100" aria-label="Close offer editor">X</button>
        </div>
        <div className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-[minmax(0,0.95fr)_minmax(420px,1.05fr)]">
          <form onSubmit={onSubmit} className="min-h-0 space-y-4 overflow-y-auto p-5 text-xs sm:p-7 [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
            <label className="block font-semibold text-gray-700">
              Candidate application *
              <span className="mt-1 block"><ApplicationSelectDropdown applications={applications} value={selectedApplicationId} disabled={Boolean(editingOfferId)} onChange={onApplicationChange} /></span>
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
            <div className="rounded-2xl border border-amber-200 bg-amber-50/50 p-4">
              <p className="mb-3 text-[11px] font-extrabold uppercase tracking-wider text-amber-700">Employment details</p>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <label className="font-semibold text-gray-700">Designation *<span className="mt-1 block"><DesignationSelectDropdown options={designationOptions} value={offerForm.designation} onChange={(value) => updateOfferField('designation', value)} /></span></label>
                <label className="font-semibold text-gray-700">Department *<input required value={offerForm.department} onChange={field('department')} className="mt-1 w-full rounded-xl border border-gray-200 bg-white p-2.5 text-gray-900" /></label>
                <label className="font-semibold text-gray-700">Place of posting *<input required value={offerForm.placeOfPosting} onChange={field('placeOfPosting')} className="mt-1 w-full rounded-xl border border-gray-200 bg-white p-2.5 text-gray-900" /></label>
                <label className="font-semibold text-gray-700">Salary / CTC *<input required inputMode="decimal" placeholder="e.g. 850000" value={offerForm.salaryAmount} onChange={field('salaryAmount')} className="mt-1 w-full rounded-xl border border-gray-200 bg-white p-2.5 text-gray-900" /></label>
                <label className="font-semibold text-gray-700">Salary period<select value={offerForm.salaryPeriod} onChange={field('salaryPeriod')} className="mt-1 w-full rounded-xl border border-gray-200 bg-white p-2.5 text-gray-900"><option value="month">Month</option><option value="annum">Annum</option></select></label>
                <label className="font-semibold text-gray-700">Date of joining *<input required type="date" value={offerForm.joiningDate} onChange={field('joiningDate')} className="mt-1 w-full rounded-xl border border-gray-200 bg-white p-2.5 text-gray-900" /></label>
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
            <div className="flex justify-end gap-2 border-t border-gray-200 pt-4">
              <button type="button" onClick={onClose} className="rounded-xl bg-gray-100 px-4 py-2.5 font-bold text-gray-700 hover:bg-gray-200">Cancel</button>
              <button type="submit" disabled={loadingOfferDetails || !canSubmit} className="rounded-xl bg-[#FFC107] px-4 py-2.5 font-extrabold text-black shadow-md hover:bg-[#e5ad06] disabled:opacity-50">{loadingOfferDetails ? 'Loading...' : editingOfferId ? 'Save & resend offer' : 'Generate & send offer'}</button>
            </div>
          </form>
          <div className="min-h-0 border-t border-gray-200 bg-gray-100 p-3 lg:border-l lg:border-t-0 sm:p-5"><div className="h-full overflow-hidden rounded-2xl border border-gray-300 bg-white shadow-inner"><PDFViewer showToolbar={false} className="h-full w-full border-0"><OfferLetterPdfDocument data={offerForm} /></PDFViewer></div></div>
        </div>
      </div>
    </div>
  );
}

function ApplicationSelectDropdown({
  applications,
  value,
  onChange,
  disabled = false,
}: {
  applications: ApplicationOption[];
  value: string;
  onChange: (val: string) => void;
  disabled?: boolean;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = React.useRef<HTMLDivElement>(null);

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

  const selectedApp = applications.find((a) => a.id === value);
  const { t } = useTranslation();
  const displayLabel = selectedApp
    ? `${selectedApp.candidate?.fullName || 'Candidate'} - ${selectedApp.job?.title || 'Job'} (${selectedApp.applicationRef})`
    : t('recruitment.selectCandidateApp', 'Select candidate application...');

  return (
    <div className="relative inline-block w-full text-left" ref={dropdownRef} onClick={(e) => e.stopPropagation()}>
      <button
        type="button"
        disabled={disabled}
        onClick={() => !disabled && setIsOpen((prev) => !prev)}
        className={`flex w-full items-center justify-between gap-2 rounded-2xl border border-gray-200 bg-white px-4 py-3 text-xs font-semibold text-gray-900 hover:border-gray-300 focus:outline-none transition-all cursor-pointer shadow-sm ${disabled ? 'opacity-60 cursor-not-allowed' : ''}`}
      >
        <span className={selectedApp ? 'text-gray-900 font-semibold truncate' : 'text-gray-400 font-medium truncate'}>
          {displayLabel}
        </span>
        <ChevronDown className={`h-4 w-4 shrink-0 text-gray-400 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {isOpen && !disabled && (
        <div className="absolute left-0 top-full z-[100] mt-2 w-full min-w-[220px] overflow-hidden rounded-3xl border border-gray-200/90 bg-white p-3 shadow-[0_16px_50px_-10px_rgba(0,0,0,0.18)] animate-in fade-in zoom-in-95 duration-100">
          <div className="max-h-60 overflow-y-auto space-y-1 p-1 [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
            {applications.length === 0 ? (
              <div className="py-3 px-4 text-xs text-gray-400 italic">No applications found</div>
            ) : (
              applications.map((app) => {
                const isSelected = app.id === value;
                const label = `${app.candidate?.fullName || 'Candidate'} - ${app.job?.title || 'Job'} (${app.applicationRef})`;
                return (
                  <button
                    key={app.id}
                    type="button"
                    onClick={() => {
                      onChange(app.id);
                      setIsOpen(false);
                    }}
                    className={`flex w-full items-center justify-between gap-3 rounded-2xl px-4 py-3 text-left text-xs transition-all duration-150 cursor-pointer ${
                      isSelected
                        ? 'bg-amber-50/90 font-bold text-gray-950 shadow-2xs'
                        : 'text-gray-700 font-medium hover:bg-gray-50 hover:text-gray-950'
                    }`}
                  >
                    <span className="leading-relaxed text-[13px] text-gray-800">{label}</span>
                    {isSelected && <CheckCircle2 className="h-4 w-4 shrink-0 text-[#E5A700] stroke-[2.5]" />}
                  </button>
                );
              })
            )}
          </div>
        </div>
      )}

      {/* stale misplaced editor block disabled during root-level editor integration
              <button type="button" onClick={() => setShowCreateModal(false)} className="rounded-lg px-3 py-2 text-gray-500 hover:bg-gray-100" aria-label="Close offer editor">✕</button>
            </div>
            <div className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-[minmax(0,0.95fr)_minmax(420px,1.05fr)]">
              <form onSubmit={handleCreateOffer} className="min-h-0 space-y-4 overflow-y-auto p-5 text-xs sm:p-7 [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
                <label className="block font-semibold text-gray-700">Candidate application *<ApplicationSelectDropdown applications={applications} value={selectedApplicationId} disabled={Boolean(editingOfferId)} onChange={(nextId) => void loadOfferApplication(nextId)} /></label>
                {loadingOfferDetails && <p className="rounded-lg bg-amber-50 px-3 py-2 text-[11px] font-semibold text-amber-700">Loading candidate details…</p>}
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <label className="font-semibold text-gray-700">Letter date *<input required type="date" value={offerForm.letterDate} onChange={(e) => updateOfferField('letterDate', e.target.value)} className="mt-1 w-full rounded-xl border border-gray-200 bg-gray-50 p-2.5 text-gray-900" /></label>
                  <label className="font-semibold text-gray-700">Offer letter no. *<input required value={offerForm.offerLetterNo} onChange={(e) => updateOfferField('offerLetterNo', e.target.value)} className="mt-1 w-full rounded-xl border border-gray-200 bg-gray-50 p-2.5 text-gray-900" /></label>
                  <label className="font-semibold text-gray-700">Employee name *<input required value={offerForm.employeeName} onChange={(e) => updateOfferField('employeeName', e.target.value)} className="mt-1 w-full rounded-xl border border-gray-200 bg-gray-50 p-2.5 text-gray-900" /></label>
                  <label className="font-semibold text-gray-700">Company name *<input required value={offerForm.companyName} onChange={(e) => updateOfferField('companyName', e.target.value)} className="mt-1 w-full rounded-xl border border-gray-200 bg-gray-50 p-2.5 text-gray-900" /></label>
                  <label className="font-semibold text-gray-700">Employee address<textarea rows={2} value={offerForm.employeeAddress} onChange={(e) => updateOfferField('employeeAddress', e.target.value)} className="mt-1 w-full rounded-xl border border-gray-200 bg-gray-50 p-2.5 text-gray-900" /></label>
                  <label className="font-semibold text-gray-700">Company address<textarea rows={2} value={offerForm.companyAddress} onChange={(e) => updateOfferField('companyAddress', e.target.value)} className="mt-1 w-full rounded-xl border border-gray-200 bg-gray-50 p-2.5 text-gray-900" /></label>
                </div>
                <div className="rounded-2xl border border-amber-200 bg-amber-50/50 p-4">
                  <p className="mb-3 text-[11px] font-extrabold uppercase tracking-wider text-amber-700">Employment details</p>
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <label className="font-semibold text-gray-700">Designation *<DesignationSelectDropdown options={designationOptions} value={offerForm.designation} onChange={(value) => updateOfferField('designation', value)} /></label>
                    <label className="font-semibold text-gray-700">Department *<input required value={offerForm.department} onChange={(e) => updateOfferField('department', e.target.value)} className="mt-1 w-full rounded-xl border border-gray-200 bg-white p-2.5 text-gray-900" /></label>
                    <label className="font-semibold text-gray-700">Place of posting *<input required value={offerForm.placeOfPosting} onChange={(e) => updateOfferField('placeOfPosting', e.target.value)} className="mt-1 w-full rounded-xl border border-gray-200 bg-white p-2.5 text-gray-900" /></label>
                    <label className="font-semibold text-gray-700">Salary / CTC *<input required inputMode="decimal" placeholder="e.g. 850000" value={offerForm.salaryAmount} onChange={(e) => updateOfferField('salaryAmount', e.target.value)} className="mt-1 w-full rounded-xl border border-gray-200 bg-white p-2.5 text-gray-900" /></label>
                    <label className="font-semibold text-gray-700">Salary period<select value={offerForm.salaryPeriod} onChange={(e) => updateOfferField('salaryPeriod', e.target.value)} className="mt-1 w-full rounded-xl border border-gray-200 bg-white p-2.5 text-gray-900"><option value="month">Month</option><option value="annum">Annum</option></select></label>
                    <label className="font-semibold text-gray-700">Date of joining *<input required type="date" value={offerForm.joiningDate} onChange={(e) => updateOfferField('joiningDate', e.target.value)} className="mt-1 w-full rounded-xl border border-gray-200 bg-white p-2.5 text-gray-900" /></label>
                    <label className="font-semibold text-gray-700">Probation (months) *<input required value={offerForm.probationPeriod} onChange={(e) => updateOfferField('probationPeriod', e.target.value)} className="mt-1 w-full rounded-xl border border-gray-200 bg-white p-2.5 text-gray-900" /></label>
                    <label className="font-semibold text-gray-700">Notice period (days) *<input required value={offerForm.noticePeriod} onChange={(e) => updateOfferField('noticePeriod', e.target.value)} className="mt-1 w-full rounded-xl border border-gray-200 bg-white p-2.5 text-gray-900" /></label>
                  </div>
                </div>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <label className="font-semibold text-gray-700">Signatory name *<input required value={offerForm.signatoryName} onChange={(e) => updateOfferField('signatoryName', e.target.value)} className="mt-1 w-full rounded-xl border border-gray-200 bg-gray-50 p-2.5 text-gray-900" /></label>
                  <label className="font-semibold text-gray-700">Signatory designation *<input required value={offerForm.signatoryDesignation} onChange={(e) => updateOfferField('signatoryDesignation', e.target.value)} className="mt-1 w-full rounded-xl border border-gray-200 bg-gray-50 p-2.5 text-gray-900" /></label>
                  <label className="font-semibold text-gray-700">Signatory date<input type="date" value={offerForm.signatoryDate} onChange={(e) => updateOfferField('signatoryDate', e.target.value)} className="mt-1 w-full rounded-xl border border-gray-200 bg-gray-50 p-2.5 text-gray-900" /></label>
                  <label className="font-semibold text-gray-700">Signatory place<input value={offerForm.signatoryPlace} onChange={(e) => updateOfferField('signatoryPlace', e.target.value)} className="mt-1 w-full rounded-xl border border-gray-200 bg-gray-50 p-2.5 text-gray-900" /></label>
                </div>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2"><label className="font-semibold text-gray-700">Acceptance date<textarea rows={1} value={offerForm.acceptanceDate} onChange={(e) => updateOfferField('acceptanceDate', e.target.value)} placeholder="Leave blank for candidate" className="mt-1 w-full rounded-xl border border-gray-200 bg-gray-50 p-2.5 text-gray-900" /></label><label className="font-semibold text-gray-700">Acceptance place<textarea rows={1} value={offerForm.acceptancePlace} onChange={(e) => updateOfferField('acceptancePlace', e.target.value)} placeholder="Leave blank for candidate" className="mt-1 w-full rounded-xl border border-gray-200 bg-gray-50 p-2.5 text-gray-900" /></label></div>
                <label className="block font-semibold text-gray-700">Additional terms (one per line)<textarea rows={4} value={offerForm.additionalTerms} onChange={(e) => updateOfferField('additionalTerms', e.target.value)} className="mt-1 w-full rounded-xl border border-gray-200 bg-gray-50 p-2.5 text-gray-900" /></label>
                <div className="flex justify-end gap-2 border-t border-gray-200 pt-4"><button type="button" onClick={() => setShowCreateModal(false)} className="rounded-xl bg-gray-100 px-4 py-2.5 font-bold text-gray-700 hover:bg-gray-200">Cancel</button><button type="submit" disabled={loadingOfferDetails || (editingOfferId ? !canUpdateOffer : !canCreateOffer)} className="rounded-xl bg-[#FFC107] px-4 py-2.5 font-extrabold text-black shadow-md hover:bg-[#e5ad06] disabled:opacity-50">{loadingOfferDetails ? 'Loading…' : editingOfferId ? 'Save & resend offer' : 'Generate & send offer'}</button></div>
              </form>
              <div className="min-h-0 border-t border-gray-200 bg-gray-100 p-3 lg:border-l lg:border-t-0 sm:p-5"><div className="h-full overflow-hidden rounded-2xl border border-gray-300 bg-white shadow-inner"><PDFViewer showToolbar={false} className="h-full w-full border-0"><OfferLetterPdfDocument data={offerForm} /></PDFViewer></div></div>
            </div>
          </div>
        </div>
      )}
      */}
    </div>
  );
}

function DesignationSelectDropdown({
  options,
  value,
  onChange,
  disabled = false,
}: {
  options: string[];
  value: string;
  onChange: (val: string) => void;
  disabled?: boolean;
}) {
  const { t } = useTranslation();
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = React.useRef<HTMLDivElement>(null);

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

  const displayLabel = value || t('recruitment.selectDesignation', 'Select designation...');

  return (
    <div className="relative inline-block w-full text-left" ref={dropdownRef} onClick={(e) => e.stopPropagation()}>
      <button
        type="button"
        disabled={disabled}
        onClick={() => !disabled && setIsOpen((prev) => !prev)}
        className={`flex w-full items-center justify-between gap-2 rounded-2xl border border-gray-200 bg-white px-4 py-3 text-xs font-semibold text-gray-900 hover:border-gray-300 focus:outline-none transition-all cursor-pointer shadow-sm ${disabled ? 'opacity-60 cursor-not-allowed' : ''}`}
      >
        <span className={value ? 'text-gray-900 font-semibold truncate' : 'text-gray-400 font-medium truncate'}>
          {displayLabel}
        </span>
        <ChevronDown className={`h-4 w-4 shrink-0 text-gray-400 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {isOpen && !disabled && (
        <div className="absolute left-0 top-full z-[100] mt-2 w-full min-w-[200px] overflow-hidden rounded-3xl border border-gray-200/90 bg-white p-3 shadow-[0_16px_50px_-10px_rgba(0,0,0,0.18)] animate-in fade-in zoom-in-95 duration-100">
          <div className="max-h-60 overflow-y-auto space-y-1 p-1 [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
            {options.length === 0 ? (
              <div className="py-3 px-4 text-xs text-gray-400 italic">No designations available</div>
            ) : (
              options.map((opt) => {
                const isSelected = opt === value;
                return (
                  <button
                    key={opt}
                    type="button"
                    onClick={() => {
                      onChange(opt);
                      setIsOpen(false);
                    }}
                    className={`flex w-full items-center justify-between gap-3 rounded-2xl px-4 py-3 text-left text-xs transition-all duration-150 cursor-pointer ${
                      isSelected
                        ? 'bg-amber-50/90 font-bold text-gray-950 shadow-2xs'
                        : 'text-gray-700 font-medium hover:bg-gray-50 hover:text-gray-950'
                    }`}
                  >
                    <span className="leading-relaxed text-[13px] text-gray-800">{opt}</span>
                    {isSelected && <CheckCircle2 className="h-4 w-4 shrink-0 text-[#E5A700] stroke-[2.5]" />}
                  </button>
                );
              })
            )}
          </div>
        </div>
      )}
      {/* stale root editor copy; the live editor is mounted by AdminOffersPage
      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-gray-950/60 p-3 backdrop-blur-sm sm:p-5">
          <div className="flex h-[94vh] w-full max-w-[1500px] flex-col overflow-hidden rounded-3xl bg-white shadow-2xl">
            <div className="flex shrink-0 items-center justify-between border-b border-gray-200 px-5 py-4 sm:px-7">
              <div>
                <h3 className="text-base font-bold text-gray-900">{editingOfferId ? 'Edit Employment Offer' : 'Generate Employment Offer'}</h3>
                <p className="mt-1 text-xs text-gray-500">The preview is the exact PDF that will be saved to Drive and sent to the selected candidate.</p>
              </div>
              <button type="button" onClick={() => setShowCreateModal(false)} className="rounded-lg px-3 py-2 text-xl text-gray-500 hover:bg-gray-100" aria-label="Close offer editor">X</button>
            </div>
            <div className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-[minmax(0,0.95fr)_minmax(420px,1.05fr)]">
              <form onSubmit={handleCreateOffer} className="min-h-0 space-y-4 overflow-y-auto p-5 text-xs sm:p-7 [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
                <label className="block font-semibold text-gray-700">
                  Candidate application *
                  <span className="mt-1 block"><ApplicationSelectDropdown applications={applications} value={selectedApplicationId} disabled={Boolean(editingOfferId)} onChange={(nextId) => void loadOfferApplication(nextId)} /></span>
                </label>
                {loadingOfferDetails && <p className="rounded-lg bg-amber-50 px-3 py-2 text-[11px] font-semibold text-amber-700">Loading candidate details...</p>}

                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <label className="font-semibold text-gray-700">Letter date *<input required type="date" value={offerForm.letterDate} onChange={(e) => updateOfferField('letterDate', e.target.value)} className="mt-1 w-full rounded-xl border border-gray-200 bg-gray-50 p-2.5 text-gray-900" /></label>
                  <label className="font-semibold text-gray-700">Offer letter no. *<input required value={offerForm.offerLetterNo} onChange={(e) => updateOfferField('offerLetterNo', e.target.value)} className="mt-1 w-full rounded-xl border border-gray-200 bg-gray-50 p-2.5 text-gray-900" /></label>
                  <label className="font-semibold text-gray-700">Employee name *<input required value={offerForm.employeeName} onChange={(e) => updateOfferField('employeeName', e.target.value)} className="mt-1 w-full rounded-xl border border-gray-200 bg-gray-50 p-2.5 text-gray-900" /></label>
                  <label className="font-semibold text-gray-700">Company name *<input required value={offerForm.companyName} onChange={(e) => updateOfferField('companyName', e.target.value)} className="mt-1 w-full rounded-xl border border-gray-200 bg-gray-50 p-2.5 text-gray-900" /></label>
                  <label className="font-semibold text-gray-700">Employee address<textarea rows={2} value={offerForm.employeeAddress} onChange={(e) => updateOfferField('employeeAddress', e.target.value)} className="mt-1 w-full rounded-xl border border-gray-200 bg-gray-50 p-2.5 text-gray-900" /></label>
                  <label className="font-semibold text-gray-700">Company address<textarea rows={2} value={offerForm.companyAddress} onChange={(e) => updateOfferField('companyAddress', e.target.value)} className="mt-1 w-full rounded-xl border border-gray-200 bg-gray-50 p-2.5 text-gray-900" /></label>
                </div>

                <div className="rounded-2xl border border-amber-200 bg-amber-50/50 p-4">
                  <p className="mb-3 text-[11px] font-extrabold uppercase tracking-wider text-amber-700">Employment details</p>
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <label className="font-semibold text-gray-700">Designation *<span className="mt-1 block"><DesignationSelectDropdown options={designationOptions} value={offerForm.designation} onChange={(value) => updateOfferField('designation', value)} /></span></label>
                    <label className="font-semibold text-gray-700">Department *<input required value={offerForm.department} onChange={(e) => updateOfferField('department', e.target.value)} className="mt-1 w-full rounded-xl border border-gray-200 bg-white p-2.5 text-gray-900" /></label>
                    <label className="font-semibold text-gray-700">Place of posting *<input required value={offerForm.placeOfPosting} onChange={(e) => updateOfferField('placeOfPosting', e.target.value)} className="mt-1 w-full rounded-xl border border-gray-200 bg-white p-2.5 text-gray-900" /></label>
                    <label className="font-semibold text-gray-700">Salary / CTC *<input required inputMode="decimal" placeholder="e.g. 850000" value={offerForm.salaryAmount} onChange={(e) => updateOfferField('salaryAmount', e.target.value)} className="mt-1 w-full rounded-xl border border-gray-200 bg-white p-2.5 text-gray-900" /></label>
                    <label className="font-semibold text-gray-700">Salary period<select value={offerForm.salaryPeriod} onChange={(e) => updateOfferField('salaryPeriod', e.target.value)} className="mt-1 w-full rounded-xl border border-gray-200 bg-white p-2.5 text-gray-900"><option value="month">Month</option><option value="annum">Annum</option></select></label>
                    <label className="font-semibold text-gray-700">Date of joining *<input required type="date" value={offerForm.joiningDate} onChange={(e) => updateOfferField('joiningDate', e.target.value)} className="mt-1 w-full rounded-xl border border-gray-200 bg-white p-2.5 text-gray-900" /></label>
                    <label className="font-semibold text-gray-700">Probation (months) *<input required value={offerForm.probationPeriod} onChange={(e) => updateOfferField('probationPeriod', e.target.value)} className="mt-1 w-full rounded-xl border border-gray-200 bg-white p-2.5 text-gray-900" /></label>
                    <label className="font-semibold text-gray-700">Notice period (days) *<input required value={offerForm.noticePeriod} onChange={(e) => updateOfferField('noticePeriod', e.target.value)} className="mt-1 w-full rounded-xl border border-gray-200 bg-white p-2.5 text-gray-900" /></label>
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <label className="font-semibold text-gray-700">Signatory name *<input required value={offerForm.signatoryName} onChange={(e) => updateOfferField('signatoryName', e.target.value)} className="mt-1 w-full rounded-xl border border-gray-200 bg-gray-50 p-2.5 text-gray-900" /></label>
                  <label className="font-semibold text-gray-700">Signatory designation *<input required value={offerForm.signatoryDesignation} onChange={(e) => updateOfferField('signatoryDesignation', e.target.value)} className="mt-1 w-full rounded-xl border border-gray-200 bg-gray-50 p-2.5 text-gray-900" /></label>
                  <label className="font-semibold text-gray-700">Signatory date<input type="date" value={offerForm.signatoryDate} onChange={(e) => updateOfferField('signatoryDate', e.target.value)} className="mt-1 w-full rounded-xl border border-gray-200 bg-gray-50 p-2.5 text-gray-900" /></label>
                  <label className="font-semibold text-gray-700">Signatory place<input value={offerForm.signatoryPlace} onChange={(e) => updateOfferField('signatoryPlace', e.target.value)} className="mt-1 w-full rounded-xl border border-gray-200 bg-gray-50 p-2.5 text-gray-900" /></label>
                </div>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <label className="font-semibold text-gray-700">Acceptance date<textarea rows={1} value={offerForm.acceptanceDate} onChange={(e) => updateOfferField('acceptanceDate', e.target.value)} placeholder="Leave blank for candidate" className="mt-1 w-full rounded-xl border border-gray-200 bg-gray-50 p-2.5 text-gray-900" /></label>
                  <label className="font-semibold text-gray-700">Acceptance place<textarea rows={1} value={offerForm.acceptancePlace} onChange={(e) => updateOfferField('acceptancePlace', e.target.value)} placeholder="Leave blank for candidate" className="mt-1 w-full rounded-xl border border-gray-200 bg-gray-50 p-2.5 text-gray-900" /></label>
                </div>
                <label className="block font-semibold text-gray-700">Additional terms (one per line)<textarea rows={4} value={offerForm.additionalTerms} onChange={(e) => updateOfferField('additionalTerms', e.target.value)} className="mt-1 w-full rounded-xl border border-gray-200 bg-gray-50 p-2.5 text-gray-900" /></label>
                <div className="flex justify-end gap-2 border-t border-gray-200 pt-4">
                  <button type="button" onClick={() => setShowCreateModal(false)} className="rounded-xl bg-gray-100 px-4 py-2.5 font-bold text-gray-700 hover:bg-gray-200">Cancel</button>
                  <button type="submit" disabled={loadingOfferDetails || (editingOfferId ? !canUpdateOffer : !canCreateOffer)} className="rounded-xl bg-[#FFC107] px-4 py-2.5 font-extrabold text-black shadow-md hover:bg-[#e5ad06] disabled:opacity-50">{loadingOfferDetails ? 'Loading...' : editingOfferId ? 'Save & resend offer' : 'Generate & send offer'}</button>
                </div>
              </form>
              <div className="min-h-0 border-t border-gray-200 bg-gray-100 p-3 lg:border-l lg:border-t-0 sm:p-5">
                <div className="h-full overflow-hidden rounded-2xl border border-gray-300 bg-white shadow-inner">
                  <PDFViewer showToolbar={false} className="h-full w-full border-0"><OfferLetterPdfDocument data={offerForm} /></PDFViewer>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
      */}
    </div>
  );
}

interface CustomFilterSelectProps {
  value: string;
  onChange: (val: string) => void;
  options: Array<{ value: string; label: string }>;
  placeholder: string;
}

function CustomFilterSelect({ value, onChange, options, placeholder }: CustomFilterSelectProps) {
  const [isOpen, setIsOpen] = useState(false);
  const filterRef = React.useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent | TouchEvent) {
      if (filterRef.current && !filterRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
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

  const selectedOption = options.find((o) => o.value === value);

  return (
    <div className="relative inline-block text-left" ref={filterRef}>
      <button
        type="button"
        onClick={() => setIsOpen((prev) => !prev)}
        className="flex items-center justify-between gap-3 rounded-2xl border border-gray-200/90 bg-white px-4 py-2.5 text-xs font-semibold text-gray-800 shadow-2xs hover:bg-gray-50/80 hover:border-gray-300 focus:outline-none transition-all cursor-pointer min-w-[140px]"
      >
        <span className="truncate">{selectedOption ? selectedOption.label : placeholder}</span>
        <ChevronDown className={`h-4 w-4 shrink-0 text-gray-400 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {isOpen && (
        <div className="absolute left-0 sm:left-auto sm:right-0 top-full mt-2 z-50 w-[220px] origin-top-left sm:origin-top-right rounded-3xl border border-gray-100 bg-white p-2 shadow-[0_12px_40px_-8px_rgba(0,0,0,0.18)] animate-in fade-in zoom-in-95 duration-100">
          <div className="max-h-60 overflow-y-auto space-y-1 [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
            <button
              type="button"
              onClick={() => {
                onChange('');
                setIsOpen(false);
              }}
              className={`flex w-full items-center justify-between rounded-2xl px-3.5 py-2.5 text-left text-xs transition-colors duration-150 ${
                !value
                  ? 'bg-[#FFF9E6] font-bold text-gray-900'
                  : 'text-gray-700 font-medium hover:bg-gray-50'
              }`}
            >
              <span>{placeholder}</span>
              {!value && <Check className="h-4 w-4 shrink-0 text-[#E5A700] stroke-[2.5]" />}
            </button>
            {options.map((opt) => {
              const isSelected = opt.value === value;
              return (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => {
                    onChange(opt.value);
                    setIsOpen(false);
                  }}
                  className={`flex w-full items-center justify-between rounded-2xl px-3.5 py-2.5 text-left text-xs transition-colors duration-150 ${
                    isSelected
                      ? 'bg-[#FFF9E6] font-bold text-gray-900'
                      : 'text-gray-700 font-medium hover:bg-gray-50'
                  }`}
                >
                  <span>{opt.label}</span>
                  {isSelected && <Check className="h-4 w-4 shrink-0 text-[#E5A700] stroke-[2.5]" />}
                </button>
              );
            })}
          </div>
        </div>
      )}
      {/* misplaced root editor invocation; AdminOffersPage owns this instance
      <OfferLetterEditorModal
        open={showCreateModal}
        editingOfferId={editingOfferId}
        applications={applications}
        selectedApplicationId={selectedApplicationId}
        onApplicationChange={(nextId) => void loadOfferApplication(nextId)}
        loadingOfferDetails={loadingOfferDetails}
        offerForm={offerForm}
        updateOfferField={updateOfferField}
        designationOptions={designationOptions}
        onClose={() => setShowCreateModal(false)}
        onSubmit={handleCreateOffer}
        canSubmit={editingOfferId ? canUpdateOffer : canCreateOffer}
      />
      */}
    </div>
  );
}

export default function AdminOffersPage() {
  const { t } = useTranslation();
  const currentUser = useAuthStore((state) => state.user);
  const canCreateOffer = canUseRecruitmentPermission(currentUser, recruitmentPermissions.offersCreate);
  const canUpdateOffer = canUseRecruitmentPermission(currentUser, recruitmentPermissions.offersUpdate);
  const canDeleteOffer = canUseRecruitmentPermission(currentUser, recruitmentPermissions.offersDelete);
  const { darkLogoUrl } = useSiteLogo();
  const [offers, setOffers] = useState<OfferItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const deferredSearchTerm = useDeferredValue(searchTerm);
  const [designationFilter, setDesignationFilter] = useState('');
  const [ctcFilter, setCtcFilter] = useState('');
  const [selectedOffer, setSelectedOffer] = useState<OfferItem | null>(null);

  // Create Offer Modal
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [applications, setApplications] = useState<ApplicationOption[]>([]);
  const [selectedApplicationId, setSelectedApplicationId] = useState('');
  const [offerDesignation, setOfferDesignation] = useState('');
  const [annualCtc, setAnnualCtc] = useState('');
  const [joiningDate, setJoiningDate] = useState('');
  const [editingOfferId, setEditingOfferId] = useState<string | null>(null);
  const [offerForm, setOfferForm] = useState<OfferLetterFormData>(emptyOfferLetterData);
  const [loadingOfferDetails, setLoadingOfferDetails] = useState(false);

  const fetchOffers = async () => {
    try {
      setLoading(true);
      const res = await api.get('/recruitment/admin/offers');
      const offerList = res.data?.offers || res.data?.data;
      if (res.data?.success && Array.isArray(offerList)) {
        setOffers(offerList);
      } else {
        setOffers(getMockOffers());
      }
    } catch (err: unknown) {
      console.warn('Backend offers fetch failed, using fallback mock data:', err);
      setOffers(getMockOffers());
    } finally {
      setLoading(false);
    }
  };

  const [jobs, setJobs] = useState<Array<{ id: string; title: string }>>([]);

  const fetchApplicationsList = async () => {
    try {
      const [appRes, jobRes] = await Promise.all([
        api.get('/recruitment/admin/applications?limit=50&compact=true'),
        api.get('/recruitment/admin/jobs?limit=100'),
      ]);
      const appList = appRes.data?.applications || appRes.data?.data;
      if (Array.isArray(appList)) {
        setApplications(appList);
      }
      const jobList = jobRes.data?.jobs || jobRes.data?.data;
      if (Array.isArray(jobList)) {
        setJobs(jobList);
      }
    } catch (err) {
      console.warn('Failed to fetch applications or jobs list for offer creation', err);
    }
  };

  const designationOptions = useMemo(() => {
    const set = new Set<string>();
    (applications || []).forEach((app) => {
      if (app.job?.title) set.add(app.job.title);
    });
    (jobs || []).forEach((j) => {
      if (j.title) set.add(j.title);
    });
    return Array.from(set);
  }, [applications, jobs]);

  useEffect(() => {
    fetchOffers();
  }, []);

  const updateOfferField = <K extends keyof OfferLetterFormData>(field: K, value: OfferLetterFormData[K]) => {
    setOfferForm((previous) => ({ ...previous, [field]: value }));
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
      designation: job?.title || '',
      department: job?.department?.name || '',
      placeOfPosting: location,
      joiningDate: '',
      signatoryDate: today,
      signatoryPlace: job?.locationCity || '',
    };
  };

  const loadOfferApplication = async (applicationId: string, baseApplication?: ApplicationOption) => {
    setSelectedApplicationId(applicationId);
    setOfferForm(getOfferDefaults(baseApplication || applications.find((application) => application.id === applicationId)));
    if (!applicationId) return;
    try {
      setLoadingOfferDetails(true);
      const response = await api.get(`/recruitment/admin/applications/${applicationId}`);
      const details = response.data?.application as OfferApplicationDetails | undefined;
      if (details) setOfferForm(getOfferDefaults(details));
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
  }, []);

  const handleCreateOffer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (editingOfferId ? !canUpdateOffer : !canCreateOffer) return;
    const targetApplicationId = selectedApplicationId || offers.find((offer) => offer.id === editingOfferId)?.application?.id;
    if (!targetApplicationId || !offerForm.employeeName.trim() || !offerForm.designation.trim() || !offerForm.department.trim() || !offerForm.salaryAmount.trim() || !offerForm.joiningDate) {
      alert('Application, employee, designation, department, salary and joining date are required.');
      return;
    }

    try {
      setLoadingOfferDetails(true);
      const pdfBlob = await pdf(<OfferLetterPdfDocument data={offerForm} logoUrl={darkLogoUrl} />).toBlob();
      const payload = new FormData();
      payload.append('applicationId', targetApplicationId);
      payload.append('designation', offerForm.designation);
      payload.append('department', offerForm.department);
      payload.append('joiningLocation', offerForm.placeOfPosting);
      payload.append('ctc', offerForm.salaryAmount.replace(/,/g, ''));
      payload.append('joiningDate', offerForm.joiningDate);
      payload.append('probationPeriod', offerForm.probationPeriod);
      payload.append('additionalTerms', offerForm.additionalTerms);
      payload.append('offerData', JSON.stringify(offerForm));
      payload.append('offerPdf', pdfBlob, `${offerForm.offerLetterNo || 'offer-letter'}.pdf`);
      if (editingOfferId) {
        await api.patch(`/recruitment/admin/offers/${editingOfferId}`, payload, { headers: { 'Content-Type': 'multipart/form-data' } });
      } else {
        await api.post('/recruitment/admin/offers', payload, { headers: { 'Content-Type': 'multipart/form-data' } });
      }
      setShowCreateModal(false);
      setEditingOfferId(null);
      await fetchOffers();
      window.dispatchEvent(new Event('recruitment_offers_updated'));
      window.dispatchEvent(new Event('recruitment_applications_updated'));
    } catch (error) {
      console.error('Failed to create offer:', error);
      alert('Failed to create offer letter. Please check the form and try again.');
    } finally {
      setLoadingOfferDetails(false);
    }
  };

  const openCreateOffer = () => {
    if (!canCreateOffer) return;
    setEditingOfferId(null);
    setSelectedApplicationId('');
    setOfferForm(getOfferDefaults());
    setShowCreateModal(true);
    void fetchApplicationsList();
  };

  const openEditOffer = (offer: OfferItem) => {
    if (!canUpdateOffer) return;
    setEditingOfferId(offer.id);
    setSelectedApplicationId(offer.application?.id || '');
    setOfferForm({
      ...getOfferDefaults(offer.application),
      designation: offer.designation || '',
      salaryAmount: offer.annualCtc ? String(offer.annualCtc) : '',
      placeOfPosting: offer.workLocation || '',
      joiningDate: offer.joiningDate ? new Date(offer.joiningDate).toISOString().slice(0, 10) : '',
    });

    // Ensure candidate application exists in applications option list
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
    void fetchApplicationsList();
    void loadOfferApplication(offer.application?.id || '', offer.application);
  };

  const handleDeleteOffer = async (offerId: string) => {
    if (!canDeleteOffer) return;
    if (!window.confirm('Delete this offer?')) return;
    setOffers((prev) => (prev || []).filter((o) => o.id !== offerId));
    try {
      await api.delete(`/recruitment/admin/offers/${offerId}`);
    } catch {
      console.warn('API offer delete failed, keeping local deletion');
    } finally {
      window.dispatchEvent(new Event('recruitment_offers_updated'));
      window.dispatchEvent(new Event('recruitment_applications_updated'));
    }
  };

  const safeOffers = useMemo(() => (Array.isArray(offers) ? offers : []), [offers]);

  // Dynamic Designation & CTC filter options derived from current page items
  const dynamicDesignationOptions = useMemo(() => {
    const uniqueDesignations = Array.from(
      new Set(safeOffers.map((o) => o.designation).filter(Boolean))
    );
    if (uniqueDesignations.length === 0) {
      return [
        { value: 'Senior Excavator Service Engineer', label: 'Senior Excavator Service Engineer' },
        { value: 'Territory Sales Executive - Heavy Equipment', label: 'Territory Sales Executive - Heavy Equipment' },
      ];
    }
    return uniqueDesignations.map((d) => ({
      value: d,
      label: d,
    }));
  }, [safeOffers]);

  const dynamicCtcOptions = useMemo(() => {
    const uniqueCtcs = Array.from(
      new Set(safeOffers.map((o) => o.annualCtc).filter((val) => typeof val === 'number' && val > 0))
    ).sort((a, b) => a - b);

    if (uniqueCtcs.length === 0) {
      return [
        { value: '600000', label: '₹6.0 LPA' },
        { value: '1200000', label: '₹12.0 LPA' },
      ];
    }

    return uniqueCtcs.map((ctc) => {
      const lpa = (ctc / 100000).toFixed(1);
      return {
        value: String(ctc),
        label: `₹${lpa} LPA`,
      };
    });
  }, [safeOffers]);

  const filteredOffers = useMemo(() => {
    const searchLower = deferredSearchTerm.trim().toLowerCase();

    return safeOffers.filter((item) => {
      const matchesSearch =
        !searchLower ||
        item.application?.candidate?.fullName?.toLowerCase().includes(searchLower) ||
        item.application?.job?.title?.toLowerCase().includes(searchLower) ||
        item.designation?.toLowerCase().includes(searchLower) ||
        item.offerRef?.toLowerCase().includes(searchLower);

      const matchesDesignation = !designationFilter || item.designation === designationFilter;
      const matchesCtc = !ctcFilter || String(item.annualCtc) === ctcFilter;

      return matchesSearch && matchesDesignation && matchesCtc;
    });
  }, [ctcFilter, deferredSearchTerm, designationFilter, safeOffers]);

  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
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

  useEffect(() => {
    setCurrentPage(1);
  }, [deferredSearchTerm, designationFilter, ctcFilter, pageSize]);

  const totalPages = Math.ceil(filteredOffers.length / pageSize) || 1;
  const paginatedOffers = useMemo(
    () => filteredOffers.slice((currentPage - 1) * pageSize, currentPage * pageSize),
    [currentPage, filteredOffers, pageSize]
  );
  const startItemIndex = filteredOffers.length > 0 ? (currentPage - 1) * pageSize + 1 : 0;
  const endItemIndex = Math.min(currentPage * pageSize, filteredOffers.length);

  // KPI Metrics
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
            <CustomFilterSelect
              value={designationFilter}
              onChange={setDesignationFilter}
              placeholder={t('recruitment.allDesignations', 'All Designations')}
              options={dynamicDesignationOptions}
            />
            <CustomFilterSelect
              value={ctcFilter}
              onChange={setCtcFilter}
              placeholder={t('recruitment.allCtcs', 'All CTCs')}
              options={dynamicCtcOptions}
            />

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
        ) : filteredOffers.length === 0 ? (
          <div className="bg-white rounded-2xl border border-gray-200 p-12 text-center">
            <Award className="mx-auto text-gray-300 mb-3" size={48} />
            <h4 className="text-lg font-bold text-gray-900">{t('recruitment.noOffersFound', 'No offers found')}</h4>
            <p className="text-sm text-gray-500 mt-1">Generate a new offer letter or clear active filters.</p>
          </div>
        ) : (
          <div className="bg-white rounded-2xl border border-gray-200/80 shadow-sm overflow-hidden flex flex-col">
            <div className="overflow-x-auto max-h-[calc(100vh-320px)] overflow-y-auto [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
              <table className="w-full text-left border-collapse" style={{minWidth: '640px'}}>
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
                    <tr key={item.id} className="hover:bg-amber-50/20 transition">
                      <td className="py-4 px-4">
                        <div>
                          <p className="font-extrabold text-gray-900 text-xs">{item.application?.candidate?.fullName || 'N/A'}</p>
                          <p className="text-xs font-semibold text-gray-500 font-mono mt-0.5">{item.offerRef}</p>
                        </div>
                      </td>

                      <td className="py-4 px-4">
                        <div>
                          <p className="font-extrabold text-gray-900 text-xs">{item.designation}</p>
                          <p className="text-xs text-gray-500">{item.application?.job?.title}</p>
                        </div>
                      </td>

                      <td className="py-4 px-4 font-black text-gray-900 text-xs">
                        ₹{(item.annualCtc / 100000).toFixed(2)} Lakhs / yr
                      </td>

                      <td className="py-4 px-4">
                        <p className="text-xs font-bold text-gray-900">
                          {formatDateDDMMYYYY(item.joiningDate)}
                        </p>
                      </td>

                      <td className="py-4 px-4">
                        <span className="rounded-xl border border-gray-200 bg-gray-50 px-3 py-1.5 text-xs font-extrabold text-gray-700">
                          {item.status.replaceAll('_', ' ')}
                        </span>
                      </td>

                      <td className="py-4 px-4 text-right">
                        <div className="flex justify-end gap-2">
                          <button type="button" onClick={() => setSelectedOffer(item)} className="px-3 py-1.5 bg-gray-100 hover:bg-gray-200 text-gray-800 font-bold text-xs rounded-xl transition"><Eye size={14} /></button>
                          {canUpdateOffer && <button type="button" onClick={() => openEditOffer(item)} className="px-3 py-1.5 bg-blue-50 hover:bg-blue-100 text-blue-700 font-bold text-xs rounded-xl transition">{t('roleManagement.edit', 'Edit')}</button>}
                          {canDeleteOffer && <button type="button" onClick={() => void handleDeleteOffer(item.id)} className="px-3 py-1.5 bg-rose-50 hover:bg-rose-100 text-rose-700 font-bold text-xs rounded-xl transition">{t('recruitment.deleteOffer', 'Delete')}</button>}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Pagination Footer - Matches Jobs/Listings module */}
            {filteredOffers.length > 0 && (
              <div className="flex flex-col gap-4 border-t border-gray-100 bg-white px-6 py-3.5 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex flex-wrap items-center justify-between gap-4 text-xs font-medium text-gray-500 sm:justify-start">
                  <div>
                    Showing <span className="font-bold text-gray-900">{startItemIndex}</span> to{' '}
                    <span className="font-bold text-gray-900">{endItemIndex}</span> of{' '}
                    <span className="font-bold text-gray-900">{filteredOffers.length}</span> entries
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
                          {[5, 10, 25, 50].map((size) => (
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
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1">
                <span className="text-gray-500">{t('recruitment.workLocation', 'Work Location:')}</span>
                <span className="font-bold text-gray-900">{selectedOffer.workLocation}</span>
              </div>
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1">
                <span className="text-gray-500">{t('recruitment.annualCtc', 'Annual CTC:')}</span>
                <span className="font-black text-gray-900 text-sm">
                  ₹{(selectedOffer.annualCtc / 100000).toFixed(2)} Lakhs
                </span>
              </div>
            </div>

            <div className="pt-4 border-t border-gray-200 flex justify-end gap-3">
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

      {/* Generate Offer Modal */}
      {false && showCreateModal && (
        <div className="fixed inset-0 z-50 bg-gray-900/50 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-3xl max-w-md w-full p-5 sm:p-7 shadow-2xl my-4 max-h-[90vh] overflow-y-auto [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
            <div className="flex items-center justify-between border-b border-gray-200 pb-3 mb-4">
              <h3 className="text-base font-bold text-gray-950 flex items-center gap-2">
                {editingOfferId ? t('recruitment.editOfferTitle', 'Edit Employment Offer') : t('recruitment.generateOffer', 'Generate Employment Offer')}
              </h3>
              <button onClick={() => setShowCreateModal(false)} className="text-gray-400 hover:text-gray-600 font-bold text-lg">
                ✕
              </button>
            </div>

              <form onSubmit={handleCreateOffer} className="space-y-4 text-xs text-gray-950">
              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1">{t('recruitment.selectApplication', 'Select Application')} *</label>
                <ApplicationSelectDropdown
                  applications={applications}
                  value={selectedApplicationId}
                  disabled={Boolean(editingOfferId)}
                  onChange={(nextId) => {
                    const selected = applications.find((app) => app.id === nextId);
                    setSelectedApplicationId(nextId);
                    setOfferDesignation(selected?.job?.title || '');
                  }}
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1">{t('recruitment.offeredDesignation', 'Offered Designation')}</label>
                <DesignationSelectDropdown
                  options={designationOptions}
                  value={offerDesignation}
                  onChange={setOfferDesignation}
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1">{t('recruitment.offeredCtcLakhs', 'Offered CTC (Rs. Lakhs)')} *</label>
                <input
                  type="number"
                  step="0.1"
                  placeholder="e.g. 12.0"
                  value={annualCtc}
                  onChange={(e) => setAnnualCtc(e.target.value)}
                  required
                  className="w-full py-2.5 px-3 bg-gray-50 border border-gray-200 rounded-xl text-xs font-semibold text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-[#FFC107]/50 focus:border-[#FFC107]"
                />
              </div>

              <div>
                <div>
                  <label className="block text-xs font-bold text-gray-700 mb-1">{t('recruitment.joiningDate', 'Joining Date')} *</label>
                  <input
                    type="date"
                    value={joiningDate}
                    onChange={(e) => setJoiningDate(e.target.value)}
                    className="w-full py-2.5 px-3 bg-gray-50 border border-gray-200 rounded-xl text-xs font-semibold text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-[#FFC107]/50 focus:border-[#FFC107]"
                  />
                </div>
              </div>

              <div className="pt-4 border-t border-gray-200 flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="px-4 py-2.5 bg-gray-100 text-gray-700 font-bold text-xs rounded-xl hover:bg-gray-200 transition"
                >
                  {t('roleManagement.cancel', 'Cancel')}
                </button>
                <button
                  type="submit"
                  disabled={editingOfferId ? !canUpdateOffer : !canCreateOffer}
                  className="px-5 py-2.5 bg-[#FFC107] hover:bg-[#e5ad06] text-black font-extrabold text-xs rounded-xl shadow-md transition-all disabled:opacity-50"
                >
                  Open offer workspace
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      <OfferLetterEditorModal
        open={showCreateModal}
        editingOfferId={editingOfferId}
        applications={applications}
        selectedApplicationId={selectedApplicationId}
        onApplicationChange={(nextId) => void loadOfferApplication(nextId)}
        loadingOfferDetails={loadingOfferDetails}
        offerForm={offerForm}
        updateOfferField={updateOfferField}
        designationOptions={designationOptions}
        onClose={() => setShowCreateModal(false)}
        onSubmit={handleCreateOffer}
        canSubmit={editingOfferId ? canUpdateOffer : canCreateOffer}
      />
    </div>
  );
}

// Fallback Mock Data
function getMockOffers(): OfferItem[] {
  return [
    {
      id: 'off-001',
      offerRef: 'OFFER-2026-0001',
      designation: 'Territory Sales Executive - Heavy Equipment',
      annualCtc: 950000,
      workLocation: 'Ahmedabad Branch',
      joiningDate: '2026-09-15T00:00:00Z',
      expiryDate: '2026-09-10T00:00:00Z',
      status: 'SENT',
      createdAt: '2026-08-28T12:00:00Z',
      application: {
        id: 'app-102',
        applicationRef: 'JCB-JOB-2026-000102',
        candidate: {
          fullName: 'Priya Patel',
          email: 'priya.patel@example.com',
          mobile: '+91 98123 45678',
        },
        job: {
          title: 'Territory Sales Executive - Heavy Equipment',
          jobCode: 'SALES-TE-002',
        },
      },
    },
  ];
}
