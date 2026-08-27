'use client';

import { useEffect, useMemo, useState } from 'react';
import Image from 'next/image';
import { Search, X, MoreVertical, Eye, AlertCircle, CheckCircle2, XCircle } from 'lucide-react';
import axios from 'axios';
import api from '@/lib/api';
import { formatPartnerTypeLabel } from '@/lib/partnerType';
import { useTranslation } from '@/hooks/useTranslation';

interface VerificationItem {
  id: string;
  name: string;
  email: string | null;
  partnerType: string;
  appliedOn: string;
  status: string;
}

interface VerificationDetail {
  id: string;
  ownerName: string | null;
  email: string | null;
  mobile: string | null;
  whatsappNumber: string | null;
  city: string | null;
  state: string | null;
  profile: {
    ownerName: string | null;
    businessName: string | null;
    partnerType: string | null;
    businessAddress: string | null;
    district: string | null;
    pinCode: string | null;
    businessExperience: string | null;
    expectedMonthlyListings: number | null;
    businessDescription: string | null;
    serviceAreas: string | null;
    workingHours: string | null;
    gstNumber: string | null;
    businessRegistrationNumber: string | null;
    websiteUrl: string | null;
    socialLinks: string | null;
    yearsInBusiness: number | null;
    teamSize: number | null;
    contactPreference: string | null;
    googleMapsLocation: string | null;
    onboardingStatus: string;
    kycStatus: string;
    accountStatus: string;
    approvedAt: string | null;
  };
  documents: Array<{
    id: string;
    documentType: string;
    fileUrl: string;
    fileName: string | null;
    documentNumber: string | null;
    nameOnDocument: string | null;
    issueDate: string | null;
    expiryDate: string | null;
    submittedNote: string | null;
    status: string;
    reviewComment: string | null;
  }>;
  agreements: Array<{
    agreementType: string;
    version: string;
    acceptedAt: string;
  }>;
  reviewHistory: Array<{
    id: string;
    action: string;
    comment: string | null;
    createdAt: string;
  }>;
}

const formatDate = (value?: string | null) =>
  value
    ? new Intl.DateTimeFormat('en-IN', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
      }).format(new Date(value))
    : '-';

const formatStatus = (value?: string | null) => (value ? value.replaceAll('_', ' ') : '-');

const getReviewActionLabel = (action: string, partnerType?: string | null, partnerName?: string | null) => {
  const resolvedPartnerType = formatPartnerTypeLabel(partnerType);
  const resolvedPartnerName = partnerName?.trim() || 'Unknown';
  const labels: Record<string, string> = {
    PARTNER_SAVED_ONBOARDING_DRAFT: `${resolvedPartnerType} ${resolvedPartnerName} saved onboarding draft`,
    PARTNER_SUBMITTED_FULL_ONBOARDING: `${resolvedPartnerType} ${resolvedPartnerName} submitted full onboarding`,
  };

  return labels[action] || formatStatus(action);
};

const getSecureDocumentPath = (fileUrl: string) => {
  if (!fileUrl) {
    return '';
  }

  if (/^https?:\/\//i.test(fileUrl)) {
    return new URL(fileUrl).pathname.replace(/^\/api/, '');
  }

  return fileUrl.replace(/^\/api/, '');
};

const statusLabel: Record<string, string> = {
  SUBMITTED: 'Submitted',
  UNDER_REVIEW: 'Under Review',
  CHANGES_REQUESTED: 'Changes Requested',
  REJECTED: 'Rejected',
  APPROVED: 'Approved',
};

