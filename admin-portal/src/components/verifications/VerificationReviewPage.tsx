'use client';

import { useCallback, useEffect, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import axios from 'axios';
import { toast } from 'react-toastify';
import {
  AlertTriangle,
  ArrowLeft,
  Check,
  CheckCircle2,
  Download,
  ExternalLink,
  Eye,
  FileCheck2,
  FileText,
  ImageIcon,
  Loader2,
  Pencil,
  X,
} from 'lucide-react';
import api from '@/lib/api';
import { formatPartnerTypeLabel } from '@/lib/partnerType';
import { hasAnyPermission } from '@/lib/permissionUtils';
import { useAuthStore } from '@/store/authStore';
import { downloadSecureDocument, fetchSecureDocumentBlob } from '@/lib/secureDownload';
import PartnerKycTemplateModal, { type PartnerTemplateResponse } from '@/components/kyc/PartnerKycTemplateModal';
import VerificationDecisionModal from '@/components/verifications/VerificationDecisionModal';
import {
  documentDisplayTitles,
  formatDate,
  formatDateTime,
  formatFileSize,
  formatStatus,
  getReviewActionLabel,
  isTemplateDocumentType,
  partnerEditBasePathFor,
  partnerTemplateEndpointBase,
  statusLabel,
  verificationReviewPath,
  verificationsBasePath,
  verificationStatusLabel,
  type TemplateDocumentType,
  type VerificationDecisionStatus,
  type VerificationDetail,
  type VerificationDocument,
} from '@/lib/verificationReview';
import { generateAdminPartnerEditPath } from '@/lib/routePaths';

type ReviewTab = 'documents' | 'profile' | 'agreements' | 'history';

const isImageFile = (fileName?: string | null) => /\.(jpe?g|png|webp|gif|bmp)$/i.test(fileName || '');

const getErrorMessage = (err: unknown, fallback: string) =>
  axios.isAxiosError(err) ? err.response?.data?.error || fallback : fallback;

// Saved templates open in the same preview the partner used; it only needs the record id and the template summary.
const buildTemplatePreviewResponse = (document: VerificationDocument): PartnerTemplateResponse | null => {
  const template = document.verificationTemplate;
  const recordId = document.verificationRecordId;
  if (!template || !recordId) return null;

  if (document.documentType === 'PAN_CARD') {
    return {
      success: true,
      record: {
        id: recordId,
        operation: 'PAN_COMPREHENSIVE_V2',
        status: 'SUCCESS',
        maskedPan: document.documentNumber || 'SAVED',
        provider: 'saved-template',
        providerClientId: null,
        messageCode: null,
        safeMessage: null,
        createdAt: template.createdAt,
        completedAt: template.createdAt,
        rawDataExpiresAt: null,
        template,
      },
      result: null,
      template,
    } as PartnerTemplateResponse;
  }

  if (document.documentType === 'GST_CERTIFICATE') {
    return {
      success: true,
      record: {
        id: recordId,
        status: 'SUCCESS',
        maskedGstin: document.documentNumber || 'SAVED',
        gstinStatus: 'ACTIVE',
        businessName: document.nameOnDocument || null,
        legalName: document.nameOnDocument || null,
        provider: 'saved-template',
        providerClientId: null,
        messageCode: null,
        safeMessage: null,
        createdAt: template.createdAt,
        completedAt: template.createdAt,
        rawDataExpiresAt: null,
        template,
      },
      result: null,
      template,
    } as PartnerTemplateResponse;
  }

  return {
    success: true,
    record: {
      id: recordId,
      status: 'SUCCESS',
      maskedAadhaar: document.documentNumber || 'SAVED',
      providerClientId: null,
      rawDataExpiresAt: null,
      template,
    },
    result: null,
    template,
  };
};

function SecureImageThumbnail({ fileUrl, fileName, onOpen }: { fileUrl: string; fileName: string; onOpen: () => void }) {
  const [url, setUrl] = useState('');
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let active = true;
    let objectUrl = '';
    fetchSecureDocumentBlob(fileUrl, fileName)
      .then((blob) => {
        if (!active) return;
        objectUrl = URL.createObjectURL(blob);
        setUrl(objectUrl);
      })
      .catch(() => {
        if (active) setFailed(true);
      });
    return () => {
      active = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [fileUrl, fileName]);

  return (
    <button
      type="button"
      onClick={onOpen}
      className="relative flex h-28 w-24 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-slate-200 bg-slate-50 shadow-2xs hover:border-amber-300"
      aria-label={`Open ${fileName}`}
    >
      {url ? (
        <Image src={url} alt={fileName} width={96} height={112} unoptimized className="h-full w-full object-cover" />
      ) : failed ? (
        <ImageIcon className="h-6 w-6 text-slate-300" />
      ) : (
        <Loader2 className="h-5 w-5 animate-spin text-amber-500" />
      )}
    </button>
  );
}

export default function VerificationReviewPage({ partnerId }: { partnerId: string }) {
  const pathname = usePathname();
  const router = useRouter();
  const viewer = useAuthStore((state) => state.user);

  const canEditKyc =
    viewer?.role === 'SUPER_ADMIN' ||
    viewer?.role === 'ADMIN' ||
    hasAnyPermission(viewer?.permissions, ['kyc.edit.override']);
  const canManageKyc =
    viewer?.role === 'SUPER_ADMIN' ||
    viewer?.role === 'ADMIN' ||
    hasAnyPermission(viewer?.permissions, ['kyc.manage']);

  const listPath = verificationsBasePath(pathname);
  const [detail, setDetail] = useState<VerificationDetail | null>(null);
  // The URL carries a readable slug; once loaded, every call uses the partner's real id.
  const resolvedPartnerId = detail?.id ?? partnerId;
  const editPath = generateAdminPartnerEditPath(partnerEditBasePathFor(pathname), {
    id: resolvedPartnerId,
    businessName: detail?.profile?.businessName,
    district: detail?.profile?.district,
  });
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [tab, setTab] = useState<ReviewTab>('documents');
  const [decision, setDecision] = useState<VerificationDecisionStatus | null>(null);

  const [actionError, setActionError] = useState('');
  const [busyKey, setBusyKey] = useState('');
  const [previewAsset, setPreviewAsset] = useState<{ url: string; name: string; mimeType: string } | null>(null);
  const [templatePreview, setTemplatePreview] = useState<{
    documentType: TemplateDocumentType;
    documentNumber: string;
    response: PartnerTemplateResponse;
  } | null>(null);

  useEffect(() => {
    let active = true;
    api
      .get<{ verification: VerificationDetail }>(`/superadmin/verifications/${partnerId}`)
      .then((response) => {
        if (active) setDetail(response.data.verification);
      })
      .catch((err) => {
        if (active) setLoadError(getErrorMessage(err, 'Unable to load verification detail.'));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [partnerId]);

  useEffect(() => {
    if (!detail) return;
    const canonicalPath = verificationReviewPath(pathname, { id: detail.id, name: detail.profile?.businessName || detail.ownerName || detail.email });
    if (pathname !== canonicalPath) router.replace(canonicalPath);
  }, [detail, pathname, router]);

  useEffect(() => () => {
    if (previewAsset?.url) URL.revokeObjectURL(previewAsset.url);
  }, [previewAsset]);

  const runAction = useCallback(async (key: string, fallback: string, action: () => Promise<void>) => {
    setBusyKey(key);
    setActionError('');
    try {
      await action();
    } catch (err) {
      setActionError(getErrorMessage(err, fallback));
    } finally {
      setBusyKey('');
    }
  }, []);

  const openFilePreview = (document: VerificationDocument) => {
    if (!document.fileUrl) return;
    const fileUrl = document.fileUrl;
    const name = document.fileName || documentDisplayTitles[document.documentType] || 'Document';
    void runAction(`preview:${document.id}`, 'Unable to retrieve secure file.', async () => {
      const blob = await fetchSecureDocumentBlob(fileUrl, name);
      setPreviewAsset({ url: URL.createObjectURL(blob), name, mimeType: blob.type || 'application/octet-stream' });
    });
  };

  const downloadFile = (document: VerificationDocument) => {
    if (!document.fileUrl) return;
    const fileUrl = document.fileUrl;
    void runAction(`download:${document.id}`, 'Unable to download file.', () =>
      downloadSecureDocument(fileUrl, document.fileName || `${document.documentType.toLowerCase()}-document`),
    );
  };

  const openTemplate = (document: VerificationDocument) => {
    const response = buildTemplatePreviewResponse(document);
    if (!response || !isTemplateDocumentType(document.documentType)) {
      setActionError('Saved template is not available for this document.');
      return;
    }
    setTemplatePreview({ documentType: document.documentType, documentNumber: document.documentNumber || '', response });
  };

  const downloadTemplate = (document: VerificationDocument) => {
    const template = document.verificationTemplate;
    if (!template || !document.verificationRecordId) return;
    const endpoint = `${partnerTemplateEndpointBase(resolvedPartnerId, document.documentType)}/${document.verificationRecordId}/template`;
    void runAction(`template:${document.id}`, 'Unable to download template.', async () => {
      const response = await api.get<Blob>(endpoint, { responseType: 'blob' });
      const url = URL.createObjectURL(response.data);
      const link = window.document.createElement('a');
      link.href = url;
      link.download = template.fileName || `${document.documentType.toLowerCase()}-template.pdf`;
      window.document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    });
  };

  const handleDecided = (targetStatus: VerificationDecisionStatus) => {
    setDecision(null);
    toast.success(`Partner verification moved to ${formatStatus(targetStatus).toLowerCase()} successfully.`);
    router.push(listPath);
  };

  if (loading) {
    return (
      <div className="py-24 text-center space-y-2">
        <Loader2 className="mx-auto h-8 w-8 animate-spin text-amber-500" />
        <p className="text-xs font-bold text-slate-700">Loading full partner verification package...</p>
      </div>
    );
  }

  if (loadError || !detail) {
    return (
      <div className="mx-auto max-w-lg space-y-3 rounded-2xl border border-rose-200 bg-rose-50 p-6 text-center">
        <AlertTriangle className="mx-auto h-8 w-8 text-rose-500" />
        <p className="text-sm font-bold text-rose-800">{loadError || 'Partner verification record not found.'}</p>
        <Link href={listPath} className="inline-flex items-center gap-1.5 text-xs font-bold text-slate-700 hover:text-slate-950">
          <ArrowLeft className="h-3.5 w-3.5" /> Back to verification queue
        </Link>
      </div>
    );
  }

  const partnerName = detail.profile.businessName || detail.profile.ownerName || detail.ownerName || detail.email || 'Partner';
  const kycStatus = detail.profile.kycStatus;
  const latestChangesRequest = detail.reviewHistory.find(
    (item) => item.action === 'SUPER_ADMIN_CHANGES_REQUESTED' && Boolean(item.comment?.trim()),
  );

  return (
    <div className="space-y-4 pb-4">
      {/* Header */}
      <div className="rounded-2xl border border-slate-200/90 bg-white p-4 sm:p-5 shadow-2xs">
        <Link
          href={listPath}
          className="inline-flex items-center gap-1.5 text-xs font-bold text-slate-500 hover:text-slate-900"
        >
          <ArrowLeft className="h-3.5 w-3.5" /> Back to verification queue
        </Link>

        <div className="mt-3 flex items-center gap-2">
          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Partner KYC Dossier Audit</span>
          <span
            className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-bold ${
              kycStatus === 'APPROVED'
                ? 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200'
                : kycStatus === 'CHANGES_REQUESTED' || kycStatus === 'REJECTED'
                ? 'bg-rose-50 text-rose-700 ring-1 ring-rose-200'
                : 'bg-amber-50 text-amber-800 ring-1 ring-amber-200'
            }`}
          >
            {statusLabel[kycStatus] || formatStatus(kycStatus)}
          </span>
        </div>
        <h1 className="mt-0.5 text-lg font-black text-slate-900 leading-tight break-words">{partnerName}</h1>
        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-600">
          <span>Owner: <strong className="font-bold text-slate-900">{detail.profile.ownerName || detail.ownerName || '-'}</strong></span>
          {detail.email && <span>Email: <strong className="font-bold text-slate-900">{detail.email}</strong></span>}
          {detail.mobile && (
            <span>Phone: <strong className="font-mono font-bold text-slate-900">{detail.mobile}</strong></span>
          )}
          <span>Type: <strong className="font-bold text-amber-800">{formatPartnerTypeLabel(detail.profile.partnerType)}</strong></span>
          {detail.partnerCode && (
            <span>Partner ID: <strong className="font-mono font-bold text-slate-900">{detail.partnerCode}</strong></span>
          )}
        </div>

        <div className="mt-3.5 flex items-center gap-1.5 border-t border-slate-100 pt-2.5 overflow-x-auto [&::-webkit-scrollbar]:hidden">
          {[
            { id: 'documents', label: 'KYC Documents Vault', count: detail.documents.length },
            { id: 'profile', label: 'Operating Profile' },
            { id: 'agreements', label: 'Signed Agreements', count: detail.agreements.length },
            { id: 'history', label: 'Audit Trail', count: detail.reviewHistory.length },
          ].map((item) => {
            const active = tab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setTab(item.id as ReviewTab)}
                className={`inline-flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold transition-all ${
                  active ? 'bg-slate-900 text-white shadow-2xs' : 'border border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                }`}
              >
                <span>{item.label}</span>
                {item.count !== undefined && (
                  <span className={`rounded-full px-1.5 text-[10px] font-mono font-bold ${active ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-600'}`}>
                    {item.count}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {actionError && (
        <div className="flex items-center justify-between gap-2 rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-800">
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 shrink-0 text-rose-600" />
            <span className="font-semibold">{actionError}</span>
          </div>
          <button type="button" onClick={() => setActionError('')} className="text-rose-500 hover:text-rose-700" aria-label="Dismiss">
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      {latestChangesRequest && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-3.5 shadow-2xs">
          <div className="flex items-start gap-2.5">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-700" />
            <div className="min-w-0 text-xs">
              <p className="font-bold text-amber-950">Latest correction remark</p>
              <p className="mt-1 whitespace-pre-wrap leading-relaxed text-amber-900">{latestChangesRequest.comment}</p>
              <p className="mt-1 text-[10px] text-amber-700">Recorded on {formatDateTime(latestChangesRequest.createdAt)}</p>
            </div>
          </div>
        </div>
      )}

      {/* KYC Documents Vault */}
      {tab === 'documents' && (
        <div className="grid gap-3 lg:grid-cols-2">
          {detail.documents.length === 0 && (
            <p className="rounded-xl border border-slate-200 bg-white py-10 text-center text-xs text-slate-500 lg:col-span-2">
              No KYC documents submitted yet.
            </p>
          )}
          {detail.documents.map((doc) => {
            const docTitle = documentDisplayTitles[doc.documentType] || formatStatus(doc.documentType);
            const templateBacked = isTemplateDocumentType(doc.documentType);
            const template = doc.verificationTemplate;
            const verificationStatus = doc.verificationStatus || 'NOT_STARTED';
            const showThumbnail = Boolean(doc.fileUrl) && (doc.documentType === 'PASSPORT_PHOTO' || isImageFile(doc.fileName));

            return (
              <div key={doc.id} className="flex flex-col justify-between gap-3 rounded-xl border border-slate-200/90 bg-white p-4 shadow-2xs">
                <div>
                  <div className="flex items-start justify-between gap-2 border-b border-slate-100 pb-2">
                    <div className="min-w-0">
                      <h4 className="text-sm font-bold text-slate-900 leading-snug">{docTitle}</h4>
                      <p className="mt-0.5 text-[11px] font-mono text-slate-500">{doc.documentNumber || 'No number entered'}</p>
                    </div>
                    <div className="flex flex-col items-end gap-1">
                      {templateBacked && (
                        <span
                          className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                            verificationStatus === 'VERIFIED'
                              ? 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200'
                              : verificationStatus === 'FAILED'
                              ? 'bg-rose-50 text-rose-700 ring-1 ring-rose-200'
                              : 'bg-amber-50 text-amber-800 ring-1 ring-amber-200'
                          }`}
                        >
                          {verificationStatusLabel[verificationStatus] || formatStatus(verificationStatus)}
                        </span>
                      )}
                      {templateBacked ? (
                        <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${template ? 'bg-indigo-50 text-indigo-700' : 'bg-slate-100 text-slate-500'}`}>
                          {template ? 'Template saved' : 'Template not saved'}
                        </span>
                      ) : (
                        <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${doc.fileUrl ? 'bg-blue-50 text-blue-700' : 'bg-slate-100 text-slate-500'}`}>
                          {doc.fileUrl ? 'Uploaded' : 'Not uploaded'}
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="mt-2.5 flex gap-3">
                    {showThumbnail && doc.fileUrl && (
                      <SecureImageThumbnail
                        fileUrl={doc.fileUrl}
                        fileName={doc.fileName || docTitle}
                        onOpen={() => openFilePreview(doc)}
                      />
                    )}
                    <dl className="min-w-0 flex-1 space-y-1 text-xs">
                      {doc.nameOnDocument && (
                        <div className="flex justify-between gap-3">
                          <dt className="text-[11px] text-slate-400">Name on ID</dt>
                          <dd className="text-right font-semibold text-slate-900">{doc.nameOnDocument}</dd>
                        </div>
                      )}
                      {doc.issueDate && (
                        <div className="flex justify-between gap-3">
                          <dt className="text-[11px] text-slate-400">Issue date</dt>
                          <dd className="font-mono text-slate-700">{formatDate(doc.issueDate)}</dd>
                        </div>
                      )}
                      {doc.expiryDate && (
                        <div className="flex justify-between gap-3">
                          <dt className="text-[11px] text-slate-400">Expiry date</dt>
                          <dd className="font-mono text-slate-700">{formatDate(doc.expiryDate)}</dd>
                        </div>
                      )}
                      {templateBacked && doc.verificationCompletedAt && (
                        <div className="flex justify-between gap-3">
                          <dt className="text-[11px] text-slate-400">Verified on</dt>
                          <dd className="font-mono text-slate-700">{formatDateTime(doc.verificationCompletedAt)}</dd>
                        </div>
                      )}
                      {doc.submittedNote && (
                        <div>
                          <dt className="text-[11px] text-slate-400">Partner note</dt>
                          <dd className="mt-0.5 rounded bg-slate-50 p-2 text-[11px] text-slate-700">{doc.submittedNote}</dd>
                        </div>
                      )}
                      {doc.reviewComment && (
                        <div>
                          <dt className="text-[11px] text-slate-400">Review comment</dt>
                          <dd className="mt-0.5 rounded bg-amber-50 p-2 text-[11px] text-amber-900">{doc.reviewComment}</dd>
                        </div>
                      )}
                    </dl>
                  </div>

                  {doc.verificationMessage && (
                    <p className="mt-2 rounded bg-rose-50 p-2 text-[11px] font-medium text-rose-600">{doc.verificationMessage}</p>
                  )}
                </div>

                <div className="space-y-2 border-t border-slate-100 pt-2.5">
                  {templateBacked && (
                    template ? (
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex min-w-0 items-center gap-2">
                          <FileCheck2 className="h-4 w-4 shrink-0 text-indigo-600" />
                          <div className="min-w-0">
                            <p className="truncate text-[11px] font-semibold text-slate-800">{template.fileName}</p>
                            <p className="text-[10px] text-slate-500">
                              {[formatFileSize(template.fileSize), `Saved ${formatDateTime(template.createdAt)}`].filter(Boolean).join(' · ')}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => openTemplate(doc)}
                            className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-bold text-slate-800 hover:bg-slate-50 shadow-2xs"
                          >
                            <Eye className="h-3 w-3 text-amber-500" />
                            <span>View template</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => downloadTemplate(doc)}
                            disabled={busyKey === `template:${doc.id}`}
                            className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-bold text-slate-800 hover:bg-slate-50 shadow-2xs disabled:opacity-50"
                          >
                            {busyKey === `template:${doc.id}` ? <Loader2 className="h-3 w-3 animate-spin" /> : <Download className="h-3 w-3" />}
                            <span>Download</span>
                          </button>
                        </div>
                      </div>
                    ) : (
                      <p className="flex items-start gap-1.5 rounded-lg bg-amber-50 p-2 text-[11px] text-amber-900">
                        <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-600" />
                        <span>
                          Verification template is not saved for this document.
                          {canEditKyc ? ' Use Edit KYC to re-verify and upload the template.' : ''}
                        </span>
                      </p>
                    )
                  )}

                  {doc.fileUrl ? (
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex min-w-0 items-center gap-2">
                        {showThumbnail ? (
                          <ImageIcon className="h-4 w-4 shrink-0 text-blue-600" />
                        ) : (
                          <FileText className="h-4 w-4 shrink-0 text-blue-600" />
                        )}
                        <p className="truncate text-[11px] font-semibold text-slate-800">{doc.fileName || 'Uploaded file'}</p>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => openFilePreview(doc)}
                          disabled={busyKey === `preview:${doc.id}`}
                          className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-bold text-slate-800 hover:bg-slate-50 shadow-2xs disabled:opacity-50"
                        >
                          {busyKey === `preview:${doc.id}` ? <Loader2 className="h-3 w-3 animate-spin" /> : <Eye className="h-3 w-3 text-amber-500" />}
                          <span>Preview</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => downloadFile(doc)}
                          disabled={busyKey === `download:${doc.id}`}
                          className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-bold text-slate-800 hover:bg-slate-50 shadow-2xs disabled:opacity-50"
                        >
                          {busyKey === `download:${doc.id}` ? <Loader2 className="h-3 w-3 animate-spin" /> : <Download className="h-3 w-3" />}
                          <span>Download</span>
                        </button>
                      </div>
                    </div>
                  ) : !templateBacked ? (
                    <p className="text-[11px] text-slate-400">No file uploaded.</p>
                  ) : null}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Operating Profile */}
      {tab === 'profile' && (
        <div className="space-y-3.5">
          <div className="rounded-xl border border-slate-200/90 bg-white p-4 shadow-2xs">
            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-800 border-b border-slate-100 pb-2 mb-3">
              Entity Profile & Sourcing Details
            </h4>
            <div className="grid gap-3 sm:grid-cols-2 text-xs">
              <div>
                <span className="text-slate-400 text-[11px]">Authorized Place:</span>
                <p className="font-bold text-slate-900">{detail.profile.businessName || '-'}</p>
              </div>
              <div>
                <span className="text-slate-400 text-[11px]">Industry Experience:</span>
                <p className="font-bold text-slate-900">{detail.profile.businessExperience || '-'}</p>
              </div>
              <div>
                <span className="text-slate-400 text-[11px]">Years in Business:</span>
                <p className="font-bold text-slate-900">{detail.profile.yearsInBusiness || '-'}</p>
              </div>
              <div>
                <span className="text-slate-400 text-[11px]">Team Size:</span>
                <p className="font-bold text-slate-900">{detail.profile.teamSize || '-'}</p>
              </div>
              <div>
                <span className="text-slate-400 text-[11px]">Expected Monthly Listings:</span>
                <p className="font-bold text-slate-900">{detail.profile.expectedMonthlyListings || '-'}</p>
              </div>
              <div>
                <span className="text-slate-400 text-[11px]">Preferred Contact:</span>
                <p className="font-bold text-slate-900">{formatStatus(detail.profile.contactPreference)}</p>
              </div>
            </div>
          </div>

          <div className="rounded-xl border border-slate-200/90 bg-white p-4 shadow-2xs">
            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-800 border-b border-slate-100 pb-2 mb-3">
              Location & Digital Presence
            </h4>
            <div className="space-y-2.5 text-xs">
              <div>
                <span className="text-slate-400 text-[11px]">Physical Street Address:</span>
                <p className="font-medium text-slate-800 mt-0.5 bg-slate-50 p-2 rounded border border-slate-100">
                  {detail.profile.businessAddress || '-'}
                </p>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <span className="text-slate-400 text-[11px]">State / City:</span>
                  <p className="font-bold text-slate-900">{detail.state || '-'} / {detail.city || '-'}</p>
                </div>
                <div>
                  <span className="text-slate-400 text-[11px]">District / PIN:</span>
                  <p className="font-bold text-slate-900">{detail.profile.district || '-'} / {detail.profile.pinCode || '-'}</p>
                </div>
              </div>
              {detail.profile.googleMapsLocation && (
                <div>
                  <span className="text-slate-400 text-[11px]">Google Maps Link:</span>
                  <div className="mt-0.5 flex items-center gap-2">
                    <span className="font-mono text-slate-800 text-[11px] truncate flex-1">{detail.profile.googleMapsLocation}</span>
                    <a
                      href={detail.profile.googleMapsLocation}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1 rounded border border-slate-200 bg-slate-50 px-2 py-1 text-xs font-bold text-slate-700 hover:bg-slate-100"
                    >
                      <ExternalLink className="h-3 w-3" />
                      <span>Open Map</span>
                    </a>
                  </div>
                </div>
              )}
              {detail.profile.websiteUrl && (
                <div>
                  <span className="text-slate-400 text-[11px]">Official Website:</span>
                  <a
                    href={detail.profile.websiteUrl.startsWith('http') ? detail.profile.websiteUrl : `https://${detail.profile.websiteUrl}`}
                    target="_blank"
                    rel="noreferrer"
                    className="font-semibold text-amber-700 hover:underline block mt-0.5"
                  >
                    {detail.profile.websiteUrl}
                  </a>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Signed Agreements */}
      {tab === 'agreements' && (
        <div className="grid gap-2.5 sm:grid-cols-2">
          {detail.agreements.length === 0 && (
            <p className="rounded-xl border border-slate-200 bg-white py-10 text-center text-xs text-slate-500 sm:col-span-2">
              No agreements accepted yet.
            </p>
          )}
          {detail.agreements.map((agreement) => (
            <div key={agreement.agreementType} className="rounded-xl border border-slate-200/90 bg-white p-3 shadow-2xs">
              <div className="flex items-center justify-between border-b border-slate-100 pb-1.5 mb-1.5">
                <span className="rounded-md bg-amber-100 px-1.5 py-0.5 text-[10px] font-bold font-mono text-amber-800">
                  {agreement.version || 'v1.0'}
                </span>
                <span className="text-[10px] font-bold text-emerald-700 flex items-center gap-1">
                  <Check className="h-3 w-3 stroke-[3]" /> Accepted
                </span>
              </div>
              <h4 className="text-xs font-bold text-slate-900 leading-snug">{formatStatus(agreement.agreementType)}</h4>
              <p className="mt-1 text-[10px] text-slate-500 font-mono">Signed on {formatDate(agreement.acceptedAt)}</p>
            </div>
          ))}
        </div>
      )}

      {/* Audit Trail */}
      {tab === 'history' && (
        <div className="space-y-2.5">
          {detail.reviewHistory.length === 0 ? (
            <p className="rounded-xl border border-slate-200 bg-white py-10 text-center text-xs text-slate-500">No review events logged yet.</p>
          ) : (
            detail.reviewHistory.map((item) => (
              <div key={item.id} className="rounded-xl border border-slate-200/90 bg-white p-3 shadow-2xs text-xs space-y-1">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-bold text-slate-900 leading-tight">
                    {getReviewActionLabel(item.action, detail.profile.partnerType, detail.profile.businessName || detail.profile.ownerName)}
                  </span>
                  <span className="font-mono text-[10px] text-slate-500">{formatDateTime(item.createdAt)}</span>
                </div>
                {item.comment && (
                  <p className="text-[11px] font-mono text-slate-600 bg-slate-50 p-2 rounded border border-slate-100 mt-1">{item.comment}</p>
                )}
              </div>
            ))
          )}
        </div>
      )}

      {/* Sticky review actions */}
      <div className="sticky bottom-0 z-20 -mx-1 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-200/90 bg-white/95 px-4 py-3 shadow-lg backdrop-blur">
        <Link
          href={listPath}
          className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-50"
        >
          Back
        </Link>

        <div className="flex flex-wrap items-center justify-end gap-2">
          {canEditKyc && (
            <button
              type="button"
              onClick={() => router.push(editPath)}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-bold text-slate-800 hover:bg-slate-50 shadow-2xs"
            >
              <Pencil className="h-3.5 w-3.5" />
              <span>Edit KYC</span>
            </button>
          )}
          {canManageKyc && (
            <>
              <button
                type="button"
                onClick={() => setDecision('CHANGES_REQUESTED')}
                className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-1.5 text-xs font-bold text-amber-800 hover:bg-amber-100"
              >
                Request Changes
              </button>
              <button
                type="button"
                onClick={() => setDecision('REJECTED')}
                className="rounded-lg border border-rose-300 bg-rose-50 px-3 py-1.5 text-xs font-bold text-rose-700 hover:bg-rose-100"
              >
                Reject
              </button>
              <button
                type="button"
                onClick={() => setDecision('APPROVED')}
                className="inline-flex items-center gap-1.5 rounded-lg bg-[#FFC107] px-4 py-1.5 text-xs font-black text-slate-950 hover:bg-[#E5AD06] shadow-2xs"
              >
                <CheckCircle2 className="h-3.5 w-3.5" />
                <span>Approve & Activate</span>
              </button>
            </>
          )}
        </div>
      </div>

      {decision && (
        <VerificationDecisionModal
          partnerId={detail.id}
          partnerName={partnerName}
          targetStatus={decision}
          onClose={() => setDecision(null)}
          onDecided={handleDecided}
        />
      )}

      {templatePreview && (
        <PartnerKycTemplateModal
          documentType={templatePreview.documentType}
          documentNumber={templatePreview.documentNumber}
          response={templatePreview.response}
          isPartnerMode={false}
          templateEndpointBaseOverride={partnerTemplateEndpointBase(resolvedPartnerId, templatePreview.documentType)}
          onClose={() => setTemplatePreview(null)}
          onSaved={() => undefined}
        />
      )}

      {previewAsset && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 p-4 backdrop-blur-xs">
          <div className="w-full max-w-4xl overflow-hidden rounded-2xl bg-white shadow-2xl animate-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between border-b border-slate-200 px-5 py-3.5">
              <div className="min-w-0">
                <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Secure Document Viewer</p>
                <h4 className="mt-0.5 text-sm font-bold text-slate-900 truncate max-w-md">{previewAsset.name}</h4>
              </div>
              <div className="flex items-center gap-2">
                <a
                  href={previewAsset.url}
                  download={previewAsset.name}
                  className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-bold text-slate-700 hover:bg-slate-100"
                >
                  <Download className="h-3 w-3" />
                  <span>Download</span>
                </a>
                <button
                  type="button"
                  onClick={() => setPreviewAsset(null)}
                  className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                  aria-label="Close preview"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>
            <div className="bg-slate-900 p-4 flex items-center justify-center min-h-[400px] max-h-[75vh] overflow-auto">
              {previewAsset.mimeType.startsWith('image/') ? (
                <Image
                  src={previewAsset.url}
                  alt={previewAsset.name}
                  width={1600}
                  height={1200}
                  unoptimized
                  className="max-h-[70vh] w-auto max-w-full rounded-lg object-contain shadow-2xl"
                />
              ) : previewAsset.mimeType === 'application/pdf' ? (
                <iframe src={previewAsset.url} title={previewAsset.name} className="h-[70vh] w-full rounded-lg bg-white" />
              ) : (
                <div className="p-8 text-center text-white space-y-3">
                  <FileText className="mx-auto h-12 w-12 text-slate-400" />
                  <p className="text-xs font-bold">Preview format not supported inline.</p>
                  <a
                    href={previewAsset.url}
                    download={previewAsset.name}
                    className="inline-flex rounded-lg bg-[#FFC107] px-4 py-2 text-xs font-bold text-slate-950 hover:bg-[#E5AD06]"
                  >
                    Download File
                  </a>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
