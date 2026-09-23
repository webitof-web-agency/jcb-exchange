'use client';

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import {
  AlertCircle,
  ArrowLeft,
  Award,
  BarChart3,
  Calendar,
  CheckCircle2,
  Clock3,
  ChevronLeft,
  ChevronRight,
  Eye,
  FileText,
  Gauge,
  Image as ImageIcon,
  Landmark,
  Maximize2,
  MapPin,
  PackageCheck,
  Play,
  TrendingUp,
  Users,
  WalletCards,
  X,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import api from '@/lib/api';
import BrandLoader from '@/components/ui/BrandLoader';
import SafeRemoteImage from '@/components/ui/SafeRemoteImage';
import SafeRemoteVideo from '@/components/ui/SafeRemoteVideo';
import { getMediaSourceCandidates } from '@/lib/fileUpload';
import { buildPaginationItems } from '@/lib/paginationUtils';
import { resolveListingId } from '@/lib/routeResolvers';

type LeadItem = {
  id: string;
  status: string;
  enquiryType?: string | null;
  createdAt: string;
  updatedAt: string;
};

type SaleRecord = {
  soldPrice: number;
  soldAt: string;
};

type PaymentRecord = {
  id: string;
  method: string;
  status: string;
  amount: number;
  transactionRef?: string | null;
  submittedAt: string;
  reviewedAt?: string | null;
};

type MediaAsset = {
  id: string;
  url: string;
  type: string;
  slot?: string | null;
  isFeatured: boolean;
};

type AnalyticsListingDetailData = {
  id: string;
  title: string;
  status: string;
  price: number;
  isNegotiable?: boolean;
  views: number;
  trackedViews: number;
  manufacturingYear: number;
  operatingHours?: number | null;
  address?: string | null;
  condition?: string | null;
  description?: string | null;
  additionalDescription?: string | null;
  grossPower?: string | null;
  contactMode?: string | null;
  locationCity?: string | null;
  locationState?: string | null;
  createdAt: string;
  updatedAt?: string;
  soldAt?: string | null;
  category?: { id: string; name: string } | null;
  brand?: { name: string } | null;
  model?: { name: string } | null;
  partner?: {
    id: string;
    name?: string | null;
    email?: string | null;
    role?: string | null;
    partnerProfile?: {
      businessName?: string | null;
      ownerName?: string | null;
      partnerType?: string | null;
      contactPreference?: string | null;
    } | null;
  } | null;
  media?: MediaAsset[];
  leads: LeadItem[];
  saleRecord: SaleRecord | null;
};

type ApiResponse = {
  listing: AnalyticsListingDetailData;
  leadSummary?: { total: number; active: number; won: number; conversionRate: number };
  leadStatusBreakdown?: Array<{ status: string; count: number }>;
  payments?: PaymentRecord[];
  trackedViewTimeline?: Array<{ date: string; count: number }>;
  availability: {
    uniqueViews: number;
    historicalImpressions: string;
    sampledTrackedViewEvents?: number;
    trackedViewTimelineDays?: number;
  };
};

const fmt = (value: number | null | undefined) => new Intl.NumberFormat('en-IN').format(Number(value || 0));
const fmtCurrency = (value: number | null | undefined) => `₹${fmt(value)}`;
const fmtDate = (value?: string | null) => {
  if (!value) return 'Not recorded';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 'Not recorded' : date.toLocaleDateString('en-IN', { day: '2-digit', month: '2-digit', year: 'numeric' });
};
const fmtDateTime = (value?: string | null) => {
  if (!value) return 'Not recorded';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 'Not recorded' : date.toLocaleString('en-IN', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
};
const labelify = (value?: string | null) => value ? value.toLowerCase().replace(/_/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase()) : 'Not recorded';
const displayValue = (value?: string | number | null) => value === null || value === undefined || value === '' ? 'Not recorded' : String(value);

const STATUS_STYLES: Record<string, string> = {
  PUBLISHED: 'border-emerald-200 bg-emerald-50 text-emerald-800',
  DRAFT: 'border-slate-200 bg-slate-100 text-slate-700',
  PENDING_APPROVAL: 'border-amber-200 bg-amber-50 text-amber-800',
  CHANGES_REQUESTED: 'border-orange-200 bg-orange-50 text-orange-800',
  PAUSED: 'border-slate-200 bg-slate-100 text-slate-600',
  RESERVED: 'border-blue-200 bg-blue-50 text-blue-800',
  SOLD: 'border-violet-200 bg-violet-50 text-violet-800',
  REJECTED: 'border-rose-200 bg-rose-50 text-rose-800',
};

const LEAD_STYLES: Record<string, { badge: string; bar: string }> = {
  NEW: { badge: 'border-blue-200 bg-blue-50 text-blue-800', bar: 'bg-blue-500' },
  CONTACTED: { badge: 'border-indigo-200 bg-indigo-50 text-indigo-800', bar: 'bg-indigo-500' },
  INTERESTED: { badge: 'border-violet-200 bg-violet-50 text-violet-800', bar: 'bg-violet-500' },
  INSPECTION_SCHEDULED: { badge: 'border-amber-200 bg-amber-50 text-amber-800', bar: 'bg-amber-500' },
  WON: { badge: 'border-emerald-200 bg-emerald-50 text-emerald-800', bar: 'bg-emerald-500' },
  LOST: { badge: 'border-rose-200 bg-rose-50 text-rose-800', bar: 'bg-rose-500' },
};

function Badge({ value, type = 'listing' }: { value?: string | null; type?: 'listing' | 'lead' | 'payment' }) {
  const styles = type === 'lead'
    ? LEAD_STYLES[value || '']?.badge || 'border-slate-200 bg-slate-100 text-slate-700'
    : type === 'payment'
      ? value === 'APPROVED' || value === 'PAID'
        ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
        : value === 'REJECTED'
          ? 'border-rose-200 bg-rose-50 text-rose-800'
          : 'border-amber-200 bg-amber-50 text-amber-800'
      : STATUS_STYLES[value || ''] || 'border-slate-200 bg-slate-100 text-slate-700';

  return <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-bold ${styles}`}>{labelify(value)}</span>;
}

function SectionHeading({ icon, eyebrow, title, detail, action }: { icon: ReactNode; eyebrow?: string; title: string; detail?: string; action?: ReactNode }) {
  return (
    <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
      <div className="flex items-start gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-amber-50 text-[#9a6b00]">{icon}</span>
        <div>
          {eyebrow ? <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-[#a47400]">{eyebrow}</p> : null}
          <h2 className="mt-0.5 text-base font-bold tracking-tight text-slate-950">{title}</h2>
          {detail ? <p className="mt-1 text-xs leading-5 text-slate-500">{detail}</p> : null}
        </div>
      </div>
      {action}
    </div>
  );
}

function MetricCard({ icon, label, value, note, accent = 'amber' }: { icon: ReactNode; label: string; value: string; note: string; accent?: 'amber' | 'blue' | 'green' | 'violet' }) {
  const accents = {
    amber: 'bg-amber-50 text-[#9a6b00]',
    blue: 'bg-blue-50 text-blue-700',
    green: 'bg-emerald-50 text-emerald-700',
    violet: 'bg-violet-50 text-violet-700',
  };
  return (
    <article className="rounded-2xl border border-slate-200 bg-white p-4 shadow-[0_2px_10px_rgba(15,23,42,0.04)] transition-shadow hover:shadow-md">
      <div className="flex items-center gap-2.5">
        <span className={`flex h-9 w-9 items-center justify-center rounded-xl ${accents[accent]}`}>{icon}</span>
        <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-slate-500">{label}</p>
      </div>
      <p className="mt-4 text-2xl font-black tracking-tight text-slate-950">{value}</p>
      <p className="mt-1 text-xs text-slate-500">{note}</p>
    </article>
  );
}

function InfoItem({ label, value, icon }: { label: string; value?: string | number | null; icon?: ReactNode }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50/70 px-3.5 py-3">
      <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.12em] text-slate-500">{icon}{label}</div>
      <p className="mt-1.5 break-words text-sm font-semibold text-slate-900">{displayValue(value)}</p>
    </div>
  );
}

function EmptyState({ title, detail, icon }: { title: string; detail: string; icon: ReactNode }) {
  return <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-slate-200 bg-slate-50/50 px-6 py-12 text-center"><span className="text-slate-300">{icon}</span><p className="mt-3 text-sm font-bold text-slate-600">{title}</p><p className="mt-1 max-w-sm text-xs leading-5 text-slate-400">{detail}</p></div>;
}

function AnalyticsMediaGallery({ media = [] }: { media?: MediaAsset[] }) {
  const [activeMediaIndex, setActiveMediaIndex] = useState(0);
  const [unavailableMediaIds, setUnavailableMediaIds] = useState<string[]>([]);
  const [isLightboxOpen, setIsLightboxOpen] = useState(false);
  const [zoom, setZoom] = useState(1);
  const thumbnailStripRef = useRef<HTMLDivElement | null>(null);

  const sortedMedia = useMemo(() => [...media].sort((first, second) => {
    if (first.isFeatured !== second.isFeatured) return first.isFeatured ? -1 : 1;
    const firstIsVideo = first.type.toUpperCase() === 'VIDEO';
    const secondIsVideo = second.type.toUpperCase() === 'VIDEO';
    if (firstIsVideo !== secondIsVideo) return firstIsVideo ? 1 : -1;
    return 0;
  }), [media]);
  const availableMedia = useMemo(
    () => sortedMedia.filter((mediaItem) => !unavailableMediaIds.includes(mediaItem.id)),
    [sortedMedia, unavailableMediaIds],
  );
  const displayedActiveMediaIndex = availableMedia.length
    ? Math.min(activeMediaIndex, availableMedia.length - 1)
    : 0;
  const activeMedia = availableMedia[displayedActiveMediaIndex];
  const activeIsVideo = activeMedia?.type.toUpperCase() === 'VIDEO';

  const markMediaUnavailable = (mediaId: string) => {
    setUnavailableMediaIds((current) => current.includes(mediaId) ? current : [...current, mediaId]);
  };

  const moveMedia = useCallback((direction: 'previous' | 'next') => {
    if (availableMedia.length < 2) return;
    setActiveMediaIndex((current) => direction === 'previous'
      ? current > 0 ? current - 1 : availableMedia.length - 1
      : current < availableMedia.length - 1 ? current + 1 : 0);
    setZoom(1);
  }, [availableMedia.length]);

  const scrollThumbnails = (direction: 'left' | 'right') => {
    thumbnailStripRef.current?.scrollBy({ left: direction === 'left' ? -240 : 240, behavior: 'smooth' });
  };

  useEffect(() => {
    if (!isLightboxOpen) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setIsLightboxOpen(false);
      if (event.key === 'ArrowLeft') moveMedia('previous');
      if (event.key === 'ArrowRight') moveMedia('next');
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isLightboxOpen, moveMedia]);

  useEffect(() => {
    if (isLightboxOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = 'unset';
    }
    return () => { document.body.style.overflow = 'unset'; };
  }, [isLightboxOpen]);

  if (!media.length) {
    return (
      <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-[0_2px_12px_rgba(15,23,42,0.04)] sm:p-6">
        <SectionHeading icon={<ImageIcon className="h-4 w-4" />} eyebrow="Listing media" title="Media gallery" detail="Images and videos attached to the live listing record." />
        <EmptyState icon={<ImageIcon className="h-8 w-8" />} title="No media uploaded" detail="This listing does not have any image or video assets available." />
      </section>
    );
  }

  const openLightboxAt = (index: number) => {
    setActiveMediaIndex(index);
    setZoom(1);
    setIsLightboxOpen(true);
  };

  return (
    <>
      <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-[0_2px_12px_rgba(15,23,42,0.04)] sm:p-6">
        <SectionHeading
          icon={<ImageIcon className="h-4 w-4" />}
          eyebrow="Listing media"
          title="Media gallery"
          detail="Click any item to view in full resolution or play video."
          action={<span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-bold text-slate-600">{fmt(availableMedia.length)} available</span>}
        />

        {availableMedia.length ? (
          <div className="relative mt-3">
            {availableMedia.length > 4 ? (
              <>
                <button type="button" onClick={() => scrollThumbnails('left')} className="absolute -left-3 top-1/2 z-10 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-700 shadow-md transition hover:border-amber-300 hover:text-[#9a6b00] focus:outline-none focus:ring-2 focus:ring-amber-400" aria-label="Scroll thumbnails left"><ChevronLeft className="h-4 w-4" /></button>
                <button type="button" onClick={() => scrollThumbnails('right')} className="absolute -right-3 top-1/2 z-10 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-700 shadow-md transition hover:border-amber-300 hover:text-[#9a6b00] focus:outline-none focus:ring-2 focus:ring-amber-400" aria-label="Scroll thumbnails right"><ChevronRight className="h-4 w-4" /></button>
              </>
            ) : null}
            <div ref={thumbnailStripRef} className="flex snap-x gap-3 overflow-x-auto px-1 py-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              {availableMedia.map((mediaItem, index) => {
                const isVideo = mediaItem.type.toUpperCase() === 'VIDEO';
                return (
                  <button
                    key={mediaItem.id}
                    type="button"
                    onClick={() => openLightboxAt(index)}
                    className="group relative flex h-28 w-44 min-w-[176px] shrink-0 cursor-pointer snap-start overflow-hidden rounded-2xl border border-slate-200 bg-slate-950 shadow-xs transition hover:border-amber-400 hover:shadow-md focus:outline-none focus:ring-2 focus:ring-amber-400"
                    aria-label={`Open ${isVideo ? 'video' : 'image'} ${index + 1}`}
                  >
                    {isVideo ? (
                      <SafeRemoteVideo src={getMediaSourceCandidates(mediaItem.url)[0]} fallbackSrcs={getMediaSourceCandidates(mediaItem.url).slice(1)} muted playsInline preload="metadata" className="h-full w-full object-cover opacity-75 transition-transform duration-300 group-hover:scale-105" onError={() => markMediaUnavailable(mediaItem.id)} />
                    ) : (
                      <SafeRemoteImage src={getMediaSourceCandidates(mediaItem.url)[0]} fallbackSrcs={getMediaSourceCandidates(mediaItem.url).slice(1)} alt={mediaItem.slot || `Listing image ${index + 1}`} className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105" onError={() => markMediaUnavailable(mediaItem.id)} fallback={<div className="flex h-full w-full items-center justify-center text-[10px] font-semibold text-slate-400">Unavailable</div>} />
                    )}
                    <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-black/20 opacity-80 transition-opacity group-hover:opacity-90" />
                    <div className="absolute left-2 top-2 flex items-center gap-1">
                      {mediaItem.isFeatured ? <span className="rounded-md bg-[#f7b500] px-1.5 py-0.5 text-[9px] font-black text-slate-950">Featured</span> : null}
                      <span className="rounded-md bg-black/60 px-1.5 py-0.5 text-[9px] font-bold text-white backdrop-blur-xs">{isVideo ? 'Video' : 'Image'}</span>
                    </div>
                    {isVideo ? (
                      <div className="absolute inset-0 flex items-center justify-center">
                        <span className="flex h-9 w-9 items-center justify-center rounded-full bg-black/65 text-white backdrop-blur-xs transition-transform group-hover:scale-110"><Play className="ml-0.5 h-4 w-4 fill-current" /></span>
                      </div>
                    ) : (
                      <div className="absolute bottom-2 right-2 opacity-0 transition-opacity group-hover:opacity-100">
                        <span className="flex h-7 w-7 items-center justify-center rounded-full bg-black/60 text-white backdrop-blur-xs"><Maximize2 className="h-3.5 w-3.5" /></span>
                      </div>
                    )}
                    <div className="absolute bottom-2 left-2 truncate text-[10px] font-bold text-white/90">
                      {mediaItem.slot ? labelify(mediaItem.slot) : `Asset #${index + 1}`}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        ) : <EmptyState icon={<ImageIcon className="h-8 w-8" />} title="Media could not be loaded" detail="The listing has media records, but the available files could not be displayed." />}
      </section>

      {isLightboxOpen && activeMedia ? (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/95 p-3 backdrop-blur-sm sm:p-8" onClick={() => setIsLightboxOpen(false)} role="dialog" aria-modal="true" aria-label="Listing media viewer">
          <button type="button" onClick={() => setIsLightboxOpen(false)} className="absolute right-3 top-3 z-[110] flex h-11 w-11 items-center justify-center rounded-full bg-white/10 text-white transition hover:bg-white/20 focus:outline-none focus:ring-2 focus:ring-amber-400 sm:right-6 sm:top-6" aria-label="Close media viewer"><X className="h-6 w-6" /></button>
          <div className="relative flex h-full w-full max-w-7xl items-center justify-center" onClick={(event) => event.stopPropagation()}>
            {activeIsVideo ? (
              <SafeRemoteVideo src={getMediaSourceCandidates(activeMedia.url)[0]} fallbackSrcs={getMediaSourceCandidates(activeMedia.url).slice(1)} controls muted autoPlay playsInline className="max-h-[82vh] max-w-[92vw] object-contain" onError={() => markMediaUnavailable(activeMedia.id)} />
            ) : (
              <div className="flex h-full w-full items-center justify-center overflow-auto">
                <div className="origin-center transition-transform duration-200" style={{ transform: `scale(${zoom})` }}>
                  <SafeRemoteImage src={getMediaSourceCandidates(activeMedia.url)[0]} fallbackSrcs={getMediaSourceCandidates(activeMedia.url).slice(1)} alt={activeMedia.slot || 'Listing media'} className="max-h-[82vh] max-w-[92vw] object-contain" onError={() => markMediaUnavailable(activeMedia.id)} fallback={<div className="px-8 py-12 text-center text-sm font-semibold text-slate-300">Image unavailable</div>} />
                </div>
              </div>
            )}

            {availableMedia.length > 1 ? (
              <>
                <button type="button" onClick={() => moveMedia('previous')} className="absolute left-0 top-1/2 z-[110] flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full bg-white/10 text-white backdrop-blur-md transition hover:bg-white/20 focus:outline-none focus:ring-2 focus:ring-amber-400 sm:left-3" aria-label="Previous media"><ChevronLeft className="h-6 w-6" /></button>
                <button type="button" onClick={() => moveMedia('next')} className="absolute right-0 top-1/2 z-[110] flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full bg-white/10 text-white backdrop-blur-md transition hover:bg-white/20 focus:outline-none focus:ring-2 focus:ring-amber-400 sm:right-3" aria-label="Next media"><ChevronRight className="h-6 w-6" /></button>
              </>
            ) : null}

            {!activeIsVideo ? <div className="absolute bottom-2 left-1/2 z-[110] flex -translate-x-1/2 items-center gap-2 rounded-full bg-black/60 p-1.5 text-white backdrop-blur-md"><button type="button" onClick={() => setZoom((current) => Math.max(1, Number((current - 0.25).toFixed(2))))} className="flex h-9 w-9 items-center justify-center rounded-full transition hover:bg-white/20 focus:outline-none focus:ring-2 focus:ring-amber-400" aria-label="Zoom out"><ZoomOut className="h-4 w-4" /></button><span className="min-w-12 text-center text-xs font-bold">{Math.round(zoom * 100)}%</span><button type="button" onClick={() => setZoom((current) => Math.min(3.5, Number((current + 0.25).toFixed(2))))} className="flex h-9 w-9 items-center justify-center rounded-full transition hover:bg-white/20 focus:outline-none focus:ring-2 focus:ring-amber-400" aria-label="Zoom in"><ZoomIn className="h-4 w-4" /></button><button type="button" onClick={() => setZoom(1)} className="flex h-9 items-center justify-center rounded-full px-2 text-[11px] font-bold transition hover:bg-white/20 focus:outline-none focus:ring-2 focus:ring-amber-400" aria-label="Reset zoom">Reset</button></div> : null}
            <span className="absolute bottom-3 left-3 z-[110] rounded-full bg-black/60 px-3 py-1.5 text-xs font-bold text-white backdrop-blur-md sm:bottom-4 sm:left-1/2 sm:-translate-x-1/2">{displayedActiveMediaIndex + 1} / {availableMedia.length}</span>
          </div>
        </div>
      ) : null}
    </>
  );
}

export default function AnalyticsListingDetail({ listingId, backHref }: { listingId: string; backHref: string }) {
  const searchParams = useSearchParams();
  const backUrl = useMemo(() => {
    const query = searchParams?.toString();
    return query ? `${backHref}?${query}` : backHref;
  }, [backHref, searchParams]);
  const [data, setData] = useState<ApiResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 15;

  const load = useCallback(async (isRefresh = false) => {
    if (!isRefresh) setLoading(true);
    setError('');
    try {
      const resolvedListingId = (await resolveListingId(listingId)) || listingId;
      const response = await api.get<ApiResponse>(`/analytics/listings/${encodeURIComponent(resolvedListingId)}`);
      setData(response.data);
      setPage(1);
    } catch {
      setError('Could not load analytics for this listing. Please refresh and try again.');
    } finally {
      setLoading(false);
    }
  }, [listingId]);

  // Data fetching is intentionally started from the effect; load owns the async state transition.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void load(); }, [load]);

  const listing = data?.listing;

  const recentLeads = useMemo(() => listing?.leads || [], [listing?.leads]);
  const leadSummary = data?.leadSummary || {
    total: recentLeads.length,
    active: recentLeads.filter((lead) => !['WON', 'LOST'].includes(lead.status)).length,
    won: recentLeads.filter((lead) => lead.status === 'WON').length,
    conversionRate: recentLeads.length ? Number(((recentLeads.filter((lead) => lead.status === 'WON').length / recentLeads.length) * 100).toFixed(1)) : 0,
  };
  const leadBreakdown = data?.leadStatusBreakdown?.length
    ? data.leadStatusBreakdown
    : Object.entries(recentLeads.reduce<Record<string, number>>((counts, lead) => ({ ...counts, [lead.status]: (counts[lead.status] || 0) + 1 }), {})).map(([status, count]) => ({ status, count }));
  const totalLeadCount = leadSummary.total;
  const totalPages = Math.ceil(recentLeads.length / PAGE_SIZE) || 1;
  const currentPage = Math.min(page, totalPages);
  const paginatedLeads = useMemo(() => recentLeads.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE), [recentLeads, currentPage]);
  const paginationItems = useMemo(() => buildPaginationItems(currentPage, totalPages), [currentPage, totalPages]);
  const mediaCount = listing?.media?.length || 0;
  const paymentRecords = data?.payments || [];
  const partnerName = listing?.partner?.partnerProfile?.businessName || listing?.partner?.name || listing?.partner?.email || 'Partner not recorded';
  const location = [listing?.locationCity, listing?.locationState].filter(Boolean).join(', ');
  const viewsTotal = (listing?.views || 0) + (listing?.trackedViews || 0);
  const trackedShare = viewsTotal > 0 ? Math.round(((listing?.trackedViews || 0) / viewsTotal) * 100) : 0;

  return (
    <main className="space-y-5 pb-10">

      {loading ? <BrandLoader variant="section" size="md" bg="light" text="Loading listing intelligence…" className="rounded-3xl border border-slate-200 bg-white p-16 shadow-sm" /> : null}

      {!loading && error ? <div role="alert" className="flex items-start gap-3 rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm font-semibold text-rose-800"><AlertCircle className="mt-0.5 h-5 w-5 shrink-0" />{error}</div> : null}

      {!loading && listing ? (
        <>
          <section className="relative overflow-hidden rounded-3xl border border-slate-200 bg-white p-6 shadow-[0_2px_12px_rgba(15,23,42,0.04)] sm:p-7">
            <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
              <div className="space-y-3">
                <div className="flex flex-wrap items-center gap-2">
                  <Link
                    href={backUrl}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-bold text-slate-700 transition hover:border-amber-400 hover:bg-amber-50 hover:text-amber-900 focus:outline-none focus:ring-2 focus:ring-amber-400"
                  >
                    <ArrowLeft className="h-3.5 w-3.5" />
                    Back
                  </Link>
                  <Badge value={listing.status} />
                  <span className="text-[11px] font-bold uppercase tracking-wider text-amber-700 bg-amber-50 px-2.5 py-1 rounded-md border border-amber-200/60">Analytics Detail</span>
                </div>
                <h1 className="text-2xl font-black leading-tight tracking-tight text-slate-900 sm:text-3xl">{listing.title}</h1>
                <p className="text-sm font-semibold text-slate-500">{[listing.brand?.name, listing.model?.name, listing.manufacturingYear].filter(Boolean).join(' · ') || 'Machine profile'}</p>
                <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-xs font-semibold text-slate-600 pt-1">
                  <span className="inline-flex items-center gap-1.5"><MapPin className="h-4 w-4 text-amber-500" />{location || 'Location not recorded'}</span>
                  <span className="inline-flex items-center gap-1.5"><Calendar className="h-4 w-4 text-amber-500" />Listed {fmtDate(listing.createdAt)}</span>
                </div>
              </div>
              <div className="rounded-2xl border border-amber-200/80 bg-amber-50/60 px-6 py-4 lg:text-right shrink-0">
                <p className="text-[10px] font-black uppercase tracking-wider text-amber-800/80">Asking price</p>
                <p className="mt-1 text-2xl font-black tracking-tight text-amber-900 sm:text-3xl">{fmtCurrency(listing.price)}</p>
                {listing.isNegotiable ? <p className="mt-1 text-xs font-bold text-amber-700">Negotiable</p> : null}
              </div>
            </div>
          </section>

          <section className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
            <MetricCard icon={<Eye className="h-4 w-4" />} label="Legacy views" value={fmt(listing.views)} note="Cumulative counter" />
            <MetricCard icon={<Users className="h-4 w-4" />} label="Unique views" value={fmt(data?.availability.uniqueViews)} note="Distinct visitor identities" accent="green" />
            <MetricCard icon={<Users className="h-4 w-4" />} label="Total leads" value={fmt(totalLeadCount)} note={`${fmt(leadSummary.active)} active`} accent="violet" />
            <MetricCard icon={<Award className="h-4 w-4" />} label="Won leads" value={fmt(leadSummary.won)} note="Successful conversions" accent="green" />
            <MetricCard icon={<TrendingUp className="h-4 w-4" />} label="Conversion" value={`${leadSummary.conversionRate}%`} note="Won ÷ total leads" />
            <MetricCard icon={<ImageIcon className="h-4 w-4" />} label="Media assets" value={fmt(mediaCount)} note="Listing attachments" accent="blue" />
          </section>

          <div className="grid gap-5 xl:grid-cols-[minmax(0,1.25fr)_minmax(320px,0.75fr)]">
            <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-[0_2px_12px_rgba(15,23,42,0.04)] sm:p-6">
              <SectionHeading icon={<Gauge className="h-4 w-4" />} eyebrow="Reach and demand" title="Performance pulse" detail="A compact view of attention, lead quality and tracked activity for this listing." />
              <div className="grid gap-4 md:grid-cols-2">
                <div className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4"><div className="flex items-center justify-between"><p className="text-xs font-bold text-slate-700">Tracked share of recorded views</p><span className="text-sm font-black text-slate-950">{trackedShare}%</span></div><div className="mt-3 h-3 overflow-hidden rounded-full bg-slate-200"><div className="h-full rounded-full bg-[#f7b500] transition-all" style={{ width: `${trackedShare}%` }} /></div><p className="mt-3 text-xs leading-5 text-slate-500">Legacy views and durable events are different sources; they should not be added as unique visitors.</p></div>
                <div className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4"><div className="flex items-center justify-between"><p className="text-xs font-bold text-slate-700">Lead pipeline health</p><span className="text-sm font-black text-slate-950">{leadSummary.active} active</span></div><div className="mt-3 flex h-3 overflow-hidden rounded-full bg-slate-200">{leadBreakdown.map((item) => <div key={item.status} className={`${LEAD_STYLES[item.status]?.bar || 'bg-slate-400'} h-full`} style={{ width: `${totalLeadCount ? (item.count / totalLeadCount) * 100 : 0}%` }} title={`${labelify(item.status)}: ${item.count}`} />)}</div><div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-slate-500"><span><strong className="text-slate-900">{leadSummary.won}</strong> won</span><span><strong className="text-slate-900">{leadSummary.active}</strong> active</span><span><strong className="text-slate-900">{Math.max(totalLeadCount - leadSummary.active - leadSummary.won, 0)}</strong> lost</span></div></div>
              </div>
            </section>

            <div className="flex flex-col gap-5">
              <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-[0_2px_12px_rgba(15,23,42,0.04)] sm:p-6">
                <SectionHeading icon={<BarChart3 className="h-4 w-4" />} eyebrow="Lead intelligence" title="Status breakdown" detail={`${fmt(totalLeadCount)} total leads across the complete listing history.`} />
                {leadBreakdown.length ? (
                  <div className="max-h-[180px] overflow-y-auto pr-1 space-y-4 [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
                    {leadBreakdown.map((item) => {
                      const percent = totalLeadCount ? Math.round((item.count / totalLeadCount) * 100) : 0;
                      return (
                        <div key={item.status}>
                          <div className="mb-1.5 flex items-center justify-between gap-3">
                            <Badge value={item.status} type="lead" />
                            <span className="text-xs font-bold text-slate-800">{fmt(item.count)} <span className="font-normal text-slate-400">({percent}%)</span></span>
                          </div>
                          <div className="h-2 overflow-hidden rounded-full bg-slate-100">
                            <div className={`h-full rounded-full ${LEAD_STYLES[item.status]?.bar || 'bg-slate-400'}`} style={{ width: `${percent}%` }} />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <EmptyState icon={<Users className="h-8 w-8" />} title="No leads recorded" detail="Lead status data will appear here when buyers enquire about this listing." />
                )}
              </section>

              <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-[0_2px_12px_rgba(15,23,42,0.04)] sm:p-6">
                <SectionHeading icon={<WalletCards className="h-4 w-4" />} eyebrow="Commercial activity" title="Payment submissions" detail="Payment records linked to this listing, including their current review state." />
                {paymentRecords.length ? (
                  <div className="max-h-[220px] overflow-y-auto pr-1 space-y-3 [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
                    {paymentRecords.map((payment) => (
                      <div key={payment.id} className="rounded-2xl border border-slate-200 p-4">
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div>
                            <p className="text-sm font-bold text-slate-900">{labelify(payment.method)}</p>
                            <p className="mt-1 text-xs text-slate-500">Submitted {fmtDateTime(payment.submittedAt)}</p>
                          </div>
                          <div className="text-right">
                            <p className="text-base font-black text-slate-950">{fmtCurrency(payment.amount)}</p>
                            <Badge value={payment.status} type="payment" />
                          </div>
                        </div>
                        {payment.transactionRef ? <p className="mt-3 break-all text-xs text-slate-500">Reference: <span className="font-mono text-slate-700">{payment.transactionRef}</span></p> : null}
                        {payment.reviewedAt ? <p className="mt-2 text-[11px] font-semibold text-slate-500">Reviewed {fmtDateTime(payment.reviewedAt)}</p> : null}
                      </div>
                    ))}
                  </div>
                ) : (
                  <EmptyState icon={<WalletCards className="h-8 w-8" />} title="No payment submissions" detail="Payment activity linked to this listing will appear here when available." />
                )}
              </section>
            </div>
          </div>

          <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(320px,0.8fr)]">
            <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-[0_2px_12px_rgba(15,23,42,0.04)] sm:p-6"><SectionHeading icon={<PackageCheck className="h-4 w-4" />} eyebrow="Inventory record" title="Listing profile" detail="All searchable attributes returned by the listing record." /><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3"><InfoItem label="Category" value={listing.category?.name} /><InfoItem label="Brand" value={listing.brand?.name} /><InfoItem label="Model" value={listing.model?.name} /><InfoItem label="Manufacturing year" value={listing.manufacturingYear} /><InfoItem label="Operating hours" value={listing.operatingHours} /><InfoItem label="Gross power" value={listing.grossPower ? `${listing.grossPower} HP` : null} /><InfoItem label="Condition" value={listing.condition} /><InfoItem label="Contact mode" value={listing.contactMode} /><InfoItem label="Last updated" value={fmtDateTime(listing.updatedAt)} /><InfoItem label="Address" value={listing.address} icon={<MapPin className="h-3 w-3" />} /><InfoItem label="City" value={listing.locationCity} /><InfoItem label="State" value={listing.locationState} /></div>{listing.description || listing.additionalDescription ? <div className="mt-6 grid gap-4 lg:grid-cols-2"><div className="relative overflow-hidden rounded-2xl border border-amber-100 bg-gradient-to-b from-amber-50/50 to-transparent p-5 shadow-sm"><div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.15em] text-amber-800"><FileText className="h-3.5 w-3.5" />Description</div><div className="mt-3 max-h-[220px] overflow-y-auto pr-2 [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-amber-200"><p className="whitespace-pre-wrap text-[13px] leading-relaxed text-slate-700">{listing.description || 'Not recorded'}</p></div></div><div className="relative overflow-hidden rounded-2xl border border-slate-200 bg-gradient-to-b from-slate-50/80 to-transparent p-5 shadow-sm"><div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.15em] text-slate-600"><FileText className="h-3.5 w-3.5" />Additional description</div><div className="mt-3 max-h-[220px] overflow-y-auto pr-2 [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-slate-200"><p className="whitespace-pre-wrap text-[13px] leading-relaxed text-slate-600">{listing.additionalDescription || 'Not recorded'}</p></div></div></div> : null}</section>

            <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-[0_2px_12px_rgba(15,23,42,0.04)] sm:p-6"><SectionHeading icon={<Landmark className="h-4 w-4" />} eyebrow="Ownership context" title="Partner and source" detail="The account and source context attached to this listing." /><div className="space-y-3"><InfoItem label="Partner / dealer" value={partnerName} /><InfoItem label="Owner name" value={listing.partner?.partnerProfile?.ownerName} /><InfoItem label="Partner type" value={listing.partner?.partnerProfile?.partnerType || listing.partner?.role} /><InfoItem label="Contact preference" value={listing.partner?.partnerProfile?.contactPreference} /><InfoItem label="Account email" value={listing.partner?.email} /></div></section>
          </div>

          <AnalyticsMediaGallery media={listing.media} />

          <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-[0_2px_12px_rgba(15,23,42,0.04)] sm:p-6"><SectionHeading icon={<Users className="h-4 w-4" />} eyebrow="Buyer activity" title="Lead timeline" detail={`Showing the latest ${Math.min(recentLeads.length, 100)} records. Complete lead totals and status counts are shown above.`} action={<span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-bold text-slate-600">{fmt(totalLeadCount)} total</span>} />{recentLeads.length ? <><div className="overflow-x-auto overflow-y-auto max-h-[400px] rounded-2xl border border-slate-200 [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]"><table className="w-full min-w-[720px] text-left text-sm relative"><thead className="sticky top-0 z-10 bg-slate-50 text-[10px] font-black uppercase tracking-[0.12em] text-slate-500 shadow-sm"><tr>{['Lead ID', 'Status', 'Enquiry type', 'Created', 'Last updated'].map((heading) => <th key={heading} className="px-4 py-3">{heading}</th>)}</tr></thead><tbody className="divide-y divide-slate-100">{paginatedLeads.map((lead) => <tr key={lead.id} className="transition hover:bg-amber-50/30"><td className="px-4 py-3"><code className="block max-w-[180px] truncate font-mono text-[11px] text-slate-500">{lead.id}</code></td><td className="px-4 py-3"><Badge value={lead.status} type="lead" /></td><td className="px-4 py-3 text-xs font-semibold text-slate-600">{labelify(lead.enquiryType)}</td><td className="whitespace-nowrap px-4 py-3 text-xs text-slate-600">{fmtDateTime(lead.createdAt)}</td><td className="whitespace-nowrap px-4 py-3 text-xs text-slate-600">{fmtDateTime(lead.updatedAt)}</td></tr>)}</tbody></table></div>{recentLeads.length > PAGE_SIZE ? <div className="flex flex-col gap-3 border-x border-b border-slate-200 px-4 py-3 text-xs text-slate-600 sm:flex-row sm:items-center sm:justify-between rounded-b-2xl"><span>Showing <strong className="text-slate-950">{(currentPage - 1) * PAGE_SIZE + 1}</strong> to <strong className="text-slate-950">{Math.min(currentPage * PAGE_SIZE, recentLeads.length)}</strong> of {recentLeads.length} recent records</span><div className="flex items-center gap-1">{paginationItems.map((item, index) => typeof item === 'number' ? <button key={item} type="button" onClick={() => setPage(item)} className={`h-8 min-w-8 rounded-lg px-2 text-xs font-bold transition ${item === currentPage ? 'bg-[#f7b500] text-slate-950' : 'text-slate-600 hover:bg-slate-100'}`}>{item}</button> : <span key={`ellipsis-${index}`} className="px-1 text-slate-400">…</span>)}</div></div> : null}</> : <EmptyState icon={<Users className="h-8 w-8" />} title="No leads yet" detail="Leads will appear here once buyers enquire about this listing." />}</section>

          {listing.saleRecord ? <section className="rounded-3xl border border-emerald-200 bg-emerald-50/70 p-5 shadow-[0_2px_12px_rgba(16,185,129,0.06)] sm:p-6"><SectionHeading icon={<CheckCircle2 className="h-4 w-4" />} eyebrow="Sale outcome" title="Sale record" detail="The recorded sale outcome attached to this listing." /><div className="grid gap-3 sm:grid-cols-2"><InfoItem label="Sold price" value={fmtCurrency(listing.saleRecord.soldPrice)} /><InfoItem label="Sold date" value={fmtDate(listing.saleRecord.soldAt)} icon={<Clock3 className="h-3 w-3" />} /></div></section> : null}
        </>
      ) : null}
    </main>
  );
}
