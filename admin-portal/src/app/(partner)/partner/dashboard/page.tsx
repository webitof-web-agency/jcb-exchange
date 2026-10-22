'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  Activity,
  ArrowRight,
  CheckCircle2,
  CircleDollarSign,
  Clock,
  MessagesSquare,
  Plus,
  RotateCw,
  ShieldCheck,
  TrendingUp,
  Trophy,
  Truck,
  Flame,
  ChevronRight,
  ExternalLink,
} from 'lucide-react';
import { useAuthStore } from '@/store/authStore';
import api from '@/lib/api';
import SafeRemoteImage from '@/components/ui/SafeRemoteImage';
import { formatPartnerTypeLabel } from '@/lib/partnerType';
import { formatPortalCurrency } from '@/lib/partnerPortal';
import { formatDateTime } from '@/lib/i18n/formatters';
import { getAbsoluteFileUrl } from '@/lib/fileUpload';
import { useTranslation } from '@/hooks/useTranslation';
import { Area, AreaChart, ResponsiveContainer, Tooltip as RechartsTooltip, XAxis, YAxis } from 'recharts';

type DashboardAnalyticsResponse = {
  summary: {
    totalListings: number;
    liveListings: number;
    publishedListings: number;
    pendingListings: number;
    soldListings: number;
    totalLeads: number;
    activeLeads: number;
    wonLeads: number;
    conversionRate: number;
    averageLeadsPerListing: number;
    liveInventoryValue: number;
  };
  listingStatusBreakdown: Array<{ status: string; label: string; count: number }>;
  leadStatusBreakdown: Array<{ status: string; label: string; count: number }>;
  monthlyLeadTrend: Array<{ key: string; label: string; count: number }>;
  topListings: Array<{
    id: string;
    title: string;
    status: string;
    price: number;
    location: string;
    manufacturingYear: number;
    leadCount: number;
    wonLeadCount: number;
    featuredImage: string;
  }>;
  recentLeads: Array<{
    id: string;
    status: string;
    enquiryType: string;
    createdAt: string;
    customerName: string;
    listingTitle: string;
  }>;
};

const emptyDashboardData: DashboardAnalyticsResponse = {
  summary: {
    totalListings: 0,
    liveListings: 0,
    publishedListings: 0,
    pendingListings: 0,
    soldListings: 0,
    totalLeads: 0,
    activeLeads: 0,
    wonLeads: 0,
    conversionRate: 0,
    averageLeadsPerListing: 0,
    liveInventoryValue: 0,
  },
  listingStatusBreakdown: [],
  leadStatusBreakdown: [],
  monthlyLeadTrend: [],
  topListings: [],
  recentLeads: [],
};

const formatLeadStatus = (value: string) =>
  value
    .toLowerCase()
    .split('_')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');

function formatRelativeTime(dateStr: string): string {
  try {
    const date = new Date(dateStr);
    const now = new Date();
    const diffSec = Math.floor((now.getTime() - date.getTime()) / 1000);
    if (diffSec < 60) return 'Just now';
    const diffMin = Math.floor(diffSec / 60);
    if (diffMin < 60) return `${diffMin}m ago`;
    const diffHr = Math.floor(diffMin / 60);
    if (diffHr < 24) return `${diffHr}h ago`;
    const diffDays = Math.floor(diffHr / 24);
    if (diffDays === 1) return 'Yesterday';
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' });
  } catch {
    return dateStr;
  }
}

