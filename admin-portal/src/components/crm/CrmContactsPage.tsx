'use client';

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useRouter } from 'next/navigation';
import { toast } from 'react-toastify';
import {
  Check,
  ChevronDown,
  Crown,
  Loader2,
  MessageCircle,
  Phone,
  Plus,
  Search,
  UserPlus,
  UserX,
  Users,
} from 'lucide-react';
import api from '@/lib/api';
import { Button, cellClass, EmptyState, Field, inputClass, Modal, ModalFooter, tableHeadClass, Toggle } from '@/components/financeWorkspace/ui';
import {
  contactHref,
  CONTACT_TYPES,
  CrmErrorBanner,
  CrmLoadingState,
  CrmSelect,
  crmError,
  CrmPageFrame,
  fmtDate,
  fmtDateTime,
  getJson,
  label,
  PageHeader,
  phoneLinks,
  StatusBadge,
  useCrmBase,
  useCrmMeta,
  useCrmResource,
  type ContactLite,
} from './crmShared';
import { LocationFields } from './LeadForm';
import { buildContactPayload, sanitizePhoneInput, updateContactLocation, validateContactPhones, type ContactFormState } from './contactFormState';
import { contactLifecyclePresentation, type ContactLifecycleTone } from './contactPresentation';

type ContactRow = ContactLite & {
  createdAt: string;
  isPrime: boolean;
  leadCount: number;
  openLeadCount: number;
  lastLeadAt: string | null;
  nextFollowUpAt: string | null;
  pipelineStage: { code: string; name: string; color: string; isTerminal: boolean } | null;
  crmProfile: {
    companyName: string | null;
    lifecycle: string;
    contactTypes: string[];
    tags: string[];
    doNotContact: boolean;
    owner: { id: string; name: string | null } | null;
  } | null;
};

const LIFECYCLE_CONFIG: Record<
  ContactLifecycleTone,
  { bg: string; text: string; border: string; dot: string }
> = {
  blue: { bg: 'bg-blue-50', text: 'text-blue-700', border: 'border-blue-200/90', dot: 'bg-blue-500' },
  amber: { bg: 'bg-amber-50', text: 'text-amber-800', border: 'border-amber-200/90', dot: 'bg-amber-500' },
  green: { bg: 'bg-emerald-50', text: 'text-emerald-800', border: 'border-emerald-200/90', dot: 'bg-emerald-500' },
  slate: { bg: 'bg-slate-100', text: 'text-slate-700', border: 'border-slate-200/90', dot: 'bg-slate-400' },
};

const PAGE_SIZE = 50;

