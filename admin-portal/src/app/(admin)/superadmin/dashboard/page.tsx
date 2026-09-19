'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import axios from 'axios';
import api from '@/lib/api';
import { getDashboardCards } from '@/lib/dashboardCardLinks';
import { Users, ClipboardList, Package, CheckCircle2, MessageSquare, Heart } from 'lucide-react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, PieChart, Pie, Cell } from 'recharts';

interface DashboardStats {
  totalPartners: number;
  approvedPartners: number;
  pendingKyc: number;
  activeListings: number;
  totalEnquiries: number;
}

interface GraphData {
  name: string;
  partners: number;
  listings: number;
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

interface DashboardResponse {
  stats: DashboardStats;
  graphData: GraphData[];
  categoryBreakdown?: CategoryBreakdown[];
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
};

const dashboardCardMeta = {
  totalPartners: {
    title: 'Total Partners',
    description: 'Registered users',
    valueClassName: 'text-gray-900',
    icon: Users,
    iconWrapperClassName: 'bg-gradient-to-br from-blue-50 to-blue-100',
    iconClassName: 'text-blue-600',
  },
  approvedPartners: {
    title: 'Approved Partners',
    description: 'Fully verified',
    valueClassName: 'text-gray-900',
    icon: CheckCircle2,
    iconWrapperClassName: 'bg-gradient-to-br from-yellow-50 to-[#FFC107]/20',
    iconClassName: 'text-yellow-600',
  },
  pendingKyc: {
    title: 'Pending KYC',
    description: 'Awaiting review',
    valueClassName: 'text-orange-500',
    icon: ClipboardList,
    iconWrapperClassName: 'bg-gradient-to-br from-orange-50 to-orange-100',
    iconClassName: 'text-orange-600',
  },
  activeListings: {
    title: 'Active Listings',
    description: 'Live on platform',
    valueClassName: 'text-green-600',
    icon: Package,
    iconWrapperClassName: 'bg-gradient-to-br from-green-50 to-green-100',
    iconClassName: 'text-green-600',
  },
  totalEnquiries: {
    title: 'Total Enquiries',
    description: 'Leads generated',
    valueClassName: 'text-purple-600',
    icon: MessageSquare,
    iconWrapperClassName: 'bg-gradient-to-br from-purple-50 to-purple-100',
    iconClassName: 'text-purple-600',
  },
} as const;

export default function SuperAdminDashboard() {
  const [data, setData] = useState<DashboardResponse>({
    stats: defaultStats,
    graphData: [],
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const dashboardCards = getDashboardCards({ portal: 'superadmin' });

  useEffect(() => {
    const loadDashboard = async () => {
      try {
        const response = await api.get<DashboardResponse>('/superadmin/dashboard');
        setData({
          stats: {
            totalPartners: response.data.stats?.totalPartners ?? 0,
            approvedPartners: response.data.stats?.approvedPartners ?? 0,
            pendingKyc: response.data.stats?.pendingKyc ?? 0,
            activeListings: response.data.stats?.activeListings ?? 0,
            totalEnquiries: response.data.stats?.totalEnquiries ?? 0,
          },
          graphData: Array.isArray(response.data.graphData) ? response.data.graphData : [],
          categoryBreakdown: Array.isArray(response.data.categoryBreakdown) ? response.data.categoryBreakdown : [],
          recentApplications: Array.isArray(response.data.recentApplications) ? response.data.recentApplications : [],
          recentListings: Array.isArray(response.data.recentListings) ? response.data.recentListings : [],
          recentEnquiries: Array.isArray(response.data.recentEnquiries) ? response.data.recentEnquiries : [],
        });
      } catch (err) {
        if (axios.isAxiosError(err)) {
          setError(err.response?.data?.error || 'Unable to load super admin dashboard.');
        } else {
          setError('Unable to load super admin dashboard.');
        }
      } finally {
        setLoading(false);
      }
    };

    void loadDashboard();
  }, []);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Platform Overview</h2>
        </div>
      </div>

      {error ? (
        <div className="rounded-2xl border border-red-200 bg-red-50 p-6 shadow-sm">
          <p className="text-sm font-medium text-red-700">{error}</p>
        </div>
      ) : null}

      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
        {dashboardCards.map((card) => {
          const meta = dashboardCardMeta[card.key];
          const Icon = meta.icon;
          const value = data.stats[card.key];

          return (
            <Link
              key={card.key}
              href={card.href!}
              className={`bg-white/80 backdrop-blur-xl p-5 sm:p-6 rounded-2xl shadow-sm border border-gray-100/80 flex flex-col justify-between transition-all duration-300 hover:-translate-y-1.5 hover:shadow-[0_8px_30px_rgb(0,0,0,0.06)] hover:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FFC107] ${card.key === 'totalEnquiries' ? 'sm:col-span-2 lg:col-span-1 xl:col-span-1' : ''}`}
            >
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-gray-500 text-sm font-medium">{meta.title}</h3>
                <div className={`p-2.5 rounded-xl ${meta.iconWrapperClassName}`}>
                  <Icon className={`w-5 h-5 ${meta.iconClassName}`} />
                </div>
              </div>
              <div>
                <p className={`text-3xl font-black tracking-tight ${meta.valueClassName}`}>{loading ? '...' : value}</p>
                <p className="mt-1 text-xs font-medium text-gray-400">{meta.description}</p>
              </div>
            </Link>
          );
        })}
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="rounded-2xl border border-gray-100/80 bg-white/80 backdrop-blur-xl p-5 sm:p-6 shadow-sm lg:col-span-2 hover:shadow-[0_8px_30px_rgb(0,0,0,0.04)] transition-all duration-300">
          <h3 className="mb-6 text-lg font-bold text-gray-900">Platform Growth (6 Months)</h3>
          <div className="h-[350px] w-full">
            {loading ? (
              <div className="flex h-full items-center justify-center text-sm text-gray-400">Loading chart data...</div>
            ) : data.graphData && data.graphData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart
                  data={data.graphData}
                  margin={{ top: 10, right: 10, left: -20, bottom: 0 }}
                >
                  <defs>
                    <linearGradient id="colorPartners" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#3B82F6" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="#3B82F6" stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="colorListings" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#FFC107" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="#FFC107" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f3f4f6" />
                  <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#9ca3af' }} dy={10} />
                  <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#9ca3af' }} />
                  <Tooltip 
                    contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1)' }}
                  />
                  <Legend verticalAlign="top" height={36} iconType="circle" />
                  <Area type="monotone" name="New Partners" dataKey="partners" stroke="#3B82F6" strokeWidth={3} fillOpacity={1} fill="url(#colorPartners)" />
                  <Area type="monotone" name="New Listings" dataKey="listings" stroke="#FFC107" strokeWidth={3} fillOpacity={1} fill="url(#colorListings)" />
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex h-full items-center justify-center text-sm text-gray-400">No data available</div>
            )}
          </div>
        </div>

        <div className="rounded-2xl border border-gray-100/80 bg-white/80 backdrop-blur-xl p-5 sm:p-6 shadow-sm flex flex-col h-full hover:shadow-[0_8px_30px_rgb(0,0,0,0.04)] transition-all duration-300">
          <h3 className="mb-6 text-lg font-bold text-gray-900">Categories</h3>
          <div className="h-[350px] w-full flex-1">
            {loading ? (
              <div className="flex h-full items-center justify-center text-sm text-gray-400">Loading chart data...</div>
            ) : data.categoryBreakdown && data.categoryBreakdown.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={data.categoryBreakdown}
                    cx="50%"
                    cy="45%"
                    innerRadius={65}
                    outerRadius={100}
                    paddingAngle={5}
                    dataKey="value"
                    nameKey="name"
                  >
                    {data.categoryBreakdown.map((entry, index) => {
                      const colors = ['#FFC107', '#3B82F6', '#10B981', '#F59E0B', '#6366F1', '#EC4899'];
                      return <Cell key={`cell-${index}`} fill={colors[index % colors.length]} strokeWidth={0} />;
                    })}
                  </Pie>
                  <Tooltip 
                    contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                  />
                  <Legend 
                    verticalAlign="bottom" 
                    iconType="circle"
                    wrapperStyle={{
                      fontSize: '12px',
                      fontWeight: 500,
                      paddingTop: '20px',
                      lineHeight: '1.5',
                      display: 'flex',
                      flexWrap: 'wrap',
                      justifyContent: 'center'
                    }}
                  />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex h-full items-center justify-center text-sm text-gray-400">No data available</div>
            )}
          </div>
        </div>

      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-1">
        {/* Recent Applications (KYC) */}
        <div className="rounded-2xl border border-gray-100/80 bg-white/80 backdrop-blur-xl p-5 sm:p-6 shadow-sm flex flex-col h-full hover:shadow-[0_8px_30px_rgb(0,0,0,0.04)] transition-all duration-300">
          <div className="flex items-center justify-between mb-4 border-b border-gray-50 pb-4">
            <h3 className="text-lg font-bold text-gray-900 flex items-center gap-2">
              <ClipboardList className="w-4 h-4 text-orange-500" /> KYC Pending
            </h3>
            <Link href="/superadmin/verifications" className="text-sm font-semibold text-[#FFC107] hover:text-[#E5AD06] transition-colors">
              View All
            </Link>
          </div>
          
