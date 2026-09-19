'use client';

import { useEffect, useMemo, useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { Search, Phone, Crown, ChevronLeft, ChevronRight, ChevronDown, CircleDot, PlayCircle, BadgeCheck, Check, type LucideIcon } from 'lucide-react';
import { toast } from 'react-toastify';
import api from '@/lib/api';
import BrandLoader from '@/components/ui/BrandLoader';
import { formatPortalDateTime, formatPortalLabel } from '@/lib/partnerPortal';
import { useAuthStore } from '@/store/authStore';
import { generateAdminLeadDetailPath } from '@/lib/routePaths';

type DealStage = 'OPEN' | 'ONGOING' | 'CLOSED';

const getDealStage = (status: string): DealStage => {
  const normalized = String(status || '').toUpperCase();
  if (normalized === 'WON' || normalized === 'LOST') return 'CLOSED';
  if (normalized === 'CONTACTED' || normalized === 'INTERESTED' || normalized === 'INSPECTION_SCHEDULED') return 'ONGOING';
  return 'OPEN';
};

const getStageStatusOptions = (stage: DealStage) => {
  if (stage === 'CLOSED') return ['WON', 'LOST'] as const;
  if (stage === 'ONGOING') return ['CONTACTED', 'INTERESTED', 'INSPECTION_SCHEDULED'] as const;
  return ['NEW'] as const;
};

const stageMeta: Record<DealStage, { label: string; icon: LucideIcon }> = {
  OPEN: { label: 'Open', icon: CircleDot },
  ONGOING: { label: 'Ongoing', icon: PlayCircle },
  CLOSED: { label: 'Closed', icon: BadgeCheck },
};

function InlineCrmDropdown({ 
  leadId, 
  currentStatus, 
  onStatusChange 
}: { 
  leadId: string; 
  currentStatus: string; 
  onStatusChange: (status: string) => void;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [dealStage, setDealStage] = useState<DealStage>(getDealStage(currentStatus));
  const [selectedStatus, setSelectedStatus] = useState(currentStatus);
  const [closeNote, setCloseNote] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent | TouchEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      document.addEventListener('touchstart', handleClickOutside, { passive: true });
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('touchstart', handleClickOutside);
    };
  }, [isOpen]);

  const handleSave = async (statusToSave: string, note: string = '') => {
    try {
      setIsSaving(true);
      await api.patch(`/leads/${leadId}/status`, {
        status: statusToSave,
        note: note
      });
      toast.success('Deal status updated');
      onStatusChange(statusToSave);
      setIsOpen(false);
    } catch {
      toast.error('Failed to update status');
    } finally {
      setIsSaving(false);
    }
  };

  const StageIcon = stageMeta[getDealStage(currentStatus)].icon;
  const effectiveDealStage = isOpen ? dealStage : getDealStage(currentStatus);
  const effectiveSelectedStatus = isOpen ? selectedStatus : currentStatus;
  const isLossSelected = effectiveSelectedStatus === 'LOST';

  return (
    <div className="relative" ref={dropdownRef} onClick={(e) => e.stopPropagation()}>
      <button
        type="button"
        onClick={() => {
          if (!isOpen) {
            setDealStage(getDealStage(currentStatus));
            setSelectedStatus(currentStatus);
            setCloseNote('');
          }
          setIsOpen(!isOpen);
        }}
        className="flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-2.5 py-1.5 text-[11px] font-bold text-gray-700 shadow-2xs transition hover:bg-gray-50 focus:border-[#FFC107] focus:ring-1 focus:ring-[#FFC107]"
      >
        <StageIcon className={`h-3 w-3 ${
          getDealStage(currentStatus) === 'OPEN' ? 'text-gray-400' : 
          getDealStage(currentStatus) === 'ONGOING' ? 'text-blue-500' : 'text-green-500'
        }`} />
        <span className="truncate max-w-[100px]">{currentStatus.replace(/_/g, ' ')}</span>
        <ChevronDown className={`h-3 w-3 text-gray-400 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {isOpen && (
        <div className="absolute top-full mt-1 left-0 z-50 w-64 rounded-xl border border-gray-200 bg-white p-2 shadow-xl animate-in fade-in zoom-in-95 duration-100">
          <div className="mb-2 grid grid-cols-3 gap-1 rounded-lg bg-gray-50 p-1">
            {(['OPEN', 'ONGOING', 'CLOSED'] as DealStage[]).map((stage) => {
              const SIcon = stageMeta[stage].icon;
              const active = effectiveDealStage === stage;
              return (
                <button
                  key={stage}
                  onClick={() => {
                     setDealStage(stage);
                     const defaultStat = stage === 'CLOSED' ? 'WON' : stage === 'ONGOING' ? 'CONTACTED' : 'NEW';
                     setSelectedStatus(defaultStat);
                     setCloseNote('');
                  }}
                  className={`flex flex-col items-center justify-center rounded-md py-1.5 transition ${
                    active ? 'bg-white shadow-sm text-gray-900 font-bold' : 'text-gray-500 hover:bg-gray-200/50 hover:text-gray-700'
                  }`}
                >
                  <SIcon className={`h-3.5 w-3.5 mb-1 ${active ? 'text-[#FFC107]' : 'text-gray-400'}`} />
                  <span className="text-[9px] uppercase tracking-wider">{stageMeta[stage].label}</span>
                </button>
              );
            })}
          </div>

          <div className="space-y-1 max-h-40 overflow-y-auto">
            {getStageStatusOptions(effectiveDealStage).map(option => (
              <button
                key={option}
                onClick={() => {
                  setSelectedStatus(option);
                  if (option !== 'LOST') {
                    void handleSave(option);
                  }
                }}
                className={`flex w-full items-center justify-between rounded-lg px-2.5 py-2 text-[11px] font-bold transition ${
                  effectiveSelectedStatus === option ? 'bg-gray-100 text-gray-900' : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                }`}
              >
                {option.replace(/_/g, ' ')}
                {effectiveSelectedStatus === option && <Check className="h-3 w-3" />}
              </button>
            ))}
          </div>

          {isLossSelected && (
            <div className="mt-2 border-t border-gray-100 pt-2 animate-in slide-in-from-top-2">
              <textarea
                autoFocus
                placeholder="Reason for loss..."
                value={closeNote}
                onChange={(e) => setCloseNote(e.target.value)}
                className="w-full rounded-lg border border-gray-200 bg-gray-50 px-2.5 py-2 text-[11px] text-gray-700 outline-none focus:border-rose-400 focus:bg-white focus:ring-1 focus:ring-rose-400"
                rows={2}
              />
              <button
                disabled={!closeNote.trim() || isSaving}
                onClick={() => void handleSave('LOST', closeNote.trim())}
                className="mt-1.5 flex w-full items-center justify-center rounded-lg bg-gray-900 py-1.5 text-[11px] font-bold text-white transition hover:bg-gray-800 disabled:opacity-50"
              >
                {isSaving ? 'Saving...' : 'Confirm Loss'}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
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
    isPrime?: boolean;
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
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [openPageSizeDropdown, setOpenPageSizeDropdown] = useState(false);
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

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent | TouchEvent) => {
      const target = e.target as HTMLElement;
      if (target?.closest?.('.rows-per-page-dropdown-container')) {
        return;
      }
      setOpenPageSizeDropdown(false);
    };
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('touchstart', handleClickOutside, { passive: true });
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('touchstart', handleClickOutside);
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

  const totalLeads = filteredLeads.length;
  const totalPages = Math.ceil(totalLeads / pageSize) || 1;
  const safeCurrentPage = Math.min(currentPage, totalPages);

  const paginatedLeads = useMemo(() => {
    const startIndex = (safeCurrentPage - 1) * pageSize;
    return filteredLeads.slice(startIndex, startIndex + pageSize);
  }, [filteredLeads, pageSize, safeCurrentPage]);

  const startItemIndex = totalLeads === 0 ? 0 : (safeCurrentPage - 1) * pageSize + 1;
  const endItemIndex = Math.min(safeCurrentPage * pageSize, totalLeads);

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

      <div className="rounded-2xl border border-gray-100 bg-white shadow-sm overflow-hidden flex flex-col max-h-[calc(100vh-170px)]">
        {loading ? (
          <BrandLoader variant="section" size="sm" bg="light" text="Loading enquiry pipeline..." />
        ) : filteredLeads.length === 0 ? (
          <div className="p-8">
            <div className="rounded-2xl border border-dashed border-gray-200 bg-gray-50 px-6 py-10 text-center">
              <h3 className="text-lg font-semibold text-gray-900">No enquiries found</h3>
            </div>
          </div>
        ) : (
          <>
            <div className="overflow-x-auto overflow-y-auto flex-1 max-h-[620px] [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
              <table className="w-full min-w-[800px] border-collapse text-left">
                <thead className="sticky top-0 z-10 bg-gray-50 shadow-2xs">
                  <tr className="border-b border-gray-200 text-xs uppercase tracking-wider text-gray-500">
                    <th className="p-4 font-semibold">Customer</th>
                    <th className="p-4 font-semibold">Listing</th>
                    <th className="p-4 font-semibold">Status</th>
                    <th className="p-4 font-semibold">Enquiry Type</th>
                    {isInternal ? <th className="p-4 font-semibold">Routed Seller</th> : null}
                    <th className="p-4 font-semibold">Received</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {paginatedLeads.map((lead) => {
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
                              <div className="flex items-center gap-1.5 flex-wrap">
                                <span className="font-bold text-gray-900 transition group-hover:text-[#FFC107]">
                                  {lead.customer.name}
                                </span>
                                {lead.customer.isPrime ? (
                                  <span
                                    title="Prime Customer"
                                    className="inline-flex items-center justify-center rounded-full bg-amber-100/90 p-0.5 text-amber-800 border border-amber-300 shadow-2xs shrink-0"
                                  >
                                    <Crown className="h-2.5 w-2.5 fill-amber-500 text-amber-600" />
                                  </span>
                                ) : null}
                              </div>
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
                        <td className="p-4 max-w-[230px]">
                          <span
                            className="font-semibold text-gray-900 transition group-hover:text-[#FFC107] block text-xs leading-snug line-clamp-2"
                            title={lead.listing.title}
                          >
                            {lead.listing.title}
                          </span>
                          <div className="mt-0.5 text-[11px] text-gray-500">
                            {[lead.listing.locationCity, lead.listing.locationState].filter(Boolean).join(', ')}
                          </div>
                        </td>
                        <td className="p-4 whitespace-nowrap">
                          <InlineCrmDropdown 
                            leadId={lead.id}
                            currentStatus={lead.status}
                            onStatusChange={(newStatus) => {
                              setData(prev => {
                                const newLeads = prev.leads.map(l => l.id === lead.id ? { ...l, status: newStatus } : l);
                                return { ...prev, leads: newLeads };
                              });
                            }}
                          />
                        </td>
                        <td className="p-4 whitespace-nowrap">
                          <span
                            className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold whitespace-nowrap ${
                              lead.enquiryType.startsWith('SUPER_ADMIN')
                                ? 'bg-amber-50 text-amber-900 border border-amber-200'
                                : 'bg-gray-100 text-gray-700'
                            }`}
                          >
                            {formatPortalLabel(lead.enquiryType)}
                          </span>
                        </td>
                        {isInternal ? (
                          <td className="p-4 whitespace-nowrap min-w-[170px]">
                            {lead.routing.mode === 'SUPER_ADMIN' ? (
                              <div className="flex items-center gap-2">
                                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-amber-100 text-[11px] font-extrabold text-amber-800 border border-amber-300">
                                  SA
                                </div>
                                <div className="flex flex-col gap-0.5">
                                  <span className="font-bold text-gray-900 text-xs whitespace-nowrap">
                                    Super Admin
                                  </span>
                                  <span className="inline-flex w-fit rounded bg-amber-100 px-1.5 py-0.5 text-[8px] font-extrabold uppercase tracking-wider text-amber-800">
                                    PLATFORM ADMIN
                                  </span>
                                </div>
                              </div>
                            ) : lead.listingOwner || lead.recipient ? (
                              <div className="flex items-center gap-2">
                                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-blue-50 text-[11px] font-extrabold text-blue-700 border border-blue-200">
                                  {(lead.listingOwner?.name || lead.recipient?.name || 'S').charAt(0).toUpperCase()}
                                </div>
                                <div className="flex flex-col gap-0.5">
                                  <span className="font-bold text-gray-900 text-xs whitespace-nowrap">
                                    {lead.listingOwner?.name || lead.recipient?.name}
                                  </span>
                                  {(lead.listingOwner?.partnerType || lead.recipient?.partnerType) ? (
                                    <span className="inline-flex w-fit rounded bg-gray-100 px-1.5 py-0.5 text-[8px] font-extrabold uppercase tracking-wider text-gray-600">
                                      {formatPortalLabel(lead.listingOwner?.partnerType || lead.recipient?.partnerType)}
                                    </span>
                                  ) : (
                                    <span className="inline-flex w-fit rounded bg-gray-100 px-1.5 py-0.5 text-[8px] font-extrabold uppercase tracking-wider text-gray-600">
                                      SELLER
                                    </span>
                                  )}
                                  {(lead.listingOwner?.mobile || lead.listingOwner?.whatsappNumber || lead.recipient?.mobile || lead.recipient?.whatsappNumber) ? (
                                    <a
                                      href={`tel:${lead.listingOwner?.mobile || lead.listingOwner?.whatsappNumber || lead.recipient?.mobile || lead.recipient?.whatsappNumber}`}
                                      onClick={(e) => e.stopPropagation()}
                                      className="group/phone mt-0.5 inline-flex w-fit items-center gap-1 text-[10px] font-bold text-blue-700 transition-colors hover:text-blue-900 whitespace-nowrap"
                                    >
                                      <Phone className="h-2.5 w-2.5 text-blue-600 transition-colors group-hover/phone:text-blue-700" />
                                      <span>Call {lead.listingOwner?.mobile || lead.listingOwner?.whatsappNumber || lead.recipient?.mobile || lead.recipient?.whatsappNumber}</span>
                                    </a>
                                  ) : (
                                    <span className="text-[10px] text-gray-400 mt-0.5">No contact</span>
                                  )}
                                </div>
                              </div>
                            ) : (
                              <span className="inline-flex rounded-full bg-gray-50 px-2.5 py-0.5 text-[10px] font-medium text-gray-400">
                                Not routed
                              </span>
                            )}
                          </td>
                        ) : null}
                        <td className="p-4 text-xs font-medium text-gray-700 whitespace-nowrap">
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

            {/* Pagination Controls */}
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between border-t border-gray-100 bg-white px-6 py-3.5">
              <div className="flex flex-wrap items-center justify-between gap-4 sm:justify-start text-xs text-gray-500 font-medium">
                <div>
                  Showing <span className="font-bold text-gray-900">{startItemIndex}</span> to{' '}
                  <span className="font-bold text-gray-900">{endItemIndex}</span> of{' '}
                  <span className="font-bold text-gray-900">{totalLeads}</span> enquiries
                </div>

                <div className="flex items-center gap-2">
                  <span>Rows per page:</span>
                  <div className="relative rows-per-page-dropdown-container">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        setOpenPageSizeDropdown((prev) => !prev);
                      }}
                      className="flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-2.5 py-1 text-xs font-bold text-gray-800 shadow-2xs transition hover:bg-gray-50 focus:border-[#FFC107] focus:ring-1 focus:ring-[#FFC107]"
                    >
                      <span>{pageSize}</span>
                      <ChevronDown className="h-3.5 w-3.5 text-gray-400" />
                    </button>

                    {openPageSizeDropdown && (
                      <div className="absolute bottom-full left-0 z-50 mb-1.5 w-20 origin-bottom-left rounded-xl border border-gray-100 bg-white p-1 shadow-lg">
                        {[5, 10, 25, 50].map((size) => (
                          <button
                            key={size}
                            type="button"
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              setPageSize(size);
                              setCurrentPage(1);
                              setOpenPageSizeDropdown(false);
                            }}
                            className={`block w-full rounded-lg px-2.5 py-1.5 text-left text-xs transition-colors hover:bg-gray-100 ${
                              pageSize === size
                                ? 'bg-[#FFC107]/20 font-extrabold text-gray-900'
                                : 'text-gray-700 font-medium'
                            }`}
                          >
                            {size}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-center sm:justify-end gap-1">
                <button
                  type="button"
                  onClick={() => setCurrentPage((prev) => Math.max(prev - 1, 1))}
                  disabled={currentPage === 1}
                  className="inline-flex items-center gap-1 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-semibold text-gray-700 shadow-2xs transition hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <ChevronLeft className="h-4 w-4" />
                  <span className="hidden sm:inline">Previous</span>
                </button>

                <div className="flex items-center gap-1 px-1">
                  {Array.from({ length: totalPages }, (_, idx) => idx + 1)
                    .filter((page) => {
                      if (totalPages <= 5) return true;
                      if (page === 1 || page === totalPages) return true;
                      return Math.abs(page - safeCurrentPage) <= 1;
                    })
                    .reduce<(number | string)[]>((acc, page, i, arr) => {
                      if (i > 0 && page - (arr[i - 1] as number) > 1) {
                        acc.push('...');
                      }
                      acc.push(page);
                      return acc;
                    }, [])
                    .map((item, idx) =>
                      typeof item === 'number' ? (
                        <button
                          key={item}
                          type="button"
                          onClick={() => setCurrentPage(item)}
                          className={`h-8 w-8 rounded-lg text-xs font-bold transition ${
                            safeCurrentPage === item
                              ? 'bg-[#FFC107] text-black shadow-2xs'
                              : 'text-gray-600 hover:bg-gray-100'
                          }`}
                        >
                          {item}
                        </button>
                      ) : (
                        <span key={`ellipsis-${idx}`} className="px-1 text-xs text-gray-400 font-bold">
                          ...
                        </span>
                      )
                    )}
                </div>

                <button
                  type="button"
                  onClick={() => setCurrentPage((prev) => Math.min(prev + 1, totalPages))}
                  disabled={currentPage === totalPages || totalPages === 1}
                  className="inline-flex items-center gap-1 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-semibold text-gray-700 shadow-2xs transition hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <span className="hidden sm:inline">Next</span>
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
