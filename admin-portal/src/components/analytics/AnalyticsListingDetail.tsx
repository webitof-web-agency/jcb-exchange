'use client';

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import {
  AlertCircle,
  ArrowLeft,
  Award,
  BarChart3,
  Building2,
  Calendar,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  Clock3,
  Copy,
  DollarSign,
  Eye,
  FileText,
  Filter,
  Gauge,
  Image as ImageIcon,
  Landmark,
  Layers,
  Mail,
  MapPin,
  Maximize2,
  PackageCheck,
  Phone,
  Play,
  RefreshCw,
  Search,
  ShieldCheck,
  Sparkles,
  Tag,
  TrendingDown,
  TrendingUp,
  User,
  Users,
  UsersRound,
  WalletCards,
  X,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip as RechartsTooltip,
  XAxis,
  YAxis,
} from 'recharts';
import api from '@/lib/api';
import BrandLoader from '@/components/ui/BrandLoader';
import SafeRemoteImage from '@/components/ui/SafeRemoteImage';
import SafeRemoteVideo from '@/components/ui/SafeRemoteVideo';
import { getMediaSourceCandidates } from '@/lib/fileUpload';
import { buildPaginationItems } from '@/lib/paginationUtils';
import { resolveListingId } from '@/lib/routeResolvers';
import { generateAdminListingDetailPath } from '@/lib/routePaths';

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
  invoiceNo?: string | null;
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
  return Number.isNaN(date.getTime())
    ? 'Not recorded'
    : date.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
};
const fmtDateTime = (value?: string | null) => {
  if (!value) return 'Not recorded';
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? 'Not recorded'
    : date.toLocaleString('en-IN', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
};
const fmtRelativeTime = (value?: string | null) => {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const diffSec = Math.floor((Date.now() - date.getTime()) / 1000);
  if (diffSec < 60) return 'Just now';
  if (diffSec < 3600) return `${Math.floor(diffSec / 60)}m ago`;
  if (diffSec < 86400) return `${Math.floor(diffSec / 3600)}h ago`;
  if (diffSec < 604800) return `${Math.floor(diffSec / 86400)}d ago`;
  return fmtDate(value);
};
const labelify = (value?: string | null) =>
  value
    ? value
        .toLowerCase()
        .replace(/_/g, ' ')
        .replace(/\b\w/g, (char) => char.toUpperCase())
    : 'Not recorded';
const displayValue = (value?: string | number | null) =>
  value === null || value === undefined || value === '' ? '—' : String(value);

const STATUS_CONFIG: Record<string, { badge: string; dot: string; label: string }> = {
  PUBLISHED: { badge: 'border-emerald-200 bg-emerald-50 text-emerald-800', dot: 'bg-emerald-500', label: 'Published' },
  SOLD: { badge: 'border-violet-200 bg-violet-50 text-violet-800', dot: 'bg-violet-500', label: 'Sold' },
  RESERVED: { badge: 'border-blue-200 bg-blue-50 text-blue-800', dot: 'bg-blue-500', label: 'Reserved' },
  PENDING_APPROVAL: { badge: 'border-amber-200 bg-amber-50 text-amber-800', dot: 'bg-amber-500', label: 'Pending Approval' },
  CHANGES_REQUESTED: { badge: 'border-orange-200 bg-orange-50 text-orange-800', dot: 'bg-orange-500', label: 'Changes Requested' },
  PAUSED: { badge: 'border-slate-200 bg-slate-100 text-slate-700', dot: 'bg-slate-400', label: 'Paused' },
  DRAFT: { badge: 'border-slate-200 bg-slate-100 text-slate-700', dot: 'bg-slate-400', label: 'Draft' },
  REJECTED: { badge: 'border-rose-200 bg-rose-50 text-rose-800', dot: 'bg-rose-500', label: 'Rejected' },
};

const LEAD_STAGE_MAP: Record<string, { label: string; badge: string; bar: string; text: string }> = {
  NEW: { label: 'New', badge: 'border-blue-200 bg-blue-50 text-blue-700', bar: 'bg-blue-500', text: 'text-blue-700' },
  CONTACTED: { label: 'Contacted', badge: 'border-indigo-200 bg-indigo-50 text-indigo-700', bar: 'bg-indigo-500', text: 'text-indigo-700' },
  INTERESTED: { label: 'Interested', badge: 'border-amber-200 bg-amber-50 text-amber-800', bar: 'bg-amber-500', text: 'text-amber-700' },
  INSPECTION_SCHEDULED: { label: 'Inspection', badge: 'border-purple-200 bg-purple-50 text-purple-700', bar: 'bg-purple-500', text: 'text-purple-700' },
  WON: { label: 'Won', badge: 'border-emerald-200 bg-emerald-50 text-emerald-800', bar: 'bg-emerald-500', text: 'text-emerald-700' },
  LOST: { label: 'Lost', badge: 'border-rose-200 bg-rose-50 text-rose-800', bar: 'bg-rose-500', text: 'text-rose-700' },
};

function StatusBadge({ value }: { value?: string | null }) {
  const cfg = STATUS_CONFIG[value || ''] || {
    badge: 'border-slate-200 bg-slate-100 text-slate-700',
    dot: 'bg-slate-400',
    label: labelify(value),
  };
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 text-[11px] font-bold ${cfg.badge}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${cfg.dot}`} />
      {cfg.label}
    </span>
  );
}

function LeadBadge({ value }: { value?: string | null }) {
  const cfg = LEAD_STAGE_MAP[value || ''] || {
    badge: 'border-slate-200 bg-slate-100 text-slate-700',
    bar: 'bg-slate-400',
    label: labelify(value),
    text: 'text-slate-600',
  };
  return (
    <span className={`inline-flex items-center rounded-md border px-2 py-0.5 text-[10.5px] font-bold ${cfg.badge}`}>
      {cfg.label}
    </span>
  );
}

function PaymentBadge({ value }: { value?: string | null }) {
  const isApproved = value === 'APPROVED' || value === 'PAID';
  const isRejected = value === 'REJECTED';
  const styles = isApproved
    ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
    : isRejected
      ? 'border-rose-200 bg-rose-50 text-rose-800'
      : 'border-amber-200 bg-amber-50 text-amber-800';

  return (
    <span className={`inline-flex items-center rounded-md border px-2 py-0.5 text-[10.5px] font-bold ${styles}`}>
      {labelify(value)}
    </span>
  );
}

function CopyPill({ label, text, className = '' }: { label?: string; text: string; className?: string }) {
  const [copied, setCopied] = useState(false);
  const handleCopy = () => {
    void navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1600);
  };

  return (
    <button
      type="button"
      onClick={handleCopy}
      title="Click to copy"
      className={`inline-flex items-center gap-1 rounded-md border border-slate-200 bg-slate-50 px-2 py-0.5 text-[11px] font-mono font-medium text-slate-700 transition hover:border-amber-400 hover:bg-amber-50/70 hover:text-amber-950 focus:outline-none ${className}`}
    >
      {label ? <span className="font-sans text-[10px] uppercase font-bold text-slate-400">{label}:</span> : null}
      <span className="truncate max-w-[140px] sm:max-w-[200px]">{text}</span>
      {copied ? <Check className="h-3 w-3 text-emerald-600 shrink-0" /> : <Copy className="h-3 w-3 text-slate-400 shrink-0" />}
    </button>
  );
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
    setActiveMediaIndex((current) =>
      direction === 'previous'
        ? current > 0 ? current - 1 : availableMedia.length - 1
        : current < availableMedia.length - 1 ? current + 1 : 0
    );
    setZoom(1);
  }, [availableMedia.length]);

  const scrollThumbnails = (direction: 'left' | 'right') => {
    thumbnailStripRef.current?.scrollBy({ left: direction === 'left' ? -220 : 220, behavior: 'smooth' });
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
      <div className="flex items-center justify-between rounded-xl border border-dashed border-slate-200 bg-slate-50/50 p-4 text-xs text-slate-500">
        <div className="flex items-center gap-2">
          <ImageIcon className="h-4 w-4 text-slate-400" />
          <span>No media uploaded for this listing yet.</span>
        </div>
      </div>
    );
  }

  const openLightboxAt = (index: number) => {
    setActiveMediaIndex(index);
    setZoom(1);
    setIsLightboxOpen(true);
  };

  return (
    <>
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5 text-xs font-bold text-slate-800">
            <ImageIcon className="h-4 w-4 text-amber-600" />
            <span>Listing Media Assets</span>
            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-600">
              {availableMedia.length} files
            </span>
          </div>
          {availableMedia.length > 5 ? (
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => scrollThumbnails('left')}
                className="flex h-6 w-6 items-center justify-center rounded-md border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 hover:text-slate-900"
                aria-label="Previous thumbnails"
              >
                <ChevronLeft className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                onClick={() => scrollThumbnails('right')}
                className="flex h-6 w-6 items-center justify-center rounded-md border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 hover:text-slate-900"
                aria-label="Next thumbnails"
              >
                <ChevronRight className="h-3.5 w-3.5" />
              </button>
            </div>
          ) : null}
        </div>

        <div
          ref={thumbnailStripRef}
          className="flex snap-x gap-2.5 overflow-x-auto pb-1 [scrollbar-width:thin] [&::-webkit-scrollbar]:h-1.5 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-slate-200"
        >
          {availableMedia.map((mediaItem, index) => {
            const isVideo = mediaItem.type.toUpperCase() === 'VIDEO';
            return (
              <button
                key={mediaItem.id}
                type="button"
                onClick={() => openLightboxAt(index)}
                className="group relative flex h-24 w-36 min-w-[144px] shrink-0 cursor-pointer snap-start overflow-hidden rounded-xl border border-slate-200/90 bg-slate-900 shadow-xs transition hover:border-amber-400 hover:shadow-sm focus:outline-none focus:ring-2 focus:ring-amber-400/40"
              >
                {isVideo ? (
                  <SafeRemoteVideo
                    src={getMediaSourceCandidates(mediaItem.url)[0]}
                    fallbackSrcs={getMediaSourceCandidates(mediaItem.url).slice(1)}
                    muted
                    playsInline
                    preload="metadata"
                    className="h-full w-full object-cover opacity-80 transition-transform duration-300 group-hover:scale-105"
                    onError={() => markMediaUnavailable(mediaItem.id)}
                  />
                ) : (
                  <SafeRemoteImage
                    src={getMediaSourceCandidates(mediaItem.url)[0]}
                    fallbackSrcs={getMediaSourceCandidates(mediaItem.url).slice(1)}
                    alt={mediaItem.slot || `Asset ${index + 1}`}
                    className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                    onError={() => markMediaUnavailable(mediaItem.id)}
                    fallback={<div className="flex h-full w-full items-center justify-center text-[10px] text-slate-400">Unavailable</div>}
                  />
                )}
                <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-black/25 opacity-75 group-hover:opacity-90 transition-opacity" />
                <div className="absolute left-1.5 top-1.5 flex items-center gap-1">
                  {mediaItem.isFeatured ? (
                    <span className="rounded bg-[#f7b500] px-1 py-0.25 text-[8.5px] font-black text-slate-950 uppercase">
                      Featured
                    </span>
                  ) : null}
                  <span className="rounded bg-black/60 px-1 py-0.25 text-[8.5px] font-bold text-white backdrop-blur-xs">
                    {isVideo ? 'Video' : 'Photo'}
                  </span>
                </div>
                {isVideo ? (
                  <div className="absolute inset-0 flex items-center justify-center">
                    <span className="flex h-7 w-7 items-center justify-center rounded-full bg-black/70 text-white backdrop-blur-xs transition-transform group-hover:scale-110">
                      <Play className="ml-0.5 h-3.5 w-3.5 fill-current" />
                    </span>
                  </div>
                ) : (
                  <div className="absolute bottom-1.5 right-1.5 opacity-0 transition-opacity group-hover:opacity-100">
                    <span className="flex h-6 w-6 items-center justify-center rounded-md bg-black/60 text-white">
                      <Maximize2 className="h-3 w-3" />
                    </span>
                  </div>
                )}
                <div className="absolute bottom-1.5 left-1.5 truncate text-[10px] font-semibold text-white/90">
                  {mediaItem.slot ? labelify(mediaItem.slot) : `#${index + 1}`}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {isLightboxOpen && activeMedia ? (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/95 p-3 backdrop-blur-sm sm:p-6"
          onClick={() => setIsLightboxOpen(false)}
          role="dialog"
          aria-modal="true"
        >
          <button
            type="button"
            onClick={() => setIsLightboxOpen(false)}
            className="absolute right-4 top-4 z-[110] flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-white transition hover:bg-white/20 focus:outline-none focus:ring-2 focus:ring-amber-400"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>

          <div className="relative flex h-full w-full max-w-6xl items-center justify-center" onClick={(e) => e.stopPropagation()}>
            {activeIsVideo ? (
              <SafeRemoteVideo
                src={getMediaSourceCandidates(activeMedia.url)[0]}
                fallbackSrcs={getMediaSourceCandidates(activeMedia.url).slice(1)}
                controls
                muted
                autoPlay
                playsInline
                className="max-h-[82vh] max-w-[92vw] object-contain rounded-lg"
                onError={() => markMediaUnavailable(activeMedia.id)}
              />
            ) : (
              <div className="flex h-full w-full items-center justify-center overflow-auto">
                <div className="origin-center transition-transform duration-200" style={{ transform: `scale(${zoom})` }}>
                  <SafeRemoteImage
                    src={getMediaSourceCandidates(activeMedia.url)[0]}
                    fallbackSrcs={getMediaSourceCandidates(activeMedia.url).slice(1)}
                    alt={activeMedia.slot || 'Listing media'}
                    className="max-h-[82vh] max-w-[92vw] object-contain rounded-lg shadow-2xl"
                    onError={() => markMediaUnavailable(activeMedia.id)}
                    fallback={<div className="p-8 text-slate-300 text-sm">Image unavailable</div>}
                  />
                </div>
              </div>
            )}

            {availableMedia.length > 1 ? (
              <>
                <button
                  type="button"
                  onClick={() => moveMedia('previous')}
                  className="absolute left-2 top-1/2 z-[110] flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full bg-white/10 text-white backdrop-blur-md hover:bg-white/25 focus:outline-none"
                  aria-label="Previous"
                >
                  <ChevronLeft className="h-5 w-5" />
                </button>
                <button
                  type="button"
                  onClick={() => moveMedia('next')}
                  className="absolute right-2 top-1/2 z-[110] flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full bg-white/10 text-white backdrop-blur-md hover:bg-white/25 focus:outline-none"
                  aria-label="Next"
                >
                  <ChevronRight className="h-5 w-5" />
                </button>
              </>
            ) : null}

            {!activeIsVideo ? (
              <div className="absolute bottom-3 left-1/2 z-[110] flex -translate-x-1/2 items-center gap-1.5 rounded-full bg-black/70 px-3 py-1 text-white backdrop-blur-md text-xs">
                <button
                  type="button"
                  onClick={() => setZoom((c) => Math.max(1, Number((c - 0.25).toFixed(2))))}
                  className="p-1 hover:text-amber-400"
                >
                  <ZoomOut className="h-4 w-4" />
                </button>
                <span className="min-w-10 text-center font-mono font-bold">{Math.round(zoom * 100)}%</span>
                <button
                  type="button"
                  onClick={() => setZoom((c) => Math.min(3, Number((c + 0.25).toFixed(2))))}
                  className="p-1 hover:text-amber-400"
                >
                  <ZoomIn className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={() => setZoom(1)}
                  className="ml-1 rounded px-1.5 py-0.5 text-[10px] font-bold bg-white/20 hover:bg-white/30"
                >
                  Reset
                </button>
              </div>
            ) : null}

            <span className="absolute bottom-3 left-4 z-[110] rounded-md bg-black/60 px-2 py-1 text-[11px] font-bold text-white backdrop-blur-md">
              {displayedActiveMediaIndex + 1} / {availableMedia.length}
            </span>
          </div>
        </div>
      ) : null}
    </>
  );
}