          <div className="flex-1 overflow-y-auto pr-2">
            {!data.recentApplications || data.recentApplications.length === 0 ? (
              <div className="flex h-full items-center justify-center text-sm text-gray-400 py-10">No recent applications</div>
            ) : (
              <div className="space-y-4">
                {data.recentApplications.map((app) => (
                  <div key={app.id} className="flex items-center justify-between group">
                    <div>
                      <p className="text-sm font-bold text-gray-900 line-clamp-1 group-hover:text-[#FFC107] transition-colors">{app.name}</p>
                      <p className="text-xs text-gray-500 mt-0.5">{app.mobile || app.email}</p>
                    </div>
                    <div className="text-right">
                      <span className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                        app.kycStatus === 'APPROVED' ? 'bg-green-50 text-green-700' :
                        app.kycStatus === 'SUBMITTED' || app.kycStatus === 'UNDER_REVIEW' ? 'bg-orange-50 text-orange-700' :
                        'bg-gray-100 text-gray-600'
                      }`}>
                        {app.kycStatus.replace('_', ' ')}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>



      </div>

      <div className="border-t border-gray-100 pt-8 pb-4">
        <div className="flex flex-col items-center gap-2 text-center text-xs font-medium text-gray-400">
          <span>© 2026-2027 JCB Exchange. All rights reserved.</span>
          <span className="inline-flex items-center justify-center">
            Crafted with <Heart className="mx-1 h-3.5 w-3.5 inline-block shrink-0 fill-red-500 text-red-500" /> by{' '}
            <a href="https://webitof.com/" target="_blank" rel="noopener noreferrer" className="ml-1 font-semibold text-gray-600 underline transition-colors hover:text-gray-900">
              Webitof
            </a>
          </span>
        </div>
      </div>
    </div>
  );
}

