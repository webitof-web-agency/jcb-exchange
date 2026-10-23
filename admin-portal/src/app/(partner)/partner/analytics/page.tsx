'use client';

import React, { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  Activity,
  ArrowRight,
  BarChart3,
  CheckCircle2,
  CircleDollarSign,
  CircleGauge,
  Clock,
  ExternalLink,
  Flame,
  Layers,
  MessagesSquare,
  RotateCw,
  TrendingUp,
  Trophy,
  Truck,
  Users,
} from 'lucide-react';
import api from '@/lib/api';
import SafeRemoteImage from '@/components/ui/SafeRemoteImage';
import { formatPortalCurrency } from '@/lib/partnerPortal';
import { formatDateTime } from '@/lib/i18n/formatters';
import { getAbsoluteFileUrl } from '@/lib/fileUpload';
import { useTranslation } from '@/hooks/useTranslation';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip as RechartsTooltip,
  XAxis,
  YAxis,
} from 'recharts';

type AnalyticsResponse = {
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
  listingStatusBreakdown: Array<{
    status: string;
    label: string;
    count: number;
  }>;
  leadStatusBreakdown: Array<{
    status: string;
    label: string;
    count: number;
  }>;
  monthlyLeadTrend: Array<{
    key: string;
    label: string;
    count: number;
  }>;
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

const emptyAnalytics: AnalyticsResponse = {
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

const PIPELINE_COLORS: Record<string, string> = {
  NEW: '#3B82F6',
  CONTACTED: '#F59E0B',
  QUALIFIED: '#8B5CF6',
  INTERESTED: '#06B6D4',
  INSPECTION_SCHEDULED: '#EC4899',
  NEGOTIATION: '#EAB308',
  WON: '#10B981',
  LOST: '#EF4444',
  ON_HOLD: '#64748B',
};

export default function PartnerAnalyticsPage() {
  const { t, locale } = useTranslation();
  const [data, setData] = useState<AnalyticsResponse>(emptyAnalytics);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const loadAnalytics = async (isManual = false) => {
    if (isManual) setRefreshing(true);
    else setLoading(true);

    try {
      const response = await api.get<AnalyticsResponse>('/analytics/partner-overview');
      setData(response.data);
    } catch (error) {
      console.error('Failed to load partner analytics:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    void loadAnalytics();
  }, []);

  const totalListingCount = data.summary.totalListings || 1;
  const totalPipelineCount = useMemo(
    () => data.leadStatusBreakdown.reduce((sum, item) => sum + item.count, 0) || 1,
    [data.leadStatusBreakdown]
  );

  return (
    <div className="space-y-4 max-w-7xl mx-auto pb-10">
      {/* 1. Executive Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white p-4 sm:p-5 rounded-2xl border border-slate-200/90 shadow-2xs">
        <div className="flex items-center gap-3.5">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-amber-500/10 text-amber-600 border border-amber-500/20">
            <BarChart3 className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-base sm:text-lg font-bold text-slate-900 tracking-tight">
              Performance & Business Analytics
            </h1>
            <p className="text-xs text-slate-500 mt-0.5">
              Live intelligence on equipment valuation, demand velocity, and conversion funnel.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => loadAnalytics(true)}
            disabled={loading || refreshing}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-700 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-xl transition-all shadow-2xs disabled:opacity-50"
            title="Refresh metrics"
          >
            <RotateCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin text-amber-600' : ''}`} />
            <span className="hidden sm:inline">Refresh Data</span>
          </button>

          <Link
            href="/partner/listings"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-700 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-xl transition-all shadow-2xs"
          >
            <Truck className="w-3.5 h-3.5 text-slate-500" />
            <span>Inventory</span>
          </Link>

          <Link
            href="/partner/leads"
            className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-bold text-slate-950 bg-[#FFC107] hover:bg-[#E5AD06] rounded-xl transition-all shadow-xs"
          >
            <MessagesSquare className="w-4 h-4" />
            <span>Buyer Pipeline</span>
          </Link>
        </div>
      </div>

      {/* 2. KPI Cards Strip */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        {/* Metric 1 */}
        <div className="rounded-2xl bg-white p-4 sm:p-5 border border-slate-200/90 shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">Live Inventory</span>
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-500/10 text-amber-600">
              <Truck className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-2.5 flex items-baseline gap-2">
            <span className="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight">
              {loading ? '...' : data.summary.liveListings}
            </span>
            <span className="text-xs font-semibold text-slate-500">units</span>
          </div>
          <p className="mt-2 text-[11px] text-slate-500">
            {data.summary.totalListings} total created · {data.summary.pendingListings} in review
          </p>
        </div>

        {/* Metric 2 */}
        <div className="rounded-2xl bg-white p-4 sm:p-5 border border-slate-200/90 shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">Fleet Valuation</span>
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
            Active market valuation of live equipment
          </p>
        </div>

        {/* Metric 3 */}
        <div className="rounded-2xl bg-white p-4 sm:p-5 border border-slate-200/90 shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">Total Enquiries</span>
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-500/10 text-blue-600">
              <MessagesSquare className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-2.5 flex items-baseline gap-2">
            <span className="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight">
              {loading ? '...' : data.summary.totalLeads}
            </span>
            <span className="text-xs font-semibold text-slate-500">leads</span>
          </div>
          <p className="mt-2 text-[11px] text-slate-500">
            Avg {data.summary.averageLeadsPerListing} inquiries per active machine
          </p>
        </div>

        {/* Metric 4 */}
        <div className="rounded-2xl bg-white p-4 sm:p-5 border border-slate-200/90 shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">Deal Conversion</span>
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-purple-500/10 text-purple-600">
              <Trophy className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-2.5 flex items-baseline gap-2">
            <span className="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight">
              {loading ? '...' : `${data.summary.conversionRate}%`}
            </span>
          </div>
          <p className="mt-2 text-[11px] text-slate-500">
            {data.summary.wonLeads} deals won · {data.summary.soldListings} sold vehicles
          </p>
        </div>
      </div>

      {/* 3. Charts Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Left 2 Cols: 6-Month Lead Trend */}
        <div className="lg:col-span-2 rounded-2xl bg-white p-4 sm:p-5 border border-slate-200/90 shadow-2xs flex flex-col justify-between">
          <div className="flex items-center justify-between mb-2">
            <div>
              <h3 className="text-sm font-bold text-slate-900">Enquiry Trajectory</h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Monthly buyer inquiry volume across the last 6 months.
              </p>
            </div>
            <span className="text-[10px] font-bold text-slate-600 bg-slate-100 px-2 py-0.5 rounded-full">
              6-Month Trend
            </span>
          </div>

          <div className="h-64 w-full mt-3">
            {loading ? (
              <div className="flex h-full items-center justify-center text-xs text-slate-400">
                Loading trend data...
              </div>
            ) : data.monthlyLeadTrend.length === 0 ? (
              <div className="flex h-full items-center justify-center text-xs text-slate-400">
                No monthly data recorded yet.
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={data.monthlyLeadTrend} margin={{ top: 10, right: 10, left: -25, bottom: 0 }}>
                  <defs>
                    <linearGradient id="analyticsTrendGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#F59E0B" stopOpacity={0.4} />
                      <stop offset="95%" stopColor="#F59E0B" stopOpacity={0.0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#F1F5F9" />
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
                      backgroundColor: '#0F172A',
                      borderRadius: '10px',
                      border: 'none',
                      color: '#FFFFFF',
                      fontSize: '12px',
                      padding: '8px 12px',
                    }}
                    labelStyle={{ color: '#FCD34D', fontWeight: 'bold' }}
                  />
                  <Area
                    type="monotone"
                    dataKey="count"
                    name="Leads"
                    stroke="#D97706"
                    strokeWidth={2.5}
                    fillOpacity={1}
                    fill="url(#analyticsTrendGrad)"
                  />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        {/* Right 1 Col: Listing Inventory Distribution */}
        <div className="rounded-2xl bg-white p-4 sm:p-5 border border-slate-200/90 shadow-2xs flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-sm font-bold text-slate-900">Inventory Status Mix</h3>
              <span className="text-[10px] font-bold text-amber-700 bg-amber-50 px-2 py-0.5 rounded-full border border-amber-200/60">
                {data.summary.totalListings} machines
              </span>
            </div>
            <p className="text-xs text-slate-500 mb-4">
              Status distribution of your equipment on the platform.
            </p>

            <div className="space-y-3.5">
              {data.listingStatusBreakdown.map((item) => {
                const percentage = Math.round((item.count / totalListingCount) * 100);
                const isPublished = item.status === 'PUBLISHED' || item.status === 'ACTIVE';
                const isPending = item.status.includes('PENDING');

                return (
                  <div key={item.status}>
                    <div className="flex items-center justify-between text-xs mb-1">
                      <span className="font-semibold text-slate-700 flex items-center gap-1.5">
                        <span
                          className={`h-2 w-2 rounded-full ${
                            isPublished ? 'bg-emerald-500' : isPending ? 'bg-amber-500' : 'bg-slate-400'
                          }`}
                        />
                        {item.label}
                      </span>
                      <span className="font-bold text-slate-900">
                        {item.count} <span className="text-slate-400 font-normal">({percentage}%)</span>
                      </span>
                    </div>
                    <div className="h-2 w-full rounded-full bg-slate-100 overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all ${
                          isPublished ? 'bg-emerald-500' : isPending ? 'bg-amber-500' : 'bg-slate-400'
                        }`}
                        style={{ width: `${percentage}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="mt-5 p-3 rounded-xl bg-slate-50 border border-slate-200/80 text-[11px] text-slate-600">
            <span className="font-bold text-slate-800">Note: </span>
            Keep pending machines updated with chassis documents to speed up admin verification.
          </div>
        </div>
      </div>

      {/* 4. Buyer Pipeline Stage Breakdown & Top Equipment Velocity */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Pipeline Stage Funnel */}
        <div className="rounded-2xl bg-white p-4 sm:p-5 border border-slate-200/90 shadow-2xs">
          <div className="flex items-center justify-between mb-3">
            <div>
              <h3 className="text-sm font-bold text-slate-900">CRM Deal Pipeline Stages</h3>
              <p className="text-xs text-slate-500 mt-0.5">Active buyer inquiries by deal progress.</p>
            </div>
            <Link
              href="/partner/leads"
              className="text-xs font-bold text-amber-600 hover:text-amber-700 flex items-center gap-1"
            >
              Open CRM <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </div>

          {loading ? (
            <div className="py-8 text-center text-xs text-slate-400">Loading pipeline...</div>
          ) : data.leadStatusBreakdown.length === 0 ? (
            <div className="py-8 text-center text-xs text-slate-400">No leads in pipeline yet.</div>
          ) : (
            <div className="space-y-3 pt-2">
              {data.leadStatusBreakdown.map((item) => {
                const color = PIPELINE_COLORS[item.status.toUpperCase()] || '#64748B';
                const percentage = Math.round((item.count / totalPipelineCount) * 100);

                return (
                  <div key={item.status} className="p-2.5 rounded-xl bg-slate-50/70 border border-slate-100">
                    <div className="flex items-center justify-between text-xs mb-1.5">
                      <span className="font-bold text-slate-800 flex items-center gap-2">
                        <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ backgroundColor: color }} />
                        {item.label}
                      </span>
                      <span className="font-black text-slate-900">
                        {item.count} deals <span className="text-slate-400 font-normal">({percentage}%)</span>
                      </span>
                    </div>
                    <div className="h-1.5 w-full rounded-full bg-slate-200/70 overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all"
                        style={{ width: `${percentage}%`, backgroundColor: color }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Highest Lead Velocity Equipment */}
        <div className="rounded-2xl bg-white p-4 sm:p-5 border border-slate-200/90 shadow-2xs flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-3">
              <div>
                <h3 className="text-sm font-bold text-slate-900">Top Performing Machinery</h3>
                <p className="text-xs text-slate-500 mt-0.5">Vehicles generating the highest buyer interest.</p>
              </div>
              <Link
                href="/partner/listings"
                className="text-xs font-bold text-amber-600 hover:text-amber-700 flex items-center gap-1"
              >
                All Listings <ArrowRight className="w-3.5 h-3.5" />
              </Link>
            </div>

            <div className="divide-y divide-slate-100 max-h-[340px] overflow-y-auto custom-scrollbar">
              {loading ? (
                <div className="py-8 text-center text-xs text-slate-400">Loading listings...</div>
              ) : data.topListings.length === 0 ? (
                <div className="py-8 text-center text-xs text-slate-400">No active equipment generating leads.</div>
              ) : (
                data.topListings.map((listing, idx) => (
                  <div key={listing.id} className="py-2.5 first:pt-0 last:pb-0 flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-slate-100 text-[11px] font-bold text-slate-600">
                        #{idx + 1}
                      </span>
                      <div className="relative h-10 w-14 shrink-0 overflow-hidden rounded-lg bg-slate-100 border border-slate-200">
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
                        <p className="text-[11px] font-semibold text-amber-600">
                          {formatPortalCurrency(listing.price)}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <span className="inline-flex items-center gap-1 text-[11px] font-bold text-blue-700 bg-blue-50 px-2 py-0.5 rounded-full border border-blue-200/60">
                        <MessagesSquare className="w-3 h-3 text-blue-600" />
                        {listing.leadCount}
                      </span>
                      {listing.wonLeadCount > 0 && (
                        <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-200">
                          {listing.wonLeadCount} Won
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
    </div>
  );
}
