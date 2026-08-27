'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { Activity, CircleDollarSign, MessagesSquare, Truck } from 'lucide-react';
import { useAuthStore } from '@/store/authStore';
import api from '@/lib/api';
import { formatPartnerTypeLabel } from '@/lib/partnerType';
import { formatPortalCurrency, formatPortalDateTime } from '@/lib/partnerPortal';
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

export default function PartnerDashboard() {
  const user = useAuthStore((state) => state.user);
  const { t } = useTranslation();
  const [data, setData] = useState<DashboardAnalyticsResponse>(emptyDashboardData);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    const loadDashboard = async () => {
      try {
        const response = await api.get<DashboardAnalyticsResponse>('/analytics/partner-overview');
        if (!cancelled) {
          setData(response.data);
        }
      } catch (error) {
        console.error('Failed to load partner dashboard analytics:', error);
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    void loadDashboard();

    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="max-w-7xl space-y-6">
      <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-gray-900">{t('partnerDashboard.workspaceTitle')}</h2>
          <p className="text-sm text-gray-500">{t('partnerDashboard.workspaceDescription')}</p>
        </div>
        <div className="flex items-center gap-3">
           <span className="rounded-full border border-green-200 bg-green-50 px-3 py-1 text-xs font-semibold uppercase tracking-wider text-green-700">{user?.accountStatus || t('partnerDashboard.activeStatus')}</span>
           <span className="rounded-full border border-blue-200 bg-blue-50 px-3 py-1 text-xs font-semibold uppercase tracking-wider text-blue-700">{formatPartnerTypeLabel(user?.partnerType)}</span>
        </div>
      </div>

      <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-2">
        {/* Stat Cards */}
        <div className="relative overflow-hidden rounded-2xl bg-white p-6 shadow-sm ring-1 ring-gray-100">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-gray-500">{t('partnerDashboard.liveListings')}</h3>
            <div className="rounded-xl bg-[#FFC107]/10 p-2 text-[#FFC107]">
              <Truck className="h-5 w-5" />
            </div>
          </div>
          <p className="mt-4 text-3xl font-bold text-gray-900">{loading ? '...' : data.summary.liveListings}</p>
          <div className="mt-2 flex items-center text-xs text-gray-500 gap-1.5">
             <span className="font-semibold text-orange-500">{data.summary.pendingListings}</span> {t('partnerDashboard.pendingApproval')}
          </div>
          <div className="absolute -right-4 -top-4 h-24 w-24 rounded-full bg-gradient-to-br from-[#FFC107]/10 to-transparent blur-2xl"></div>
        </div>



        <div className="relative overflow-hidden rounded-2xl bg-white p-6 shadow-sm ring-1 ring-gray-100">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-gray-500">{t('partnerDashboard.inventoryValue')}</h3>
            <div className="rounded-xl bg-emerald-100 p-2 text-emerald-600">
              <CircleDollarSign className="h-5 w-5" />
            </div>
          </div>
          <p className="mt-4 text-3xl font-bold text-gray-900">{loading ? '...' : formatPortalCurrency(data.summary.liveInventoryValue)}</p>
          <div className="mt-2 flex items-center text-xs text-gray-500 gap-1.5">
             {t('partnerDashboard.acrossActiveMachinesPrefix')} <span className="font-semibold text-gray-700">{data.summary.liveListings}</span> {t('partnerDashboard.acrossActiveMachinesSuffix')}
          </div>
          <div className="absolute -right-4 -top-4 h-24 w-24 rounded-full bg-gradient-to-br from-emerald-100 to-transparent blur-2xl"></div>
        </div>



      </section>

      {/* Charts Section */}
      <section className="w-full">
        {/* Lead Growth Trend */}
        <div className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-gray-100">
          <div className="mb-6 flex items-center justify-between">
            <div>
              <h3 className="text-lg font-bold text-gray-900">{t('partnerDashboard.leadVolumeTrend')}</h3>
              <p className="text-sm text-gray-500">{t('partnerDashboard.lastSixMonths')}</p>
            </div>
            <Activity className="h-5 w-5 text-gray-400" />
          </div>
          <div className="h-72 w-full">
            {loading ? (
              <div className="flex h-full items-center justify-center text-sm text-gray-500">{t('partnerDashboard.loadingChart')}</div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={data.monthlyLeadTrend} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <defs>
                    <linearGradient id="colorLeads" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <XAxis dataKey="label" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#6b7280' }} dy={10} />
                  <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#6b7280' }} />
                  <RechartsTooltip 
                    contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                  />
                  <Area
                    type="monotone"
                    dataKey="count"
                    stroke="#3b82f6"
                    strokeWidth={3}
                    fillOpacity={1}
                    fill="url(#colorLeads)"
                  />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>


      </section>

      {/* Tables Section */}
      <section className="grid gap-6 lg:grid-cols-2">
        {/* Recent Leads */}
        <div className="rounded-2xl bg-white shadow-sm ring-1 ring-gray-100 overflow-hidden flex flex-col">
          <div className="border-b border-gray-100 bg-gray-50/50 p-6 flex items-center justify-between">
            <div>
              <h3 className="text-lg font-bold text-gray-900">{t('partnerDashboard.recentEnquiries')}</h3>
              <p className="text-sm text-gray-500">{t('partnerDashboard.latestLeads')}</p>
            </div>
            <Link href="/partner/leads" className="text-sm font-semibold text-blue-600 hover:text-blue-700 hover:underline">{t('partnerDashboard.viewAll')}</Link>
          </div>
          <div className="flex-1 p-6 overflow-y-auto max-h-[400px] [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-thumb]:bg-gray-200 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-track]:bg-transparent">
            {loading ? (
              <div className="text-sm text-gray-500">{t('partnerDashboard.loadingLeads')}</div>
            ) : data.recentLeads.length === 0 ? (
              <div className="flex h-full flex-col items-center justify-center rounded-xl border border-dashed border-gray-200 bg-gray-50 p-8 text-center">
                <MessagesSquare className="mb-2 h-8 w-8 text-gray-400" />
                <p className="text-sm text-gray-500">{t('partnerDashboard.noRecentEnquiries')}</p>
              </div>
            ) : (
              <div className="space-y-4">
                {data.recentLeads.map((lead) => (
                  <div key={lead.id} className="flex items-start justify-between border-b border-gray-50 pb-4 last:border-0 last:pb-0">
                    <div>
                      <p className="font-semibold text-gray-900">{lead.customerName}</p>
                      <p className="text-xs text-gray-500 max-w-[200px] truncate">{lead.listingTitle}</p>
                      <div className="mt-1 flex items-center gap-2 text-xs text-gray-400">
                         <span>{formatPortalDateTime(lead.createdAt)}</span>
                         <span>•</span>
                         <span>{formatLeadStatus(lead.enquiryType)}</span>
                      </div>
                    </div>
                    <span className="rounded-full bg-blue-50 px-2.5 py-1 text-[10px] font-semibold text-blue-700">
                      {formatLeadStatus(lead.status)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Top Listings */}
        <div className="rounded-2xl bg-white shadow-sm ring-1 ring-gray-100 overflow-hidden flex flex-col">
           <div className="border-b border-gray-100 bg-gray-50/50 p-6 flex items-center justify-between">
            <div>
              <h3 className="text-lg font-bold text-gray-900">{t('partnerDashboard.topPerformingListings')}</h3>
              <p className="text-sm text-gray-500">{t('partnerDashboard.mostLeadMachines')}</p>
            </div>
            <Link href="/partner/listings" className="text-sm font-semibold text-blue-600 hover:text-blue-700 hover:underline">{t('partnerDashboard.manage')}</Link>
          </div>
          <div className="flex-1 p-6 overflow-y-auto max-h-[400px] [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-thumb]:bg-gray-200 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-track]:bg-transparent">
             {loading ? (
              <div className="text-sm text-gray-500">{t('partnerDashboard.loadingListings')}</div>
            ) : data.topListings.length === 0 ? (
               <div className="flex h-full flex-col items-center justify-center rounded-xl border border-dashed border-gray-200 bg-gray-50 p-8 text-center">
                <Truck className="mb-2 h-8 w-8 text-gray-400" />
                <p className="text-sm text-gray-500">{t('partnerDashboard.noActiveListingsDrivingLeads')}</p>
              </div>
            ) : (
               <div className="space-y-4">
                 {data.topListings.map((listing) => (
                   <div key={listing.id} className="flex items-center gap-4 rounded-xl p-2 transition-colors hover:bg-gray-50">
                     <div className="h-14 w-20 shrink-0 overflow-hidden rounded-lg bg-gray-100">
                       {listing.featuredImage ? (
                         <Image
                           src={getAbsoluteFileUrl(listing.featuredImage)}
                           alt={listing.title}
                           width={80}
                           height={56}
                           unoptimized
                           className="h-full w-full object-cover"
                         />
                       ) : (
                         <div className="flex h-full w-full items-center justify-center">
                           <Truck className="h-5 w-5 text-gray-300" />
                         </div>
                       )}
                     </div>
                     <div className="flex-1 min-w-0">
                        <p className="truncate font-semibold text-gray-900">{listing.title}</p>
                        <p className="text-xs text-gray-500">{listing.manufacturingYear} - {listing.location}</p>
                        <p className="text-sm font-bold text-[#FFC107] mt-0.5">{formatPortalCurrency(listing.price)}</p>
                     </div>
                     <div className="flex flex-col items-end gap-1">
                        <div className="flex items-center gap-1 text-xs font-semibold text-blue-600 bg-blue-50 px-2 py-0.5 rounded-full">
                           <MessagesSquare className="h-3 w-3" />
                           {listing.leadCount}
                        </div>
                        {listing.wonLeadCount > 0 && (
                          <div className="flex items-center gap-1 text-[10px] font-semibold text-green-600">
                            {listing.wonLeadCount} {t('partnerDashboard.closed')}
                          </div>
                        )}
                     </div>
                   </div>
                 ))}
               </div>
            )}
          </div>
        </div>

      </section>
    </div>
  );
}
