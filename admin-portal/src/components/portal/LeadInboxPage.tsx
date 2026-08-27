'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Search, Phone } from 'lucide-react';
import api from '@/lib/api';
import { formatPortalDateTime, formatPortalLabel } from '@/lib/partnerPortal';
import { useAuthStore } from '@/store/authStore';
import { generateAdminLeadDetailPath } from '@/lib/routePaths';


type LeadRecord = {
  id: string;
  enquiryType: string;
  message: string;
  status: string;
  createdAt: string;
  updatedAt: string;
  customer: {
    id: string;
    name: string;
    mobile: string;
    email: string;
    city: string;
    state: string;
  };
  listing: {
    id: string;
    title: string;
    status: string;
    price: number;
    locationCity: string;
    locationState: string;
  };
  routing: {
    mode: 'SUPER_ADMIN' | 'SELLER';
  };
  recipient: {
    id: string;
    name: string;
    mobile: string;
    email: string;
    whatsappNumber: string;
    role: string;
    partnerType: string | null;
  };
  listingOwner: {
    id: string;
    name: string;
    mobile: string;
    whatsappNumber: string;
    partnerType: string | null;
  } | null;
};

type LeadsResponse = {
  summary: {
    total: number;
    new: number;
    contacted: number;
    interested: number;
    inspectionScheduled: number;
    won: number;
    lost: number;
    active: number;
    conversionRate: number;
  };
  leads: LeadRecord[];
};

const emptyResponse: LeadsResponse = {
  summary: {
    total: 0,
    new: 0,
    contacted: 0,
    interested: 0,
    inspectionScheduled: 0,
    won: 0,
    lost: 0,
    active: 0,
    conversionRate: 0,
  },
  leads: [],
};