export default function SuperAdminVerificationsPage() {
  const { t } = useTranslation();
  const [verifications, setVerifications] = useState<VerificationItem[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedDetail, setSelectedDetail] = useState<VerificationDetail | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState('');
  const [openActionMenuId, setOpenActionMenuId] = useState<string | null>(null);
  const [previewAsset, setPreviewAsset] = useState<{
    url: string;
    name: string;
    mimeType: string;
  } | null>(null);

  useEffect(() => {
    const loadVerifications = async () => {
      try {
        const response = await api.get<{ verifications: VerificationItem[] }>('/superadmin/verifications');
        setVerifications(response.data.verifications);
      } catch (err) {
        if (axios.isAxiosError(err)) {
          setError(err.response?.data?.error || t('verifications.loadQueueFailed'));
        } else {
          setError(t('verifications.loadQueueFailed'));
        }
      } finally {
        setLoading(false);
      }
    };

    void loadVerifications();
  }, [t]);

  const filteredVerifications = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) {
      return verifications;
    }

    return verifications.filter((partner) => {
      return (
        partner.name.toLowerCase().includes(query) ||
        partner.partnerType.toLowerCase().includes(query) ||
        (partner.email || '').toLowerCase().includes(query)
      );
    });
  }, [search, verifications]);

  const openDetail = async (id: string) => {
    try {
      setDetailLoading(true);
      setSelectedId(id);
      const response = await api.get<{ verification: VerificationDetail }>(`/superadmin/verifications/${id}`);
      setSelectedDetail(response.data.verification);
    } catch (err) {
      if (axios.isAxiosError(err)) {
        setError(err.response?.data?.error || t('verifications.loadDetailFailed'));
      } else {
        setError(t('verifications.loadDetailFailed'));
      }
    } finally {
      setDetailLoading(false);
    }
  };

  const closeDetail = () => {
    setSelectedId(null);
    setSelectedDetail(null);
  };

  const closePreview = () => {
    if (previewAsset?.url) {
      window.URL.revokeObjectURL(previewAsset.url);
    }

    setPreviewAsset(null);
    setPreviewError('');
  };

  const openSecurePreview = async (fileUrl: string, fileName?: string | null) => {
    try {
      setPreviewLoading(true);
      setPreviewError('');
      if (previewAsset?.url) {
        window.URL.revokeObjectURL(previewAsset.url);
        setPreviewAsset(null);
      }

      const path = getSecureDocumentPath(fileUrl);
      const response = await api.get(path, { responseType: 'blob' });
      const blobUrl = window.URL.createObjectURL(response.data);
      setPreviewAsset({
        url: blobUrl,
        name: fileName || t('verifications.securePreviewName'),
        mimeType: response.headers['content-type'] || response.data.type || 'application/octet-stream',
      });
    } catch (err) {
      if (axios.isAxiosError(err)) {
        setPreviewError(err.response?.data?.error || t('verifications.openDocumentFailed'));
      } else {
        setPreviewError(t('verifications.openDocumentFailed'));
      }
    } finally {
      setPreviewLoading(false);
    }
  };

  const handleStatusUpdate = async (id: string, status: 'APPROVED' | 'REJECTED' | 'CHANGES_REQUESTED') => {
    try {
      setUpdatingId(id);
      await api.patch(`/superadmin/verifications/${id}/status`, { status });
      setVerifications((current) => current.filter((partner) => partner.id !== id));
      if (selectedId === id) {
        closeDetail();
      }
    } catch (err) {
      if (axios.isAxiosError(err)) {
        setError(err.response?.data?.error || t('verifications.updateStatusFailed'));
      } else {
        setError(t('verifications.updateStatusFailed'));
      }
    } finally {
      setUpdatingId(null);
    }
  };

  useEffect(() => {
    return () => {
      if (previewAsset?.url) {
        window.URL.revokeObjectURL(previewAsset.url);
      }
    };
  }, [previewAsset]);

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center justify-end">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="relative flex items-center">
            <Search className="absolute left-4 h-4 w-4 text-gray-400" />
            <input
              type="text"
              placeholder={t('verifications.searchPlaceholder')}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full rounded-full border border-gray-200 bg-white py-2.5 pl-11 pr-4 text-sm text-gray-900 placeholder:text-gray-400 outline-none transition focus:border-[#FFC107] focus:ring-2 focus:ring-[#FFC107]/20 sm:w-64"
            />
          </div>
        </div>
      </div>

      <div className="overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm">
        {error ? (
          <div className="p-10 text-center text-sm font-medium text-red-700">{error}</div>
        ) : loading ? (
          <div className="p-10 text-center text-sm font-medium text-gray-500">{t('verifications.loadingQueue')}</div>
        ) : filteredVerifications.length === 0 ? (
          <div className="p-10 text-center text-sm font-medium text-gray-500">{t('verifications.emptyQueue')}</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-gray-50 text-xs font-medium uppercase text-gray-500">
                <tr>
                  <th className="px-4 py-3 sm:px-6 sm:py-4">{t('verifications.businessName')}</th>
                  <th className="px-4 py-3 sm:px-6 sm:py-4">{t('verifications.type')}</th>
                  <th className="px-4 py-3 sm:px-6 sm:py-4">{t('verifications.appliedOn')}</th>
                  <th className="px-4 py-3 sm:px-6 sm:py-4">{t('verifications.status')}</th>
                  <th className="px-4 py-3 sm:px-6 sm:py-4 text-right">{t('verifications.actions')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filteredVerifications.map((partner) => (
                  <tr key={partner.id} className="transition-colors hover:bg-gray-50/50">
                    <td className="px-6 py-4">
                      <button
                        type="button"
                        onClick={() => void openDetail(partner.id)}
                        className="text-left font-medium text-gray-900 transition hover:text-[#FFC107]"
                      >
                        {partner.name}
                      </button>
                    </td>
                    <td className="px-4 py-3 sm:px-6 sm:py-4 text-gray-600">
                      <span className="inline-flex rounded-full bg-blue-50 px-2.5 py-1 text-xs font-semibold text-blue-700">
                        {formatPartnerTypeLabel(partner.partnerType)}
                      </span>
                    </td>
                    <td className="px-4 py-3 sm:px-6 sm:py-4 text-gray-600">{formatDate(partner.appliedOn)}</td>
                    <td className="px-4 py-3 sm:px-6 sm:py-4">
                      <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${
                        partner.status === 'APPROVED' ? 'bg-green-50 text-green-700' :
                        partner.status === 'REJECTED' ? 'bg-red-50 text-red-700' :
                        partner.status === 'CHANGES_REQUESTED' ? 'bg-amber-50 text-amber-700' :
                        'bg-orange-50 text-orange-700'
                      }`}>
                        {statusLabel[partner.status] || partner.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 sm:px-6 sm:py-4">
                      <div className="relative flex justify-end">
                        <button
                          type="button"
                          onClick={() => setOpenActionMenuId(openActionMenuId === partner.id ? null : partner.id)}
                          className="rounded-full p-2 text-gray-400 transition hover:bg-gray-100 hover:text-gray-600"
                          title="Actions"
                        >
                          <MoreVertical className="h-5 w-5" />
                        </button>

                        {openActionMenuId === partner.id && (
                          <>
                            <div 
                              className="fixed inset-0 z-[100]" 
                              onClick={(e) => {
                                e.stopPropagation();
                                setOpenActionMenuId(null);
                              }}
                            />
                            <div className="absolute right-4 top-10 z-[110] min-w-max overflow-hidden rounded-xl border border-gray-100 bg-white py-1 shadow-lg">
                              <button
                                type="button"
                                onClick={() => { setOpenActionMenuId(null); void openDetail(partner.id); }}
                                className="flex w-full items-center gap-2.5 px-4 py-2 text-sm font-medium text-gray-700 transition hover:bg-gray-50 hover:text-blue-600"
                              >
                                <Eye className="h-4 w-4" />
                                {t('verifications.review')}
                              </button>
                              <button
                                type="button"
                                onClick={() => { setOpenActionMenuId(null); void handleStatusUpdate(partner.id, 'CHANGES_REQUESTED'); }}
                                disabled={updatingId === partner.id}
                                className="flex w-full items-center gap-2.5 px-4 py-2 text-sm font-medium text-gray-700 transition hover:bg-amber-50 hover:text-amber-600 disabled:opacity-50"
                              >
                                <AlertCircle className="h-4 w-4" />
                                {t('verifications.requestChanges')}
                              </button>
                              <button
                                type="button"
                                onClick={() => { setOpenActionMenuId(null); void handleStatusUpdate(partner.id, 'APPROVED'); }}
                                disabled={updatingId === partner.id}
                                className="flex w-full items-center gap-2.5 px-4 py-2 text-sm font-medium text-gray-700 transition hover:bg-green-50 hover:text-green-600 disabled:cursor-not-allowed disabled:opacity-50"
                              >
                                <CheckCircle2 className="h-4 w-4" />
                                {t('verifications.approve')}
                              </button>
                              <button
                                type="button"
                                onClick={() => { setOpenActionMenuId(null); void handleStatusUpdate(partner.id, 'REJECTED'); }}
                                disabled={updatingId === partner.id}
                                className="flex w-full items-center gap-2.5 px-4 py-2 text-sm font-medium text-gray-700 transition hover:bg-red-50 hover:text-red-600 disabled:opacity-50"
                              >
                                <XCircle className="h-4 w-4" />
                                {t('verifications.reject')}
                              </button>
                            </div>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {selectedId ? (
        <div className="fixed inset-0 z-40 flex justify-end bg-black/40">
          <button type="button" className="absolute inset-0" onClick={closeDetail} aria-label="Close detail panel" />
          <div className="relative z-50 h-full w-full max-w-3xl overflow-y-auto bg-white shadow-2xl">
            <div className="sticky top-0 z-10 flex items-center justify-between border-b border-gray-200 bg-white px-4 py-3 sm:px-6 sm:py-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-gray-500">{t('verifications.verificationReview')}</p>
                <h3 className="mt-1 text-xl font-bold text-gray-900">
                  {selectedDetail?.profile.businessName || t('verifications.loading')}
                </h3>
              </div>
              <button
                type="button"
                onClick={closeDetail}
                className="rounded-full border border-gray-200 p-2 text-gray-500 transition hover:bg-gray-50"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {detailLoading || !selectedDetail ? (
              <div className="p-4 sm:p-6 text-sm text-gray-500">{t('verifications.loadingPackage')}</div>
            ) : (
              <div className="space-y-6 p-4 sm:p-6">
                <Section title={t('verifications.profileOverview')}>
                  <DetailGrid
                    items={[
                      ['Owner', selectedDetail.profile.ownerName || selectedDetail.ownerName || '-'],
                      ['Partner type', formatPartnerTypeLabel(selectedDetail.profile.partnerType, '-')],
                      ['Email', selectedDetail.email || '-'],
                      ['Primary mobile', selectedDetail.mobile || '-'],
                      ['WhatsApp', selectedDetail.whatsappNumber || '-'],
                      ['State / City', `${selectedDetail.state || '-'} / ${selectedDetail.city || '-'}`],
                      ['District / PIN', `${selectedDetail.profile.district || '-'} / ${selectedDetail.profile.pinCode || '-'}`],
                      ['Experience', selectedDetail.profile.businessExperience || '-'],
                      ['Expected monthly listings', String(selectedDetail.profile.expectedMonthlyListings || '-')],
                      ['Contact preference', formatStatus(selectedDetail.profile.contactPreference)],
                    ]}
                  />
                  <LongText label="Business address" value={selectedDetail.profile.businessAddress} />
                  <LongText label="Business description" value={selectedDetail.profile.businessDescription} />
                  <LongText label="Service areas" value={selectedDetail.profile.serviceAreas} />
                </Section>

                <Section title={t('verifications.kycDocuments')}>
                  {previewError ? <p className="text-sm text-red-600">{previewError}</p> : null}
                  <div className="space-y-4">
                    {selectedDetail.documents.map((document) => (
                      <div key={document.id} className="rounded-xl border border-gray-200 p-4">
                        <div className="flex items-start justify-between gap-4">
                          <div>
                            <p className="text-sm font-semibold text-gray-900">{formatStatus(document.documentType)}</p>
                            <p className="mt-1 text-xs text-gray-500">{document.fileName || t('verifications.uploadedFile')}</p>
                          </div>
                          <span className="rounded-full bg-gray-100 px-3 py-1 text-xs font-semibold text-gray-700">
                            {formatStatus(document.status)}
                          </span>
                        </div>
                        <div className="mt-3 grid gap-3 md:grid-cols-2 text-sm text-gray-600">
                          <div>Document number: {document.documentNumber || '-'}</div>
                          <div>Name on document: {document.nameOnDocument || '-'}</div>
                          <div>Issue date: {formatDate(document.issueDate)}</div>
                          <div>Expiry date: {formatDate(document.expiryDate)}</div>
                        </div>
                        {document.submittedNote ? <LongText label="Partner note" value={document.submittedNote} /> : null}
                        {document.reviewComment ? <LongText label="Review comment" value={document.reviewComment} /> : null}
                        <button
                          type="button"
                          onClick={() => void openSecurePreview(document.fileUrl, document.fileName)}
                          disabled={previewLoading}
                          className="mt-3 inline-flex text-sm font-semibold text-[#9a7600] hover:underline"
                        >
                          {previewLoading ? t('verifications.opening') : t('verifications.openFile')}
                        </button>
                      </div>
                    ))}
                  </div>
                </Section>

                <Section title={t('verifications.acceptedAgreements')}>
                  <div className="grid gap-3 md:grid-cols-2">
                    {selectedDetail.agreements.map((agreement) => (
                      <div key={agreement.agreementType} className="rounded-xl border border-gray-200 p-4">
                        <p className="text-sm font-semibold text-gray-900">{formatStatus(agreement.agreementType)}</p>
                        <p className="mt-1 text-xs text-gray-500">Version {agreement.version}</p>
                        <p className="mt-2 text-sm text-gray-600">Accepted on {formatDate(agreement.acceptedAt)}</p>
                      </div>
                    ))}
                  </div>
                </Section>

                <Section title={t('verifications.reviewHistory')}>
                  <div className="space-y-3">
                    {selectedDetail.reviewHistory.map((item) => (
                      <div key={item.id} className="rounded-xl border border-gray-200 p-4">
                        <p className="text-sm font-semibold text-gray-900">
                          {getReviewActionLabel(
                            item.action,
                            selectedDetail.profile.partnerType,
                            selectedDetail.profile.businessName || selectedDetail.profile.ownerName || selectedDetail.ownerName
                          )}
                        </p>
                        <p className="mt-1 text-xs text-gray-500">{new Date(item.createdAt).toLocaleString('en-IN')}</p>
                        {item.comment ? <p className="mt-2 text-sm text-gray-600">{item.comment}</p> : null}
                      </div>
                    ))}
                  </div>
                </Section>

                <div className="flex flex-wrap justify-end gap-3 border-t border-gray-100 pt-4">
                  <button
                    type="button"
                    onClick={() => void handleStatusUpdate(selectedDetail.id, 'CHANGES_REQUESTED')}
                    disabled={updatingId === selectedDetail.id}
                    className="rounded-md border border-amber-200 px-4 py-2 text-sm font-medium text-amber-700 transition hover:bg-amber-50 disabled:opacity-60"
                  >
                    {t('verifications.requestChanges')}
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleStatusUpdate(selectedDetail.id, 'APPROVED')}
                    disabled={updatingId === selectedDetail.id}
                    className="rounded-md border border-green-200 px-4 py-2 text-sm font-medium text-green-700 transition hover:bg-green-50 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {t('verifications.approvePartner')}
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleStatusUpdate(selectedDetail.id, 'REJECTED')}
                    disabled={updatingId === selectedDetail.id}
                    className="rounded-md border border-red-200 px-4 py-2 text-sm font-medium text-red-700 transition hover:bg-red-50 disabled:opacity-60"
                  >
                    {t('verifications.rejectPartner')}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      ) : null}

      {previewAsset ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4 py-6">
          <div className="w-full max-w-5xl overflow-hidden rounded-2xl bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-gray-200 px-5 py-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-gray-500">{t('verifications.documentPreview')}</p>
                <h4 className="mt-1 text-lg font-bold text-gray-900">{previewAsset.name}</h4>
              </div>
              <button
                type="button"
                onClick={closePreview}
                className="rounded-full border border-gray-200 p-2 text-gray-500 transition hover:bg-gray-50"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="bg-neutral-950 p-4">
              {previewAsset.mimeType.startsWith('image/') ? (
                <Image
                  src={previewAsset.url}
                  alt={previewAsset.name}
                  width={1600}
                  height={1200}
                  unoptimized
                  className="mx-auto h-auto max-h-[75vh] w-auto max-w-full rounded-xl object-contain"
                />
              ) : previewAsset.mimeType === 'application/pdf' ? (
                <iframe
                  src={previewAsset.url}
                  title={previewAsset.name}
                  className="h-[75vh] w-full rounded-xl bg-white"
                />
              ) : (
                <div className="flex min-h-[40vh] items-center justify-center rounded-xl bg-white p-8 text-center">
                  <div>
                    <p className="text-sm font-semibold text-gray-900">{t('verifications.previewUnavailable')}</p>
                    <a
                      href={previewAsset.url}
                      download={previewAsset.name}
                      className="mt-4 inline-flex rounded-lg bg-[#FFC107] px-4 py-2 text-sm font-semibold text-black hover:bg-[#E5AD06]"
                    >
                      {t('verifications.downloadFile')}
                    </a>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-4">
      <h4 className="text-lg font-bold text-gray-900">{title}</h4>
      {children}
    </section>
  );
}

function DetailGrid({ items }: { items: Array<[string, string]> }) {
  return (
    <div className="grid gap-3 md:grid-cols-2">
      {items.map(([label, value]) => (
        <div key={label} className="rounded-xl border border-gray-200 bg-gray-50 p-4">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-gray-500">{label}</p>
          <p className="mt-2 text-sm font-medium text-gray-900">{value}</p>
        </div>
      ))}
    </div>
  );
}

function LongText({ label, value }: { label: string; value?: string | null }) {
  if (!value) {
    return null;
  }

  return (
    <div className="rounded-xl border border-gray-200 bg-gray-50 p-4">
      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-gray-500">{label}</p>
      <p className="mt-2 text-sm text-gray-700 whitespace-pre-wrap">{value}</p>
    </div>
  );
}
