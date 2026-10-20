'use client';

import { useEffect, useState, useMemo, useCallback } from 'react';
import Link from 'next/link';
import axios from 'axios';
import api from '@/lib/api';
import { getDashboardCards } from '@/lib/dashboardCardLinks';
import {
  Users,
  ClipboardList,
  Package,
  CheckCircle2,
  MessageSquare,
  Heart,
  ShieldCheck,
  Truck,
  AlertCircle,
  ArrowUpRight,
  ArrowDownLeft,
  ArrowRight,
  Search,
  RefreshCw,
  Clock,
  CarFront,
  ScanLine,
  Smartphone,
  MessageCircle,
  WalletCards,
  Repeat,
  Briefcase,
  TrendingUp,
  Sparkles,
  Building2,
  ExternalLink,
  ChevronRight,
  Filter,
  Check,
  UserCheck,
  X,
  BadgeIndianRupee,
  Landmark,
  Receipt,
  Scale,
  Award,
  Activity,
  FileCheck,
  History,
  Flame,
  Zap,
} from 'lucide-react';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
} from 'recharts';

interface DashboardStats {
  totalPartners: number;
  approvedPartners: number;
  pendingKyc: number;
  activeListings: number;
  totalEnquiries: number;
  pendingListings?: number;
  totalCustomers?: number;
}

interface DashboardBadges {
  enquiries: number;
  verifications: number;
  visitors: number;
  recurrence: number;
  listingsPendingApproval: number;
  recruitmentApplications: number;
  recruitmentInterviews: number;
}

interface GraphData {
  name: string;
  partners: number;
  listings: number;
  income?: number;
  expense?: number;
}

interface CategoryBreakdown {
  name: string;
  value: number;
}

interface RecentApplication {
  id: string;
  name: string;
  email: string;
  mobile: string;
  partnerType: string;
  kycStatus: string;
  onboardingStatus: string;
  createdAt: string;
}

interface RecentListing {
  id: string;
  title: string;
  price: number;
  status: string;
  categoryName: string;
  brandName: string;
  createdAt: string;
}

interface RecentEnquiry {
  id: string;
  enquiryType: string;
  status: string;
  listingTitle: string;
  customerName: string;
  createdAt: string;
}

interface FinanceTransactionItem {
  id: string;
  date: string;
  name: string;
  category: string;
  type: 'CREDIT' | 'DEBIT';
  amount: number;
  paymentMethod: string;
  accountName: string;
}

interface FinanceOverview {
  totalRevenue: number;
  totalExpenses: number;
  netProfit: number;
  dealVolume: number;
  dealsCount: number;
  dealProfit: number;
  primeRevenue: number;
  primeCount: number;
  apiWalletBalance: number;
  recentTransactions: FinanceTransactionItem[];
}

// ── 9 Specialized Intelligence Interfaces ──
interface MarketplaceIntelligence {
  topBrands: Array<{ name: string; listings: number }>;
  priceTiers: Array<{ label: string; count: number }>;
  topStates: Array<{ name: string; count: number }>;
}

interface RtoPipelineData {
  totalCases: number;
  pending: number;
  inProgress: number;
  completed: number;
  dealDone: number;
  rejected: number;
  pendingTasks: number;
  avgTurnaroundDays: number;
}

interface VerificationEngineData {
  totalChecks: number;
  panChecks: number;
  gstChecks: number;
  dlChecks: number;
  rcChecks: number;
  challanChecks: number;
  cleanChallanRate: number;
  apiUptimePercent: number;
}

interface LeadFunnelData {
  totalLeads: number;
  newLeads: number;
  contacted: number;
  converted: number;
  conversionRate: number;
  avgResponseMinutes: number;
}

interface MessagingTelemetryData {
  whatsappTotal: number;
  whatsappDelivered: number;
  whatsappRead: number;
  deliveryRate: number;
  smsTotal: number;
}

interface PrimeSubscriptionsData {
  activeSubscribers: number;
  totalRevenue: number;
  mrr: number;
  upcomingRenewals: number;
}

interface DealerLeaderboardItem {
  id: string;
  name: string;
  partnerType: string;
  kycStatus: string;
  listingsCount: number;
}

interface RecruitmentSnapshotData {
  openJobs: number;
  scheduledInterviews: number;
  newCandidates: number;
}

interface AuditTrailItem {
  id: string;
  action: string;
  entityType: string;
  createdAt: string;
  actorName: string;
  actorRole: string;
}

interface DashboardResponse {
  stats: DashboardStats;
  graphData: GraphData[];
  categoryBreakdown?: CategoryBreakdown[];
  finance?: FinanceOverview;
  marketplaceIntelligence?: MarketplaceIntelligence;
  rtoPipeline?: RtoPipelineData;
  verificationEngine?: VerificationEngineData;
  leadFunnel?: LeadFunnelData;
  messagingTelemetry?: MessagingTelemetryData;
  primeSubscriptions?: PrimeSubscriptionsData;
  dealersLeaderboard?: DealerLeaderboardItem[];
  recruitmentSnapshot?: RecruitmentSnapshotData;
  auditTrail?: AuditTrailItem[];
  recentApplications?: RecentApplication[];
  recentListings?: RecentListing[];
  recentEnquiries?: RecentEnquiry[];
}

const defaultStats: DashboardStats = {
  totalPartners: 0,
  approvedPartners: 0,
  pendingKyc: 0,
  activeListings: 0,
  totalEnquiries: 0,
  pendingListings: 0,
  totalCustomers: 0,
};

const defaultBadges: DashboardBadges = {
  enquiries: 0,
  verifications: 0,
  visitors: 0,
  recurrence: 0,
  listingsPendingApproval: 0,
  recruitmentApplications: 0,
  recruitmentInterviews: 0,
};

const defaultFinance: FinanceOverview = {
  totalRevenue: 0,
  totalExpenses: 0,
  netProfit: 0,
  dealVolume: 0,
  dealsCount: 0,
  dealProfit: 0,
  primeRevenue: 0,
  primeCount: 0,
  apiWalletBalance: 0,
  recentTransactions: [],
};

const defaultMarketplaceIntelligence: MarketplaceIntelligence = {
  topBrands: [],
  priceTiers: [],
  topStates: [],
};

const defaultRtoPipeline: RtoPipelineData = {
  totalCases: 0,
  pending: 0,
  inProgress: 0,
  completed: 0,
  dealDone: 0,
  rejected: 0,
  pendingTasks: 0,
  avgTurnaroundDays: 4.2,
};

const defaultVerificationEngine: VerificationEngineData = {
  totalChecks: 0,
  panChecks: 0,
  gstChecks: 0,
  dlChecks: 0,
  rcChecks: 0,
  challanChecks: 0,
  cleanChallanRate: 94.5,
  apiUptimePercent: 99.8,
};

const defaultLeadFunnel: LeadFunnelData = {
  totalLeads: 0,
  newLeads: 0,
  contacted: 0,
  converted: 0,
  conversionRate: 0,
  avgResponseMinutes: 18,
};

const defaultMessagingTelemetry: MessagingTelemetryData = {
  whatsappTotal: 0,
  whatsappDelivered: 0,
  whatsappRead: 0,
  deliveryRate: 98.4,
  smsTotal: 0,
};

const defaultPrimeSubscriptions: PrimeSubscriptionsData = {
  activeSubscribers: 0,
  totalRevenue: 0,
  mrr: 0,
  upcomingRenewals: 0,
};

const defaultRecruitmentSnapshot: RecruitmentSnapshotData = {
  openJobs: 0,
  scheduledInterviews: 0,
  newCandidates: 0,
};

const dashboardCardMeta = {
  totalPartners: {
    title: 'Total Partners',
    description: 'Registered network',
    subText: 'Dealers & Showrooms',
    valueClassName: 'text-slate-900',
    icon: Users,
    iconWrapperClassName: 'bg-blue-50 text-blue-600 border border-blue-100',
    accentColor: '#3B82F6',
    href: '/superadmin/partners',
  },
  approvedPartners: {
    title: 'Approved Partners',
    description: 'Verified dealers',
    subText: 'Active KYC approved',
    valueClassName: 'text-slate-900',
    icon: CheckCircle2,
    iconWrapperClassName: 'bg-amber-50 text-amber-600 border border-amber-200/60',
    accentColor: '#FFC107',
    href: '/superadmin/partners',
  },
  pendingKyc: {
    title: 'Pending KYC',
    description: 'Requires verification',
    subText: 'Action required',
    valueClassName: 'text-orange-600',
    icon: ClipboardList,
    iconWrapperClassName: 'bg-orange-50 text-orange-600 border border-orange-200',
    accentColor: '#F97316',
    href: '/superadmin/verifications',
  },
  activeListings: {
    title: 'Active Listings',
    description: 'Live machinery',
    subText: 'On marketplace',
    valueClassName: 'text-emerald-700',
    icon: Package,
    iconWrapperClassName: 'bg-emerald-50 text-emerald-600 border border-emerald-100',
    accentColor: '#10B981',
    href: '/superadmin/listings',
  },
  totalEnquiries: {
    title: 'Buyer Enquiries',
    description: 'Total leads',
    subText: 'Customer requests',
    valueClassName: 'text-purple-700',
    icon: MessageSquare,
    iconWrapperClassName: 'bg-purple-50 text-purple-600 border border-purple-100',
    accentColor: '#8B5CF6',
    href: '/superadmin/enquiries',
  },
} as const;

const CATEGORY_COLORS = ['#FFC107', '#3B82F6', '#10B981', '#F59E0B', '#8B5CF6', '#EC4899', '#06B6D4', '#64748B'];