export default function AnalyticsListingDetail({ listingId, backHref }: { listingId: string; backHref: string }) {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const backUrl = useMemo(() => {
    const query = searchParams?.toString();
    return query ? `${backHref}?${query}` : backHref;
  }, [backHref, searchParams]);

  const [data, setData] = useState<ApiResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [page, setPage] = useState(1);
  const [leadStatusFilter, setLeadStatusFilter] = useState('ALL');
  const [leadSearch, setLeadSearch] = useState('');
  const [descExpanded, setDescExpanded] = useState(false);
  const PAGE_SIZE = 12;

  const load = useCallback(async (isRefresh = false) => {
    if (!isRefresh) setLoading(true);
    setError('');
    try {
      const resolvedListingId = (await resolveListingId(listingId)) || listingId;
      const response = await api.get<ApiResponse>(`/analytics/listings/${encodeURIComponent(resolvedListingId)}`);
      setData(response.data);
      setPage(1);
    } catch {
      setError('Could not load analytics for this listing. Please check connection and try again.');
    } finally {
      setLoading(false);
    }
  }, [listingId]);

  useEffect(() => {
    let active = true;
    queueMicrotask(() => {
      if (active) void load();
    });
    return () => {
      active = false;
    };
  }, [load]);

  const listing = data?.listing;

  useEffect(() => {
    if (!listing) return;
    const canonicalPath = generateAdminListingDetailPath(backHref, listing);
    if (pathname !== canonicalPath) router.replace(canonicalPath);
  }, [backHref, listing, pathname, router]);
  const recentLeads = useMemo(() => listing?.leads || [], [listing?.leads]);

  const leadSummary = data?.leadSummary || {
    total: recentLeads.length,
    active: recentLeads.filter((lead) => !['WON', 'LOST'].includes(lead.status)).length,
    won: recentLeads.filter((lead) => lead.status === 'WON').length,
    conversionRate: recentLeads.length
      ? Number(((recentLeads.filter((lead) => lead.status === 'WON').length / recentLeads.length) * 100).toFixed(1))
      : 0,
  };

  const leadBreakdown = useMemo(() => {
    if (data?.leadStatusBreakdown?.length) return data.leadStatusBreakdown;
    const counts = recentLeads.reduce<Record<string, number>>((acc, lead) => {
      acc[lead.status] = (acc[lead.status] || 0) + 1;
      return acc;
    }, {});
    return Object.entries(counts).map(([status, count]) => ({ status, count }));
  }, [data?.leadStatusBreakdown, recentLeads]);

  const totalLeadCount = leadSummary.total;
  const viewsTotal = (listing?.views || 0) + (listing?.trackedViews || 0);
  const trackedShare = viewsTotal > 0 ? Math.round(((listing?.trackedViews || 0) / viewsTotal) * 100) : 0;
  const paymentRecords = data?.payments || [];
  const location = [listing?.locationCity, listing?.locationState].filter(Boolean).join(', ');
  const partnerName =
    listing?.partner?.partnerProfile?.businessName ||
    listing?.partner?.partnerProfile?.ownerName ||
    listing?.partner?.name ||
    listing?.partner?.email ||
    'Partner not assigned';

  // Filtered leads
  const filteredLeads = useMemo(() => {
    return recentLeads.filter((lead) => {
      const matchesStatus = leadStatusFilter === 'ALL' || lead.status === leadStatusFilter;
      const q = leadSearch.trim().toLowerCase();
      const matchesSearch = !q || lead.id.toLowerCase().includes(q) || (lead.enquiryType || '').toLowerCase().includes(q);
      return matchesStatus && matchesSearch;
    });
  }, [recentLeads, leadStatusFilter, leadSearch]);

  const totalPages = Math.ceil(filteredLeads.length / PAGE_SIZE) || 1;
  const currentPage = Math.min(page, totalPages);
  const paginatedLeads = useMemo(
    () => filteredLeads.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE),
    [filteredLeads, currentPage, PAGE_SIZE]
  );
  const paginationItems = useMemo(() => buildPaginationItems(currentPage, totalPages), [currentPage, totalPages]);

  // Timeline chart data
  const trackedViewTimeline = data?.trackedViewTimeline;
  const timelineData = useMemo(() => {
    if (!trackedViewTimeline?.length) return [];
    return trackedViewTimeline.map((item) => {
      const parts = item.date.split('-');
      const shortDate = parts.length === 3 ? `${parts[2]}/${parts[1]}` : item.date;
      return {
        ...item,
        shortDate,
      };
    });
  }, [trackedViewTimeline]);

  // Sale price variance
  const saleRecord = listing?.saleRecord;
  const listingPrice = listing?.price;
  const saleVariance = useMemo(() => {
    if (!saleRecord || !listingPrice) return null;
    const diff = saleRecord.soldPrice - listingPrice;
    const pct = Number(((diff / listingPrice) * 100).toFixed(1));
    return { diff, pct };
  }, [saleRecord, listingPrice]);

  const mediaList = listing?.media || [];
  const photosCount = mediaList.filter((m) => m.type.toUpperCase() !== 'VIDEO').length;
  const videosCount = mediaList.filter((m) => m.type.toUpperCase() === 'VIDEO').length;

  return (
    <div className="w-full space-y-3 pb-8">
      {/* Top Breadcrumb & Control Bar */}
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-200/90 bg-white px-3.5 py-2.5 shadow-xs">
        <div className="flex flex-wrap items-center gap-2">
          <Link
            href={backUrl}
            className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-bold text-slate-700 transition hover:border-amber-400 hover:bg-amber-50 hover:text-amber-950 focus:outline-none"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            <span>Back</span>
          </Link>

          <span className="text-slate-300">/</span>

          <span className="text-xs font-bold text-slate-500">Analytics</span>

          <span className="text-slate-300">/</span>

          {listing ? (
            <>
              <CopyPill label="ID" text={listing.id} />
              <StatusBadge value={listing.status} />
              {listing.category?.name ? (
                <span className="inline-flex items-center rounded-md bg-amber-50 px-2 py-0.5 text-[11px] font-bold text-amber-900 border border-amber-200/70">
                  {listing.category.name}
                </span>
              ) : null}
            </>
          ) : (
            <span className="text-xs font-semibold text-slate-400">Loading details...</span>
          )}
        </div>

        <div className="flex items-center gap-2">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-0.5 text-[10.5px] font-bold text-emerald-700 border border-emerald-200/70">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
            Live Telemetry
          </span>
          <button
            type="button"
            onClick={() => void load(true)}
            className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-semibold text-slate-700 transition hover:bg-slate-100 hover:text-slate-900"
            title="Refresh analytics data"
          >
            <RefreshCw className="h-3 w-3" />
            <span className="hidden sm:inline">Sync</span>
          </button>
        </div>
      </div>

      {loading ? (
        <BrandLoader
          variant="section"
          size="md"
          bg="light"
          text="Aggregating listing intelligence & telemetry..."
          className="rounded-2xl border border-slate-200 bg-white p-12 shadow-xs"
        />
      ) : null}

      {!loading && error ? (
        <div role="alert" className="flex items-start gap-3 rounded-xl border border-rose-200 bg-rose-50 p-4 text-xs font-semibold text-rose-800">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-rose-600" />
          <div className="space-y-1">
            <p className="font-bold">Unable to load machine telemetry</p>
            <p className="text-rose-700">{error}</p>
          </div>
        </div>
      ) : null}

      {!loading && listing ? (
        <>
          {/* Header Hero Banner: Equipment Identity & Asking / Sold Valuation */}
          <section className="relative overflow-hidden rounded-2xl border border-slate-200/90 bg-white p-3.5 sm:p-4.5 shadow-xs">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
              {/* Left Machine Identity */}
              <div className="min-w-0 space-y-1.5">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-[10px] font-black uppercase tracking-wider text-amber-800 bg-amber-100/70 px-2 py-0.5 rounded">
                    Equipment Dossier
                  </span>
                  {listing.condition ? (
                    <span className="inline-flex items-center gap-1 rounded bg-slate-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-slate-700 border border-slate-200">
                      <Sparkles className="h-2.5 w-2.5 text-amber-500" />
                      {labelify(listing.condition)} Condition
                    </span>
                  ) : null}
                  {listing.operatingHours ? (
                    <span className="inline-flex items-center gap-1 rounded bg-blue-50 px-2 py-0.5 text-[10px] font-bold text-blue-700 border border-blue-100">
                      <Clock3 className="h-2.5 w-2.5 text-blue-500" />
                      {fmt(listing.operatingHours)} Hours
                    </span>
                  ) : null}
                </div>

                <h1 className="text-lg font-black tracking-tight text-slate-950 sm:text-2xl leading-snug break-words">
                  {listing.title}
                </h1>

                <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-600 font-medium">
                  <span className="font-bold text-slate-900">
                    {[listing.brand?.name, listing.model?.name, listing.manufacturingYear].filter(Boolean).join(' · ')}
                  </span>
                  <span className="inline-flex items-center gap-1 text-slate-500">
                    <MapPin className="h-3.5 w-3.5 text-amber-600 shrink-0" />
                    {location || 'Location unrecorded'}
                  </span>
                  <span className="inline-flex items-center gap-1 text-slate-500">
                    <Calendar className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                    Listed {fmtDate(listing.createdAt)} ({fmtRelativeTime(listing.createdAt)})
                  </span>
                </div>
              </div>

              {/* Right Commercial Valuation Card */}
              <div className="flex flex-wrap items-center gap-3 shrink-0 lg:flex-col lg:items-end lg:justify-center">
                <div className="rounded-xl border border-amber-200/90 bg-gradient-to-br from-amber-50/80 to-amber-100/40 px-4 py-2.5 text-left lg:text-right shadow-xs min-w-[200px]">
                  <div className="flex items-center justify-between lg:justify-end gap-2">
                    <span className="text-[10px] font-black uppercase tracking-wider text-amber-900/80">Asking Price</span>
                    <span className={`rounded px-1.5 py-0.25 text-[9px] font-black uppercase tracking-wider ${listing.isNegotiable ? 'bg-amber-200/80 text-amber-950' : 'bg-slate-200/80 text-slate-800'}`}>
                      {listing.isNegotiable ? 'Negotiable' : 'Fixed'}
                    </span>
                  </div>
                  <p className="mt-0.5 text-2xl font-black tracking-tight text-amber-950 font-mono">
                    {fmtCurrency(listing.price)}
                  </p>
                  {listing.saleRecord ? (
                    <div className="mt-1 pt-1.5 border-t border-amber-200/60 flex items-center justify-between lg:justify-end gap-2 text-[11px] font-bold">
                      <span className="text-emerald-700">Sold: {fmtCurrency(listing.saleRecord.soldPrice)}</span>
                      {saleVariance ? (
                        <span className={`text-[10px] font-black ${saleVariance.diff <= 0 ? 'text-emerald-800' : 'text-blue-800'}`}>
                          ({saleVariance.pct > 0 ? `+${saleVariance.pct}` : saleVariance.pct}%)
                        </span>
                      ) : null}
                    </div>
                  ) : (
                    <p className="mt-0.5 text-[10.5px] font-semibold text-amber-800/80">
                      Status: <span className="font-bold">{labelify(listing.status)}</span>
                    </p>
                  )}
                </div>
              </div>
            </div>
          </section>

          {/* High-Density 6-KPI Velocity Strip */}
          <section className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-6">
            {/* 1. Total Impressions */}
            <article className="rounded-xl border border-slate-200/90 bg-white p-3 shadow-xs transition hover:border-slate-300">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Total Views</span>
                <span className="flex h-6 w-6 items-center justify-center rounded-md bg-amber-50 text-amber-700">
                  <Eye className="h-3.5 w-3.5" />
                </span>
              </div>
              <p className="mt-2 text-xl font-black tracking-tight text-slate-950 font-mono">
                {fmt(viewsTotal)}
              </p>
              <div className="mt-1 flex items-center justify-between text-[10.5px] text-slate-500 font-medium">
                <span>{fmt(listing.trackedViews)} events</span>
                <span className="font-bold text-amber-800">{trackedShare}% tracked</span>
              </div>
            </article>

            {/* 2. Unique Visitors */}
            <article className="rounded-xl border border-slate-200/90 bg-white p-3 shadow-xs transition hover:border-slate-300">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Unique Visitors</span>
                <span className="flex h-6 w-6 items-center justify-center rounded-md bg-emerald-50 text-emerald-700">
                  <Users className="h-3.5 w-3.5" />
                </span>
              </div>
              <p className="mt-2 text-xl font-black tracking-tight text-slate-950 font-mono">
                {fmt(data?.availability.uniqueViews)}
              </p>
              <p className="mt-1 text-[10.5px] font-medium text-emerald-700 truncate">
                {viewsTotal > 0 ? `${Math.round(((data?.availability.uniqueViews || 0) / Math.max(viewsTotal, 1)) * 100)}% of impressions` : 'Distinct sessions'}
              </p>
            </article>

            {/* 3. Total Leads */}
            <article className="rounded-xl border border-slate-200/90 bg-white p-3 shadow-xs transition hover:border-slate-300">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Inquiries / Leads</span>
                <span className="flex h-6 w-6 items-center justify-center rounded-md bg-blue-50 text-blue-700">
                  <UsersRound className="h-3.5 w-3.5" />
                </span>
              </div>
              <p className="mt-2 text-xl font-black tracking-tight text-slate-950 font-mono">
                {fmt(totalLeadCount)}
              </p>
              <p className="mt-1 text-[10.5px] font-medium text-blue-700">
                <strong className="font-bold">{fmt(leadSummary.active)}</strong> active pipeline
              </p>
            </article>

            {/* 4. Deals Won */}
            <article className="rounded-xl border border-slate-200/90 bg-white p-3 shadow-xs transition hover:border-slate-300">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Deals Closed</span>
                <span className="flex h-6 w-6 items-center justify-center rounded-md bg-purple-50 text-purple-700">
                  <Award className="h-3.5 w-3.5" />
                </span>
              </div>
              <p className="mt-2 text-xl font-black tracking-tight text-slate-950 font-mono">
                {fmt(leadSummary.won)}
              </p>
              <p className="mt-1 text-[10.5px] font-medium text-purple-700">
                <strong className="font-bold">{leadSummary.conversionRate}%</strong> win rate
              </p>
            </article>

            {/* 5. Media Assets */}
            <article className="rounded-xl border border-slate-200/90 bg-white p-3 shadow-xs transition hover:border-slate-300">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Media Assets</span>
                <span className="flex h-6 w-6 items-center justify-center rounded-md bg-indigo-50 text-indigo-700">
                  <ImageIcon className="h-3.5 w-3.5" />
                </span>
              </div>
              <p className="mt-2 text-xl font-black tracking-tight text-slate-950 font-mono">
                {fmt(mediaList.length)}
              </p>
              <p className="mt-1 text-[10.5px] font-medium text-slate-500">
                {photosCount} photos · {videosCount} videos
              </p>
            </article>

            {/* 6. Commercial Status */}
            <article className="rounded-xl border border-slate-200/90 bg-white p-3 shadow-xs transition hover:border-slate-300">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Commercial State</span>
                <span className="flex h-6 w-6 items-center justify-center rounded-md bg-emerald-50 text-emerald-700">
                  <WalletCards className="h-3.5 w-3.5" />
                </span>
              </div>
              <p className="mt-2 text-base font-black tracking-tight text-slate-950 truncate">
                {listing.saleRecord ? 'Closed / Sold' : paymentRecords.length ? `${paymentRecords.length} Submissions` : 'Available'}
              </p>
              <p className="mt-1 text-[10.5px] font-medium text-slate-500 truncate">
                {listing.saleRecord ? `Sold on ${fmtDate(listing.saleRecord.soldAt)}` : `${paymentRecords.filter((p) => p.status === 'APPROVED' || p.status === 'PAID').length} approved payments`}
              </p>
            </article>
          </section>

          {/* Traffic Velocity & Timeline Area Chart */}
          {timelineData.length > 0 ? (
            <section className="rounded-2xl border border-slate-200/90 bg-white p-3.5 sm:p-4 shadow-xs">
              <div className="flex flex-wrap items-center justify-between gap-2 pb-2 border-b border-slate-100">
                <div className="flex items-center gap-2">
                  <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-amber-50 text-amber-700">
                    <TrendingUp className="h-4 w-4" />
                  </span>
                  <div>
                    <h2 className="text-xs font-black uppercase tracking-wider text-slate-900">Traffic Velocity & Daily Views Timeline</h2>
                    <p className="text-[11px] text-slate-500">Daily buyer activity trends recorded from high-confidence telemetry events</p>
                  </div>
                </div>
                <div className="flex items-center gap-2 text-xs">
                  <span className="rounded-md bg-slate-100 px-2.5 py-1 text-[11px] font-bold text-slate-700">
                    {data?.availability.sampledTrackedViewEvents || timelineData.reduce((acc, curr) => acc + curr.count, 0)} total timeline views
                  </span>
                  <span className="rounded-md bg-amber-50 px-2.5 py-1 text-[11px] font-bold text-amber-800 border border-amber-200/60">
                    {timelineData.length} active dates
                  </span>
                </div>
              </div>

              <div className="mt-3 h-44 sm:h-52 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={timelineData} margin={{ top: 8, right: 10, left: -24, bottom: 0 }}>
                    <defs>
                      <linearGradient id="viewTimelineGradient" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#f59e0b" stopOpacity={0.4} />
                        <stop offset="95%" stopColor="#f59e0b" stopOpacity={0.02} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                    <XAxis
                      dataKey="shortDate"
                      tick={{ fontSize: 10, fill: '#64748b', fontWeight: 600 }}
                      axisLine={{ stroke: '#e2e8f0' }}
                      tickLine={false}
                    />
                    <YAxis
                      allowDecimals={false}
                      tick={{ fontSize: 10, fill: '#64748b', fontWeight: 600 }}
                      axisLine={false}
                      tickLine={false}
                    />
                    <RechartsTooltip
                      content={({ active, payload }) => {
                        if (!active || !payload?.length) return null;
                        const row = payload[0].payload as { date: string; count: number };
                        return (
                          <div className="rounded-lg border border-slate-200 bg-white/95 px-3 py-2 shadow-lg backdrop-blur-xs text-xs">
                            <p className="font-bold text-slate-900">{fmtDate(row.date)}</p>
                            <p className="mt-1 font-mono font-bold text-amber-700">
                              {fmt(row.count)} <span className="text-slate-500 font-sans font-normal">views recorded</span>
                            </p>
                          </div>
                        );
                      }}
                    />
                    <Area
                      type="monotone"
                      dataKey="count"
                      stroke="#d97706"
                      strokeWidth={2.5}
                      fill="url(#viewTimelineGradient)"
                      activeDot={{ r: 5, fill: '#d97706', stroke: '#fff', strokeWidth: 2 }}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </section>
          ) : null}

          {/* Main 12-Column High-Density Workstation */}
          <div className="grid gap-3 xl:grid-cols-12 items-start">
            {/* LEFT COLUMN: 8 COLS (Technical Dossier, Descriptions, Media Showcase & Leads Table) */}
            <div className="space-y-3 xl:col-span-8">
              {/* Technical Specifications Sheet */}
              <section className="rounded-2xl border border-slate-200/90 bg-white p-3.5 sm:p-4 shadow-xs">
                <div className="flex items-center justify-between pb-2.5 border-b border-slate-100">
                  <div className="flex items-center gap-2">
                    <span className="flex h-6 w-6 items-center justify-center rounded-md bg-amber-50 text-amber-700">
                      <PackageCheck className="h-3.5 w-3.5" />
                    </span>
                    <h2 className="text-xs font-black uppercase tracking-wider text-slate-900">Machine Specifications & Record</h2>
                  </div>
                  <span className="text-[11px] font-semibold text-slate-500">
                    Updated {fmtDateTime(listing.updatedAt)}
                  </span>
                </div>

                {/* Dense Spec Grid */}
                <div className="mt-3 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2 text-xs">
                  <div className="rounded-xl border border-slate-100 bg-slate-50/70 p-2.5">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Category</p>
                    <p className="mt-1 font-bold text-slate-900 truncate">{displayValue(listing.category?.name)}</p>
                  </div>
                  <div className="rounded-xl border border-slate-100 bg-slate-50/70 p-2.5">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">OEM / Brand</p>
                    <p className="mt-1 font-bold text-slate-900 truncate">{displayValue(listing.brand?.name)}</p>
                  </div>
                  <div className="rounded-xl border border-slate-100 bg-slate-50/70 p-2.5">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Model Name</p>
                    <p className="mt-1 font-bold text-slate-900 truncate">{displayValue(listing.model?.name)}</p>
                  </div>
                  <div className="rounded-xl border border-slate-100 bg-slate-50/70 p-2.5">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Manufacture Year</p>
                    <p className="mt-1 font-mono font-bold text-slate-900">{displayValue(listing.manufacturingYear)}</p>
                  </div>
                  <div className="rounded-xl border border-slate-100 bg-slate-50/70 p-2.5">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Operating Hours</p>
                    <p className="mt-1 font-mono font-bold text-slate-900">
                      {listing.operatingHours ? `${fmt(listing.operatingHours)} hrs` : '—'}
                    </p>
                  </div>
                  <div className="rounded-xl border border-slate-100 bg-slate-50/70 p-2.5">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Horse Power / Engine</p>
                    <p className="mt-1 font-mono font-bold text-slate-900">
                      {listing.grossPower ? `${listing.grossPower} HP` : '—'}
                    </p>
                  </div>
                  <div className="rounded-xl border border-slate-100 bg-slate-50/70 p-2.5">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Condition Grade</p>
                    <p className="mt-1 font-bold text-slate-900">{labelify(listing.condition)}</p>
                  </div>
                  <div className="rounded-xl border border-slate-100 bg-slate-50/70 p-2.5">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Contact Mode</p>
                    <p className="mt-1 font-bold text-slate-900">{labelify(listing.contactMode)}</p>
                  </div>
                  <div className="rounded-xl border border-slate-100 bg-slate-50/70 p-2.5">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">City</p>
                    <p className="mt-1 font-bold text-slate-900 truncate">{displayValue(listing.locationCity)}</p>
                  </div>
                  <div className="rounded-xl border border-slate-100 bg-slate-50/70 p-2.5">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">State / Region</p>
                    <p className="mt-1 font-bold text-slate-900 truncate">{displayValue(listing.locationState)}</p>
                  </div>
                  <div className="col-span-2 rounded-xl border border-slate-100 bg-slate-50/70 p-2.5">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Registered Address</p>
                    <p className="mt-1 font-semibold text-slate-800 truncate" title={listing.address || ''}>
                      {displayValue(listing.address)}
                    </p>
                  </div>
                </div>

                {/* Description & Inspector Notes */}
                {listing.description || listing.additionalDescription ? (
                  <div className="mt-3 pt-3 border-t border-slate-100 space-y-2.5">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-black uppercase tracking-wider text-slate-500">
                        Description & Condition Notes
                      </span>
                      {(listing.description?.length || 0) > 280 || (listing.additionalDescription?.length || 0) > 280 ? (
                        <button
                          type="button"
                          onClick={() => setDescExpanded(!descExpanded)}
                          className="inline-flex items-center gap-1 text-[11px] font-bold text-amber-700 hover:text-amber-800"
                        >
                          {descExpanded ? (
                            <>
                              <span>Collapse notes</span>
                              <ChevronUp className="h-3.5 w-3.5" />
                            </>
                          ) : (
                            <>
                              <span>Read full description</span>
                              <ChevronDown className="h-3.5 w-3.5" />
                            </>
                          )}
                        </button>
                      ) : null}
                    </div>

                    <div className="grid gap-2.5 sm:grid-cols-2 text-xs">
                      {listing.description ? (
                        <div className="rounded-xl border border-amber-200/70 bg-amber-50/30 p-3">
                          <p className="text-[10px] font-bold uppercase tracking-wider text-amber-800">Primary Description</p>
                          <p className={`mt-1.5 whitespace-pre-wrap leading-relaxed text-slate-800 font-medium ${!descExpanded && listing.description.length > 280 ? 'line-clamp-4' : ''}`}>
                            {listing.description}
                          </p>
                        </div>
                      ) : null}

                      {listing.additionalDescription ? (
                        <div className="rounded-xl border border-slate-200/80 bg-slate-50/50 p-3">
                          <p className="text-[10px] font-bold uppercase tracking-wider text-slate-600">Technical & Inspection Notes</p>
                          <p className={`mt-1.5 whitespace-pre-wrap leading-relaxed text-slate-700 font-medium ${!descExpanded && listing.additionalDescription.length > 280 ? 'line-clamp-4' : ''}`}>
                            {listing.additionalDescription}
                          </p>
                        </div>
                      ) : null}
                    </div>
                  </div>
                ) : null}
              </section>

              {/* Media Asset Showcase Strip */}
              <section className="rounded-2xl border border-slate-200/90 bg-white p-3.5 sm:p-4 shadow-xs">
                <AnalyticsMediaGallery media={listing.media} />
              </section>

              {/* Buyer Enquiries & Lead Timeline (Full Data Table) */}
              <section className="rounded-2xl border border-slate-200/90 bg-white p-3.5 sm:p-4 shadow-xs">
                {/* Header with Search and Filter pills */}
                <div className="flex flex-col gap-2.5 sm:flex-row sm:items-center sm:justify-between pb-3 border-b border-slate-100">
                  <div className="flex items-center gap-2">
                    <span className="flex h-6 w-6 items-center justify-center rounded-md bg-blue-50 text-blue-700">
                      <Users className="h-3.5 w-3.5" />
                    </span>
                    <div>
                      <h2 className="text-xs font-black uppercase tracking-wider text-slate-900">Buyer Inquiries & Leads Log</h2>
                      <p className="text-[11px] text-slate-500">
                        {fmt(recentLeads.length)} total inquiries recorded ({filteredLeads.length} matching filter)
                      </p>
                    </div>
                  </div>

                  {/* Search Input */}
                  <div className="flex items-center gap-2">
                    <div className="relative min-w-[160px] sm:min-w-[200px]">
                      <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
                      <input
                        type="text"
                        value={leadSearch}
                        onChange={(e) => {
                          setLeadSearch(e.target.value);
                          setPage(1);
                        }}
                        placeholder="Search lead ID / type..."
                        className="w-full rounded-lg border border-slate-200 bg-slate-50/70 pl-8 pr-2.5 py-1 text-xs text-slate-800 placeholder:text-slate-400 focus:border-amber-400 focus:bg-white focus:outline-none"
                      />
                      {leadSearch ? (
                        <button
                          type="button"
                          onClick={() => setLeadSearch('')}
                          className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      ) : null}
                    </div>
                  </div>
                </div>

                {/* Status Quick-Filter Chips */}
                <div className="mt-2.5 flex flex-wrap items-center gap-1.5 pb-2.5">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mr-1 flex items-center gap-1">
                    <Filter className="h-3 w-3" />
                    Status:
                  </span>
                  {[
                    { key: 'ALL', label: `All (${recentLeads.length})` },
                    ...leadBreakdown.map((b) => ({
                      key: b.status,
                      label: `${labelify(b.status)} (${b.count})`,
                    })),
                  ].map((filterTab) => {
                    const isActive = leadStatusFilter === filterTab.key;
                    return (
                      <button
                        key={filterTab.key}
                        type="button"
                        onClick={() => {
                          setLeadStatusFilter(filterTab.key);
                          setPage(1);
                        }}
                        className={`rounded-md px-2 py-0.5 text-[10.5px] font-bold transition ${
                          isActive
                            ? 'bg-[#f7b500] text-slate-950 shadow-xs'
                            : 'bg-slate-100 text-slate-600 hover:bg-slate-200/80 hover:text-slate-900'
                        }`}
                      >
                        {filterTab.label}
                      </button>
                    );
                  })}
                </div>

                {/* Table */}
                {paginatedLeads.length ? (
                  <div className="overflow-x-auto rounded-xl border border-slate-200/80">
                    <table className="w-full min-w-[620px] text-left text-xs">
                      <thead className="bg-slate-50 border-b border-slate-200 text-[10px] font-black uppercase tracking-wider text-slate-500">
                        <tr>
                          <th className="px-3.5 py-2">Lead ID</th>
                          <th className="px-3.5 py-2">Pipeline Status</th>
                          <th className="px-3.5 py-2">Enquiry Category</th>
                          <th className="px-3.5 py-2">Created Date</th>
                          <th className="px-3.5 py-2">Last Updated</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 bg-white">
                        {paginatedLeads.map((lead) => (
                          <tr key={lead.id} className="transition hover:bg-amber-50/30">
                            <td className="px-3.5 py-2">
                              <CopyPill text={lead.id} />
                            </td>
                            <td className="px-3.5 py-2">
                              <LeadBadge value={lead.status} />
                            </td>
                            <td className="px-3.5 py-2 font-semibold text-slate-800">
                              {labelify(lead.enquiryType)}
                            </td>
                            <td className="whitespace-nowrap px-3.5 py-2 text-slate-600">
                              <div className="font-semibold text-slate-800">{fmtDate(lead.createdAt)}</div>
                              <div className="text-[10px] text-slate-400">{fmtRelativeTime(lead.createdAt)}</div>
                            </td>
                            <td className="whitespace-nowrap px-3.5 py-2 text-slate-500 font-medium">
                              {fmtDateTime(lead.updatedAt)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-slate-200 bg-slate-50/50 py-8 text-center text-xs text-slate-500">
                    <Users className="h-6 w-6 text-slate-300 mb-1.5" />
                    <p className="font-bold text-slate-700">No matching inquiries</p>
                    <p className="text-slate-400">No lead records found matching the active search or status filter.</p>
                  </div>
                )}

                {/* Pagination footer */}
                {filteredLeads.length > PAGE_SIZE ? (
                  <div className="mt-2.5 flex flex-col gap-2 pt-2 border-t border-slate-100 sm:flex-row sm:items-center sm:justify-between text-xs text-slate-600">
                    <span>
                      Showing <strong className="text-slate-900">{(currentPage - 1) * PAGE_SIZE + 1}</strong> to{' '}
                      <strong className="text-slate-900">{Math.min(currentPage * PAGE_SIZE, filteredLeads.length)}</strong> of{' '}
                      <strong className="text-slate-900">{filteredLeads.length}</strong> inquiries
                    </span>

                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => setPage((c) => Math.max(1, c - 1))}
                        disabled={currentPage === 1}
                        className="rounded-md border border-slate-200 bg-white px-2 py-1 text-xs font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-40"
                      >
                        Prev
                      </button>
                      {paginationItems.map((item, index) =>
                        typeof item === 'number' ? (
                          <button
                            key={item}
                            type="button"
                            onClick={() => setPage(item)}
                            className={`h-7 min-w-7 rounded-md px-1.5 text-xs font-bold transition ${
                              item === currentPage
                                ? 'bg-[#f7b500] text-slate-950 font-black'
                                : 'text-slate-600 hover:bg-slate-100'
                            }`}
                          >
                            {item}
                          </button>
                        ) : (
                          <span key={`el-${index}`} className="px-1 text-slate-400">
                            …
                          </span>
                        )
                      )}
                      <button
                        type="button"
                        onClick={() => setPage((c) => Math.min(totalPages, c + 1))}
                        disabled={currentPage === totalPages}
                        className="rounded-md border border-slate-200 bg-white px-2 py-1 text-xs font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-40"
                      >
                        Next
                      </button>
                    </div>
                  </div>
                ) : null}
              </section>
            </div>

            {/* RIGHT COLUMN: 4 COLS (Commercial & Sale Record, Pipeline Funnel, Dealer Dossier, Quality Audit) */}
            <div className="space-y-3 xl:col-span-4">
              {/* Commercial & Sale Outcome Card */}
              <section className="rounded-2xl border border-slate-200/90 bg-white p-3.5 sm:p-4 shadow-xs">
                <div className="flex items-center justify-between pb-2.5 border-b border-slate-100">
                  <div className="flex items-center gap-2">
                    <span className="flex h-6 w-6 items-center justify-center rounded-md bg-emerald-50 text-emerald-700">
                      <DollarSign className="h-3.5 w-3.5" />
                    </span>
                    <h2 className="text-xs font-black uppercase tracking-wider text-slate-900">Commercial & Financials</h2>
                  </div>
                  <span className="rounded-md bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-600">
                    {paymentRecords.length} records
                  </span>
                </div>

                <div className="mt-3 space-y-2.5">
                  {/* Valuation summary */}
                  <div className="rounded-xl border border-slate-200/80 bg-slate-50/70 p-3">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Listed Price</span>
                      <span className="font-mono text-sm font-bold text-slate-900">{fmtCurrency(listing.price)}</span>
                    </div>

                    {listing.saleRecord ? (
                      <>
                        <div className="mt-2 flex items-center justify-between pt-2 border-t border-slate-200">
                          <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-700">Closed Sale Price</span>
                          <span className="font-mono text-base font-black text-emerald-700">
                            {fmtCurrency(listing.saleRecord.soldPrice)}
                          </span>
                        </div>
                        <div className="mt-1 flex items-center justify-between text-[11px] text-slate-500">
                          <span>Sold Date: {fmtDate(listing.saleRecord.soldAt)}</span>
                          {saleVariance ? (
                            <span className={`font-bold ${saleVariance.diff <= 0 ? 'text-emerald-700' : 'text-blue-700'}`}>
                              {saleVariance.diff <= 0 ? 'Discount:' : 'Premium:'} {fmtCurrency(Math.abs(saleVariance.diff))} ({saleVariance.pct}%)
                            </span>
                          ) : null}
                        </div>
                        {listing.saleRecord.invoiceNo ? (
                          <div className="mt-2 flex items-center justify-between text-[11px] pt-1.5 border-t border-slate-100">
                            <span className="text-slate-500">Invoice:</span>
                            <span className="font-mono font-bold text-slate-800">{listing.saleRecord.invoiceNo}</span>
                          </div>
                        ) : null}
                      </>
                    ) : (
                      <div className="mt-2 flex items-center justify-between pt-2 border-t border-slate-200/80 text-[11px] text-slate-500">
                        <span>Sale Status:</span>
                        <span className="font-bold text-amber-700">Active in Marketplace</span>
                      </div>
                    )}
                  </div>

                  {/* Payment Submissions List */}
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1.5">
                      Payment Submissions ({paymentRecords.length})
                    </p>
                    {paymentRecords.length ? (
                      <div className="space-y-1.5 max-h-[220px] overflow-y-auto pr-1 [scrollbar-width:thin]">
                        {paymentRecords.map((pay) => (
                          <div key={pay.id} className="rounded-lg border border-slate-200/90 bg-white p-2.5 shadow-2xs text-xs">
                            <div className="flex items-center justify-between">
                              <span className="font-bold text-slate-900">{labelify(pay.method)}</span>
                              <div className="text-right">
                                <span className="font-mono font-bold text-slate-900">{fmtCurrency(pay.amount)}</span>
                                <div className="mt-0.5">
                                  <PaymentBadge value={pay.status} />
                                </div>
                              </div>
                            </div>
                            {pay.transactionRef ? (
                              <p className="mt-1 text-[10.5px] font-mono text-slate-500 truncate">
                                Ref: {pay.transactionRef}
                              </p>
                            ) : null}
                            <div className="mt-1 flex items-center justify-between text-[10px] text-slate-400">
                              <span>Submitted: {fmtDate(pay.submittedAt)}</span>
                              {pay.reviewedAt ? <span>Reviewed: {fmtDate(pay.reviewedAt)}</span> : null}
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="rounded-lg border border-dashed border-slate-200 bg-slate-50/50 p-3 text-center text-xs text-slate-400">
                        No payment submissions recorded for this listing.
                      </div>
                    )}
                  </div>
                </div>
              </section>

              {/* Lead Conversion Funnel & Pipeline Health */}
              <section className="rounded-2xl border border-slate-200/90 bg-white p-3.5 sm:p-4 shadow-xs">
                <div className="flex items-center justify-between pb-2.5 border-b border-slate-100">
                  <div className="flex items-center gap-2">
                    <span className="flex h-6 w-6 items-center justify-center rounded-md bg-purple-50 text-purple-700">
                      <BarChart3 className="h-3.5 w-3.5" />
                    </span>
                    <h2 className="text-xs font-black uppercase tracking-wider text-slate-900">Pipeline Funnel Health</h2>
                  </div>
                  <span className="text-[11px] font-bold text-purple-700">
                    {leadSummary.won} Won · {leadSummary.conversionRate}%
                  </span>
                </div>

                <div className="mt-3 space-y-2.5">
                  {/* Status distribution bars */}
                  {leadBreakdown.length ? (
                    <div className="space-y-2">
                      {leadBreakdown.map((item) => {
                        const pct = totalLeadCount ? Math.round((item.count / totalLeadCount) * 100) : 0;
                        const cfg = LEAD_STAGE_MAP[item.status] || {
                          label: labelify(item.status),
                          bar: 'bg-slate-400',
                          text: 'text-slate-600',
                          badge: 'border-slate-200 bg-slate-100 text-slate-700',
                        };
                        return (
                          <div key={item.status} className="space-y-1">
                            <div className="flex items-center justify-between text-xs">
                              <span className="font-bold text-slate-700">{cfg.label}</span>
                              <span className="font-mono text-slate-600">
                                <strong className="font-bold text-slate-900">{fmt(item.count)}</strong>{' '}
                                <span className="text-[10.5px] text-slate-400">({pct}%)</span>
                              </span>
                            </div>
                            <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
                              <div className={`h-full rounded-full ${cfg.bar}`} style={{ width: `${pct}%` }} />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="rounded-lg border border-dashed border-slate-200 bg-slate-50/50 p-3 text-center text-xs text-slate-400">
                      No lead breakdown data available yet.
                    </div>
                  )}

                  {/* Pipeline Metric Chips */}
                  <div className="mt-3 grid grid-cols-3 gap-1.5 pt-2 border-t border-slate-100 text-center">
                    <div className="rounded-lg bg-blue-50/70 p-2 border border-blue-100/60">
                      <p className="text-[9.5px] font-bold uppercase tracking-wider text-blue-700">Active</p>
                      <p className="mt-0.5 font-mono text-sm font-black text-blue-900">{leadSummary.active}</p>
                    </div>
                    <div className="rounded-lg bg-emerald-50/70 p-2 border border-emerald-100/60">
                      <p className="text-[9.5px] font-bold uppercase tracking-wider text-emerald-700">Won</p>
                      <p className="mt-0.5 font-mono text-sm font-black text-emerald-900">{leadSummary.won}</p>
                    </div>
                    <div className="rounded-lg bg-slate-100/80 p-2 border border-slate-200/60">
                      <p className="text-[9.5px] font-bold uppercase tracking-wider text-slate-600">Closed/Lost</p>
                      <p className="mt-0.5 font-mono text-sm font-black text-slate-900">
                        {Math.max(totalLeadCount - leadSummary.active - leadSummary.won, 0)}
                      </p>
                    </div>
                  </div>
                </div>
              </section>

              {/* Dealer / Source Account Dossier */}
              <section className="rounded-2xl border border-slate-200/90 bg-white p-3.5 sm:p-4 shadow-xs">
                <div className="flex items-center justify-between pb-2.5 border-b border-slate-100">
                  <div className="flex items-center gap-2">
                    <span className="flex h-6 w-6 items-center justify-center rounded-md bg-amber-50 text-amber-700">
                      <Building2 className="h-3.5 w-3.5" />
                    </span>
                    <h2 className="text-xs font-black uppercase tracking-wider text-slate-900">Dealer & Origin Account</h2>
                  </div>
                  {listing.partner?.id ? <CopyPill label="UID" text={listing.partner.id} /> : null}
                </div>

                <div className="mt-3 space-y-2 text-xs">
                  <div className="rounded-xl border border-slate-100 bg-slate-50/70 p-2.5">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Business / Dealership Name</p>
                    <p className="mt-1 font-bold text-slate-900">{partnerName}</p>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div className="rounded-xl border border-slate-100 bg-slate-50/70 p-2.5">
                      <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Contact Person</p>
                      <p className="mt-1 font-bold text-slate-900 truncate">
                        {displayValue(listing.partner?.partnerProfile?.ownerName || listing.partner?.name)}
                      </p>
                    </div>
                    <div className="rounded-xl border border-slate-100 bg-slate-50/70 p-2.5">
                      <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Partner Role</p>
                      <p className="mt-1 font-bold text-slate-900 truncate">
                        {displayValue(listing.partner?.partnerProfile?.partnerType || listing.partner?.role)}
                      </p>
                    </div>
                  </div>

                  <div className="rounded-xl border border-slate-100 bg-slate-50/70 p-2.5">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Registered Email</p>
                    <p className="mt-1 font-mono font-semibold text-slate-800 truncate">
                      {displayValue(listing.partner?.email)}
                    </p>
                  </div>

                  <div className="flex items-center justify-between rounded-xl border border-slate-100 bg-slate-50/70 p-2.5 text-[11px]">
                    <span className="font-bold text-slate-500">Contact Preference:</span>
                    <span className="font-bold text-amber-800">
                      {displayValue(listing.partner?.partnerProfile?.contactPreference || listing.contactMode)}
                    </span>
                  </div>
                </div>
              </section>

              {/* Data Quality & Auditing Strip */}
              <section className="rounded-2xl border border-slate-200/90 bg-white p-3.5 sm:p-4 shadow-xs">
                <div className="flex items-center gap-2 pb-2 border-b border-slate-100">
                  <span className="flex h-6 w-6 items-center justify-center rounded-md bg-slate-100 text-slate-700">
                    <ShieldCheck className="h-3.5 w-3.5" />
                  </span>
                  <h2 className="text-xs font-black uppercase tracking-wider text-slate-900">Data Integrity & Audit</h2>
                </div>

                <div className="mt-2.5 space-y-1.5 text-xs text-slate-600">
                  <div className="flex items-center justify-between text-[11px]">
                    <span>Sampled Durable Events:</span>
                    <span className="font-mono font-bold text-slate-900">
                      {fmt(data?.availability.sampledTrackedViewEvents)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-[11px]">
                    <span>Active Telemetry Days:</span>
                    <span className="font-mono font-bold text-slate-900">
                      {data?.availability.trackedViewTimelineDays ?? '—'}
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-[11px]">
                    <span>Tracking Model:</span>
                    <span className="font-bold text-emerald-700">Durable Event Sink</span>
                  </div>
                </div>
              </section>
            </div>
          </div>
        </>
      ) : null}
    </div>
  );
}