export default function LeadInboxPage() {
  const [data, setData] = useState<LeadsResponse>(emptyResponse);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const currentUserRole = useAuthStore((state) => state.user?.role);
  const router = useRouter();
  const isSuperAdmin = currentUserRole === 'SUPER_ADMIN';
  const isEmployee = currentUserRole === 'EMPLOYEE';
  const isInternal = isSuperAdmin || isEmployee;

  useEffect(() => {
    let cancelled = false;

    const loadLeads = async () => {
      try {
        const response = await api.get<LeadsResponse>('/leads/my-leads');
        if (!cancelled) {
          setData(response.data);
        }
      } catch (error) {
        console.error('Failed to load leads:', error);
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    void loadLeads();

    return () => {
      cancelled = true;
    };
  }, []);

  const filteredLeads = useMemo(() => {
    return data.leads.filter((lead) => {
      const query = search.trim().toLowerCase();
      const matchesSearch =
        query.length === 0 ||
        lead.customer.name.toLowerCase().includes(query) ||
        lead.customer.mobile.toLowerCase().includes(query) ||
        lead.listing.title.toLowerCase().includes(query) ||
        formatPortalLabel(lead.enquiryType).toLowerCase().includes(query);

      return matchesSearch;
    });
  }, [data.leads, search]);

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <div className="relative w-full sm:max-w-md">
            <input
              type="text"
              placeholder="Search enquiries..."
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              className="w-full rounded-full border border-gray-300 bg-white px-5 py-2.5 pl-11 text-sm font-medium text-gray-700 shadow-sm outline-none transition focus:border-[#FFC107] focus:ring-1 focus:ring-[#FFC107]"
            />
            <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          </div>
        </div>


      <div className="rounded-2xl border border-gray-100 bg-white shadow-sm overflow-hidden">

        {loading ? (
          <div className="p-8 text-sm text-gray-500">Loading enquiry pipeline...</div>
        ) : filteredLeads.length === 0 ? (
          <div className="p-8">
            <div className="rounded-2xl border border-dashed border-gray-200 bg-gray-50 px-6 py-10 text-center">
              <h3 className="text-lg font-semibold text-gray-900">No enquiries found</h3>
            </div>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-left">
              <thead>
                <tr className="border-b border-gray-200 bg-gray-50 text-xs uppercase tracking-wider text-gray-500">
                  <th className="p-4 font-semibold">Customer</th>
                  <th className="p-4 font-semibold">Listing</th>
                  <th className="p-4 font-semibold">Enquiry Type</th>
                  {isInternal ? <th className="p-4 font-semibold">Routed Seller</th> : null}
                  <th className="p-4 font-semibold">Received</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filteredLeads.map((lead) => {
                  const detailHref = isSuperAdmin
                    ? generateAdminLeadDetailPath('/superadmin/enquiries', {
                        id: lead.id,
                        customerName: lead.customer.name,
                        listingTitle: lead.listing.title,
                      })
                    : currentUserRole === 'EMPLOYEE'
                    ? generateAdminLeadDetailPath('/employee/enquiries', {
                        id: lead.id,
                        customerName: lead.customer.name,
                        listingTitle: lead.listing.title,
                      })
                    : generateAdminLeadDetailPath('/partner/leads', {
                        id: lead.id,
                        customerName: lead.customer.name,
                        listingTitle: lead.listing.title,
                      });

                  return (
                    <tr 
                      key={lead.id} 
                      onClick={() => router.push(detailHref)}
                      className="group align-top transition-colors hover:bg-gray-50/80 cursor-pointer"
                    >
                      <td className="p-4">
                        <div className="flex items-center gap-3">
                          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#FFC107]/10 text-sm font-bold text-yellow-700">
                            {lead.customer.name.charAt(0).toUpperCase()}
                          </div>
                          <div className="flex flex-col gap-0.5">
                            <span className="font-bold text-gray-900 transition group-hover:text-[#FFC107]">
                              {lead.customer.name}
                            </span>
                            {lead.customer.mobile ? (
                              <a
                                href={`tel:${lead.customer.mobile}`}
                                onClick={(e) => e.stopPropagation()}
                                className="group/phone mt-1 inline-flex w-fit items-center gap-1 rounded-full bg-green-50 px-2.5 py-0.5 text-[10px] font-bold text-green-700 transition-colors hover:bg-green-100 hover:text-green-800 whitespace-nowrap"
                              >
                                <Phone className="h-3 w-3 text-green-600 transition-colors group-hover/phone:text-green-700" />
                                <span>Call {lead.customer.mobile}</span>
                              </a>
                            ) : (
                              <span className="text-xs text-gray-400 mt-1">{lead.customer.email || 'No contact'}</span>
                            )}
                            {[lead.customer.city, lead.customer.state].filter(Boolean).join(', ') ? (
                              <span className="text-[10px] uppercase tracking-wider text-gray-400">
                                {[lead.customer.city, lead.customer.state].filter(Boolean).join(', ')}
                              </span>
                            ) : null}
                          </div>
                        </div>
                      </td>
                      <td className="p-4">
                        <span className="font-semibold text-gray-900 transition group-hover:text-[#FFC107] block text-sm">
                          {lead.listing.title}
                        </span>
                        <div className="mt-0.5 text-[11px] text-gray-500">
                          {[lead.listing.locationCity, lead.listing.locationState].filter(Boolean).join(', ')}
                        </div>
                        {lead.message ? <div className="mt-1.5 hidden max-w-[200px] truncate rounded border border-gray-100 bg-gray-50 px-2 py-1 text-[11px] text-gray-500 xl:block" title={lead.message}>{lead.message}</div> : null}
                      </td>
                      <td className="p-4">
                        <span className="inline-flex rounded-full bg-gray-100 px-2.5 py-1 text-xs font-semibold text-gray-700">
                          {formatPortalLabel(lead.enquiryType)}
                        </span>
                      </td>
                      {isInternal ? (
                        <td className="p-4">
                          {lead.routing.mode === 'SELLER' && lead.listingOwner ? (
                            <div className="flex items-center gap-3">
                              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-blue-50 text-sm font-bold text-blue-700">
                                {lead.listingOwner.name.charAt(0).toUpperCase()}
                              </div>
                              <div className="flex flex-col gap-0.5">
                                <div className="flex items-center gap-2">
                                  <span className="font-bold text-gray-900">{lead.listingOwner.name}</span>
                                  {lead.listingOwner.partnerType ? (
                                    <span className="inline-flex rounded bg-gray-100 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-gray-600">
                                      {formatPortalLabel(lead.listingOwner.partnerType)}
                                    </span>
                                  ) : null}
                                </div>
                                {(lead.listingOwner.mobile || lead.listingOwner.whatsappNumber) ? (
                                  <a
                                    href={`tel:${lead.listingOwner.mobile || lead.listingOwner.whatsappNumber}`}
                                    onClick={(e) => e.stopPropagation()}
                                    className="group/phone mt-1 inline-flex w-fit items-center gap-1 rounded-full bg-blue-50 px-2.5 py-0.5 text-[10px] font-bold text-blue-700 transition-colors hover:bg-blue-100 hover:text-blue-800 whitespace-nowrap"
                                  >
                                    <Phone className="h-3 w-3 text-blue-600 transition-colors group-hover/phone:text-blue-700" />
                                    <span>Call {lead.listingOwner.mobile || lead.listingOwner.whatsappNumber}</span>
                                  </a>
                                ) : (
                                  <span className="text-xs text-gray-400 mt-1">No contact</span>
                                )}
                              </div>
                            </div>
                          ) : (
                            <span className="inline-flex rounded-full bg-gray-50 px-3 py-1 text-xs font-medium text-gray-400">
                              Not routed
                            </span>
                          )}
                        </td>
                      ) : null}
                      <td className="p-4 text-sm text-gray-700">
                        {formatPortalDateTime(lead.updatedAt || lead.createdAt)}
                        {(lead.updatedAt && lead.updatedAt !== lead.createdAt) ? (
                          <div className="text-[10px] text-[#FFC107] font-semibold mt-0.5">Repeat Enquiry</div>
                        ) : null}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
