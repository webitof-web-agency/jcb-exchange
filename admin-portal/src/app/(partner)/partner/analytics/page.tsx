'use client';

import { useEffect, useMemo, useState } from 'react';
import { BarChart3, CircleGauge, MessagesSquare, Trophy, Truck } from 'lucide-react';
import api from '@/lib/api';
import { formatPortalCurrency, formatPortalDate, formatPortalLabel } from '@/lib/partnerPortal';

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

const barPalette = ['bg-[#F7B500]', 'bg-blue-500', 'bg-green-500', 'bg-violet-500', 'bg-amber-500', 'bg-red-500'];

export default function PartnerAnalyticsPage() {
  const [data, setData] = useState<AnalyticsResponse>(emptyAnalytics);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    const loadAnalytics = async () => {
      try {
        const response = await api.get<AnalyticsResponse>('/analytics/partner-overview');
        if (!cancelled) {
          setData(response.data);
        }
      } catch (error) {
        console.error('Failed to load partner analytics:', error);
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    void loadAnalytics();

    return () => {
      cancelled = true;
    };
  }, []);

  const listingMax = useMemo(
    () => Math.max(1, ...data.listingStatusBreakdown.map((item) => item.count)),
    [data.listingStatusBreakdown]
  );
  const leadMax = useMemo(
    () => Math.max(1, ...data.leadStatusBreakdown.map((item) => item.count)),
    [data.leadStatusBreakdown]
  );
  const trendMax = useMemo(
    () => Math.max(1, ...data.monthlyLeadTrend.map((item) => item.count)),
    [data.monthlyLeadTrend]
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Performance analytics</h1>
          <p className="mt-1 text-sm text-gray-500">
            Inventory, enquiry pipeline, aur top-performing listings ka live business snapshot.
          </p>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-gray-500">Live Inventory</p>
            <Truck className="h-4 w-4 text-gray-400" />
          </div>
          <p className="mt-3 text-3xl font-bold text-gray-900">{loading ? '...' : data.summary.liveListings}</p>
          <p className="mt-2 text-sm text-gray-500">{loading ? 'Loading...' : `${data.summary.totalListings} total listings created`}</p>
        </div>
        <div className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-gray-500">Inventory Value</p>
            <CircleGauge className="h-4 w-4 text-[#B77900]" />
          </div>
          <p className="mt-3 text-3xl font-bold text-gray-900">
            {loading ? '...' : formatPortalCurrency(data.summary.liveInventoryValue)}
          </p>
          <p className="mt-2 text-sm text-gray-500">Live and reserve-ready stock valuation.</p>
        </div>
        <div className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-gray-500">Lead Throughput</p>
            <MessagesSquare className="h-4 w-4 text-blue-500" />
          </div>
          <p className="mt-3 text-3xl font-bold text-blue-700">{loading ? '...' : data.summary.totalLeads}</p>
          <p className="mt-2 text-sm text-gray-500">
            {loading ? 'Loading...' : `${data.summary.averageLeadsPerListing} avg leads per listing`}
          </p>
        </div>
        <div className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-gray-500">Conversion</p>
            <Trophy className="h-4 w-4 text-green-500" />
          </div>
          <p className="mt-3 text-3xl font-bold text-green-700">{loading ? '...' : `${data.summary.conversionRate}%`}</p>
          <p className="mt-2 text-sm text-gray-500">{loading ? 'Loading...' : `${data.summary.wonLeads} won leads recorded`}</p>
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
        <div className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-bold text-gray-900">Lead trend</h2>
              <p className="mt-1 text-sm text-gray-500">Last 6 months ka enquiry movement.</p>
            </div>
            <BarChart3 className="h-5 w-5 text-gray-400" />
          </div>

          {loading ? (
            <div className="mt-8 text-sm text-gray-500">Loading trend graph...</div>
          ) : data.monthlyLeadTrend.length === 0 ? (
            <div className="mt-8 rounded-xl border border-dashed border-gray-200 bg-gray-50 px-5 py-10 text-sm text-gray-500">
              Trend data tab dikhega jab leads aani start hongi.
            </div>
          ) : (
            <div className="mt-8 flex h-64 items-end gap-3">
              {data.monthlyLeadTrend.map((item, index) => (
                <div key={item.key} className="flex flex-1 flex-col items-center gap-3">
                  <div className="flex h-48 w-full items-end">
                    <div
                      className={`w-full rounded-t-xl ${barPalette[index % barPalette.length]} transition-all`}
                      style={{ height: `${Math.max(12, (item.count / trendMax) * 100)}%` }}
                    />
                  </div>
                  <div className="text-center">
                    <p className="text-sm font-semibold text-gray-900">{item.count}</p>
                    <p className="text-xs text-gray-500">{item.label}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="space-y-6">
          <div className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
            <h2 className="text-lg font-bold text-gray-900">Listing status mix</h2>
            <div className="mt-5 space-y-4">
              {loading ? (
                <p className="text-sm text-gray-500">Loading listing mix...</p>
              ) : data.listingStatusBreakdown.length === 0 ? (
                <p className="text-sm text-gray-500">No listings available yet.</p>
              ) : (
                data.listingStatusBreakdown.map((item, index) => (
                  <div key={item.status}>
                    <div className="mb-2 flex items-center justify-between text-sm">
                      <span className="font-medium text-gray-700">{item.label}</span>
                      <span className="text-gray-500">{item.count}</span>
                    </div>
                    <div className="h-2 rounded-full bg-gray-100">
                      <div
                        className={`h-2 rounded-full ${barPalette[index % barPalette.length]}`}
                        style={{ width: `${(item.count / listingMax) * 100}%` }}
                      />
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          <div className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
            <h2 className="text-lg font-bold text-gray-900">Lead stage mix</h2>
            <div className="mt-5 space-y-4">
              {loading ? (
                <p className="text-sm text-gray-500">Loading lead mix...</p>
              ) : data.leadStatusBreakdown.length === 0 ? (
                <p className="text-sm text-gray-500">No leads available yet.</p>
              ) : (
                data.leadStatusBreakdown.map((item, index) => (
                  <div key={item.status}>
                    <div className="mb-2 flex items-center justify-between text-sm">
                      <span className="font-medium text-gray-700">{item.label}</span>
                      <span className="text-gray-500">{item.count}</span>
                    </div>
                    <div className="h-2 rounded-full bg-gray-100">
                      <div
                        className={`h-2 rounded-full ${barPalette[(index + 1) % barPalette.length]}`}
                        style={{ width: `${(item.count / leadMax) * 100}%` }}
                      />
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
        <h2 className="text-lg font-bold text-gray-900">Top performing listings</h2>
        <p className="mt-1 text-sm text-gray-500">Jo inventory sabse zyada enquiry pull kar rahi hai.</p>

        {loading ? (
          <div className="mt-6 text-sm text-gray-500">Loading listing performance...</div>
        ) : data.topListings.length === 0 ? (
          <div className="mt-6 rounded-xl border border-dashed border-gray-200 bg-gray-50 px-5 py-10 text-sm text-gray-500">
            Listing performance yahan show hogi jab inventory save ho jayegi.
          </div>
        ) : (
          <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {data.topListings.map((listing) => (
              <div key={listing.id} className="rounded-2xl border border-gray-100 bg-gray-50 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-semibold text-gray-900">{listing.title}</p>
                    <p className="mt-1 text-sm text-gray-500">{listing.location || 'Location pending'}</p>
                  </div>
                  <span className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-gray-700 shadow-sm">
                    {formatPortalLabel(listing.status)}
                  </span>
                </div>
                <div className="mt-4 flex flex-wrap gap-2 text-xs text-gray-500">
                  <span className="rounded-full bg-white px-3 py-1">{listing.manufacturingYear}</span>
                  <span className="rounded-full bg-white px-3 py-1">{listing.leadCount} leads</span>
                  <span className="rounded-full bg-white px-3 py-1">{listing.wonLeadCount} won</span>
                </div>
                <p className="mt-4 text-lg font-bold text-gray-900">{formatPortalCurrency(listing.price)}</p>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
        <h2 className="text-lg font-bold text-gray-900">Recent enquiry activity</h2>
        <div className="mt-5 space-y-3">
          {loading ? (
            <p className="text-sm text-gray-500">Loading activity feed...</p>
          ) : data.recentLeads.length === 0 ? (
            <p className="text-sm text-gray-500">Recent enquiry activity abhi available nahi hai.</p>
          ) : (
            data.recentLeads.map((lead) => (
              <div key={lead.id} className="flex flex-col gap-2 rounded-xl border border-gray-100 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="font-medium text-gray-900">{lead.customerName}</p>
                  <p className="text-sm text-gray-500">{lead.listingTitle}</p>
                </div>
                <div className="flex flex-wrap items-center gap-3 text-xs text-gray-500">
                  <span className="rounded-full bg-gray-100 px-3 py-1 font-semibold text-gray-700">{formatPortalLabel(lead.status)}</span>
                  <span>{formatPortalLabel(lead.enquiryType)}</span>
                  <span>{formatPortalDate(lead.createdAt)}</span>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
