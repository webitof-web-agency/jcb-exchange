'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { AlertCircle, Camera, CheckCircle2, CreditCard, FileText, Loader2, Mail, MapPin, Pencil, Phone, Save, ShieldCheck, UserRound, X } from 'lucide-react';
import Image from 'next/image';
import { toast } from 'react-toastify';
import api from '@/lib/api';
import { getPassportPhotoUploadValidationError, uploadFileToServer } from '@/lib/fileUpload';
import { normalizeSecureDocumentPath } from '@/lib/secureDocumentPath.mjs';
import type { PartnerGstVerificationResponse } from '@/lib/partnerGstVerification';
import { buildPartnerAuthGstSource, buildPartnerAuthKycFields, type PartnerAuthKycField } from '@/lib/partnerAuthKycFields';
import { DigilockerVerificationModal, type DigilockerVerificationSession } from '@/components/accounts/sold-vehicle/DigilockerVerificationModal';

type OnboardingDocument = {
  documentType?: string | null;
  documentNumber?: string | null;
  nameOnDocument?: string | null;
  fileName?: string | null;
  fileUrl?: string | null;
  verificationResult?: Record<string, unknown> | null;
};

type OnboardingResponse = {
  profile?: {
    gstNumber?: string | null;
    businessName?: string | null;
    businessAddress?: string | null;
    email?: string | null;
    primaryContact?: string | null;
    alternateMobile?: string | null;
    gstVerifiedMobile?: string | null;
    gstVerifiedEmail?: string | null;
    gstVerifiedAddress?: string | null;
    aadhaarVerifiedAt?: string | null;
  } | null;
  kycDocuments?: OnboardingDocument[];
};

type PartnerAuthKycFieldsProps = {
  gst: PartnerGstVerificationResponse | null;
  onboardingEndpoint?: string;
  readOnly?: boolean;
};

type AadhaarVerificationResponse = {
  cacheHit?: boolean;
  record?: { id?: string; status?: string; providerClientId?: string | null };
  result?: { fullName?: string | null; maskedAadhaar?: string | null } | null;
  sdkToken?: string;
  gateway?: 'sandbox' | 'production';
  expirySeconds?: number;
};

const fieldIcons: Record<PartnerAuthKycField['key'], typeof UserRound> = {
  legalName: UserRound,
  aadhaar: CreditCard,
  pan: CreditCard,
  address: MapPin,
  photo: Camera,
  email: Mail,
  primaryMobile: Phone,
  alternateMobile: Phone,
  verifiedMobile: Phone,
  verifiedEmail: Mail,
  verifiedAddress: MapPin,
};

const findDocument = (documents: OnboardingDocument[] | undefined, type: string) =>
  documents?.find((document) => document.documentType === type) || null;