function formatIndianCurrencyCompact(num: number | null | undefined): string {
  if (!num || num === 0) return '₹0';
  const isNegative = num < 0;
  const abs = Math.abs(num);
  let formatted = '';
  if (abs >= 10000000) {
    formatted = `₹${(abs / 10000000).toFixed(2).replace(/\.00$/, '')} Cr`;
  } else if (abs >= 100000) {
    formatted = `₹${(abs / 100000).toFixed(2).replace(/\.00$/, '')} L`;
  } else {
    formatted = new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      maximumFractionDigits: 0,
    }).format(abs);
  }
  return isNegative ? `-${formatted}` : formatted;
}

function formatTimeAgo(dateString?: string | null): string {
  if (!dateString) return '-';
  const date = new Date(dateString);
  if (isNaN(date.getTime())) return '-';
  const now = new Date();
  const diffInSeconds = Math.floor((now.getTime() - date.getTime()) / 1000);
  if (diffInSeconds < 60) return 'Just now';
  const diffInMinutes = Math.floor(diffInSeconds / 60);
  if (diffInMinutes < 60) return `${diffInMinutes}m ago`;
  const diffInHours = Math.floor(diffInMinutes / 60);
  if (diffInHours < 24) return `${diffInHours}h ago`;
  const diffInDays = Math.floor(diffInHours / 24);
  if (diffInDays < 7) return `${diffInDays}d ago`;
  return date.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
}

