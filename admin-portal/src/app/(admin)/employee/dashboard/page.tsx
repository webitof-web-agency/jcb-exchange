'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import axios from 'axios';
import api from '@/lib/api';
import { Users, ClipboardList, Package, CheckCircle2, MessageSquare } from 'lucide-react';
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

interface DashboardResponse {
  stats: DashboardStats;
  graphData: GraphData[];
  categoryBreakdown?: CategoryBreakdown[];
  recentApplications?: RecentApplication[];
}

const defaultStats: DashboardStats = {
  totalPartners: 0,
  approvedPartners: 0,
  pendingKyc: 0,
  activeListings: 0,
  totalEnquiries: 0,
};

export default function EmployeeDashboardPage() {
  const [data, setData] = useState<DashboardResponse>({
    stats: defaultStats,
    graphData: [],
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

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
        });
      } catch (err) {
        if (axios.isAxiosError(err)) {
          setError(err.response?.data?.error || 'Unable to load employee dashboard.');
        } else {
          setError('Unable to load employee dashboard.');
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
        <div className="min-w-0 flex-1">
          <h2 className="text-lg sm:text-2xl font-bold text-gray-900 truncate">Employee Workspace Overview</h2>
        </div>
      </div>

      {error ? (
        <div className="rounded-2xl border border-red-200 bg-red-50 p-6 shadow-sm">
          <p className="text-sm font-medium text-red-700">{error}</p>
        </div>
      ) : null}

      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
        {/* Card 1 */}
        <div className="bg-white/80 backdrop-blur-xl p-6 rounded-2xl shadow-sm border border-gray-100/80 flex flex-col justify-between transition-all hover:-translate-y-1.5 hover:shadow-[0_8px_30px_rgb(0,0,0,0.06)] hover:bg-white duration-300">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-gray-500 text-sm font-medium">Total Partners</h3>
            <div className="p-2.5 bg-gradient-to-br from-blue-50 to-blue-100 rounded-xl">
              <Users className="w-5 h-5 text-blue-600" />
            </div>
          </div>
          <div>
            <p className="text-3xl font-black tracking-tight text-gray-900">{loading ? '...' : data.stats.totalPartners}</p>
            <p className="mt-1 text-xs font-medium text-gray-400">Registered users</p>
          </div>
        </div>

        {/* Card 2 */}
        <div className="bg-white/80 backdrop-blur-xl p-6 rounded-2xl shadow-sm border border-gray-100/80 flex flex-col justify-between transition-all hover:-translate-y-1.5 hover:shadow-[0_8px_30px_rgb(0,0,0,0.06)] hover:bg-white duration-300">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-gray-500 text-sm font-medium">Approved Partners</h3>
            <div className="p-2.5 bg-gradient-to-br from-yellow-50 to-[#FFC107]/20 rounded-xl">
              <CheckCircle2 className="w-5 h-5 text-yellow-600" />
            </div>
          </div>
          <div>
            <p className="text-3xl font-black tracking-tight text-gray-900">{loading ? '...' : data.stats.approvedPartners}</p>
            <p className="mt-1 text-xs font-medium text-gray-400">Fully verified</p>
          </div>
        </div>

        {/* Card 3 */}
        <div className="bg-white/80 backdrop-blur-xl p-6 rounded-2xl shadow-sm border border-gray-100/80 flex flex-col justify-between transition-all hover:-translate-y-1.5 hover:shadow-[0_8px_30px_rgb(0,0,0,0.06)] hover:bg-white duration-300">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-gray-500 text-sm font-medium">Pending KYC</h3>
            <div className="p-2.5 bg-gradient-to-br from-orange-50 to-orange-100 rounded-xl">
              <ClipboardList className="w-5 h-5 text-orange-600" />
            </div>
          </div>
          <div>
            <p className="text-3xl font-black tracking-tight text-orange-500">{loading ? '...' : data.stats.pendingKyc}</p>
            <p className="mt-1 text-xs font-medium text-gray-400">Awaiting review</p>
          </div>
        </div>

        {/* Card 4 */}
        <div className="bg-white/80 backdrop-blur-xl p-6 rounded-2xl shadow-sm border border-gray-100/80 flex flex-col justify-between transition-all hover:-translate-y-1.5 hover:shadow-[0_8px_30px_rgb(0,0,0,0.06)] hover:bg-white duration-300">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-gray-500 text-sm font-medium">Active Listings</h3>
            <div className="p-2.5 bg-gradient-to-br from-green-50 to-green-100 rounded-xl">
              <Package className="w-5 h-5 text-green-600" />
            </div>
          </div>
          <div>
            <p className="text-3xl font-black tracking-tight text-green-600">{loading ? '...' : data.stats.activeListings}</p>
            <p className="mt-1 text-xs font-medium text-gray-400">Live on platform</p>
          </div>
        </div>

        {/* Card 5 */}
        <div className="bg-white/80 backdrop-blur-xl p-6 rounded-2xl shadow-sm border border-gray-100/80 flex flex-col justify-between transition-all hover:-translate-y-1.5 hover:shadow-[0_8px_30px_rgb(0,0,0,0.06)] hover:bg-white duration-300 sm:col-span-2 lg:col-span-1 xl:col-span-1">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-gray-500 text-sm font-medium">Total Enquiries</h3>
            <div className="p-2.5 bg-gradient-to-br from-purple-50 to-purple-100 rounded-xl">
              <MessageSquare className="w-5 h-5 text-purple-600" />
            </div>
          </div>
          <div>
            <p className="text-3xl font-black tracking-tight text-purple-600">{loading ? '...' : data.stats.totalEnquiries}</p>
            <p className="mt-1 text-xs font-medium text-gray-400">Leads generated</p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="rounded-2xl border border-gray-100/80 bg-white/80 backdrop-blur-xl p-6 shadow-sm lg:col-span-2 hover:shadow-[0_8px_30px_rgb(0,0,0,0.04)] transition-all duration-300">
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

        <div className="rounded-2xl border border-gray-100/80 bg-white/80 backdrop-blur-xl p-6 shadow-sm flex flex-col h-full hover:shadow-[0_8px_30px_rgb(0,0,0,0.04)] transition-all duration-300">
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
                    cy="50%"
                    innerRadius={70}
                    outerRadius={110}
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
                  <Legend verticalAlign="bottom" height={36} iconType="circle" />
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
        <div className="rounded-2xl border border-gray-100/80 bg-white/80 backdrop-blur-xl p-6 shadow-sm flex flex-col h-full hover:shadow-[0_8px_30px_rgb(0,0,0,0.04)] transition-all duration-300">
          <div className="flex items-center justify-between mb-4 border-b border-gray-50 pb-4">
            <h3 className="text-lg font-bold text-gray-900 flex items-center gap-2">
              <ClipboardList className="w-4 h-4 text-orange-500" /> KYC Pending
            </h3>
            <Link href="/employee/verifications" className="text-sm font-semibold text-[#FFC107] hover:text-[#E5AD06] transition-colors">
              View All
            </Link>
          </div>
          
          <div className="flex-1 overflow-y-auto pr-2 max-h-[400px] [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-thumb]:bg-gray-200 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-track]:bg-transparent">
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

      <div className="text-center pt-8 pb-4">
        <p className="text-xs font-medium text-gray-400">© 2024–2025 JCB Exchange. All rights reserved.</p>
      </div>
    </div>
  );
}