function PhotoPreview({ fileUrl, localPreview, fileName }: { fileUrl?: string | null; localPreview?: string; fileName?: string | null }) {
  const [securePreview, setSecurePreview] = useState('');
  const [previewError, setPreviewError] = useState(false);
  const [loadedFileUrl, setLoadedFileUrl] = useState('');
  const [viewerOpen, setViewerOpen] = useState(false);

  useEffect(() => {
    let active = true;
    let objectUrl = '';

    if (localPreview || !fileUrl) {
      return () => {
        active = false;
      };
    }

    api.get<Blob>(normalizeSecureDocumentPath(fileUrl), { responseType: 'blob' })
      .then((response) => {
        if (!active) return;
        const contentType = response.data.type?.startsWith('image/') ? response.data.type : 'image/webp';
        objectUrl = URL.createObjectURL(new Blob([response.data], { type: contentType }));
        setSecurePreview(objectUrl);
        setLoadedFileUrl(fileUrl);
        setPreviewError(false);
      })
      .catch(() => {
        if (active) {
          setLoadedFileUrl(fileUrl);
          setPreviewError(true);
        }
      });

    return () => {
      active = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [fileUrl, localPreview]);

  useEffect(() => {
    if (!viewerOpen) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setViewerOpen(false);
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [viewerOpen]);

  const source = localPreview || (loadedFileUrl === fileUrl ? securePreview : '');
  const showPreviewError = !source && previewError && loadedFileUrl === fileUrl;
  return (
    <>
      <button
        type="button"
        onClick={() => source && setViewerOpen(true)}
        disabled={!source}
        aria-label={source ? `Open ${fileName || 'partner photo'}` : 'Photo preview unavailable'}
        className={`group relative h-16 w-16 shrink-0 overflow-hidden rounded-lg bg-slate-100 text-slate-400 ring-1 ring-slate-200 ${source ? 'cursor-zoom-in hover:ring-blue-300' : 'cursor-default'}`}
      >
        {source ? (
          <Image src={source} alt={fileName || 'Partner photo'} width={64} height={64} unoptimized className="h-full w-full object-cover transition group-hover:scale-105" />
        ) : (
          <span className="flex h-full w-full items-center justify-center">
            {showPreviewError ? <AlertCircle className="h-5 w-5" /> : <Camera className="h-5 w-5" />}
          </span>
        )}
      </button>
      {viewerOpen && source ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={fileName || 'Partner photo preview'}
          className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-950/80 p-4 backdrop-blur-sm"
          onMouseDown={(event) => {
            if (event.currentTarget === event.target) setViewerOpen(false);
          }}
        >
          <div className="relative max-h-[90vh] max-w-[min(92vw,900px)] rounded-2xl bg-white p-3 shadow-2xl">
            <button type="button" onClick={() => setViewerOpen(false)} aria-label="Close photo preview" className="absolute right-4 top-4 z-10 rounded-full bg-slate-900/75 p-2 text-white hover:bg-slate-900">
              <X className="h-4 w-4" />
            </button>
            <Image src={source} alt={fileName || 'Partner photo'} width={900} height={1100} unoptimized className="max-h-[84vh] w-auto max-w-[86vw] rounded-xl object-contain" />
            {fileName ? <p className="px-2 pt-2 text-center text-xs font-semibold text-slate-600">{fileName}</p> : null}
          </div>
        </div>
      ) : null}
    </>
  );
}

export default function PartnerAuthKycFields({ gst, onboardingEndpoint = '/auth/partner/onboarding', readOnly = false }: PartnerAuthKycFieldsProps) {
  const [onboarding, setOnboarding] = useState<OnboardingResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [editMode, setEditMode] = useState(false);
  const [saving, setSaving] = useState(false);
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState('');
  const [aadhaarVerification, setAadhaarVerification] = useState<'idle' | 'verifying' | 'verified'>('idle');
  const [aadhaarSession, setAadhaarSession] = useState<DigilockerVerificationSession | null>(null);
  const photoPreviewUrlRef = useRef('');
  const photoInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let active = true;

    api.get<OnboardingResponse>(onboardingEndpoint)
      .then((response) => {
        if (!active) return;
        setOnboarding(response.data);
        setAadhaarVerification(response.data.profile?.aadhaarVerifiedAt ? 'verified' : 'idle');
      })
      .catch(() => {
        if (active) setError('Unable to load the saved KYC fields.');
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [onboardingEndpoint]);

  useEffect(() => () => {
    if (photoPreviewUrlRef.current) URL.revokeObjectURL(photoPreviewUrlRef.current);
  }, []);

  const effectiveGst = useMemo(() => gst || buildPartnerAuthGstSource({
    profile: onboarding?.profile,
    documents: onboarding?.kycDocuments || [],
  }), [gst, onboarding]);
  const fields = useMemo(() => buildPartnerAuthKycFields({
    gst: effectiveGst,
    profile: onboarding?.profile,
    documents: onboarding?.kycDocuments || [],
  }), [effectiveGst, onboarding]);
  const photoDocument = findDocument(onboarding?.kycDocuments, 'PASSPORT_PHOTO');

  const cancelEditing = () => {
    setEditMode(false);
    setError('');
    setPhotoFile(null);
    if (photoPreviewUrlRef.current) URL.revokeObjectURL(photoPreviewUrlRef.current);
    photoPreviewUrlRef.current = '';
    setPhotoPreview('');
    setAadhaarVerification(onboarding?.profile?.aadhaarVerifiedAt ? 'verified' : 'idle');
  };

  const handlePhotoChange = (file: File | undefined) => {
    if (!file) return;
    const validationError = getPassportPhotoUploadValidationError(file);
    if (validationError) {
      setError(validationError);
      toast.error(validationError);
      return;
    }
    setError('');
    if (photoPreviewUrlRef.current) URL.revokeObjectURL(photoPreviewUrlRef.current);
    photoPreviewUrlRef.current = URL.createObjectURL(file);
    setPhotoPreview(photoPreviewUrlRef.current);
    setPhotoFile(file);
  };

  const handleSave = async () => {
    if (!photoFile) {
      setError('Select a photo to save. Aadhaar verification is completed separately and is not saved from Auth.');
      return;
    }

    setSaving(true);
    setError('');
    try {
      const result = await uploadFileToServer({ file: photoFile, visibility: 'secure', purpose: 'passport-photo' });
      const uploadedPhoto = { fileUrl: result.fileUrl, fileName: result.fileName || result.originalName || photoFile.name };

      await api.patch('/auth/partner/auth-identity', {
        photoUrl: uploadedPhoto.fileUrl,
        photoName: uploadedPhoto.fileName,
      });
      const response = await api.get<OnboardingResponse>('/auth/partner/onboarding');
      setOnboarding(response.data);
      setAadhaarVerification(response.data.profile?.aadhaarVerifiedAt ? 'verified' : 'idle');
      if (photoPreviewUrlRef.current) URL.revokeObjectURL(photoPreviewUrlRef.current);
      photoPreviewUrlRef.current = '';
      setPhotoPreview('');
      setPhotoFile(null);
      setEditMode(false);
      toast.success('Photo details saved successfully.');
    } catch (requestError: unknown) {
      const response = requestError as { response?: { data?: { error?: unknown } } };
      const message = typeof response.response?.data?.error === 'string' ? response.response.data.error : 'Unable to save identity details.';
      setError(message);
      toast.error(message);
    } finally {
      setSaving(false);
    }
  };

  const startAadhaarVerification = async () => {
    setAadhaarVerification('verifying');
    setError('');
    try {
      const response = await api.post<AadhaarVerificationResponse>('/auth/partner/auth/verify-aadhaar/initialize', { side: 'SALE' });
      if (response.data.cacheHit && response.data.result) {
        setAadhaarVerification('verified');
        toast.success('Aadhaar verified successfully via DigiLocker.');
        return;
      }
      const recordId = response.data.record?.id?.trim();
      const clientId = response.data.record?.providerClientId?.trim();
      if (!recordId || !clientId || !response.data.sdkToken) {
        throw new Error('DigiLocker verification session was not created.');
      }
      setAadhaarSession({
        recordId,
        clientId,
        sdkToken: response.data.sdkToken,
        gateway: response.data.gateway === 'production' ? 'production' : 'sandbox',
        expirySeconds: response.data.expirySeconds,
      });
    } catch (requestError: unknown) {
      const response = requestError as { response?: { data?: { error?: unknown } } };
      setAadhaarVerification('idle');
      setError(typeof response.response?.data?.error === 'string' ? response.response.data.error : requestError instanceof Error ? requestError.message : 'Aadhaar verification could not be started.');
    }
  };

  const completeAadhaarVerification = async (clientId: string) => {
    const session = aadhaarSession;
    if (!session) return;
    try {
      const response = await api.post<AadhaarVerificationResponse>('/auth/partner/auth/verify-aadhaar/complete', {
        recordId: session.recordId,
        clientId,
      });
      if (!response.data.result) throw new Error('Aadhaar verification result was not returned.');
      setAadhaarVerification('verified');
      toast.success('Aadhaar verified successfully via DigiLocker.');
    } catch (requestError: unknown) {
      const response = requestError as { response?: { data?: { error?: unknown } } };
      setAadhaarVerification('idle');
      setError(typeof response.response?.data?.error === 'string' ? response.response.data.error : requestError instanceof Error ? requestError.message : 'Aadhaar verification could not be completed.');
    } finally {
      setAadhaarSession(null);
    }
  };

  return (
    <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="border-b border-slate-100 bg-slate-50/80 px-5 py-4 sm:px-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-amber-600">Partner KYC profile</p>
            <h2 className="mt-1 text-lg font-bold tracking-tight text-slate-900">Identity details</h2>
            <p className="mt-1 text-xs leading-relaxed text-slate-500">Only the saved signup and verification fields are shown here.</p>
          </div>
          <div className="flex items-center gap-2">
            {!readOnly && editMode ? (
              <>
                <button type="button" onClick={cancelEditing} disabled={saving} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-[11px] font-bold text-slate-600 hover:bg-slate-50 disabled:opacity-50">
                  <X className="h-3.5 w-3.5" /> Cancel
                </button>
                <button type="button" onClick={() => void handleSave()} disabled={saving || loading || !photoFile} className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-2 text-[11px] font-bold text-white hover:bg-blue-700 disabled:opacity-50">
                  {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />} Save
                </button>
              </>
            ) : !readOnly ? (
              <button type="button" onClick={() => setEditMode(true)} disabled={loading} className="inline-flex items-center gap-1.5 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-[11px] font-bold text-blue-700 hover:bg-blue-100 disabled:opacity-50">
                <Pencil className="h-3.5 w-3.5" /> Edit details
              </button>
            ) : null}
            <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-3 py-1.5 text-[11px] font-bold text-emerald-700 ring-1 ring-emerald-200">
              <CheckCircle2 className="h-3.5 w-3.5" /> {editMode ? 'Editing' : 'Read-only view'}
            </span>
          </div>
        </div>
      </div>

      {error ? (
        <div className="m-4 flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-xs font-semibold text-rose-700">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" /> <span>{error}</span>
        </div>
      ) : null}
      {loading ? (
        <div className="grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-4 sm:p-5">
          {fields.map((field) => <div key={field.key} className="h-24 animate-pulse rounded-xl bg-slate-100" />)}
        </div>
      ) : (
        <dl className="grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-4 sm:p-5">
          {fields.map((field) => {
            const Icon = fieldIcons[field.key];
            const hasValue = Boolean(field.value);
            const isPhoto = field.key === 'photo';
            const isAadhaar = field.key === 'aadhaar';
            const isAadhaarVerified = isAadhaar && (hasValue || aadhaarVerification === 'verified');
            return (
              <div key={field.key} className="min-h-[94px] rounded-xl border border-slate-200 bg-white p-4 transition hover:border-slate-300 hover:shadow-sm">
                <dt className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                  <Icon className="h-3.5 w-3.5 text-slate-500" /> {field.label}
                </dt>
                {isAadhaar ? (
                  <div className="mt-3 space-y-2">
                    {isAadhaarVerified ? (
                      <div className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-200 bg-emerald-50 px-2.5 py-1.5 text-[11px] font-bold text-emerald-700">
                        <CheckCircle2 className="h-3.5 w-3.5" /> Verified via DigiLocker
                      </div>
                    ) : readOnly ? (
                      <div className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-[11px] font-bold text-slate-500">
                        <ShieldCheck className="h-3.5 w-3.5" /> Not verified
                      </div>
                    ) : (
                      <button type="button" onClick={() => void startAadhaarVerification()} disabled={aadhaarVerification === 'verifying'} className="inline-flex items-center gap-1.5 rounded-lg border border-amber-200 bg-amber-50 px-2.5 py-1.5 text-[11px] font-bold text-amber-800 hover:bg-amber-100 disabled:opacity-50">
                      {aadhaarVerification === 'verifying' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ShieldCheck className="h-3.5 w-3.5" />}
                        {aadhaarVerification === 'verifying' ? 'Starting verification...' : 'Verify Aadhaar'}
                      </button>
                    )}
                    <p className="text-[10px] leading-relaxed text-slate-500">Use the secure DigiLocker flow. Aadhaar number is not typed or saved from Auth.</p>
                  </div>
                ) : isPhoto ? (
                  <div className="mt-3 flex items-center gap-3">
                    <PhotoPreview fileUrl={photoDocument?.fileUrl} localPreview={photoPreview} fileName={photoDocument?.fileName} />
                    <div className="min-w-0">
                      <p className={`truncate text-sm font-bold ${hasValue || photoFile ? 'text-slate-900' : 'text-slate-400'}`}>{photoFile?.name || field.value || 'Not provided'}</p>
                      {!readOnly && editMode ? <button type="button" onClick={() => photoInputRef.current?.click()} className="mt-1 text-[11px] font-bold text-blue-600 hover:text-blue-700">{photoFile || hasValue ? 'Change photo' : 'Upload photo'}</button> : null}
                    </div>
                    {!readOnly ? <input ref={photoInputRef} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={(event) => { handlePhotoChange(event.target.files?.[0]); event.currentTarget.value = ''; }} /> : null}
                  </div>
                ) : (
                  <dd className={`mt-3 break-words text-sm font-bold ${hasValue ? 'text-slate-900' : 'text-slate-400'}`}>
                    {hasValue ? field.value : 'Not provided'}
                  </dd>
                )}
                {isPhoto && hasValue && !editMode ? <p className="mt-1 flex items-center gap-1 text-[10px] font-semibold text-emerald-600"><FileText className="h-3 w-3" /> Saved document</p> : null}
              </div>
            );
          })}
        </dl>
      )}
      {aadhaarSession ? (
        <DigilockerVerificationModal
          session={aadhaarSession}
          statusEndpointBase="/auth/partner/auth/verify-aadhaar"
          onSuccess={(clientId) => void completeAadhaarVerification(clientId)}
          onClose={() => {
            const sessionToCancel = aadhaarSession;
            setAadhaarSession(null);
            setAadhaarVerification('idle');
            void api.post('/auth/partner/auth/verify-aadhaar/cancel', { recordId: sessionToCancel.recordId }).catch(() => undefined);
          }}
        />
      ) : null}
    </section>
  );
}