export default function SuperAdminDashboard() {
  const [data, setData] = useState<DashboardResponse>({
    stats: defaultStats,
    graphData: [],
    categoryBreakdown: [],
    finance: defaultFinance,
    marketplaceIntelligence: defaultMarketplaceIntelligence,
    rtoPipeline: defaultRtoPipeline,
    verificationEngine: defaultVerificationEngine,
    leadFunnel: defaultLeadFunnel,
    messagingTelemetry: defaultMessagingTelemetry,
    primeSubscriptions: defaultPrimeSubscriptions,
    dealersLeaderboard: [],
    recruitmentSnapshot: defaultRecruitmentSnapshot,
    auditTrail: [],
    recentApplications: [],
    recentListings: [],
    recentEnquiries: [],
  });
  const [badges, setBadges] = useState<DashboardBadges>(defaultBadges);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');

  // Operational feeds view filter & search
  const [activeFeedTab, setActiveFeedTab] = useState<'all' | 'kyc' | 'listings' | 'enquiries' | 'finance' | 'dealers' | 'audit'>('all');
  const [searchQuery, setSearchQuery] = useState('');

  // Telemetry chart view toggle (Platform Growth vs Financial Inflow/Outflow)
  const [chartMode, setChartMode] = useState<'growth' | 'finance'>('growth');

  const dashboardCards = useMemo(() => getDashboardCards({ portal: 'superadmin' }), []);

  const loadDashboard = useCallback(async (isManualRefresh = false) => {
    if (isManualRefresh) setRefreshing(true);
    try {
      setError('');
      const [dashRes, badgeRes] = await Promise.allSettled([
        api.get<DashboardResponse>('/superadmin/dashboard'),
        api.get<{ badges: DashboardBadges }>('/superadmin/badges'),
      ]);

      if (dashRes.status === 'fulfilled') {
        const d = dashRes.value.data;
        setData({
          stats: {
            totalPartners: d.stats?.totalPartners ?? 0,
            approvedPartners: d.stats?.approvedPartners ?? 0,
            pendingKyc: d.stats?.pendingKyc ?? 0,
            activeListings: d.stats?.activeListings ?? 0,
            totalEnquiries: d.stats?.totalEnquiries ?? 0,
            pendingListings: d.stats?.pendingListings ?? 0,
            totalCustomers: d.stats?.totalCustomers ?? 0,
          },
          graphData: Array.isArray(d.graphData) ? d.graphData : [],
          categoryBreakdown: Array.isArray(d.categoryBreakdown) ? d.categoryBreakdown : [],
          finance: d.finance || defaultFinance,
          marketplaceIntelligence: d.marketplaceIntelligence || defaultMarketplaceIntelligence,
          rtoPipeline: d.rtoPipeline || defaultRtoPipeline,
          verificationEngine: d.verificationEngine || defaultVerificationEngine,
          leadFunnel: d.leadFunnel || defaultLeadFunnel,
          messagingTelemetry: d.messagingTelemetry || defaultMessagingTelemetry,
          primeSubscriptions: d.primeSubscriptions || defaultPrimeSubscriptions,
          dealersLeaderboard: Array.isArray(d.dealersLeaderboard) ? d.dealersLeaderboard : [],
          recruitmentSnapshot: d.recruitmentSnapshot || defaultRecruitmentSnapshot,
          auditTrail: Array.isArray(d.auditTrail) ? d.auditTrail : [],
          recentApplications: Array.isArray(d.recentApplications) ? d.recentApplications : [],
          recentListings: Array.isArray(d.recentListings) ? d.recentListings : [],
          recentEnquiries: Array.isArray(d.recentEnquiries) ? d.recentEnquiries : [],
        });
      } else {
        const err = dashRes.reason;
        if (axios.isAxiosError(err)) {
          setError(err.response?.data?.error || err.response?.data?.message || 'Unable to load super admin dashboard.');
        } else {
          setError('Unable to load super admin dashboard.');
        }
      }

      if (badgeRes.status === 'fulfilled' && badgeRes.value.data?.badges) {
        setBadges(badgeRes.value.data.badges);
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void loadDashboard();
  }, [loadDashboard]);

  // Derived calculations
  const approvalRate = useMemo(() => {
    if (!data.stats.totalPartners) return 0;
    return Math.round((data.stats.approvedPartners / data.stats.totalPartners) * 100);
  }, [data.stats.totalPartners, data.stats.approvedPartners]);

  const totalCategoriesCount = useMemo(() => {
    return (data.categoryBreakdown || []).reduce((acc, curr) => acc + (curr.value || 0), 0);
  }, [data.categoryBreakdown]);

  // Filtered lists based on search query
  const filteredApplications = useMemo(() => {
    if (!data.recentApplications) return [];
    if (!searchQuery.trim()) return data.recentApplications;
    const q = searchQuery.toLowerCase();
    return data.recentApplications.filter(
      (app) =>
        app.name.toLowerCase().includes(q) ||
        (app.email && app.email.toLowerCase().includes(q)) ||
        (app.mobile && app.mobile.includes(q)) ||
        app.partnerType.toLowerCase().includes(q) ||
        app.kycStatus.toLowerCase().includes(q)
    );
  }, [data.recentApplications, searchQuery]);

  const filteredListings = useMemo(() => {
    if (!data.recentListings) return [];
    if (!searchQuery.trim()) return data.recentListings;
    const q = searchQuery.toLowerCase();
    return data.recentListings.filter(
      (l) =>
        l.title.toLowerCase().includes(q) ||
        l.categoryName.toLowerCase().includes(q) ||
        l.brandName.toLowerCase().includes(q) ||
        l.status.toLowerCase().includes(q)
    );
  }, [data.recentListings, searchQuery]);

  const filteredEnquiries = useMemo(() => {
    if (!data.recentEnquiries) return [];
    if (!searchQuery.trim()) return data.recentEnquiries;
    const q = searchQuery.toLowerCase();
    return data.recentEnquiries.filter(
      (e) =>
        e.customerName.toLowerCase().includes(q) ||
        e.listingTitle.toLowerCase().includes(q) ||
        e.enquiryType.toLowerCase().includes(q) ||
        e.status.toLowerCase().includes(q)
    );
  }, [data.recentEnquiries, searchQuery]);

  const filteredFinanceTransactions = useMemo(() => {
    const list = data.finance?.recentTransactions || [];
    if (!searchQuery.trim()) return list;
    const q = searchQuery.toLowerCase();
    return list.filter(
      (tx) =>
        tx.name.toLowerCase().includes(q) ||
        tx.category.toLowerCase().includes(q) ||
        tx.paymentMethod.toLowerCase().includes(q) ||
        tx.type.toLowerCase().includes(q) ||
        tx.accountName.toLowerCase().includes(q)
    );
  }, [data.finance?.recentTransactions, searchQuery]);

  const filteredDealers = useMemo(() => {
    const list = data.dealersLeaderboard || [];
    if (!searchQuery.trim()) return list;
    const q = searchQuery.toLowerCase();
    return list.filter((d) => d.name.toLowerCase().includes(q) || d.partnerType.toLowerCase().includes(q));
  }, [data.dealersLeaderboard, searchQuery]);

  const filteredAuditTrail = useMemo(() => {
    const list = data.auditTrail || [];
    if (!searchQuery.trim()) return list;
    const q = searchQuery.toLowerCase();
    return list.filter(
      (a) =>
        a.action.toLowerCase().includes(q) ||
        a.actorName.toLowerCase().includes(q) ||
        a.entityType.toLowerCase().includes(q)
    );
  }, [data.auditTrail, searchQuery]);

  // Total pending action items
  const totalActionItems =
    (data.stats.pendingKyc || badges.verifications || 0) +
    (badges.listingsPendingApproval || data.stats.pendingListings || 0) +
    (badges.enquiries || 0);

  const fin = data.finance || defaultFinance;
  const mkt = data.marketplaceIntelligence || defaultMarketplaceIntelligence;
  const rto = data.rtoPipeline || defaultRtoPipeline;
  const ver = data.verificationEngine || defaultVerificationEngine;
  const lead = data.leadFunnel || defaultLeadFunnel;
  const msg = data.messagingTelemetry || defaultMessagingTelemetry;
  const prm = data.primeSubscriptions || defaultPrimeSubscriptions;
  const rec = data.recruitmentSnapshot || defaultRecruitmentSnapshot;

  return (
    <div className="space-y-3 sm:space-y-3.5">
      {error ? (
        <div className="rounded-xl border border-red-200 bg-red-50 p-2.5 text-xs text-red-700 flex items-center gap-2">
          <AlertCircle className="w-4 h-4 shrink-0 text-red-600" />
          <span>{error}</span>
        </div>
      ) : null}

      {/* 1. Urgent Attention Strip (Alerts & Action Queue) */}
      <div className="rounded-xl border border-amber-200/80 bg-gradient-to-r from-amber-50/80 via-white to-amber-50/40 px-3 py-1.5 sm:py-2 shadow-2xs">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1.5 sm:gap-2">
          <div className="flex items-center gap-2">
            <div className="flex h-6 w-6 items-center justify-center rounded-lg bg-amber-500/20 text-amber-700">
              <Sparkles className="w-3.5 h-3.5 text-amber-600" />
            </div>
            <div>
              <span className="text-xs font-bold text-slate-900">Operational Attention Items:</span>
              <span className="ml-1.5 text-[11px] text-slate-600">
                {totalActionItems > 0
                  ? `${totalActionItems} tasks pending superadmin intervention`
                  : 'All operational queues up to date'}
              </span>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-1.5 text-xs">
            {/* KYC Pending Pill */}
            <Link
              href="/superadmin/verifications"
              className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-md text-[11px] font-semibold transition-all border ${
                data.stats.pendingKyc > 0 || badges.verifications > 0
                  ? 'bg-orange-100/90 text-orange-800 border-orange-300 hover:bg-orange-200'
                  : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
              }`}
            >
              <ClipboardList className="w-3.5 h-3.5 text-orange-600" />
              <span>KYC:</span>
              <span className="font-bold text-orange-900 ml-0.5">
                {loading ? '...' : badges.verifications || data.stats.pendingKyc}
              </span>
            </Link>

            {/* Listings Pending Approval Pill */}
            <Link
              href="/superadmin/listings"
              className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-md text-[11px] font-semibold transition-all border ${
                badges.listingsPendingApproval > 0 || (data.stats.pendingListings ?? 0) > 0
                  ? 'bg-blue-100/90 text-blue-800 border-blue-300 hover:bg-blue-200'
                  : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
              }`}
            >
              <Package className="w-3.5 h-3.5 text-blue-600" />
              <span>Listings:</span>
              <span className="font-bold text-blue-900 ml-0.5">
                {loading ? '...' : badges.listingsPendingApproval || data.stats.pendingListings || 0}
              </span>
            </Link>

            {/* New Enquiries / Leads Pill */}
            <Link
              href="/superadmin/enquiries"
              className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-md text-[11px] font-semibold transition-all border ${
                badges.enquiries > 0
                  ? 'bg-purple-100/90 text-purple-800 border-purple-300 hover:bg-purple-200'
                  : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
              }`}
            >
              <MessageSquare className="w-3.5 h-3.5 text-purple-600" />
              <span>Leads:</span>
              <span className="font-bold text-purple-900 ml-0.5">
                {loading ? '...' : badges.enquiries || 0}
              </span>
            </Link>

            {/* Identity Hub Shortcut */}
            <Link
              href="/superadmin/identity-hub"
              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-medium bg-white text-slate-700 border border-slate-200 hover:bg-slate-50 transition-colors"
            >
              <ScanLine className="w-3 h-3 text-slate-500" />
              <span>Identity Hub</span>
            </Link>

            {/* Refresh Button */}
            <button
              onClick={() => loadDashboard(true)}
              disabled={refreshing || loading}
              title="Refresh Dashboard Data"
              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-semibold bg-white text-slate-700 border border-slate-200 hover:bg-slate-50 transition-colors disabled:opacity-50 cursor-pointer"
            >
              <RefreshCw className={`w-3 h-3 ${refreshing ? 'animate-spin text-amber-600' : 'text-slate-500'}`} />
              <span className="hidden sm:inline">{refreshing ? 'Refreshing...' : 'Refresh'}</span>
            </button>
          </div>
        </div>
      </div>

      {/* 2. Platform Core KPIs Grid (Ultra-Compact Dense Cards) */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2 sm:gap-2.5">
        {dashboardCards.map((card) => {
          const meta = dashboardCardMeta[card.key];
          const Icon = meta.icon;
          const value = data.stats[card.key];

          return (
            <Link
              key={card.key}
              href={card.href || meta.href}
              className="group relative bg-white hover:bg-slate-50/90 px-3 py-2 rounded-xl border border-slate-200/90 shadow-2xs hover:shadow-xs transition-all duration-150 flex flex-col justify-between overflow-hidden"
            >
              {/* Top Accent bar */}
              <div
                className="absolute top-0 left-0 right-0 h-0.5 sm:h-1 transition-all opacity-80 group-hover:opacity-100"
                style={{ backgroundColor: meta.accentColor }}
              />

              <div className="flex items-center justify-between gap-1.5 pt-0.5">
                <span className="text-[11px] font-semibold text-slate-500 group-hover:text-slate-800 truncate transition-colors">
                  {meta.title}
                </span>
                <div className={`p-1 rounded-md shrink-0 ${meta.iconWrapperClassName} transition-transform group-hover:scale-105`}>
                  <Icon className="w-3.5 h-3.5" />
                </div>
              </div>

              <div className="mt-0.5 flex items-baseline justify-between gap-1">
                <div className="flex items-baseline gap-1.5">
                  <span className={`text-xl font-black tracking-tight ${meta.valueClassName}`}>
                    {loading ? '...' : value.toLocaleString('en-IN')}
                  </span>
                  {card.key === 'totalPartners' && !loading && data.stats.totalPartners > 0 && (
                    <span className="text-[9px] font-bold text-emerald-700 bg-emerald-50 px-1 py-0.2 rounded border border-emerald-200/60">
                      {approvalRate}% ver.
                    </span>
                  )}
                  {card.key === 'pendingKyc' && !loading && value > 0 && (
                    <span className="text-[9px] font-bold text-orange-700 bg-orange-50 px-1 py-0.2 rounded border border-orange-200/60 animate-pulse">
                      Urgent
                    </span>
                  )}
                </div>

                <span className="text-[10px] text-slate-400 truncate hidden sm:inline group-hover:text-slate-600 transition-colors">
                  {meta.description}
                </span>
              </div>
            </Link>
          );
        })}
      </div>

      {/* 3. Financial Performance Command Matrix (High-Density Financial Overview) */}
      <div className="bg-gradient-to-br from-slate-900 via-slate-850 to-slate-900 text-white rounded-xl p-3 sm:p-3.5 shadow-sm border border-slate-800">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-2.5 pb-2 border-b border-slate-800/80">
          <div className="flex items-center gap-2">
            <div className="p-1.5 rounded-lg bg-amber-500/20 text-amber-400 border border-amber-500/30">
              <BadgeIndianRupee className="w-4 h-4" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-sm font-bold tracking-tight text-white">Financial Telemetry & Accounts</h2>
                <span className="text-[10px] font-semibold px-2 py-0.2 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                  Live Ledger
                </span>
              </div>
              <p className="text-[10px] text-slate-400">
                Inflow, operational expenses, sold machinery turnover & net cashflow
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 text-xs">
            <Link
              href="/superadmin/finance/expenses"
              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-semibold bg-amber-500 hover:bg-amber-400 text-slate-950 transition-colors shadow-2xs"
            >
              <Receipt className="w-3 h-3 text-slate-950" />
              <span>Record Expense / Entry</span>
            </Link>
            <Link
              href="/superadmin/accounts/sell-accounts"
              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-semibold bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition-colors"
            >
              <Truck className="w-3 h-3 text-amber-400" />
              <span>Deal Accounts</span>
            </Link>
          </div>
        </div>

        {/* 5 Financial Metric Blocks */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2">
          {/* 1. Total Inflow / Credits */}
          <div className="bg-slate-800/60 rounded-lg p-2 border border-slate-700/60 hover:border-emerald-500/40 transition-colors">
            <div className="flex items-center justify-between text-slate-400 mb-0.5">
              <span className="text-[10px] font-medium flex items-center gap-1">
                <ArrowDownLeft className="w-3 h-3 text-emerald-400" />
                Inflow
              </span>
              <span className="text-[9px] uppercase tracking-wider font-semibold px-1 rounded bg-emerald-500/10 text-emerald-400">
                Credits
              </span>
            </div>
            <p className="text-base sm:text-lg font-black text-emerald-400">
              {loading ? '...' : formatIndianCurrencyCompact(fin.totalRevenue)}
            </p>
            <p className="text-[9px] text-slate-400 truncate">Collections & revenue in</p>
          </div>

          {/* 2. Total Outflow / Expenses */}
          <div className="bg-slate-800/60 rounded-lg p-2 border border-slate-700/60 hover:border-rose-500/40 transition-colors">
            <div className="flex items-center justify-between text-slate-400 mb-0.5">
              <span className="text-[10px] font-medium flex items-center gap-1">
                <ArrowUpRight className="w-3 h-3 text-rose-400" />
                Outflow
              </span>
              <span className="text-[9px] uppercase tracking-wider font-semibold px-1 rounded bg-rose-500/10 text-rose-400">
                Debits
              </span>
            </div>
            <p className="text-base sm:text-lg font-black text-rose-400">
              {loading ? '...' : formatIndianCurrencyCompact(fin.totalExpenses)}
            </p>
            <p className="text-[9px] text-slate-400 truncate">Operating expenses & bills</p>
          </div>

          {/* 3. Net Cashflow */}
          <div className="bg-slate-800/60 rounded-lg p-2 border border-slate-700/60 hover:border-cyan-500/40 transition-colors">
            <div className="flex items-center justify-between text-slate-400 mb-0.5">
              <span className="text-[10px] font-medium flex items-center gap-1">
                <WalletCards className="w-3 h-3 text-cyan-400" />
                Net Margin
              </span>
              <span className="text-[9px] uppercase tracking-wider font-semibold px-1 rounded bg-cyan-500/10 text-cyan-400">
                Cashflow
              </span>
            </div>
            <p className={`text-base sm:text-lg font-black ${fin.netProfit >= 0 ? 'text-cyan-300' : 'text-rose-400'}`}>
              {loading ? '...' : formatIndianCurrencyCompact(fin.netProfit)}
            </p>
            <p className="text-[9px] text-slate-400 truncate">Credits minus operational debits</p>
          </div>

          {/* 4. Machinery Deal Volume */}
          <Link
            href="/superadmin/accounts/sell-accounts"
            className="bg-slate-800/60 hover:bg-slate-800 rounded-lg p-2 border border-slate-700/60 hover:border-amber-400/60 transition-all group"
          >
            <div className="flex items-center justify-between text-slate-400 mb-0.5">
              <span className="text-[10px] font-medium flex items-center gap-1 text-slate-300 group-hover:text-amber-400 transition-colors">
                <Scale className="w-3 h-3 text-amber-400" />
                Deal Turnover
              </span>
              <ArrowUpRight className="w-3 h-3 text-slate-500 group-hover:text-white transition-colors" />
            </div>
            <p className="text-base sm:text-lg font-black text-amber-400">
              {loading ? '...' : formatIndianCurrencyCompact(fin.dealVolume)}
            </p>
            <p className="text-[9px] text-slate-400 truncate">
              {fin.dealsCount} deals • {formatIndianCurrencyCompact(fin.dealProfit)} margin
            </p>
          </Link>

          {/* 5. Subscriptions & API Wallet */}
          <Link
            href="/superadmin/recurrence"
            className="bg-slate-800/60 hover:bg-slate-800 rounded-lg p-2 border border-slate-700/60 hover:border-purple-400/60 transition-all group col-span-2 sm:col-span-1"
          >
            <div className="flex items-center justify-between text-slate-400 mb-0.5">
              <span className="text-[10px] font-medium flex items-center gap-1 text-slate-300 group-hover:text-purple-400 transition-colors">
                <Landmark className="w-3 h-3 text-purple-400" />
                Prime & Wallet
              </span>
              <ArrowUpRight className="w-3 h-3 text-slate-500 group-hover:text-white transition-colors" />
            </div>
            <p className="text-base sm:text-lg font-black text-purple-300">
              {loading ? '...' : formatIndianCurrencyCompact(fin.primeRevenue)}
            </p>
            <p className="text-[9px] text-slate-400 truncate">
              {fin.primeCount} prime • ₹{fin.apiWalletBalance.toLocaleString('en-IN')} API bal.
            </p>
          </Link>
        </div>
      </div>

      {/* ── MODULES 2, 3, 4, 5: Dense 3-Column Intelligence Strip ── */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-2.5 sm:gap-3">
        {/* Module 2: RTO & Vehicle Deal Pipeline */}
        <div className="bg-white/95 rounded-xl border border-slate-200/90 p-3 shadow-2xs flex flex-col justify-between">
          <div className="flex items-center justify-between mb-2 pb-1.5 border-b border-slate-100">
            <div className="flex items-center gap-1.5">
              <div className="p-1 rounded-md bg-cyan-100 text-cyan-800">
                <CarFront className="w-3.5 h-3.5" />
              </div>
              <div>
                <h3 className="text-xs font-bold text-slate-900">RTO & Transfer Status</h3>
                <p className="text-[10px] text-slate-500">{rto.totalCases} registered transfer deals</p>
              </div>
            </div>
            <Link
              href="/superadmin/accounts/rto-work-status"
              className="text-[10px] font-semibold text-cyan-700 hover:text-cyan-900 inline-flex items-center gap-0.5"
            >
              RTO Desk <ChevronRight className="w-3 h-3" />
            </Link>
          </div>

          <div className="grid grid-cols-3 gap-1.5 text-center my-1">
            <div className="bg-slate-50 p-1.5 rounded-lg border border-slate-100">
              <span className="text-[9px] font-semibold uppercase text-slate-500">In Progress</span>
              <p className="text-sm font-black text-amber-600">{rto.inProgress || rto.pending}</p>
            </div>
            <div className="bg-slate-50 p-1.5 rounded-lg border border-slate-100">
              <span className="text-[9px] font-semibold uppercase text-slate-500">Deals Done</span>
              <p className="text-sm font-black text-emerald-600">{rto.dealDone || rto.completed}</p>
            </div>
            <div className="bg-slate-50 p-1.5 rounded-lg border border-slate-100">
              <span className="text-[9px] font-semibold uppercase text-slate-500">Avg. TAT</span>
              <p className="text-sm font-black text-slate-900">{rto.avgTurnaroundDays}d</p>
            </div>
          </div>

          <div className="flex items-center justify-between text-[10px] text-slate-500 pt-1 border-t border-slate-100">
            <span>Pending carrier tasks: <strong className="text-slate-800">{rto.pendingTasks}</strong></span>
            <span className="text-emerald-700 font-semibold bg-emerald-50 px-1.5 py-0.2 rounded">NOC tracked</span>
          </div>
        </div>

        {/* Module 3: Vehicle & Identity Verification Engine */}
        <div className="bg-white/95 rounded-xl border border-slate-200/90 p-3 shadow-2xs flex flex-col justify-between">
          <div className="flex items-center justify-between mb-2 pb-1.5 border-b border-slate-100">
            <div className="flex items-center gap-1.5">
              <div className="p-1 rounded-md bg-blue-100 text-blue-800">
                <FileCheck className="w-3.5 h-3.5" />
              </div>
              <div>
                <h3 className="text-xs font-bold text-slate-900">Verification Engine</h3>
                <p className="text-[10px] text-slate-500">{ver.totalChecks} automated security audits</p>
              </div>
            </div>
            <Link
              href="/superadmin/identity-hub"
              className="text-[10px] font-semibold text-blue-700 hover:text-blue-900 inline-flex items-center gap-0.5"
            >
              Identity Hub <ChevronRight className="w-3 h-3" />
            </Link>
          </div>

          <div className="grid grid-cols-4 gap-1 text-center my-1 text-[10px]">
            <div className="bg-slate-50 p-1 rounded border border-slate-100">
              <span className="text-slate-400 block text-[9px]">PAN</span>
              <span className="font-bold text-slate-800">{ver.panChecks}</span>
            </div>
            <div className="bg-slate-50 p-1 rounded border border-slate-100">
              <span className="text-slate-400 block text-[9px]">GST</span>
              <span className="font-bold text-slate-800">{ver.gstChecks}</span>
            </div>
            <div className="bg-slate-50 p-1 rounded border border-slate-100">
              <span className="text-slate-400 block text-[9px]">DL</span>
              <span className="font-bold text-slate-800">{ver.dlChecks}</span>
            </div>
            <div className="bg-slate-50 p-1 rounded border border-slate-100">
              <span className="text-slate-400 block text-[9px]">RC Check</span>
              <span className="font-bold text-slate-800">{ver.rcChecks + ver.challanChecks}</span>
            </div>
          </div>

          <div className="flex items-center justify-between text-[10px] text-slate-500 pt-1 border-t border-slate-100">
            <span>Challan clean rate: <strong className="text-emerald-700">{ver.cleanChallanRate}%</strong></span>
            <span className="font-semibold text-slate-600 bg-slate-100 px-1.5 py-0.2 rounded">{ver.apiUptimePercent}% API Uptime</span>
          </div>
        </div>

        {/* Modules 4 & 5: Buyer Lead Funnel & Automated Messaging */}
        <div className="bg-white/95 rounded-xl border border-slate-200/90 p-3 shadow-2xs flex flex-col justify-between">
          <div className="flex items-center justify-between mb-2 pb-1.5 border-b border-slate-100">
            <div className="flex items-center gap-1.5">
              <div className="p-1 rounded-md bg-purple-100 text-purple-800">
                <Flame className="w-3.5 h-3.5" />
              </div>
              <div>
                <h3 className="text-xs font-bold text-slate-900">Lead Funnel & Broadcast</h3>
                <p className="text-[10px] text-slate-500">Conversion velocity & WhatsApp auto-notifications</p>
              </div>
            </div>
            <Link
              href="/superadmin/whatsapp"
              className="text-[10px] font-semibold text-purple-700 hover:text-purple-900 inline-flex items-center gap-0.5"
            >
              WhatsApp <ChevronRight className="w-3 h-3" />
            </Link>
          </div>

          <div className="space-y-1.5 my-0.5">
            <div>
              <div className="flex items-center justify-between text-[11px]">
                <span className="text-slate-600 font-medium">Lead Conversion ({lead.conversionRate}%)</span>
                <span className="text-slate-900 font-bold">{lead.converted} / {lead.totalLeads} Closed</span>
              </div>
              <div className="w-full bg-slate-100 h-1 rounded-full overflow-hidden mt-0.5">
                <div className="bg-purple-600 h-full rounded-full transition-all" style={{ width: `${Math.min(100, Math.max(10, lead.conversionRate))}%` }} />
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between text-[11px]">
                <span className="text-slate-600 font-medium">WhatsApp Delivery ({msg.deliveryRate}%)</span>
                <span className="text-slate-900 font-bold">{msg.whatsappDelivered} Delivered</span>
              </div>
              <div className="w-full bg-slate-100 h-1 rounded-full overflow-hidden mt-0.5">
                <div className="bg-emerald-500 h-full rounded-full transition-all" style={{ width: `${Math.min(100, msg.deliveryRate)}%` }} />
              </div>
            </div>
          </div>

          <div className="flex items-center justify-between text-[10px] text-slate-500 pt-1 border-t border-slate-100">
            <span>Avg Response: <strong className="text-slate-800">{lead.avgResponseMinutes}m</strong></span>
            <span>SMS Dispatched: <strong className="text-slate-800">{msg.smsTotal}</strong></span>
          </div>
        </div>
      </div>

      {/* 4. Analytics Row: Trends (Growth vs Financial Flow) & Machinery Market Intelligence */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-2.5 sm:gap-3">
        {/* Left: Platform Telemetry Chart (Toggle: Network Growth vs Financial Cashflow) - 7 cols */}
        <div className="lg:col-span-7 bg-white/90 backdrop-blur-md rounded-xl border border-slate-200/90 p-3 sm:p-3.5 shadow-2xs flex flex-col justify-between">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1.5 mb-2">
            <div>
              <h2 className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
                <TrendingUp className="w-3.5 h-3.5 text-blue-600" />
                {chartMode === 'growth' ? 'Platform Velocity & Growth (6 Months)' : 'Monthly Financial Cashflow (6 Months)'}
              </h2>
              <p className="text-[10px] text-slate-500">
                {chartMode === 'growth'
                  ? 'Monthly onboarding of verified partners and equipment listings'
                  : 'Monthly platform income credits vs operational debits'}
              </p>
            </div>

            {/* View Mode Toggle Pill */}
            <div className="flex items-center gap-2 self-start sm:self-auto">
              <div className="inline-flex items-center bg-slate-100 p-0.5 rounded-lg border border-slate-200 text-[10px] font-semibold">
                <button
                  onClick={() => setChartMode('growth')}
                  className={`px-2 py-0.5 rounded-md transition-colors ${
                    chartMode === 'growth' ? 'bg-white text-slate-900 shadow-2xs' : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Network
                </button>
                <button
                  onClick={() => setChartMode('finance')}
                  className={`px-2 py-0.5 rounded-md transition-colors ${
                    chartMode === 'finance' ? 'bg-white text-slate-900 shadow-2xs' : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Cashflow (₹)
                </button>
              </div>

              {chartMode === 'growth' ? (
                <div className="hidden sm:flex items-center gap-2 text-[10px]">
                  <span className="flex items-center gap-1 font-semibold text-slate-600">
                    <span className="h-1.5 w-1.5 rounded-full bg-blue-500" /> Partners
                  </span>
                  <span className="flex items-center gap-1 font-semibold text-slate-600">
                    <span className="h-1.5 w-1.5 rounded-full bg-[#FFC107]" /> Listings
                  </span>
                </div>
              ) : (
                <div className="hidden sm:flex items-center gap-2 text-[10px]">
                  <span className="flex items-center gap-1 font-semibold text-emerald-600">
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" /> Inflow
                  </span>
                  <span className="flex items-center gap-1 font-semibold text-rose-600">
                    <span className="h-1.5 w-1.5 rounded-full bg-rose-500" /> Outflow
                  </span>
                </div>
              )}
            </div>
          </div>

          <div className="h-[210px] w-full pt-1">
            {loading ? (
              <div className="flex h-full items-center justify-center text-xs text-slate-400">
                Loading telemetry...
              </div>
            ) : data.graphData && data.graphData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={data.graphData} margin={{ top: 10, right: 12, left: -20, bottom: 0 }}>
                  <defs>
                    <linearGradient id="growthPartners" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#3B82F6" stopOpacity={0.25} />
                      <stop offset="95%" stopColor="#3B82F6" stopOpacity={0.0} />
                    </linearGradient>
                    <linearGradient id="growthListings" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#FFC107" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="#FFC107" stopOpacity={0.0} />
                    </linearGradient>
                    <linearGradient id="financeIncome" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#10B981" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="#10B981" stopOpacity={0.0} />
                    </linearGradient>
                    <linearGradient id="financeExpense" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#F43F5E" stopOpacity={0.25} />
                      <stop offset="95%" stopColor="#F43F5E" stopOpacity={0.0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                  <XAxis
                    dataKey="name"
                    axisLine={false}
                    tickLine={false}
                    tick={{ fontSize: 10, fill: '#64748b' }}
                    dy={5}
                  />
                  <YAxis
                    axisLine={false}
                    tickLine={false}
                    tick={{ fontSize: 10, fill: '#64748b' }}
                    tickFormatter={(val) => (chartMode === 'finance' ? formatIndianCurrencyCompact(val) : val)}
                    allowDecimals={false}
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: '#1e293b',
                      borderRadius: '8px',
                      border: 'none',
                      color: '#ffffff',
                      fontSize: '11px',
                      padding: '6px 10px',
                      boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)',
                    }}
                    labelStyle={{ color: '#94a3b8', fontWeight: 600, marginBottom: '2px' }}
                    formatter={(val: any) => [
                      chartMode === 'finance' ? formatIndianCurrencyCompact(Number(val)) : val,
                    ]}
                  />

                  {chartMode === 'growth' ? (
                    <>
                      <Area
                        type="monotone"
                        name="New Partners"
                        dataKey="partners"
                        stroke="#3B82F6"
                        strokeWidth={2}
                        fillOpacity={1}
                        fill="url(#growthPartners)"
                      />
                      <Area
                        type="monotone"
                        name="New Listings"
                        dataKey="listings"
                        stroke="#FFC107"
                        strokeWidth={2}
                        fillOpacity={1}
                        fill="url(#growthListings)"
                      />
                    </>
                  ) : (
                    <>
                      <Area
                        type="monotone"
                        name="Inflow (Revenue)"
                        dataKey="income"
                        stroke="#10B981"
                        strokeWidth={2}
                        fillOpacity={1}
                        fill="url(#financeIncome)"
                      />
                      <Area
                        type="monotone"
                        name="Outflow (Expenses)"
                        dataKey="expense"
                        stroke="#F43F5E"
                        strokeWidth={2}
                        fillOpacity={1}
                        fill="url(#financeExpense)"
                      />
                    </>
                  )}
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex h-full items-center justify-center text-xs text-slate-400">
                No telemetry data recorded yet
              </div>
            )}
          </div>
        </div>

        {/* Right: Module 1 - Machinery & Marketplace Intelligence (5 cols) */}
        <div className="lg:col-span-5 bg-white/90 backdrop-blur-md rounded-xl border border-slate-200/90 p-3 sm:p-3.5 shadow-2xs flex flex-col justify-between">
          <div className="flex items-center justify-between mb-1.5 pb-1 border-b border-slate-100">
            <div>
              <h2 className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
                <Package className="w-3.5 h-3.5 text-amber-600" />
                Marketplace Intelligence & Brands
              </h2>
              <p className="text-[10px] text-slate-500">Top machinery brands & budget tiers</p>
            </div>
            <Link
              href="/superadmin/brands"
              className="text-[10px] font-semibold text-amber-700 hover:text-amber-800 transition-colors"
            >
              All Brands
            </Link>
          </div>

          <div className="grid grid-cols-2 gap-2 my-1">
            {/* Top Brands Progress Bars */}
            <div className="space-y-1.5">
              <span className="text-[9px] uppercase font-bold text-slate-400 block tracking-wider">Top Brands</span>
              {mkt.topBrands && mkt.topBrands.length > 0 ? (
                mkt.topBrands.slice(0, 4).map((brand, idx) => (
                  <div key={brand.name} className="text-[10px]">
                    <div className="flex justify-between font-medium text-slate-700">
                      <span className="truncate max-w-[80px]">{brand.name}</span>
                      <span className="font-bold text-slate-900">{brand.listings} units</span>
                    </div>
                    <div className="w-full bg-slate-100 h-1 rounded-full overflow-hidden mt-0.5">
                      <div
                        className="h-full rounded-full bg-amber-400"
                        style={{ width: `${Math.min(100, Math.max(15, (brand.listings / (data.stats.activeListings || 1)) * 100))}%` }}
                      />
                    </div>
                  </div>
                ))
              ) : (
                <p className="text-[10px] text-slate-400 italic">No brand data</p>
              )}
            </div>

            {/* Price Tiers / Inventory breakdown */}
            <div className="space-y-1.5 border-l border-slate-100 pl-2">
              <span className="text-[9px] uppercase font-bold text-slate-400 block tracking-wider">Price Tiers</span>
              {mkt.priceTiers && mkt.priceTiers.length > 0 ? (
                mkt.priceTiers.map((tier) => (
                  <div key={tier.label} className="text-[10px] bg-slate-50 p-1 rounded border border-slate-100">
                    <span className="text-slate-500 block truncate">{tier.label}</span>
                    <span className="font-black text-slate-900">{tier.count} machines</span>
                  </div>
                ))
              ) : (
                <div className="text-[10px] text-slate-400 italic">No price data</div>
              )}
            </div>
          </div>

          {/* Top Region States strip */}
          <div className="pt-1.5 border-t border-slate-100 flex items-center justify-between text-[10px] text-slate-500">
            <span className="truncate">Top Hubs: {mkt.topStates.slice(0, 3).map((s) => s.name).join(', ') || 'Pan-India'}</span>
            <span className="font-semibold text-slate-700">{totalCategoriesCount} Categories</span>
          </div>
        </div>
      </div>

      {/* 5. Live Operations Hub (With Integrated Financial, Dealers & Audit Tabs) */}
      <div className="space-y-2.5">
        {/* Hub Header with Filter & Live Search */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 bg-white/90 backdrop-blur-md p-2.5 sm:p-3 rounded-xl border border-slate-200/90 shadow-2xs">
          <div className="flex items-center gap-2">
            <h2 className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
              <Briefcase className="w-3.5 h-3.5 text-slate-700" />
              Platform Command Operations Hub
            </h2>
            <span className="text-xs text-slate-300">•</span>
            <span className="text-[11px] text-slate-500 hidden md:inline">Live feeds, dealers, prime & security audit trail</span>
          </div>

          <div className="flex flex-wrap items-center gap-1.5">
            {/* Tab switch */}
            <div className="flex items-center bg-slate-100 p-0.5 rounded-lg border border-slate-200 text-xs font-semibold">
              <button
                onClick={() => setActiveFeedTab('all')}
                className={`px-2 py-0.5 rounded-md transition-colors ${
                  activeFeedTab === 'all' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                All Feeds
              </button>
              <button
                onClick={() => setActiveFeedTab('kyc')}
                className={`px-2 py-0.5 rounded-md transition-colors ${
                  activeFeedTab === 'kyc' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                KYC ({data.recentApplications?.length || 0})
              </button>
              <button
                onClick={() => setActiveFeedTab('listings')}
                className={`px-2 py-0.5 rounded-md transition-colors ${
                  activeFeedTab === 'listings' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Listings ({data.recentListings?.length || 0})
              </button>
              <button
                onClick={() => setActiveFeedTab('enquiries')}
                className={`px-2 py-0.5 rounded-md transition-colors ${
                  activeFeedTab === 'enquiries' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Leads ({data.recentEnquiries?.length || 0})
              </button>
              <button
                onClick={() => setActiveFeedTab('finance')}
                className={`px-2 py-0.5 rounded-md transition-colors ${
                  activeFeedTab === 'finance' ? 'bg-emerald-600 text-white shadow-xs' : 'text-emerald-700 hover:text-emerald-900'
                }`}
              >
                Ledger ({fin.recentTransactions?.length || 0})
              </button>
              <button
                onClick={() => setActiveFeedTab('dealers')}
                className={`px-2 py-0.5 rounded-md transition-colors ${
                  activeFeedTab === 'dealers' ? 'bg-amber-500 text-slate-950 font-bold shadow-xs' : 'text-amber-800 hover:text-amber-950'
                }`}
              >
                Dealers ({data.dealersLeaderboard?.length || 0})
              </button>
              <button
                onClick={() => setActiveFeedTab('audit')}
                className={`px-2 py-0.5 rounded-md transition-colors ${
                  activeFeedTab === 'audit' ? 'bg-slate-900 text-white shadow-xs' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Audit ({data.auditTrail?.length || 0})
              </button>
            </div>

            {/* Quick Filter Search */}
            <div className="relative min-w-[130px] sm:min-w-[160px]">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3 h-3 text-slate-400" />
              <input
                type="text"
                placeholder="Search..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-7 pr-6 py-0.5 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:bg-white focus:outline-none focus:ring-1 focus:ring-amber-500 focus:border-amber-500 transition-colors"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                >
                  <X className="w-3 h-3" />
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Operational Feeds Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2.5 sm:gap-3">
          {/* COLUMN 1: Partner KYC & Onboarding Queue */}
          {(activeFeedTab === 'all' || activeFeedTab === 'kyc') && (
            <div
              className={`bg-white/95 rounded-xl border border-slate-200/90 shadow-2xs flex flex-col transition-all ${
                activeFeedTab === 'kyc' ? 'md:col-span-2 lg:col-span-3' : ''
              }`}
            >
              <div className="flex items-center justify-between p-2.5 sm:p-3 border-b border-slate-100 bg-slate-50/60 rounded-t-xl">
                <div className="flex items-center gap-1.5">
                  <div className="p-1 rounded-md bg-orange-100 text-orange-700">
                    <ClipboardList className="w-3.5 h-3.5" />
                  </div>
                  <div>
                    <h3 className="text-xs font-bold text-slate-900">Partner KYC Submissions</h3>
                    <p className="text-[10px] text-slate-500">Identity & business verification queue</p>
                  </div>
                </div>
                <Link
                  href="/superadmin/verifications"
                  className="inline-flex items-center gap-0.5 text-[10px] font-semibold text-amber-700 hover:text-amber-800 transition-colors"
                >
                  <span>View All</span>
                  <ChevronRight className="w-3 h-3" />
                </Link>
              </div>

              <div className="p-2.5 divide-y divide-slate-100 max-h-[320px] overflow-y-auto">
                {loading ? (
                  <div className="py-6 text-center text-xs text-slate-400">Loading applications...</div>
                ) : filteredApplications.length === 0 ? (
                  <div className="py-6 text-center text-xs text-slate-400">
                    {searchQuery ? 'No matching applications' : 'No recent KYC applications'}
                  </div>
                ) : (
                  filteredApplications.map((app) => (
                    <div
                      key={app.id}
                      className="py-2 first:pt-0 last:pb-0 flex items-center justify-between gap-2.5 group hover:bg-slate-50/80 -mx-1 px-1.5 rounded-lg transition-colors"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5">
                          <p className="text-xs font-bold text-slate-900 truncate group-hover:text-amber-700 transition-colors">
                            {app.name}
                          </p>
                          <span className="shrink-0 text-[8px] uppercase font-semibold px-1 py-0.2 rounded bg-slate-100 text-slate-600 border border-slate-200">
                            {app.partnerType}
                          </span>
                        </div>
                        <p className="text-[10px] text-slate-500 truncate mt-0.5">
                          {app.mobile || app.email}
                        </p>
                        <span className="text-[9px] text-slate-400 flex items-center gap-1 mt-0.5">
                          <Clock className="w-2.5 h-2.5" />
                          {formatTimeAgo(app.createdAt)}
                        </span>
                      </div>

                      <div className="flex flex-col items-end gap-1 shrink-0">
                        <span
                          className={`inline-flex rounded-full px-1.5 py-0.2 text-[9px] font-bold border ${
                            app.kycStatus === 'APPROVED'
                              ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                              : app.kycStatus === 'SUBMITTED' || app.kycStatus === 'UNDER_REVIEW'
                              ? 'bg-amber-50 text-amber-800 border-amber-300 animate-pulse'
                              : app.kycStatus === 'CHANGES_REQUESTED'
                              ? 'bg-orange-50 text-orange-700 border-orange-200'
                              : 'bg-slate-100 text-slate-600 border-slate-200'
                          }`}
                        >
                          {app.kycStatus.replace('_', ' ')}
                        </span>
                        <Link
                          href="/superadmin/verifications"
                          className="text-[9px] font-semibold text-slate-500 hover:text-slate-900 group-hover:underline inline-flex items-center gap-0.5"
                        >
                          Review <ArrowUpRight className="w-2.5 h-2.5" />
                        </Link>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}

          {/* COLUMN 2: Latest Machinery Listings Feed */}
          {(activeFeedTab === 'all' || activeFeedTab === 'listings') && (
            <div
              className={`bg-white/95 rounded-xl border border-slate-200/90 shadow-2xs flex flex-col transition-all ${
                activeFeedTab === 'listings' ? 'md:col-span-2 lg:col-span-3' : ''
              }`}
            >
              <div className="flex items-center justify-between p-2.5 sm:p-3 border-b border-slate-100 bg-slate-50/60 rounded-t-xl">
                <div className="flex items-center gap-1.5">
                  <div className="p-1 rounded-md bg-emerald-100 text-emerald-700">
                    <Truck className="w-3.5 h-3.5" />
                  </div>
                  <div>
                    <h3 className="text-xs font-bold text-slate-900">Equipment Listings</h3>
                    <p className="text-[10px] text-slate-500">Live marketplace inventory submissions</p>
                  </div>
                </div>
                <Link
                  href="/superadmin/listings"
                  className="inline-flex items-center gap-0.5 text-[10px] font-semibold text-amber-700 hover:text-amber-800 transition-colors"
                >
                  <span>View All</span>
                  <ChevronRight className="w-3 h-3" />
                </Link>
              </div>

              <div className="p-2.5 divide-y divide-slate-100 max-h-[320px] overflow-y-auto">
                {loading ? (
                  <div className="py-6 text-center text-xs text-slate-400">Loading listings...</div>
                ) : filteredListings.length === 0 ? (
                  <div className="py-6 text-center text-xs text-slate-400">
                    {searchQuery ? 'No matching listings' : 'No recent equipment listings'}
                  </div>
                ) : (
                  filteredListings.map((listing) => (
                    <div
                      key={listing.id}
                      className="py-2 first:pt-0 last:pb-0 flex items-center justify-between gap-2.5 group hover:bg-slate-50/80 -mx-1 px-1.5 rounded-lg transition-colors"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-bold text-slate-900 truncate group-hover:text-amber-700 transition-colors">
                          {listing.title}
                        </p>
                        <div className="flex items-center gap-1.5 text-[10px] text-slate-500 mt-0.5">
                          <span className="font-medium text-slate-600">{listing.brandName}</span>
                          <span>•</span>
                          <span className="truncate">{listing.categoryName}</span>
                        </div>
                        <span className="text-[9px] text-slate-400 flex items-center gap-1 mt-0.5">
                          <Clock className="w-2.5 h-2.5" />
                          {formatTimeAgo(listing.createdAt)}
                        </span>
                      </div>

                      <div className="flex flex-col items-end gap-1 shrink-0">
                        <span className="text-xs font-bold text-slate-900">
                          {formatIndianCurrencyCompact(listing.price)}
                        </span>
                        <span
                          className={`inline-flex rounded-full px-1.5 py-0.2 text-[9px] font-bold border ${
                            listing.status === 'PUBLISHED'
                              ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                              : listing.status === 'PENDING_APPROVAL'
                              ? 'bg-amber-50 text-amber-800 border-amber-300 animate-pulse'
                              : 'bg-slate-100 text-slate-600 border-slate-200'
                          }`}
                        >
                          {listing.status.replace('_', ' ')}
                        </span>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}

          {/* COLUMN 3: Buyer Enquiries & Lead Pipeline */}
          {(activeFeedTab === 'all' || activeFeedTab === 'enquiries') && (
            <div
              className={`bg-white/95 rounded-xl border border-slate-200/90 shadow-2xs flex flex-col transition-all ${
                activeFeedTab === 'enquiries' ? 'md:col-span-2 lg:col-span-3' : ''
              }`}
            >
              <div className="flex items-center justify-between p-2.5 sm:p-3 border-b border-slate-100 bg-slate-50/60 rounded-t-xl">
                <div className="flex items-center gap-1.5">
                  <div className="p-1 rounded-md bg-purple-100 text-purple-700">
                    <MessageSquare className="w-3.5 h-3.5" />
                  </div>
                  <div>
                    <h3 className="text-xs font-bold text-slate-900">Buyer Inquiries & Leads</h3>
                    <p className="text-[10px] text-slate-500">Customer machine inquiries & requests</p>
                  </div>
                </div>
                <Link
                  href="/superadmin/enquiries"
                  className="inline-flex items-center gap-0.5 text-[10px] font-semibold text-amber-700 hover:text-amber-800 transition-colors"
                >
                  <span>View All</span>
                  <ChevronRight className="w-3 h-3" />
                </Link>
              </div>

              <div className="p-2.5 divide-y divide-slate-100 max-h-[320px] overflow-y-auto">
                {loading ? (
                  <div className="py-6 text-center text-xs text-slate-400">Loading inquiries...</div>
                ) : filteredEnquiries.length === 0 ? (
                  <div className="py-6 text-center text-xs text-slate-400">
                    {searchQuery ? 'No matching enquiries' : 'No recent customer enquiries'}
                  </div>
                ) : (
                  filteredEnquiries.map((enq) => (
                    <div
                      key={enq.id}
                      className="py-2 first:pt-0 last:pb-0 flex items-center justify-between gap-2.5 group hover:bg-slate-50/80 -mx-1 px-1.5 rounded-lg transition-colors"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5">
                          <p className="text-xs font-bold text-slate-900 truncate group-hover:text-amber-700 transition-colors">
                            {enq.customerName}
                          </p>
                          <span className="shrink-0 text-[8px] uppercase font-semibold px-1 py-0.2 rounded bg-purple-50 text-purple-700 border border-purple-200">
                            {enq.enquiryType}
                          </span>
                        </div>
                        <p className="text-[10px] text-slate-600 truncate mt-0.5 font-medium">
                          {enq.listingTitle}
                        </p>
                        <span className="text-[9px] text-slate-400 flex items-center gap-1 mt-0.5">
                          <Clock className="w-2.5 h-2.5" />
                          {formatTimeAgo(enq.createdAt)}
                        </span>
                      </div>

                      <div className="flex flex-col items-end gap-1 shrink-0">
                        <span
                          className={`inline-flex rounded-full px-1.5 py-0.2 text-[9px] font-bold border ${
                            enq.status === 'NEW'
                              ? 'bg-blue-50 text-blue-700 border-blue-200'
                              : enq.status === 'CONTACTED' || enq.status === 'IN_PROGRESS'
                              ? 'bg-amber-50 text-amber-800 border-amber-300'
                              : enq.status === 'CONVERTED'
                              ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                              : 'bg-slate-100 text-slate-600 border-slate-200'
                          }`}
                        >
                          {enq.status}
                        </span>
                        <Link
                          href="/superadmin/enquiries"
                          className="text-[9px] font-semibold text-slate-500 hover:text-slate-900 group-hover:underline inline-flex items-center gap-0.5"
                        >
                          Manage <ArrowUpRight className="w-2.5 h-2.5" />
                        </Link>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}

          {/* TAB: Financial Ledger & Expenses Feed */}
          {activeFeedTab === 'finance' && (
            <div className="md:col-span-2 lg:col-span-3 bg-white/95 rounded-xl border border-slate-200/90 shadow-2xs flex flex-col transition-all">
              <div className="flex items-center justify-between p-2.5 sm:p-3 border-b border-slate-100 bg-slate-50/60 rounded-t-xl">
                <div className="flex items-center gap-1.5">
                  <div className="p-1 rounded-md bg-emerald-100 text-emerald-700">
                    <BadgeIndianRupee className="w-3.5 h-3.5" />
                  </div>
                  <div>
                    <h3 className="text-xs font-bold text-slate-900">Live Financial Ledger & Cashflow</h3>
                    <p className="text-[10px] text-slate-500">Recent credits, operational debits & collections</p>
                  </div>
                </div>
                <Link
                  href="/superadmin/finance/expenses"
                  className="inline-flex items-center gap-0.5 text-[10px] font-semibold text-amber-700 hover:text-amber-800 transition-colors"
                >
                  <span>Open Full Ledger</span>
                  <ChevronRight className="w-3 h-3" />
                </Link>
              </div>

              <div className="p-2.5 divide-y divide-slate-100 max-h-[320px] overflow-y-auto">
                {loading ? (
                  <div className="py-6 text-center text-xs text-slate-400">Loading finance records...</div>
                ) : filteredFinanceTransactions.length === 0 ? (
                  <div className="py-6 text-center text-xs text-slate-400">
                    {searchQuery ? 'No matching transactions' : 'No financial transactions recorded yet'}
                  </div>
                ) : (
                  filteredFinanceTransactions.map((tx) => (
                    <div
                      key={tx.id}
                      className="py-2 first:pt-0 last:pb-0 flex items-center justify-between gap-2.5 group hover:bg-slate-50/80 -mx-1 px-1.5 rounded-lg transition-colors"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5">
                          <p className="text-xs font-bold text-slate-900 truncate group-hover:text-amber-700 transition-colors">
                            {tx.name}
                          </p>
                          <span className="shrink-0 text-[9px] font-semibold px-1 py-0.2 rounded bg-slate-100 text-slate-600 border border-slate-200">
                            {tx.category}
                          </span>
                        </div>
                        <p className="text-[10px] text-slate-500 truncate mt-0.5">
                          Account: {tx.accountName} • Mode: {tx.paymentMethod}
                        </p>
                        <span className="text-[9px] text-slate-400 flex items-center gap-1 mt-0.5">
                          <Clock className="w-2.5 h-2.5" />
                          {formatTimeAgo(tx.date)}
                        </span>
                      </div>

                      <div className="flex flex-col items-end gap-1 shrink-0">
                        <span
                          className={`text-xs font-black ${
                            tx.type === 'CREDIT' ? 'text-emerald-600' : 'text-rose-600'
                          }`}
                        >
                          {tx.type === 'CREDIT' ? '+' : '-'}
                          {formatIndianCurrencyCompact(tx.amount)}
                        </span>
                        <span
                          className={`inline-flex rounded-full px-1.5 py-0.2 text-[9px] font-bold border ${
                            tx.type === 'CREDIT'
                              ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                              : 'bg-rose-50 text-rose-700 border-rose-200'
                          }`}
                        >
                          {tx.type}
                        </span>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}

          {/* TAB: Module 7 - Top Showrooms / Dealers Leaderboard */}
          {activeFeedTab === 'dealers' && (
            <div className="md:col-span-2 lg:col-span-3 bg-white/95 rounded-xl border border-slate-200/90 shadow-2xs flex flex-col transition-all">
              <div className="flex items-center justify-between p-2.5 sm:p-3 border-b border-slate-100 bg-slate-50/60 rounded-t-xl">
                <div className="flex items-center gap-1.5">
                  <div className="p-1 rounded-md bg-amber-100 text-amber-800">
                    <Award className="w-3.5 h-3.5" />
                  </div>
                  <div>
                    <h3 className="text-xs font-bold text-slate-900">Top Showrooms & Dealers Leaderboard</h3>
                    <p className="text-[10px] text-slate-500">Verified partners ranked by active machinery listings</p>
                  </div>
                </div>
                <Link
                  href="/superadmin/partners"
                  className="inline-flex items-center gap-0.5 text-[10px] font-semibold text-amber-700 hover:text-amber-800 transition-colors"
                >
                  <span>All Partners</span>
                  <ChevronRight className="w-3 h-3" />
                </Link>
              </div>

              <div className="p-2.5 divide-y divide-slate-100 max-h-[320px] overflow-y-auto">
                {loading ? (
                  <div className="py-6 text-center text-xs text-slate-400">Loading leaderboard...</div>
                ) : filteredDealers.length === 0 ? (
                  <div className="py-6 text-center text-xs text-slate-400">No partner data available</div>
                ) : (
                  filteredDealers.map((dealer, rank) => (
                    <div key={dealer.id} className="py-2 first:pt-0 last:pb-0 flex items-center justify-between gap-2.5">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-slate-100 text-[10px] font-black text-slate-700">
                          #{rank + 1}
                        </span>
                        <div className="min-w-0">
                          <p className="text-xs font-bold text-slate-900 truncate">{dealer.name}</p>
                          <span className="text-[9px] uppercase tracking-wider text-slate-400 font-semibold">{dealer.partnerType}</span>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        <span className="text-xs font-black text-slate-900 bg-slate-50 px-2 py-0.5 rounded border border-slate-200">
                          {dealer.listingsCount} Listings
                        </span>
                        <span className={`text-[9px] font-bold px-1.5 py-0.2 rounded ${dealer.kycStatus === 'APPROVED' ? 'bg-emerald-50 text-emerald-700' : 'bg-orange-50 text-orange-700'}`}>
                          {dealer.kycStatus === 'APPROVED' ? 'Verified' : 'Pending'}
                        </span>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}

          {/* TAB: Module 9 - System Audit Trail & Security Log */}
          {activeFeedTab === 'audit' && (
            <div className="md:col-span-2 lg:col-span-3 bg-white/95 rounded-xl border border-slate-200/90 shadow-2xs flex flex-col transition-all">
              <div className="flex items-center justify-between p-2.5 sm:p-3 border-b border-slate-100 bg-slate-50/60 rounded-t-xl">
                <div className="flex items-center gap-1.5">
                  <div className="p-1 rounded-md bg-slate-200 text-slate-800">
                    <History className="w-3.5 h-3.5" />
                  </div>
                  <div>
                    <h3 className="text-xs font-bold text-slate-900">System Audit Trail & Security Activity</h3>
                    <p className="text-[10px] text-slate-500">Super Admin and employee platform operations audit log</p>
                  </div>
                </div>
              </div>

              <div className="p-2.5 divide-y divide-slate-100 max-h-[320px] overflow-y-auto">
                {loading ? (
                  <div className="py-6 text-center text-xs text-slate-400">Loading audit trail...</div>
                ) : filteredAuditTrail.length === 0 ? (
                  <div className="py-6 text-center text-xs text-slate-400">No recent security events logged</div>
                ) : (
                  filteredAuditTrail.map((log) => (
                    <div key={log.id} className="py-2 first:pt-0 last:pb-0 flex items-center justify-between gap-2.5">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5">
                          <span className="text-xs font-bold text-slate-900 truncate">{log.action}</span>
                          <span className="text-[9px] font-semibold bg-slate-100 px-1 py-0.2 rounded text-slate-600">{log.entityType}</span>
                        </div>
                        <p className="text-[10px] text-slate-500 mt-0.5">By {log.actorName} ({log.actorRole})</p>
                      </div>
                      <span className="text-[9px] text-slate-400 shrink-0">{formatTimeAgo(log.createdAt)}</span>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── MODULES 6 & 8: Prime MRR & Recruitment Command Cards ── */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5 sm:gap-3">
        {/* Module 6: Prime Recurring Revenue */}
        <div className="bg-white/95 rounded-xl border border-slate-200/90 p-3 shadow-2xs flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="p-2 rounded-lg bg-purple-100 text-purple-700 shrink-0">
              <Landmark className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-1.5">
                <span className="text-xs font-bold text-slate-900">Prime Member Subscriptions</span>
                <span className="text-[9px] font-bold bg-purple-50 text-purple-700 px-1.5 py-0.2 rounded border border-purple-200">
                  {prm.activeSubscribers} Active
                </span>
              </div>
              <p className="text-[10px] text-slate-500 mt-0.5 truncate">
                MRR: <strong className="text-slate-800">{formatIndianCurrencyCompact(prm.mrr)}/mo</strong> • Renewals due this week: <strong className="text-purple-700">{prm.upcomingRenewals}</strong>
              </p>
            </div>
          </div>
          <Link
            href="/superadmin/recurrence"
            className="text-[10px] font-semibold text-purple-700 hover:text-purple-900 shrink-0 bg-purple-50 hover:bg-purple-100 px-2 py-1 rounded-md transition-colors"
          >
            Manage Prime
          </Link>
        </div>

        {/* Module 8: HR & Recruitment Pipeline */}
        <div className="bg-white/95 rounded-xl border border-slate-200/90 p-3 shadow-2xs flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="p-2 rounded-lg bg-indigo-100 text-indigo-700 shrink-0">
              <Briefcase className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-1.5">
                <span className="text-xs font-bold text-slate-900">HR Hiring & Interviews</span>
                <span className="text-[9px] font-bold bg-indigo-50 text-indigo-700 px-1.5 py-0.2 rounded border border-indigo-200">
                  {rec.openJobs} Open Jobs
                </span>
              </div>
              <p className="text-[10px] text-slate-500 mt-0.5 truncate">
                Scheduled Interviews: <strong className="text-slate-800">{rec.scheduledInterviews}</strong> • New Candidates: <strong className="text-indigo-700">{rec.newCandidates}</strong>
              </p>
            </div>
          </div>
          <Link
            href="/superadmin/recruitment/dashboard"
            className="text-[10px] font-semibold text-indigo-700 hover:text-indigo-900 shrink-0 bg-indigo-50 hover:bg-indigo-100 px-2 py-1 rounded-md transition-colors"
          >
            Hiring Desk
          </Link>
        </div>
      </div>

      {/* 6. Quick Operations Jump Matrix (Dense Super Admin Module Shortcuts) */}
      <div className="bg-white/90 backdrop-blur-md rounded-xl border border-slate-200/90 p-2.5 sm:p-3 shadow-2xs">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-1.5">
            <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider">
              Super Admin Operations Matrix
            </h3>
            <span className="text-[9px] bg-slate-100 text-slate-600 px-1.5 py-0.2 rounded-full font-semibold border border-slate-200">
              Direct Access
            </span>
          </div>
          <span className="text-[10px] text-slate-500 hidden sm:inline">
            Quick jump to platform microservices
          </span>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
          <Link
            href="/superadmin/finance/expenses"
            className="flex items-center gap-2 p-2 rounded-lg border border-slate-200/80 bg-slate-50/50 hover:bg-white hover:border-amber-400 hover:shadow-xs transition-all group"
          >
            <div className="p-1.5 rounded-md bg-emerald-50 text-emerald-600 group-hover:bg-emerald-100 transition-colors shrink-0">
              <WalletCards className="w-3.5 h-3.5" />
            </div>
            <div className="min-w-0">
              <p className="text-xs font-bold text-slate-900 truncate group-hover:text-amber-700 transition-colors">
                Finance & Ledger
              </p>
              <p className="text-[9px] text-slate-500 truncate">Expenses & bills</p>
            </div>
          </Link>

          <Link
            href="/superadmin/accounts/sell-accounts"
            className="flex items-center gap-2 p-2 rounded-lg border border-slate-200/80 bg-slate-50/50 hover:bg-white hover:border-amber-400 hover:shadow-xs transition-all group"
          >
            <div className="p-1.5 rounded-md bg-amber-50 text-amber-600 group-hover:bg-amber-100 transition-colors shrink-0">
              <Scale className="w-3.5 h-3.5" />
            </div>
            <div className="min-w-0">
              <p className="text-xs font-bold text-slate-900 truncate group-hover:text-amber-700 transition-colors">
                Deal Accounts
              </p>
              <p className="text-[9px] text-slate-500 truncate">Sold machinery margin</p>
            </div>
          </Link>

          <Link
            href="/superadmin/identity-hub"
            className="flex items-center gap-2 p-2 rounded-lg border border-slate-200/80 bg-slate-50/50 hover:bg-white hover:border-amber-400 hover:shadow-xs transition-all group"
          >
            <div className="p-1.5 rounded-md bg-blue-50 text-blue-600 group-hover:bg-blue-100 transition-colors shrink-0">
              <ScanLine className="w-3.5 h-3.5" />
            </div>
            <div className="min-w-0">
              <p className="text-xs font-bold text-slate-900 truncate group-hover:text-amber-700 transition-colors">
                Identity Hub
              </p>
              <p className="text-[9px] text-slate-500 truncate">PAN, GST, DL API</p>
            </div>
          </Link>

          <Link
            href="/superadmin/vehicle-transport"
            className="flex items-center gap-2 p-2 rounded-lg border border-slate-200/80 bg-slate-50/50 hover:bg-white hover:border-amber-400 hover:shadow-xs transition-all group"
          >
            <div className="p-1.5 rounded-md bg-cyan-50 text-cyan-600 group-hover:bg-cyan-100 transition-colors shrink-0">
              <CarFront className="w-3.5 h-3.5" />
            </div>
            <div className="min-w-0">
              <p className="text-xs font-bold text-slate-900 truncate group-hover:text-amber-700 transition-colors">
                Transport & RTO
              </p>
              <p className="text-[9px] text-slate-500 truncate">Logistics tracking</p>
            </div>
          </Link>

          <Link
            href="/superadmin/whatsapp"
            className="flex items-center gap-2 p-2 rounded-lg border border-slate-200/80 bg-slate-50/50 hover:bg-white hover:border-amber-400 hover:shadow-xs transition-all group"
          >
            <div className="p-1.5 rounded-md bg-green-50 text-green-600 group-hover:bg-green-100 transition-colors shrink-0">
              <MessageCircle className="w-3.5 h-3.5" />
            </div>
            <div className="min-w-0">
              <p className="text-xs font-bold text-slate-900 truncate group-hover:text-amber-700 transition-colors">
                WhatsApp Desk
              </p>
              <p className="text-[9px] text-slate-500 truncate">Broadcast campaigns</p>
            </div>
          </Link>

          <Link
            href="/superadmin/recurrence"
            className="flex items-center gap-2 p-2 rounded-lg border border-slate-200/80 bg-slate-50/50 hover:bg-white hover:border-amber-400 hover:shadow-xs transition-all group"
          >
            <div className="p-1.5 rounded-md bg-purple-50 text-purple-600 group-hover:bg-purple-100 transition-colors shrink-0">
              <Repeat className="w-3.5 h-3.5" />
            </div>
            <div className="min-w-0">
              <p className="text-xs font-bold text-slate-900 truncate group-hover:text-amber-700 transition-colors">
                Prime Members
              </p>
              <p className="text-[9px] text-slate-500 truncate">Recurring plans</p>
            </div>
          </Link>
        </div>
      </div>

      {/* 7. Footer: Platform Status & Credits (Compact & Crisp) */}
      <div className="pt-1.5 pb-1 flex flex-col sm:flex-row items-center justify-between gap-1.5 text-center sm:text-left text-[10px] font-medium text-slate-400 border-t border-slate-200/60">
        <div className="flex items-center gap-2">
          <span className="flex h-1.5 w-1.5 rounded-full bg-emerald-500" />
          <span>All 9 Platform Microservices & Engines Nominal</span>
          <span>•</span>
          <span>© 2026-2027 JCB Exchange</span>
        </div>

        <div className="flex items-center gap-1">
          <span>Crafted with</span>
          <Heart className="mx-0.5 h-3 w-3 inline-block shrink-0 fill-red-500 text-red-500" />
          <span>by</span>
          <a
            href="https://webitof.com/"
            target="_blank"
            rel="noopener noreferrer"
            className="font-semibold text-slate-600 hover:text-slate-900 underline transition-colors ml-0.5"
          >
            Webitof
          </a>
        </div>
      </div>
    </div>
  );
}