export default function PartnerDashboard() {
  const user = useAuthStore((state) => state.user);
  const { t, locale } = useTranslation();
  const [data, setData] = useState<DashboardAnalyticsResponse>(emptyDashboardData);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const loadDashboard = async (isManual = false) => {
    if (isManual) setRefreshing(true);
    else setLoading(true);

    try {
      const response = await api.get<DashboardAnalyticsResponse>('/analytics/partner-overview');
      setData(response.data);
    } catch (error) {
      console.error('Failed to load partner dashboard analytics:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    void loadDashboard();
  }, []);

  const partnerName = user?.name || user?.ownerName || 'Partner';
  const partnerCompany = user?.businessName || '';

  return (
    <div className="space-y-4 max-w-7xl mx-auto pb-10">
      {/* 1. Header Command Strip */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 bg-white p-4 sm:p-5 rounded-2xl border border-slate-200/90 shadow-2xs">
        <div className="flex items-center gap-3.5 min-w-0">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-amber-400 to-amber-600 text-slate-950 font-black shadow-xs">
            {partnerName.charAt(0).toUpperCase()}
          </div>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-base sm:text-lg font-bold text-slate-900 tracking-tight truncate">
                Welcome back, {partnerName}
              </h1>
              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-bold text-emerald-700 border border-emerald-200/80">
                <CheckCircle2 className="h-3 w-3 text-emerald-600" />
                Verified Partner
              </span>
              <span className="inline-flex items-center rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-bold text-amber-800 border border-amber-200/80">
                {formatPartnerTypeLabel(user?.partnerType, 'Dealer')}
              </span>
            </div>
            <p className="text-xs text-slate-500 mt-0.5 truncate">
              {partnerCompany ? `${partnerCompany} · ` : ''}Manage active machinery, buyer enquiries, and deal conversions.
            </p>
          </div>
        </div>

        {/* Quick Action Buttons */}
        <div className="flex items-center gap-2 shrink-0 pt-2 md:pt-0 border-t md:border-t-0 border-slate-100">
          <button
            type="button"
            onClick={() => loadDashboard(true)}
            disabled={loading || refreshing}
            className="p-2 text-slate-500 hover:text-slate-800 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-xl transition-all shadow-2xs disabled:opacity-50"
            title="Refresh dashboard metrics"
          >
            <RotateCw className={`h-4 w-4 ${refreshing ? 'animate-spin text-amber-600' : ''}`} />
          </button>

          <Link
            href="/partner/leads"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-700 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-xl transition-all shadow-2xs"
          >
            <MessagesSquare className="w-3.5 h-3.5 text-slate-500" />
            <span className="hidden sm:inline">Enquiries</span>
          </Link>

          <Link
            href="/partner/analytics"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-700 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-xl transition-all shadow-2xs"
          >
            <Activity className="w-3.5 h-3.5 text-slate-500" />
            <span className="hidden sm:inline">Analytics</span>
          </Link>

          <Link
            href="/partner/listings"
            className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-bold text-slate-950 bg-[#FFC107] hover:bg-[#E5AD06] rounded-xl transition-all shadow-xs"
          >
            <Plus className="w-4 h-4" />
            <span>Add Vehicle</span>
          </Link>
        </div>
      </div>

      {/* 2. Executive KPI Cards (4 Column Grid) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        {/* Card 1: Live Inventory */}
        <Link
          href="/partner/listings"
          className="group relative overflow-hidden rounded-2xl bg-white p-4 sm:p-5 border border-slate-200/90 shadow-2xs hover:shadow-sm hover:border-amber-300 transition-all duration-150"
        >
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">Live Inventory</span>
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-500/10 text-amber-600 group-hover:scale-105 transition-transform">
              <Truck className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-2.5 flex items-baseline gap-2">
            <span className="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight">
              {loading ? '...' : data.summary.liveListings}
            </span>
            <span className="text-xs font-semibold text-slate-500">machines</span>
          </div>
          <div className="mt-2 flex items-center gap-1.5 text-[11px] text-slate-500">
            {data.summary.pendingListings > 0 ? (
              <span className="font-bold text-amber-600 bg-amber-50 px-1.5 py-0.2 rounded border border-amber-200/60">
                {data.summary.pendingListings} pending review
              </span>
            ) : (
              <span className="text-emerald-600 font-semibold flex items-center gap-1">
                <CheckCircle2 className="h-3 w-3" /> All approved
              </span>
            )}
            <span className="text-slate-300">•</span>
            <span>{data.summary.totalListings} total</span>
          </div>
          <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-gradient-to-r from-amber-400 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
        </Link>

        {/* Card 2: Stock Valuation */}
        <div className="group relative overflow-hidden rounded-2xl bg-white p-4 sm:p-5 border border-slate-200/90 shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">Inventory Valuation</span>
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-600">
              <CircleDollarSign className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-2.5">
            <span className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight">
              {loading ? '...' : formatPortalCurrency(data.summary.liveInventoryValue)}
            </span>
          </div>
          <p className="mt-2 text-[11px] text-slate-500">
            Estimated market value across live stock
          </p>
          <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-gradient-to-r from-emerald-400 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
        </div>

        {/* Card 3: Buyer Inquiries */}
        <Link
          href="/partner/leads"
          className="group relative overflow-hidden rounded-2xl bg-white p-4 sm:p-5 border border-slate-200/90 shadow-2xs hover:shadow-sm hover:border-blue-300 transition-all duration-150"
        >
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">Total Enquiries</span>
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-500/10 text-blue-600 group-hover:scale-105 transition-transform">
              <MessagesSquare className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-2.5 flex items-baseline gap-2">
            <span className="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight">
              {loading ? '...' : data.summary.totalLeads}
            </span>
            <span className="text-xs font-semibold text-slate-500">leads</span>
          </div>
          <div className="mt-2 flex items-center gap-1.5 text-[11px] text-slate-500">
            <span className="font-bold text-blue-600 bg-blue-50 px-1.5 py-0.2 rounded border border-blue-200/60">
              {data.summary.activeLeads} active
            </span>
            <span className="text-slate-300">•</span>
            <span>Avg {data.summary.averageLeadsPerListing}/unit</span>
          </div>
          <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-gradient-to-r from-blue-400 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
        </Link>

        {/* Card 4: Deal Conversion Rate */}
        <Link
          href="/partner/analytics"
          className="group relative overflow-hidden rounded-2xl bg-white p-4 sm:p-5 border border-slate-200/90 shadow-2xs hover:shadow-sm hover:border-purple-300 transition-all duration-150"
        >
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">Conversion Rate</span>
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-purple-500/10 text-purple-600 group-hover:scale-105 transition-transform">
              <Trophy className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-2.5 flex items-baseline gap-2">
            <span className="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight">
              {loading ? '...' : `${data.summary.conversionRate}%`}
            </span>
          </div>
          <div className="mt-2 flex items-center gap-1.5 text-[11px] text-slate-500">
            <span className="font-bold text-purple-700 bg-purple-50 px-1.5 py-0.2 rounded border border-purple-200/60">
              {data.summary.wonLeads} won deals
            </span>
            <span className="text-slate-300">•</span>
            <span>{data.summary.soldListings} sold vehicles</span>
          </div>
          <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-gradient-to-r from-purple-400 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
        </Link>
      </div>

      {/* 3. Middle Section: Charts & Inventory Breakdown */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Left (2 cols): Lead Volume Trend */}
        <div className="lg:col-span-2 rounded-2xl bg-white p-4 sm:p-5 border border-slate-200/90 shadow-2xs flex flex-col justify-between">
          <div className="flex items-center justify-between mb-3">
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-bold text-slate-900">Enquiry Growth & Velocity</h3>
                <span className="text-[10px] font-semibold text-slate-500 bg-slate-100 px-2 py-0.5 rounded-full">
                  Last 6 Months
                </span>
              </div>
              <p className="text-xs text-slate-500 mt-0.5">
                Monthly buyer inquiries received across your listed fleet.
              </p>
            </div>
            <Link
              href="/partner/analytics"
              className="text-xs font-bold text-amber-600 hover:text-amber-700 flex items-center gap-1"
            >
              Analytics <ChevronRight className="w-3.5 h-3.5" />
            </Link>
          </div>

          <div className="h-60 w-full mt-2">
            {loading ? (
              <div className="flex h-full items-center justify-center text-xs text-slate-400">
                Loading volume trend...
              </div>
            ) : data.monthlyLeadTrend.length === 0 ? (
              <div className="flex h-full flex-col items-center justify-center text-xs text-slate-400">
                No inquiry trends recorded yet.
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={data.monthlyLeadTrend} margin={{ top: 8, right: 10, left: -25, bottom: 0 }}>
                  <defs>
                    <linearGradient id="leadTrendGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#F59E0B" stopOpacity={0.35} />
                      <stop offset="95%" stopColor="#F59E0B" stopOpacity={0.0} />
                    </linearGradient>
                  </defs>
                  <XAxis
                    dataKey="label"
                    axisLine={false}
                    tickLine={false}
                    tick={{ fontSize: 11, fill: '#64748B', fontWeight: 600 }}
                    dy={5}
                  />
                  <YAxis
                    axisLine={false}
                    tickLine={false}
                    tick={{ fontSize: 11, fill: '#64748B' }}
                    allowDecimals={false}
                  />
                  <RechartsTooltip
                    contentStyle={{
                      backgroundColor: '#1E293B',
                      borderRadius: '10px',
                      border: 'none',
                      color: '#F8FAFC',
                      fontSize: '12px',
                      padding: '8px 12px',
                      boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.2)',
                    }}
                    labelStyle={{ color: '#FCD34D', fontWeight: 'bold', marginBottom: '2px' }}
                  />
                  <Area
                    type="monotone"
                    dataKey="count"
                    name="Leads"
                    stroke="#D97706"
                    strokeWidth={2.5}
                    fillOpacity={1}
                    fill="url(#leadTrendGrad)"
                  />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        {/* Right (1 col): Fleet & Pipeline Health */}
        <div className="rounded-2xl bg-white p-4 sm:p-5 border border-slate-200/90 shadow-2xs flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-bold text-slate-900">Inventory Distribution</h3>
              <span className="text-[10px] font-bold text-amber-700 bg-amber-50 px-2 py-0.5 rounded-full border border-amber-200/60">
                {data.summary.totalListings} total
              </span>
            </div>
            <p className="text-xs text-slate-500 mb-4">
              Real-time snapshot of published vs pending approval machines.
            </p>

            <div className="space-y-3">
              <div>
                <div className="flex items-center justify-between text-xs mb-1">
                  <span className="font-semibold text-slate-700 flex items-center gap-1.5">
                    <span className="h-2 w-2 rounded-full bg-emerald-500" />
                    Published / Live
                  </span>
                  <span className="font-bold text-slate-900">
                    {data.summary.publishedListings} ({data.summary.totalListings ? Math.round((data.summary.publishedListings / data.summary.totalListings) * 100) : 0}%)
                  </span>
                </div>
                <div className="h-2 w-full rounded-full bg-slate-100 overflow-hidden">
                  <div
                    className="h-full bg-emerald-500 rounded-full transition-all"
                    style={{
                      width: `${data.summary.totalListings ? (data.summary.publishedListings / data.summary.totalListings) * 100 : 0}%`,
                    }}
                  />
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between text-xs mb-1">
                  <span className="font-semibold text-slate-700 flex items-center gap-1.5">
                    <span className="h-2 w-2 rounded-full bg-amber-500" />
                    Pending Verification
                  </span>
                  <span className="font-bold text-slate-900">
                    {data.summary.pendingListings} ({data.summary.totalListings ? Math.round((data.summary.pendingListings / data.summary.totalListings) * 100) : 0}%)
                  </span>
                </div>
                <div className="h-2 w-full rounded-full bg-slate-100 overflow-hidden">
                  <div
                    className="h-full bg-amber-500 rounded-full transition-all"
                    style={{
                      width: `${data.summary.totalListings ? (data.summary.pendingListings / data.summary.totalListings) * 100 : 0}%`,
                    }}
                  />
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between text-xs mb-1">
                  <span className="font-semibold text-slate-700 flex items-center gap-1.5">
                    <span className="h-2 w-2 rounded-full bg-blue-500" />
                    Sold / Closed Out
                  </span>
                  <span className="font-bold text-slate-900">
                    {data.summary.soldListings} ({data.summary.totalListings ? Math.round((data.summary.soldListings / data.summary.totalListings) * 100) : 0}%)
                  </span>
                </div>
                <div className="h-2 w-full rounded-full bg-slate-100 overflow-hidden">
                  <div
                    className="h-full bg-blue-500 rounded-full transition-all"
                    style={{
                      width: `${data.summary.totalListings ? (data.summary.soldListings / data.summary.totalListings) * 100 : 0}%`,
                    }}
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Quick CTA Box */}
          <div className="mt-5 p-3 rounded-xl bg-amber-500/10 border border-amber-500/20 text-xs">
            <div className="flex items-center gap-2 text-amber-900 font-bold">
              <Flame className="w-3.5 h-3.5 text-amber-600" />
              <span>Pro Tip for Faster Sales</span>
            </div>
            <p className="text-slate-600 mt-1 leading-relaxed text-[11px]">
              Listings with chassis RC verification and 5+ photos receive 3.4x more buyer calls.
            </p>
          </div>
        </div>
      </div>

      {/* 4. Bottom Grid: Recent Inquiries & Top Performing Vehicles */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Recent Inquiries */}
        <div className="rounded-2xl bg-white border border-slate-200/90 shadow-2xs flex flex-col overflow-hidden">
          <div className="p-4 sm:p-5 border-b border-slate-100 flex items-center justify-between">
            <div>
              <h3 className="text-sm font-bold text-slate-900">Recent Customer Inquiries</h3>
              <p className="text-xs text-slate-500 mt-0.5">Direct buyer leads received for your fleet.</p>
            </div>
            <Link
              href="/partner/leads"
              className="text-xs font-bold text-amber-600 hover:text-amber-700 flex items-center gap-1"
            >
              View All <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </div>

          <div className="p-3 sm:p-4 divide-y divide-slate-100 flex-1 overflow-y-auto max-h-[360px] custom-scrollbar">
            {loading ? (
              <div className="py-8 text-center text-xs text-slate-400">Loading inquiries...</div>
            ) : data.recentLeads.length === 0 ? (
              <div className="py-10 text-center">
                <MessagesSquare className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                <p className="text-xs font-semibold text-slate-700">No enquiries received yet</p>
                <p className="text-[11px] text-slate-400 mt-0.5">When buyers submit inquiries on your vehicles, they will appear here.</p>
              </div>
            ) : (
              data.recentLeads.map((lead) => (
                <div
                  key={lead.id}
                  className="py-3 first:pt-0 last:pb-0 flex items-start justify-between gap-3 hover:bg-slate-50/60 p-2 rounded-xl transition-colors"
                >
                  <div className="flex items-start gap-2.5 min-w-0">
                    <div className="h-8 w-8 rounded-full bg-amber-100 text-amber-800 font-bold text-xs flex items-center justify-center shrink-0">
                      {lead.customerName ? lead.customerName.charAt(0).toUpperCase() : 'C'}
                    </div>
                    <div className="min-w-0">
                      <p className="text-xs font-bold text-slate-900 truncate">{lead.customerName}</p>
                      <p className="text-[11px] text-slate-600 truncate mt-0.5" title={lead.listingTitle}>
                        {lead.listingTitle}
                      </p>
                      <div className="flex items-center gap-2 text-[10px] text-slate-400 mt-1">
                        <span className="flex items-center gap-0.5">
                          <Clock className="w-2.5 h-2.5" />
                          {formatRelativeTime(lead.createdAt)}
                        </span>
                        <span>•</span>
                        <span>{formatLeadStatus(lead.enquiryType)}</span>
                      </div>
                    </div>
                  </div>
                  <span className="shrink-0 px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-50 text-blue-700 border border-blue-200/60">
                    {formatLeadStatus(lead.status)}
                  </span>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Top Performing Machinery */}
        <div className="rounded-2xl bg-white border border-slate-200/90 shadow-2xs flex flex-col overflow-hidden">
          <div className="p-4 sm:p-5 border-b border-slate-100 flex items-center justify-between">
            <div>
              <h3 className="text-sm font-bold text-slate-900">Top Performing Machinery</h3>
              <p className="text-xs text-slate-500 mt-0.5">Units attracting highest buyer demand.</p>
            </div>
            <Link
              href="/partner/listings"
              className="text-xs font-bold text-amber-600 hover:text-amber-700 flex items-center gap-1"
            >
              Manage Fleet <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </div>

          <div className="p-3 sm:p-4 divide-y divide-slate-100 flex-1 overflow-y-auto max-h-[360px] custom-scrollbar">
            {loading ? (
              <div className="py-8 text-center text-xs text-slate-400">Loading top listings...</div>
            ) : data.topListings.length === 0 ? (
              <div className="py-10 text-center">
                <Truck className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                <p className="text-xs font-semibold text-slate-700">No active listings driving leads yet</p>
                <p className="text-[11px] text-slate-400 mt-0.5">Create and publish machinery to start tracking performance.</p>
              </div>
            ) : (
              data.topListings.map((listing) => (
                <div
                  key={listing.id}
                  className="py-3 first:pt-0 last:pb-0 flex items-center justify-between gap-3 hover:bg-slate-50/60 p-2 rounded-xl transition-colors"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="relative h-12 w-16 shrink-0 overflow-hidden rounded-lg bg-slate-100 border border-slate-200">
                      {listing.featuredImage ? (
                        <SafeRemoteImage
                          src={getAbsoluteFileUrl(listing.featuredImage)}
                          alt={listing.title}
                          className="h-full w-full object-cover"
                          fallback={
                            <div className="flex h-full w-full items-center justify-center text-slate-400">
                              <Truck className="h-4 w-4" />
                            </div>
                          }
                        />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center text-slate-400">
                          <Truck className="h-4 w-4" />
                        </div>
                      )}
                    </div>
                    <div className="min-w-0">
                      <p className="text-xs font-bold text-slate-900 truncate" title={listing.title}>
                        {listing.title}
                      </p>
                      <p className="text-[11px] text-slate-500 mt-0.5">
                        {listing.manufacturingYear} · {listing.location}
                      </p>
                      <p className="text-xs font-black text-amber-600 mt-0.5">
                        {formatPortalCurrency(listing.price)}
                      </p>
                    </div>
                  </div>

                  <div className="flex flex-col items-end gap-1 shrink-0">
                    <span className="inline-flex items-center gap-1 text-[10px] font-bold text-blue-700 bg-blue-50 px-2 py-0.5 rounded-full border border-blue-200/60">
                      <MessagesSquare className="w-3 h-3 text-blue-600" />
                      {listing.leadCount} leads
                    </span>
                    {listing.wonLeadCount > 0 && (
                      <span className="text-[9px] font-bold text-emerald-700 bg-emerald-50 px-1.5 py-0.2 rounded border border-emerald-200">
                        {listing.wonLeadCount} Closed Won
                      </span>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