function ContactOwnerCell({ contact, onSaved }: { contact: ContactRow; onSaved: () => void }) {
  const { meta } = useCrmMeta();
  const currentOwner = contact.crmProfile?.owner;
  const currentOwnerId = currentOwner?.id || '';
  const [ownerId, setOwnerId] = useState(currentOwnerId);
  const [saving, setSaving] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [coords, setCoords] = useState<{ top: number; left: number; openUp: boolean } | null>(null);

  const canEdit = Boolean(meta?.access.canManage && meta.access.canAssign);
  const staffList = meta?.staff || [];

  // Sync state if contact prop changes
  useEffect(() => {
    setOwnerId(currentOwnerId);
  }, [currentOwnerId]);

  // Close popover on outside click and Escape
  useEffect(() => {
    if (!isOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (
        menuRef.current &&
        !menuRef.current.contains(e.target as Node) &&
        buttonRef.current &&
        !buttonRef.current.contains(e.target as Node)
      ) {
        setIsOpen(false);
      }
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setIsOpen(false);
    };
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen]);

  const toggleOpen = () => {
    if (isOpen) {
      setIsOpen(false);
      return;
    }
    if (buttonRef.current) {
      const rect = buttonRef.current.getBoundingClientRect();
      const openUp = window.innerHeight - rect.bottom < 250 && rect.top > 250;
      setCoords({
        top: openUp ? rect.top - 6 : rect.bottom + 6,
        left: Math.min(window.innerWidth - 240, Math.max(12, rect.left)),
        openUp,
      });
      setSearchQuery('');
      setIsOpen(true);
    }
  };

  const updateOwner = async (nextOwnerId: string) => {
    if (nextOwnerId === ownerId || saving) return;
    const previousOwnerId = ownerId;
    setOwnerId(nextOwnerId);
    setSaving(true);
    try {
      await api.patch(`/crm/contacts/${contact.id}`, { ownerId: nextOwnerId || null });
      toast.success(nextOwnerId ? 'Contact owner updated.' : 'Contact is now unassigned.');
      onSaved();
    } catch (error) {
      setOwnerId(previousOwnerId);
      toast.error(crmError(error, 'Could not update the contact owner.'));
    } finally {
      setSaving(false);
    }
  };

  // Find current selected staff info
  const selectedStaff = staffList.find((s) => s.id === ownerId) || (ownerId === currentOwner?.id ? currentOwner : null);
  const displayName = selectedStaff?.name || null;

  if (!canEdit) {
    if (!displayName) {
      return <span className="text-[11px] font-medium text-slate-400">Unassigned</span>;
    }
    return (
      <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-700">
        <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-slate-100 text-[10px] font-bold text-slate-700 border border-slate-200">
          {displayName.charAt(0).toUpperCase()}
        </span>
        <span className="truncate max-w-[120px]">{displayName}</span>
      </span>
    );
  }

  const filteredStaff = staffList.filter((s) =>
    (s.name || '').toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="relative inline-flex items-center">
      {displayName ? (
        <button
          ref={buttonRef}
          type="button"
          disabled={saving}
          onClick={(e) => {
            e.stopPropagation();
            toggleOpen();
          }}
          className="group inline-flex items-center gap-1.5 rounded-full border border-slate-200/90 bg-white px-2.5 py-1 text-xs font-semibold text-slate-800 shadow-2xs hover:border-amber-400 hover:bg-amber-50/40 hover:shadow-xs transition-all cursor-pointer focus:outline-none focus:ring-2 focus:ring-amber-400/20 disabled:opacity-60"
          title="Assigned staff (Click to change)"
        >
          <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-amber-400 to-amber-500 text-[10px] font-bold text-slate-950 shadow-2xs">
            {displayName.charAt(0).toUpperCase()}
          </span>
          <span className="max-w-[105px] truncate font-semibold text-slate-800 group-hover:text-slate-950">
            {displayName}
          </span>
          {saving ? (
            <Loader2 className="h-3 w-3 shrink-0 animate-spin text-amber-600" />
          ) : (
            <ChevronDown
              className={`h-3 w-3 shrink-0 text-slate-400 transition-transform duration-200 group-hover:text-slate-700 ${
                isOpen ? 'rotate-180 text-amber-600' : ''
              }`}
            />
          )}
        </button>
      ) : (
        <button
          ref={buttonRef}
          type="button"
          disabled={saving}
          onClick={(e) => {
            e.stopPropagation();
            toggleOpen();
          }}
          className="group inline-flex items-center gap-1.5 rounded-full border border-dashed border-slate-300 bg-slate-50/70 px-2.5 py-1 text-xs font-medium text-slate-500 hover:border-amber-400 hover:bg-white hover:text-slate-800 hover:shadow-2xs transition-all cursor-pointer focus:outline-none focus:ring-2 focus:ring-amber-400/20 disabled:opacity-60"
          title="Unassigned (Click to assign staff)"
        >
          <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-slate-200/70 text-slate-400 group-hover:bg-amber-100 group-hover:text-amber-700 transition-colors">
            <UserPlus className="h-3 w-3" />
          </span>
          <span className="text-[11px] font-medium text-slate-600 group-hover:text-slate-900">
            Unassigned
          </span>
          {saving ? (
            <Loader2 className="h-3 w-3 shrink-0 animate-spin text-amber-600" />
          ) : (
            <ChevronDown
              className={`h-3 w-3 shrink-0 text-slate-400 transition-transform duration-200 group-hover:text-slate-700 ${
                isOpen ? 'rotate-180 text-amber-600' : ''
              }`}
            />
          )}
        </button>
      )}

      {isOpen && coords && typeof window !== 'undefined'
        ? createPortal(
            <div
              ref={menuRef}
              style={{
                position: 'fixed',
                top: `${coords.top}px`,
                left: `${coords.left}px`,
                width: '230px',
                transform: coords.openUp ? 'translateY(-100%)' : 'none',
              }}
              className="z-[999999] overflow-hidden rounded-2xl border border-slate-200/90 bg-white p-1.5 shadow-2xl ring-1 ring-black/5 animate-in fade-in-50 zoom-in-95 duration-100"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between px-2.5 py-1.5 border-b border-slate-100 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                <span>Assign Contact Owner</span>
                <Users className="h-3 w-3 text-slate-400" />
              </div>

              {staffList.length > 4 ? (
                <div className="p-1 border-b border-slate-100">
                  <div className="relative flex items-center">
                    <Search className="pointer-events-none absolute left-2.5 h-3.5 w-3.5 text-slate-400" />
                    <input
                      type="text"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      placeholder="Search staff..."
                      autoFocus
                      className="w-full rounded-lg bg-slate-50 py-1 pl-8 pr-2 text-xs font-semibold text-slate-900 outline-none placeholder:text-slate-400 focus:bg-white focus:ring-1 focus:ring-amber-400"
                    />
                  </div>
                </div>
              ) : null}

              <div className="max-h-56 overflow-y-auto py-1 custom-scrollbar">
                <button
                  type="button"
                  onClick={() => {
                    void updateOwner('');
                    setIsOpen(false);
                  }}
                  className={`flex w-full items-center justify-between rounded-xl px-2.5 py-1.5 text-xs font-medium transition cursor-pointer ${
                    !ownerId
                      ? 'bg-amber-50/80 font-bold text-amber-900'
                      : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <span className="flex h-5 w-5 items-center justify-center rounded-full bg-slate-100 text-slate-500">
                      <UserX className="h-3 w-3" />
                    </span>
                    <span>Unassigned</span>
                  </div>
                  {!ownerId ? <Check className="h-3.5 w-3.5 text-amber-600" /> : null}
                </button>

                {filteredStaff.map((staff) => {
                  const isSelected = staff.id === ownerId;
                  return (
                    <button
                      key={staff.id}
                      type="button"
                      onClick={() => {
                        void updateOwner(staff.id);
                        setIsOpen(false);
                      }}
                      className={`flex w-full items-center justify-between rounded-xl px-2.5 py-1.5 text-xs transition cursor-pointer ${
                        isSelected
                          ? 'bg-amber-50 font-bold text-amber-950'
                          : 'text-slate-700 hover:bg-slate-50 hover:text-slate-900 font-medium'
                      }`}
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-slate-100 text-[10px] font-bold text-slate-700 border border-slate-200">
                          {(staff.name || 'S').charAt(0).toUpperCase()}
                        </span>
                        <div className="min-w-0 text-left">
                          <p className="truncate text-xs font-semibold">{staff.name}</p>
                          {staff.roleName ? (
                            <p className="truncate text-[10px] text-slate-400 font-normal">{staff.roleName}</p>
                          ) : null}
                        </div>
                      </div>
                      {isSelected ? <Check className="h-3.5 w-3.5 text-amber-600 shrink-0 ml-1.5" /> : null}
                    </button>
                  );
                })}
              </div>
            </div>,
            document.body
          )
        : null}
    </div>
  );
}

function Contacts() {
  const { meta } = useCrmMeta();
  const { base } = useCrmBase();
  const router = useRouter();
  const [q, setQ] = useState('');
  const [search, setSearch] = useState('');
  const [lifecycle, setLifecycle] = useState('');
  const [pipelineStage, setPipelineStage] = useState('');
  const [contactType, setContactType] = useState('');
  const [openLeads, setOpenLeads] = useState('');
  const [page, setPage] = useState(1);
  const [creating, setCreating] = useState(false);
  const query = { q: search, lifecycle, pipelineStage, contactType, openLeads, page, pageSize: PAGE_SIZE };
  const contacts = useCrmResource(
    () => getJson<{ total: number; items: ContactRow[] }>('/crm/contacts', query),
    JSON.stringify(query),
  );
  const total = contacts.data?.total || 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const reset = (fn: () => void) => {
    fn();
    setPage(1);
  };

  return (
    <>
      <PageHeader
        title="Customer & Contact Directory"
        badgeText={`${total} Contacts Tracked`}
        description="Unified relationship directory of buyers, equipment owners, certified dealers, and financiers. Complete interaction history linked by mobile."
        actions={
          meta?.access.canManage && !meta.access.isPartner ? (
            <Button
              variant="primary"
              icon={<Plus className="h-4 w-4" />}
              onClick={() => setCreating(true)}
            >
              Add New Contact
            </Button>
          ) : undefined
        }
      />

      <section className="overflow-hidden rounded-2xl border border-slate-200/90 bg-white shadow-2xs">
        {/* FILTERS TOOLBAR */}
        <div className="grid grid-cols-2 gap-2 border-b border-slate-100 p-3.5 sm:p-4 md:grid-cols-3 xl:grid-cols-[minmax(260px,2fr)_repeat(4,minmax(0,1fr))]">
          <form
            className="relative col-span-2 md:col-span-3 xl:col-span-1"
            onSubmit={(e) => {
              e.preventDefault();
              reset(() => setSearch(q));
            }}
          >
            <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search by customer name, mobile, company, city…"
              className="w-full rounded-xl border border-slate-200/90 bg-slate-50/70 py-1.5 pl-9 pr-3 text-xs font-semibold text-slate-900 outline-none transition focus:border-amber-400 focus:bg-white focus:ring-2 focus:ring-amber-400/20"
              aria-label="Search contacts"
            />
          </form>

          <CrmSelect
            options={[{ id: '', name: 'All Contact Lifecycles' }, ...(meta?.enums.lifecycles || []).map((l) => ({ id: l, name: label(l) }))]}
            value={lifecycle}
            onChange={(next) => reset(() => setLifecycle(next))}
            className="w-full"
          />

          <CrmSelect
            options={[{ id: '', name: 'All Pipeline Stages' }, ...(meta?.pipelineStages || []).map((stage) => ({ id: stage.code, name: stage.name }))]}
            value={pipelineStage}
            onChange={(next) => reset(() => setPipelineStage(next))}
            searchable
            className="w-full"
          />

          <CrmSelect
            options={[{ id: '', name: 'All Contact Types' }, ...CONTACT_TYPES.map((t) => ({ id: t, name: label(t) }))]}
            value={contactType}
            onChange={(next) => reset(() => setContactType(next))}
            className="w-full"
          />

          <CrmSelect
            options={[{ id: '', name: 'All Records' }, { id: 'yes', name: 'Only With Active Leads' }]}
            value={openLeads}
            onChange={(next) => reset(() => setOpenLeads(next))}
            className="w-full"
          />
        </div>

        {/* METRIC STRIP */}
        <div className="flex items-center justify-between px-4 py-2 text-xs bg-slate-50/50">
          <span className="font-bold text-slate-800">
            {total} {total === 1 ? 'Contact' : 'Contacts'} Available
          </span>
          {search || lifecycle || pipelineStage || contactType || openLeads ? (
            <button
              type="button"
              onClick={() => {
                setQ('');
                setSearch('');
                setLifecycle('');
                setPipelineStage('');
                setContactType('');
                setOpenLeads('');
                setPage(1);
              }}
              className="font-bold text-amber-700 hover:text-amber-800 text-[11px]"
            >
              Reset Filters
            </button>
          ) : null}
        </div>

        {contacts.loading && !contacts.data ? (
          <CrmLoadingState label="Loading contacts directory…" />
        ) : contacts.error ? (
          <CrmErrorBanner message={contacts.error} schemaMissing={contacts.schemaMissing} />
        ) : !contacts.data?.items.length ? (
          <EmptyState
            title="No contacts found"
            description="Try modifying search keywords or add a new customer contact directly."
          />
        ) : (
          <div className="overflow-x-auto border-t border-slate-100">
            <table className="w-full min-w-[960px] text-left text-xs">
              <thead className={tableHeadClass}>
                <tr>
                  <th className="px-3.5 py-2.5 font-bold text-slate-700">Customer Identity</th>
                  <th className="px-3.5 py-2.5 font-bold text-slate-700">Role, Lifecycle & Stage</th>
                  <th className="px-3.5 py-2.5 font-bold text-slate-700">Lead History</th>
                  <th className="px-3.5 py-2.5 font-bold text-slate-700">Next Follow-up</th>
                  <th className="px-3.5 py-2.5 font-bold text-slate-700">Assigned To</th>
                  <th className="px-3.5 py-2.5 font-bold text-slate-700">Created</th>
                  <th className="px-3.5 py-2.5 font-bold text-slate-700 text-right">Quick Dial</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {contacts.data.items.map((c) => {
                  const links = phoneLinks(c.mobile, c.whatsappNumber);
                  const lifecycle = contactLifecyclePresentation(c.crmProfile?.lifecycle);
                  const lcCfg = LIFECYCLE_CONFIG[lifecycle.tone] || LIFECYCLE_CONFIG.blue;
                  return (
                    <tr
                      key={`${c.id}:${c.crmProfile?.owner?.id || ''}`}
                      className="cursor-pointer hover:bg-slate-50/80 transition-colors"
                      onClick={() => router.push(contactHref(base, c.id))}
                    >
                      <td className={cellClass}>
                        <div className="flex items-center gap-2">
                          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-800 font-bold text-[11px] border border-slate-200">
                            {(c.name || c.mobile || 'U').charAt(0).toUpperCase()}
                          </div>
                          <div className="min-w-0">
                            <p className="flex items-center gap-1.5 font-bold text-slate-900 text-xs hover:text-amber-600 transition-colors">
                              {c.name || 'Unnamed Customer'}
                              {c.isPrime ? (
                                <span className="inline-flex items-center gap-0.5 rounded-full bg-amber-400/20 px-2 py-0.5 text-[10px] font-bold uppercase text-amber-700 border border-amber-400/40 leading-none">
                                  <Crown className="h-2.5 w-2.5 text-amber-600" />
                                  Prime
                                </span>
                              ) : null}
                              {c.crmProfile?.doNotContact ? (
                                <span className="rounded bg-rose-100 text-rose-700 px-1.5 py-0.5 text-[10px] font-bold uppercase leading-none">
                                  DND
                                </span>
                              ) : null}
                            </p>
                            <p className="text-[11px] text-slate-500 font-medium">
                              {c.mobile}
                              {c.crmProfile?.companyName ? ` · ${c.crmProfile.companyName}` : ''}
                              {c.city ? ` · ${c.city}` : ''}
                            </p>
                          </div>
                        </div>
                      </td>

                      <td className={cellClass}>
                        <div className="flex flex-col items-start gap-1">
                          <p className="text-xs font-bold text-slate-800 leading-tight">
                            {c.crmProfile?.contactTypes?.length
                              ? c.crmProfile.contactTypes.map(label).join(', ')
                              : (c.role === 'CUSTOMER' ? 'Customer' : label(c.role))}
                          </p>
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span
                              className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[10px] font-bold tracking-tight border shadow-2xs ${lcCfg.bg} ${lcCfg.text} ${lcCfg.border}`}
                              title={`Lifecycle: ${lifecycle.label}`}
                            >
                              <span className={`h-1.5 w-1.5 rounded-full shrink-0 ${lcCfg.dot}`} />
                              <span>{lifecycle.label}</span>
                            </span>
                            {c.pipelineStage ? (
                              <StatusBadge
                                status={c.pipelineStage.isTerminal && c.pipelineStage.code !== 'WON' ? 'WON' : c.pipelineStage.code}
                                name={c.pipelineStage.name}
                                title={`Pipeline Stage: ${c.pipelineStage.name}`}
                              />
                            ) : null}
                          </div>
                        </div>
                      </td>

                      <td className={cellClass}>
                        <span className="font-bold text-slate-900 text-xs">{c.openLeadCount}</span>
                        <span className="text-[11px] text-slate-500 font-medium"> open / {c.leadCount} total</span>
                      </td>

                      <td className={cellClass}>
                        <span className="text-[11px] font-semibold text-slate-700">
                          {fmtDateTime(c.nextFollowUpAt)}
                        </span>
                      </td>

                      <td className={cellClass} onClick={(e) => e.stopPropagation()}>
                        <ContactOwnerCell contact={c} onSaved={contacts.reload} />
                      </td>

                      <td className={cellClass}>
                        <span className="text-[11px] text-slate-500">{fmtDate(c.createdAt)}</span>
                      </td>

                      <td className={`${cellClass} text-right`} onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center justify-end gap-1.5">
                          {links.wa ? (
                            <a
                              href={links.wa}
                              target="_blank"
                              rel="noreferrer"
                              className="flex h-7 w-7 items-center justify-center rounded-lg border border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 transition-colors"
                              title="Chat on WhatsApp"
                            >
                              <MessageCircle className="h-3.5 w-3.5" />
                            </a>
                          ) : null}
                          {links.tel ? (
                            <a
                              href={links.tel}
                              className="flex h-7 w-7 items-center justify-center rounded-lg border border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100 transition-colors"
                              title="Direct Phone Call"
                            >
                              <Phone className="h-3.5 w-3.5" />
                            </a>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>

            {/* PAGINATION */}
            <div className="flex flex-col sm:flex-row items-center justify-between border-t border-slate-100 px-4 py-2.5 text-xs text-slate-500 gap-2">
              <span className="font-medium">
                Showing {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, total)} of {total} contacts
              </span>
              <div className="flex items-center gap-2">
                <Button disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
                  Previous
                </Button>
                <span className="font-bold text-slate-700">
                  Page {page} of {totalPages}
                </span>
                <Button disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>
                  Next
                </Button>
              </div>
            </div>
          </div>
        )}
      </section>

      {creating ? (
        <ContactForm
          onClose={() => setCreating(false)}
          onSaved={(id) => router.push(contactHref(base, id))}
        />
      ) : null}
    </>
  );
}

function ContactForm({ onClose, onSaved }: { onClose: () => void; onSaved: (id: string) => void }) {
  const { meta } = useCrmMeta();
  const [form, setForm] = useState<ContactFormState>({
    name: '',
    mobile: '',
    email: '',
    whatsappNumber: '',
    alternatePhone: '',
    companyName: '',
    city: '',
    state: '',
    pinCode: '',
    address: '',
    gstNumber: '',
    lifecycle: 'LEAD',
    contactTypes: [] as string[],
    tags: [] as string[],
    notes: '',
    ownerId: '',
    preferredLanguage: '',
    doNotContact: false,
  });
  const [busy, setBusy] = useState(false);

  const save = async () => {
    const phoneError = validateContactPhones({
      mobile: sanitizePhoneInput(form.mobile),
      whatsappNumber: sanitizePhoneInput(form.whatsappNumber),
      alternatePhone: sanitizePhoneInput(form.alternatePhone),
    });
    if (phoneError) {
      toast.error(phoneError);
      return;
    }
    setBusy(true);
    try {
      const result = (await api.post('/crm/contacts', buildContactPayload(form, Boolean(meta?.access.canAssign)))).data as {
        contact: { id: string };
        created: boolean;
      };
      toast.success(result.created ? 'Contact profile created.' : 'Mobile already exists — opened existing contact.');
      onSaved(result.contact.id);
    } catch (error) {
      toast.error(crmError(error, 'Could not save contact.'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal title="Create New Customer / Contact" onClose={onClose} wide>
      <div className="grid gap-3 p-5 sm:p-7 md:grid-cols-3">
        <Field label="Mobile Number *">
          <input
            value={form.mobile}
            onChange={(e) => setForm({ ...form, mobile: sanitizePhoneInput(e.target.value) })}
            className={inputClass}
            placeholder="e.g. 9876543210"
            inputMode="tel"
            maxLength={10}
            pattern="[6-9][0-9]{9}"
            autoComplete="tel"
          />
        </Field>
        <Field label="Full Name">
          <input
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            className={inputClass}
            placeholder="Customer or contact name"
          />
        </Field>
        <Field label="Email Address">
          <input
            type="email"
            value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
            className={inputClass}
            placeholder="customer@domain.com"
          />
        </Field>
        <Field label="Company / Entity Name">
          <input
            value={form.companyName}
            onChange={(e) => setForm({ ...form, companyName: e.target.value })}
            className={inputClass}
            placeholder="Enterprise or dealership name"
          />
        </Field>
        <Field label="WhatsApp Number">
          <input
            value={form.whatsappNumber}
            onChange={(e) => setForm({ ...form, whatsappNumber: sanitizePhoneInput(e.target.value) })}
            className={inputClass}
            placeholder="If different from mobile"
            inputMode="tel"
            maxLength={10}
            pattern="[6-9][0-9]{9}"
            autoComplete="tel-national"
          />
        </Field>
        <Field label="Alternate Phone">
          <input
            value={form.alternatePhone}
            onChange={(e) => setForm({ ...form, alternatePhone: sanitizePhoneInput(e.target.value) })}
            className={inputClass}
            placeholder="Optional alternate number"
            inputMode="tel"
            maxLength={10}
            pattern="[6-9][0-9]{9}"
            autoComplete="tel-national"
          />
        </Field>
        <div className="md:col-span-2">
          <LocationFields
            state={form.state}
            city={form.city}
            onStateChange={(next) => setForm((current) => updateContactLocation(current, 'state', next))}
            onCityChange={(next) => setForm((current) => updateContactLocation(current, 'city', next))}
          />
        </div>
        <Field label="PIN code">
          <input
            value={form.pinCode}
            onChange={(e) => setForm({ ...form, pinCode: e.target.value.replace(/\D/g, '').slice(0, 6) })}
            className={inputClass}
            placeholder="6-digit PIN"
            inputMode="numeric"
          />
        </Field>
        <Field label="GSTIN">
          <input data-sanitize="gstin"
            value={form.gstNumber}
            onChange={(e) => setForm({ ...form, gstNumber: e.target.value.toUpperCase() })}
            className={inputClass}
            placeholder="Optional GSTIN"
          />
        </Field>
        <Field label="Contact lifecycle">
          <CrmSelect
            options={(meta?.enums.lifecycles || []).map((l) => ({ id: l, name: label(l) }))}
            value={form.lifecycle}
            onChange={(next) => setForm({ ...form, lifecycle: next })}
            className="w-full"
          />
        </Field>
        {meta?.access.canAssign ? (
          <Field label="Account owner">
            <CrmSelect
              options={[{ id: '', name: 'None' }, ...meta.staff.map((s) => ({ id: s.id, name: s.name }))]}
              value={form.ownerId}
              onChange={(next) => setForm({ ...form, ownerId: next })}
              searchable
              className="w-full"
            />
          </Field>
        ) : null}
        <div className="md:col-span-3">
          <Field label="Address">
            <input
              value={form.address}
              onChange={(e) => setForm({ ...form, address: e.target.value })}
              className={inputClass}
              placeholder="Full address"
            />
          </Field>
        </div>
        <div className="md:col-span-3">
          <Field label="Contact Classification">
            <div className="flex flex-wrap gap-1.5 mt-1">
              {CONTACT_TYPES.map((t) => {
                const on = form.contactTypes.includes(t);
                return (
                  <button
                    key={t}
                    type="button"
                    onClick={() =>
                      setForm({
                        ...form,
                        contactTypes: on ? form.contactTypes.filter((x) => x !== t) : [...form.contactTypes, t],
                      })
                    }
                    className={`rounded-xl border px-3 py-1.5 text-xs font-bold transition-all ${
                      on
                        ? 'border-slate-900 bg-slate-900 text-white shadow-2xs'
                        : 'border-slate-200/90 bg-white text-slate-600 hover:bg-slate-50'
                    }`}
                  >
                    {label(t)}
                  </button>
                );
              })}
            </div>
          </Field>
        </div>
        <div className="md:col-span-3">
          <Field label="Tags">
            <div className="flex flex-wrap gap-1.5 mt-1">
              {[...(meta?.config.tags || []), ...form.tags.filter((tag) => !(meta?.config.tags || []).includes(tag))].map((tag) => {
                const selected = form.tags.includes(tag);
                return (
                  <button
                    key={tag}
                    type="button"
                    onClick={() => setForm({ ...form, tags: selected ? form.tags.filter((item) => item !== tag) : [...form.tags, tag] })}
                    className={`rounded-full border px-3 py-1.5 text-xs font-semibold ${selected ? 'border-slate-900 bg-slate-900 text-white' : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'}`}
                  >
                    {tag}
                  </button>
                );
              })}
            </div>
          </Field>
        </div>
        <Field label="Preferred language">
          <input
            value={form.preferredLanguage}
            onChange={(e) => setForm({ ...form, preferredLanguage: e.target.value })}
            className={inputClass}
            placeholder="Hindi / English…"
          />
        </Field>
        <div className="flex items-end pb-2">
          <Toggle checked={form.doNotContact} onChange={(value) => setForm({ ...form, doNotContact: value })} label="Do not contact" />
        </div>
        <Field label="Initial Notes" wide>
          <textarea
            rows={3}
            value={form.notes}
            onChange={(e) => setForm({ ...form, notes: e.target.value })}
            className={inputClass}
            placeholder="Fleet size, machinery interests, financial requirements..."
          />
        </Field>
        <div className="md:col-span-3">
          <ModalFooter>
            <Button onClick={onClose}>Cancel</Button>
            <Button
              variant="primary"
              busy={busy}
              disabled={!/^[6-9]\d{9}$/.test(sanitizePhoneInput(form.mobile))}
              onClick={save}
            >
              Save Contact
            </Button>
          </ModalFooter>
        </div>
      </div>
    </Modal>
  );
}

export default function CrmContactsPage() {
  return (
    <CrmPageFrame>
      <Contacts />
    </CrmPageFrame>
  );
}
