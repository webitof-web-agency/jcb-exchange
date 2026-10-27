'use client';

import Link from 'next/link';
import { useState } from 'react';
import { toast } from 'react-toastify';
import {
  ArrowLeft,
  ArrowRightLeft,
  FileText,
  Trophy,
  Bell,
  Building2,
  Calendar,
  CalendarPlus,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Clock,
  Copy,
  Edit3,
  ExternalLink,
  Flame,
  GitMerge,
  Globe,
  IndianRupee,
  MapPin,
  MessageCircle,
  MessageSquare,
  MessageSquareText,
  Phone,
  PhoneCall,
  Plus,
  Receipt,
  RotateCcw,
  Send,
  Share2,
  Shield,
  Shuffle,
  Snowflake,
  Sparkles,
  Star,
  StickyNote,
  Sun,
  Tag,
  Truck,
  User,
  UserCheck,
  UserCog,
  Users,
  X,
  XCircle,
} from 'lucide-react';
import api from '@/lib/api';
import { getAbsoluteFileUrl } from '@/lib/fileUpload';
import { useAuthStore } from '@/store/authStore';
import { hasAnyPermission } from '@/lib/permissionUtils';
import { Badge, Button, EmptyState, Field, inputClass, LoadingState, Modal, ModalFooter, Panel, Toggle } from '@/components/financeWorkspace/ui';
import { AssignModal, CompleteFollowUpModal, LogActivityModal, RescheduleModal, ScheduleFollowUpModal, StatusChangeModal } from './CrmModals';
import { FollowUpRow } from './FollowUpRow';
import { emptyRequirement, RequirementFields, requirementPayload, type RequirementState } from './LeadForm';
import {
  contactHref,
  CrmErrorBanner,
  crmError,
  CrmMetaProvider,
  EnquiryChannelBadge,
  fmtDate,
  fmtDateTime,
  fmtInr,
  getJson,
  label,
  LEAD_TYPE_LABELS,
  leadHref,
  leadWhatsAppMessage,
  phoneLinks,
  PriorityBadge,
  relative,
  selectClass,
  StatusBadge,
  TemperatureBadge,
  useCrmBase,
  useCrmMeta,
  useCrmResource,
  type FollowUp,
  type LeadRow,
} from './crmShared';

type Activity = {
  id: string;
  type: string;
  title: string;
  content: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: string;
  actor: { id: string; name: string | null; role: string } | null;
};

type LeadDetail = LeadRow & {
  categoryId: string | null;
  brandId: string | null;
  modelId: string | null;
  yearFrom: number | null;
  yearTo: number | null;
  requirementNotes: string | null;
  matchAlertsEnabled: boolean;
  enquiryType: string;
  assignedAt: string | null;
  wonSellAccountId: string | null;
  customer: LeadRow['customer'] & {
    crmProfile: {
      companyName: string | null;
      lifecycle: string;
      tags: string[];
      doNotContact: boolean;
      notes: string | null;
      alternatePhone: string | null;
    } | null;
  };
  dealer: LeadRow['dealer'] & { mobile: string | null; whatsappNumber: string | null };
  listing: {
    id: string;
    title: string;
    price: number | null;
    status: string;
    manufacturingYear: number;
    locationCity: string;
    locationState: string;
    brand: { name: string };
    model: { name: string };
    category: { name: string };
  } | null;
  activities: Activity[];
  followUps: FollowUp[];
  requirement: {
    category: { name: string } | null;
    brand: { name: string } | null;
    model: { name: string } | null;
  };
  wonDeal: {
    id: string;
    recordNumber: string;
    listingTitle: string | null;
    sellAmount: number | null;
  } | null;
};

type Match = {
  id: string;
  title: string;
  price: number;
  manufacturingYear: number;
  locationCity: string;
  locationState: string;
  matchScore: number;
  operatingHours: number | null;
};

type Payment = {
  id: string;
  status: string;
  amount: number | null;
  method: string;
  transactionRef: string | null;
  paymentNote: string | null;
  receiptUrl: string | null;
  submittedAt: string;
  rejectionReason: string | null;
};

type Detail = {
  lead: LeadDetail;
  otherLeads: Array<{
    id: string;
    status: string;
    leadType: string;
    createdAt: string;
    listingTitleSnapshot: string | null;
  }>;
  matches: Match[];
  payments: Payment[];
};

const STAGES = [
  'NEW',
  'CONTACTED',
  'QUALIFIED',
  'INTERESTED',
  'INSPECTION_SCHEDULED',
  'NEGOTIATION',
];

function getActivityVisuals(type: string, title: string) {
  const t = (type || '').toUpperCase();
  const lowTitle = (title || '').toLowerCase();

  if (t === 'WHATSAPP' || lowTitle.includes('whatsapp')) {
    return {
      Icon: MessageCircle,
      iconCls: 'text-emerald-600',
      bgCls: 'bg-emerald-50 border-emerald-200/90 text-emerald-700',
      badgeText: 'WhatsApp',
      badgeCls: 'bg-emerald-100 text-emerald-800 border-emerald-200',
    };
  }
  if (t === 'CALL' || lowTitle.includes('phone') || lowTitle.includes('call')) {
    return {
      Icon: PhoneCall,
      iconCls: 'text-blue-600',
      bgCls: 'bg-blue-50 border-blue-200/90 text-blue-700',
      badgeText: 'Phone Call',
      badgeCls: 'bg-blue-100 text-blue-800 border-blue-200',
    };
  }
  if (t === 'STATUS_CHANGE') {
    return {
      Icon: Shuffle,
      iconCls: 'text-purple-600',
      bgCls: 'bg-purple-50 border-purple-200/90 text-purple-700',
      badgeText: 'Stage Change',
      badgeCls: 'bg-purple-100 text-purple-800 border-purple-200',
    };
  }
  if (t === 'FOLLOW_UP' || lowTitle.includes('callback') || lowTitle.includes('repeat')) {
    return {
      Icon: Bell,
      iconCls: 'text-amber-600',
      bgCls: 'bg-amber-50 border-amber-200/90 text-amber-800',
      badgeText: lowTitle.includes('repeat') ? 'Repeat Enquiry' : 'Follow-up',
      badgeCls: 'bg-amber-100 text-amber-800 border-amber-200',
    };
  }
  if (t === 'NOTE') {
    return {
      Icon: StickyNote,
      iconCls: 'text-slate-600',
      bgCls: 'bg-slate-50 border-slate-200/90 text-slate-700',
      badgeText: 'Internal Note',
      badgeCls: 'bg-slate-100 text-slate-800 border-slate-200',
    };
  }
  if (t === 'ROUTING_UPDATE') {
    return {
      Icon: Send,
      iconCls: 'text-slate-400',
      bgCls: 'bg-slate-50 border-slate-200/60 text-slate-500',
      badgeText: 'System Route',
      badgeCls: 'bg-slate-100 text-slate-500 border-slate-200',
    };
  }
  return {
    Icon: Clock,
    iconCls: 'text-slate-500',
    bgCls: 'bg-white border-slate-200 text-slate-700',
    badgeText: label(type),
    badgeCls: 'bg-slate-100 text-slate-700 border-slate-200',
  };
}

/** Professional Interactive Stage Stepper */
function StageStepper({
  status,
  onSelectStage,
  canManage,
}: {
  status: string;
  onSelectStage: (stage: string) => void;
  canManage: boolean;
}) {
  const closed = status === 'WON' || status === 'LOST';
  const currentIndex = STAGES.indexOf(status);

  return (
    <div className="w-full">
      <div className="flex items-center gap-1 overflow-x-auto py-1 custom-scrollbar">
        {STAGES.map((stage, i) => {
          const isDone = closed ? status === 'WON' : currentIndex >= 0 && i < currentIndex;
          const isCurrent = stage === status;

          return (
            <button
              key={stage}
              type="button"
              disabled={!canManage}
              onClick={() => onSelectStage(stage)}
              className={`group relative flex flex-1 min-w-[110px] items-center justify-center gap-1.5 rounded-xl px-2.5 py-1.5 text-xs font-bold transition-all ${
                isCurrent
                  ? 'bg-slate-900 text-white shadow-sm ring-2 ring-slate-900/10'
                  : isDone
                  ? 'bg-amber-100/80 text-amber-900 hover:bg-amber-200'
                  : 'bg-slate-100 text-slate-500 hover:bg-slate-200 hover:text-slate-800'
              }`}
            >
              {isDone ? (
                <Check className="h-3 w-3 shrink-0 text-amber-700" />
              ) : isCurrent ? (
                <span className="h-1.5 w-1.5 rounded-full bg-amber-400 animate-pulse" />
              ) : (
                <span className="text-[10px] opacity-60">#{i + 1}</span>
              )}
              <span className="truncate">{label(stage)}</span>
            </button>
          );
        })}

        <button
          type="button"
          disabled={!canManage}
          onClick={() => onSelectStage(status === 'WON' ? 'LOST' : 'WON')}
          className={`shrink-0 rounded-xl px-3.5 py-1.5 text-xs font-bold transition-all ${
            status === 'WON'
              ? 'bg-emerald-600 text-white shadow-sm'
              : status === 'LOST'
              ? 'bg-rose-600 text-white shadow-sm'
              : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
          }`}
        >
          {status === 'LOST' ? 'Deal Lost' : status === 'WON' ? 'Deal Won' : 'Close Deal'}
        </button>
      </div>
    </div>
  );
}

function Detail({ leadId }: { leadId: string }) {
  const { meta } = useCrmMeta();
  const { base } = useCrmBase();
  const user = useAuthStore((s) => s.user);
  const [now] = useState(() => Date.now());
  const data = useCrmResource(() => getJson<Detail>(`/crm/leads/${leadId}`), `crm-lead-${leadId}`);
  const [modal, setModal] = useState<null | 'status' | 'schedule' | 'log' | 'assign' | 'edit' | 'merge' | 'template'>(null);
  const [targetStatus, setTargetStatus] = useState<string | undefined>(undefined);
  const [completing, setCompleting] = useState<FollowUp | null>(null);
  const [rescheduling, setRescheduling] = useState<FollowUp | null>(null);
  const [logType, setLogType] = useState('CALL');

  // Fast In-Line Activity Logger State
  const [inlineTab, setInlineTab] = useState<'NOTE' | 'CALL' | 'WHATSAPP'>('NOTE');
  const [inlineContent, setInlineContent] = useState('');
  const [inlineDuration, setInlineDuration] = useState('2');
  const [inlineDirection, setInlineDirection] = useState<'OUTBOUND' | 'INBOUND'>('OUTBOUND');
  const [isInlinePosting, setIsInlinePosting] = useState(false);

  // Timeline Filter
  const [timelineFilter, setTimelineFilter] = useState<'ALL' | 'CALLS_WHATSAPP' | 'FOLLOWUPS' | 'ROUTING'>('ALL');

  const close = () => {
    setModal(null);
    setTargetStatus(undefined);
  };
  const done = () => {
    setModal(null);
    setTargetStatus(undefined);
    setCompleting(null);
    setRescheduling(null);
    data.reload();
  };

  if (data.loading && !data.data) return <LoadingState label="Loading lead workspace…" />;
  if (data.error || !data.data) {
    return <CrmErrorBanner message={data.error || 'Lead not found.'} schemaMissing={data.schemaMissing} />;
  }

  const { lead, otherLeads, matches, payments } = data.data;
  const access = meta?.access;
  const isPartner = Boolean(access?.isPartner);
  const open = lead.status !== 'WON' && lead.status !== 'LOST';
  const links = phoneLinks(lead.customer.mobile, lead.customer.whatsappNumber, leadWhatsAppMessage(lead.customer.name, lead));
  const pending = lead.followUps
    .filter((f) => f.status === 'PENDING' || f.status === 'MISSED')
    .sort((a, b) => a.dueAt.localeCompare(b.dueAt));
  const history = lead.followUps.filter((f) => f.status === 'DONE' || f.status === 'CANCELLED');
  const backHref = isPartner ? '/partner/leads' : `${base}/leads`;
  const canVerifyPayment = user?.role === 'SUPER_ADMIN' || hasAnyPermission(user?.permissions, ['listings.verify_payment']);
  const adminPrefix = base.replace(/\/crm$/, '');
  // Latest Close Deal record: what was sold, and what the customer first enquired about.
  type WonDeal = { to?: string; soldVehicleMode?: string; soldListingTitle?: string | null; enquiredListingTitle?: string | null; isAlternate?: boolean; alternateSoldReason?: string | null };
  const wonDeal = lead.status === 'WON'
    ? lead.activities.map((a) => (a.type === 'STATUS_CHANGE' ? a.metadata as WonDeal | null : null)).find((m) => m?.to === 'WON' && m.soldVehicleMode) || null
    : null;
  const soldMachineName = wonDeal?.soldListingTitle || lead.listing?.title || lead.listingTitleSnapshot || 'Machine deal';
  const logWith = (type: string) => {
    setLogType(type);
    setModal('log');
  };

  const handleStageSelect = (newStage: string) => {
    if (newStage === lead.status) return;
    setTargetStatus(newStage);
    setModal('status');
  };

  const handleQuickInlinePost = async () => {
    if (!inlineContent.trim()) {
      toast.warning('Please enter a note or call summary.');
      return;
    }
    setIsInlinePosting(true);
    try {
      await api.post(`/crm/leads/${lead.id}/activities`, {
        type: inlineTab,
        title:
          inlineTab === 'CALL'
            ? `Phone Call (${inlineDirection === 'OUTBOUND' ? 'Outgoing' : 'Incoming'})`
            : inlineTab === 'WHATSAPP'
            ? 'WhatsApp Message Logged'
            : 'Internal Team Note',
        content: inlineContent.trim(),
        metadata:
          inlineTab === 'CALL'
            ? {
                direction: inlineDirection,
                durationSec: Number(inlineDuration || 2) * 60,
              }
            : undefined,
      });
      toast.success('Activity logged to timeline.');
      setInlineContent('');
      data.reload();
    } catch (err) {
      toast.error(crmError(err, 'Failed to log activity.'));
    } finally {
      setIsInlinePosting(false);
    }
  };

  const filteredActivities = lead.activities.filter((a) => {
    if (timelineFilter === 'ALL') return true;
    if (timelineFilter === 'CALLS_WHATSAPP') {
      return a.type === 'CALL' || a.type === 'WHATSAPP' || a.title.toLowerCase().includes('call') || a.title.toLowerCase().includes('whatsapp');
    }
    if (timelineFilter === 'FOLLOWUPS') {
      return a.type === 'FOLLOW_UP' || a.type === 'STATUS_CHANGE';
    }
    if (timelineFilter === 'ROUTING') {
      return a.type === 'ROUTING_UPDATE';
    }
    return true;
  });

  return (
    <div className="mx-auto max-w-[1540px] space-y-3.5 p-3 sm:p-5 text-slate-800">
      {/* 1. TOP BREADCRUMB & METRICS HEADER */}
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
        <Link
          href={backHref}
          className="inline-flex items-center gap-1.5 font-bold text-slate-600 hover:text-slate-900 transition-colors"
        >
          <ArrowLeft className="h-3.5 w-3.5 text-slate-500" />
          Back to Leads
        </Link>
        <div className="flex items-center gap-2 text-[11px] text-slate-500">
          <span>Lead ID: <strong className="font-mono text-slate-700">{lead.id.slice(0, 8)}</strong></span>
          <span>•</span>
          <span>Created {fmtDateTime(lead.createdAt)}</span>
          <span>•</span>
          <span className="font-semibold text-slate-700">{relative(lead.createdAt, now)}</span>
        </div>
      </div>

      {/* 2. EXECUTIVE HERO COMMAND CARD */}
      <section className="rounded-2xl border border-slate-200/90 bg-white p-4 sm:p-5 shadow-2xs space-y-4">
        {/* Top Tier: Customer Identity & High-Level Actions */}
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-xl sm:text-2xl font-black tracking-tight text-slate-900">
                {isPartner ? (
                  lead.customer.name || 'Unnamed Customer'
                ) : (
                  <Link href={contactHref(base, lead.customer.id)} className="hover:text-amber-600 transition-colors">
                    {lead.customer.name || 'Unnamed Customer'}
                  </Link>
                )}
              </h1>
              <StatusBadge status={lead.status} />
              <TemperatureBadge temperature={lead.temperature} score={lead.score} />
              <PriorityBadge priority={lead.priority} />
              {lead.customer.crmProfile?.doNotContact ? (
                <span className="inline-flex items-center gap-1 rounded-md bg-rose-50 border border-rose-200 px-2 py-0.5 text-[10px] font-bold text-rose-700">
                  <XCircle className="h-3 w-3" />
                  Do Not Contact
                </span>
              ) : null}
            </div>

            <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-600 font-medium">
              <span className="inline-flex items-center gap-1 font-semibold text-slate-900">
                <Phone className="h-3 w-3 text-slate-400" />
                {lead.customer.mobile || 'No mobile'}
                {lead.customer.mobile ? (
                  <button
                    type="button"
                    onClick={() => {
                      void navigator.clipboard.writeText(lead.customer.mobile || '');
                      toast.success('Mobile number copied.');
                    }}
                    className="text-slate-400 hover:text-slate-700 ml-0.5"
                    title="Copy phone"
                  >
                    <Copy className="h-3 w-3" />
                  </button>
                ) : null}
              </span>

              {lead.customer.city || lead.customer.state ? (
                <span className="inline-flex items-center gap-1 text-slate-500">
                  <MapPin className="h-3 w-3 text-slate-400" />
                  {[lead.customer.city, lead.customer.state].filter(Boolean).join(', ')}
                </span>
              ) : null}

              {lead.customer.crmProfile?.companyName ? (
                <span className="inline-flex items-center gap-1 text-slate-500">
                  <Building2 className="h-3 w-3 text-slate-400" />
                  {lead.customer.crmProfile.companyName}
                </span>
              ) : null}
            </div>
          </div>

          {/* Primary Quick Communication Buttons */}
          <div className="flex flex-wrap items-center gap-2 shrink-0">
            {links.tel ? (
              <a
                href={links.tel}
                onClick={() => setTimeout(() => logWith('CALL'), 400)}
                className="inline-flex items-center gap-1.5 rounded-xl bg-slate-900 px-3.5 py-2 text-xs font-bold text-white hover:bg-slate-800 transition-colors shadow-2xs"
                title="Call via phone"
              >
                <Phone className="h-3.5 w-3.5" />
                Call Customer
              </a>
            ) : null}

            {links.wa ? (
              <a
                href={links.wa}
                target="_blank"
                rel="noreferrer"
                onClick={() => setTimeout(() => logWith('WHATSAPP'), 400)}
                className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 px-3.5 py-2 text-xs font-bold text-white hover:bg-emerald-500 transition-colors shadow-2xs"
                title="Chat on WhatsApp"
              >
                <MessageCircle className="h-3.5 w-3.5" />
                WhatsApp
              </a>
            ) : null}

            {open && access?.canManage ? (
              <button
                type="button"
                onClick={() => setModal('schedule')}
                className="inline-flex items-center gap-1.5 rounded-xl bg-amber-400 px-3.5 py-2 text-xs font-bold text-slate-950 hover:bg-amber-300 transition-colors shadow-2xs"
              >
                <CalendarPlus className="h-3.5 w-3.5" />
                Next Step
              </button>
            ) : null}

            {access?.canManage ? (
              <button
                type="button"
                onClick={() => setModal('status')}
                className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-bold text-slate-700 hover:bg-slate-100 transition-colors"
              >
                <Shuffle className="h-3.5 w-3.5" />
                Stage
              </button>
            ) : null}
          </div>
        </div>

        {/* Middle Tier: Live KPI Strip */}
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6 rounded-xl bg-slate-50/80 border border-slate-100 p-2.5 text-xs">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Deal Value</p>
            <p className="font-extrabold text-slate-900 text-sm mt-0.5">
              {lead.listingPriceSnapshot || lead.expectedValue
                ? fmtInr(lead.listingPriceSnapshot || lead.expectedValue)
                : 'Not Specified'}
            </p>
          </div>

          <div>
            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Channels</p>
            <div className="mt-0.5">
              <EnquiryChannelBadge enquiryType={lead.enquiryType} tags={lead.tags} />
            </div>
          </div>

          <div>
            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Executive / Owner</p>
            <p className="font-bold text-slate-800 mt-0.5 truncate">
              {lead.owner?.name || (access?.canAssign ? (
                <button
                  type="button"
                  onClick={() => setModal('assign')}
                  className="text-amber-700 font-bold hover:underline"
                >
                  + Assign Owner
                </button>
              ) : (
                'Unassigned'
              ))}
            </p>
          </div>

          <div>
            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Response SLA</p>
            <div className="mt-0.5">
              {lead.slaBreachedAt && !lead.firstResponseAt ? (
                <span className="inline-flex items-center gap-1 rounded bg-rose-50 border border-rose-200 px-1.5 py-0.2 text-[10px] font-bold text-rose-700">
                  <span className="h-1.5 w-1.5 rounded-full bg-rose-500 animate-pulse" />
                  SLA Breached
                </span>
              ) : lead.firstResponseAt ? (
                <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-700">
                  <Check className="h-3 w-3 text-emerald-600" />
                  Contacted
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 text-[11px] font-medium text-slate-600">
                  <Clock className="h-3 w-3 text-slate-400" />
                  Active
                </span>
              )}
            </div>
          </div>

          <div>
            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Lead Source</p>
            <p className="font-semibold text-slate-800 mt-0.5 truncate">
              {label(lead.source)}
              {lead.dealer.role === 'PARTNER' && !isPartner ? (
                <span className="text-[10px] text-slate-400 block truncate">via {lead.dealer.name}</span>
              ) : null}
            </p>
          </div>

          <div>
            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Next Follow-up</p>
            <p className="font-semibold text-slate-800 mt-0.5 truncate">
              {lead.nextFollowUpAt ? fmtDate(lead.nextFollowUpAt) : 'Not Planned'}
            </p>
          </div>
        </div>

        {/* Bottom Tier: Interactive Stage Stepper */}
        <div className="pt-1">
          <StageStepper
            status={lead.status}
            onSelectStage={handleStageSelect}
            canManage={Boolean(access?.canManage)}
          />
        </div>

        {/* Secondary Command Bar */}
        {access?.canManage ? (
          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-3 text-xs">
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => setModal('edit')}
                className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1 font-semibold text-slate-700 hover:bg-slate-50 transition-colors"
              >
                <Edit3 className="h-3.5 w-3.5 text-slate-500" />
                Edit Details
              </button>

              {access.canAssign ? (
                <button
                  type="button"
                  onClick={() => setModal('assign')}
                  className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1 font-semibold text-slate-700 hover:bg-slate-50 transition-colors"
                >
                  <UserCog className="h-3.5 w-3.5 text-slate-500" />
                  {lead.owner ? `Reassign (${lead.owner.name})` : 'Assign Owner'}
                </button>
              ) : null}

              {!isPartner ? (
                <button
                  type="button"
                  onClick={() => setModal('template')}
                  className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1 font-semibold text-slate-700 hover:bg-slate-50 transition-colors"
                >
                  <Send className="h-3.5 w-3.5 text-slate-500" />
                  Meta WhatsApp Template
                </button>
              ) : null}

              {!isPartner && otherLeads.length ? (
                <button
                  type="button"
                  onClick={() => setModal('merge')}
                  className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1 font-semibold text-slate-700 hover:bg-slate-50 transition-colors"
                >
                  <GitMerge className="h-3.5 w-3.5 text-slate-500" />
                  Merge Duplicate ({otherLeads.length})
                </button>
              ) : null}
            </div>

            <span className="text-[11px] text-slate-400">
              Assigned: {lead.assignedAt ? fmtDateTime(lead.assignedAt) : 'Pending'}
            </span>
          </div>
        ) : null}
      </section>

      {lead.tags?.includes('Machine Sold') && lead.status !== 'WON' && lead.status !== 'LOST' ? (
        <section className="flex flex-col gap-2 rounded-2xl border border-amber-300 bg-amber-50 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-bold text-amber-900">The machine this customer enquired about has been sold to someone else.</p>
            <p className="text-xs text-amber-800">Offer a similar machine from the matching inventory, or close the lead if they are no longer interested.</p>
          </div>
          {!isPartner && matches.length ? (
            <a href="#crm-matching-inventory" className="shrink-0 rounded-xl bg-amber-500 px-3.5 py-2 text-xs font-bold text-white hover:bg-amber-600">See {matches.length} similar machine{matches.length === 1 ? '' : 's'}</a>
          ) : null}
        </section>
      ) : null}

      {/* 2.5 DEAL WON & SOLD VEHICLE WORKFLOW COMMAND BANNER */}
      {lead.status === 'WON' ? (
        <section className="rounded-2xl border-2 border-emerald-500/80 bg-gradient-to-r from-emerald-50/80 via-white to-emerald-50/50 p-4 sm:p-5 shadow-xs space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div className="space-y-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-2.5 py-1 text-xs font-black uppercase tracking-wider text-white shadow-2xs">
                  <Trophy className="h-3.5 w-3.5" />
                  Deal Closed & Won
                </span>
                {lead.tags?.includes('Alternate Vehicle Sold') ? (
                  <span className="inline-flex items-center gap-1 rounded-lg bg-amber-100 border border-amber-300 px-2 py-0.5 text-xs font-bold text-amber-900">
                    <ArrowRightLeft className="h-3 w-3" />
                    Alternate Machine Sold
                  </span>
                ) : null}
                {lead.tags?.includes('Outside Inventory Deal') ? (
                  <span className="inline-flex items-center gap-1 rounded-lg bg-slate-100 border border-slate-300 px-2 py-0.5 text-xs font-bold text-slate-700">
                    Outside Inventory
                  </span>
                ) : null}
                {lead.closedAt ? (
                  <span className="text-xs text-slate-500 font-medium">
                    Closed on {fmtDateTime(lead.closedAt)}
                  </span>
                ) : null}
              </div>

              <div className="flex flex-wrap items-baseline gap-2 pt-1">
                <span className="text-xs text-slate-500 font-bold uppercase tracking-wider">Sold Machine:</span>
                <span className="text-base sm:text-lg font-black text-slate-900">
                  {soldMachineName}
                </span>
                {lead.wonAmount ? (
                  <span className="font-black text-emerald-700 text-base sm:text-lg">
                    ({fmtInr(Number(lead.wonAmount))})
                  </span>
                ) : null}
              </div>

              {wonDeal?.isAlternate ? (
                <p className="text-xs text-amber-800 font-medium">
                  Original enquiry was for <strong>{wonDeal.enquiredListingTitle || lead.listingTitleSnapshot || 'another machine'}</strong>. Customer bought <strong>{soldMachineName}</strong> instead.
                  {wonDeal.alternateSoldReason ? <> Reason: {wonDeal.alternateSoldReason}</> : null}
                </p>
              ) : null}
            </div>

            {/* Right Action: Open Sold Vehicle Process */}
            {!isPartner ? (
            <div className="flex flex-col sm:items-end gap-1.5">
              {lead.wonSellAccountId ? (
                <Link
                  href={`${adminPrefix}/accounts/sell-accounts/${lead.wonSellAccountId}`}
                  className="inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 py-2.5 text-xs font-bold text-white shadow-sm hover:bg-emerald-700 transition-all"
                >
                  <FileText className="h-4 w-4" />
                  Open Sold Vehicle Workflow →
                </Link>
              ) : (
                <Link
                  href={`${adminPrefix}/accounts/sell-accounts/new?${new URLSearchParams({ leadId: lead.id, ...(lead.listingId && !lead.tags?.includes('Outside Inventory Deal') ? { listingId: lead.listingId } : {}) }).toString()}`}
                  className="inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 py-2.5 text-xs font-bold text-white shadow-sm hover:bg-emerald-700 transition-all"
                >
                  <FileText className="h-4 w-4" />
                  Initiate Sold Vehicle Workflow & RTO →
                </Link>
              )}
              <span className="text-[11px] text-slate-500 font-medium">
                {lead.wonSellAccountId ? 'Sold Vehicle record active (Agreement, Receipts, RTO)' : 'Step: Agreement Deed, Payments & RTO Handover'}
              </span>
            </div>
            ) : null}
          </div>
        </section>
      ) : null}

      {/* 3. CORE 2-COLUMN WORKSPACE */}
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.65fr)_minmax(330px,1fr)]">
        {/* LEFT COLUMN: ACTIVE WORKFLOW & ENGAGEMENT HISTORY */}
        <div className="space-y-4">
          {/* FAST IN-LINE ACTIVITY LOGGER (NO MODAL NEEDED FOR FAST CALL/NOTE ENTRY) */}
          {access?.canManage ? (
            <div className="rounded-2xl border border-slate-200/90 bg-white p-3.5 sm:p-4 shadow-2xs space-y-3">
              <div className="flex items-center justify-between border-b border-slate-100 pb-2.5">
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => setInlineTab('NOTE')}
                    className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-bold transition-all ${
                      inlineTab === 'NOTE' ? 'bg-slate-900 text-white' : 'text-slate-500 hover:text-slate-900'
                    }`}
                  >
                    <StickyNote className="h-3 w-3" />
                    Quick Note
                  </button>
                  <button
                    type="button"
                    onClick={() => setInlineTab('CALL')}
                    className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-bold transition-all ${
                      inlineTab === 'CALL' ? 'bg-blue-600 text-white' : 'text-slate-500 hover:text-slate-900'
                    }`}
                  >
                    <Phone className="h-3 w-3" />
                    Log Call
                  </button>
                  <button
                    type="button"
                    onClick={() => setInlineTab('WHATSAPP')}
                    className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-bold transition-all ${
                      inlineTab === 'WHATSAPP' ? 'bg-emerald-600 text-white' : 'text-slate-500 hover:text-slate-900'
                    }`}
                  >
                    <MessageCircle className="h-3 w-3" />
                    Log WhatsApp Chat
                  </button>
                </div>

                {inlineTab === 'CALL' ? (
                  <div className="flex items-center gap-2 text-xs">
                    <select
                      value={inlineDirection}
                      onChange={(e) => setInlineDirection(e.target.value as any)}
                      className="rounded-md border border-slate-200 bg-slate-50 py-0.5 px-1.5 text-[11px] font-semibold text-slate-700 outline-none"
                    >
                      <option value="OUTBOUND">Outgoing Call</option>
                      <option value="INBOUND">Incoming Call</option>
                    </select>
                    <input
                      type="number"
                      min={1}
                      max={60}
                      value={inlineDuration}
                      onChange={(e) => setInlineDuration(e.target.value)}
                      placeholder="Min"
                      className="w-12 rounded-md border border-slate-200 bg-slate-50 py-0.5 px-1.5 text-[11px] font-semibold text-slate-700 outline-none text-center"
                      title="Call duration in minutes"
                    />
                    <span className="text-[10px] text-slate-400">mins</span>
                  </div>
                ) : null}
              </div>

              <div className="relative">
                <textarea
                  rows={2}
                  value={inlineContent}
                  onChange={(e) => setInlineContent(e.target.value)}
                  placeholder={
                    inlineTab === 'CALL'
                      ? 'Call summary: discussed budget, customer availability, next steps...'
                      : inlineTab === 'WHATSAPP'
                      ? 'WhatsApp chat summary: machine brochure shared, customer replied...'
                      : 'Add an internal note or context about this lead...'
                  }
                  className="w-full rounded-xl border border-slate-200 bg-slate-50/50 p-2.5 text-xs text-slate-800 outline-none transition focus:border-amber-400 focus:bg-white focus:ring-2 focus:ring-amber-400/20"
                />
              </div>

              <div className="flex items-center justify-between gap-2 pt-0.5">
                <div className="flex items-center gap-1.5 flex-wrap">
                  {['Call back requested', 'Price high', 'Wants inspection', 'Need finance'].map((tag) => (
                    <button
                      key={tag}
                      type="button"
                      onClick={() => setInlineContent((c) => (c ? `${c} • ${tag}` : tag))}
                      className="rounded-md bg-slate-100 hover:bg-slate-200 px-2 py-0.5 text-[10px] font-medium text-slate-600 transition-colors"
                    >
                      + {tag}
                    </button>
                  ))}
                </div>

                <Button
                  variant="primary"
                  busy={isInlinePosting}
                  onClick={handleQuickInlinePost}
                  disabled={!inlineContent.trim()}
                  className="!py-1 !text-xs font-bold"
                >
                  Save Activity
                </Button>
              </div>
            </div>
          ) : null}

          {/* NEXT STEPS / PENDING FOLLOW-UP CARD */}
          <div className="rounded-2xl border border-slate-200/90 bg-white p-4 shadow-2xs space-y-3">
            <div className="flex items-center justify-between border-b border-slate-100 pb-2.5">
              <div>
                <h3 className="text-sm font-bold text-slate-900">Next Planned Steps</h3>
                <p className="text-[11px] text-slate-500">
                  {open
                    ? pending.length
                      ? `${pending.length} scheduled follow-up pending`
                      : 'No follow-up planned — schedule one to keep lead moving.'
                    : 'Lead is closed.'}
                </p>
              </div>

              {open && access?.canManage ? (
                <button
                  type="button"
                  onClick={() => setModal('schedule')}
                  className="inline-flex items-center gap-1 rounded-lg bg-amber-400 hover:bg-amber-300 px-2.5 py-1 text-xs font-bold text-slate-950 transition-colors"
                >
                  <Plus className="h-3 w-3" />
                  Schedule Follow-up
                </button>
              ) : null}
            </div>

            {pending.length ? (
              <div className="divide-y divide-slate-100">
                {pending.map((f) => (
                  <FollowUpRow
                    key={f.id}
                    followUp={{
                      ...f,
                      contact: lead.customer,
                      lead: {
                        id: lead.id,
                        status: lead.status,
                        leadType: lead.leadType,
                        priority: lead.priority,
                        temperature: lead.temperature,
                        listingTitleSnapshot: lead.listingTitleSnapshot,
                      },
                    }}
                    now={now}
                    showOwner={!isPartner}
                    onComplete={access?.canManage ? () => setCompleting(f) : undefined}
                    onReschedule={access?.canManage ? () => setRescheduling(f) : undefined}
                  />
                ))}
              </div>
            ) : open && access?.canManage ? (
              <div className="rounded-xl border border-amber-200 bg-amber-50/60 p-3 text-center">
                <Clock className="mx-auto h-5 w-5 text-amber-600 mb-1" />
                <p className="text-xs font-bold text-amber-900">No follow-up scheduled</p>
                <p className="text-[11px] text-amber-700 mt-0.5">Leads without a follow-up risk going cold.</p>
                <button
                  type="button"
                  onClick={() => setModal('schedule')}
                  className="mt-2 inline-flex items-center gap-1 rounded-lg bg-amber-400 px-3 py-1 text-xs font-bold text-slate-950 hover:bg-amber-300 transition-colors"
                >
                  <CalendarPlus className="h-3 w-3" />
                  Set Reminder Now
                </button>
              </div>
            ) : (
              <p className="text-xs text-slate-400">No pending follow-ups.</p>
            )}
          </div>

          {/* COMPLETE TIMELINE & ENGAGEMENT HISTORY */}
          <div className="rounded-2xl border border-slate-200/90 bg-white p-4 shadow-2xs space-y-3.5">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 pb-3">
              <div>
                <h3 className="text-sm font-bold text-slate-900">Timeline & Activity History</h3>
                <p className="text-[11px] text-slate-500">
                  Chronological records of customer enquiries, calls, WhatsApp chats, and follow-ups.
                </p>
              </div>

              {/* Activity Filter Pills */}
              <div className="flex items-center gap-1 flex-wrap text-xs">
                <button
                  type="button"
                  onClick={() => setTimelineFilter('ALL')}
                  className={`rounded-lg px-2 py-0.5 text-[11px] font-bold transition-all ${
                    timelineFilter === 'ALL' ? 'bg-slate-900 text-white' : 'text-slate-500 hover:bg-slate-100'
                  }`}
                >
                  All ({lead.activities.length})
                </button>
                <button
                  type="button"
                  onClick={() => setTimelineFilter('CALLS_WHATSAPP')}
                  className={`rounded-lg px-2 py-0.5 text-[11px] font-bold transition-all ${
                    timelineFilter === 'CALLS_WHATSAPP' ? 'bg-blue-600 text-white' : 'text-slate-500 hover:bg-slate-100'
                  }`}
                >
                  Calls & Chats
                </button>
                <button
                  type="button"
                  onClick={() => setTimelineFilter('FOLLOWUPS')}
                  className={`rounded-lg px-2 py-0.5 text-[11px] font-bold transition-all ${
                    timelineFilter === 'FOLLOWUPS' ? 'bg-amber-600 text-white' : 'text-slate-500 hover:bg-slate-100'
                  }`}
                >
                  Follow-ups
                </button>
                <button
                  type="button"
                  onClick={() => setTimelineFilter('ROUTING')}
                  className={`rounded-lg px-2 py-0.5 text-[11px] font-bold transition-all ${
                    timelineFilter === 'ROUTING' ? 'bg-slate-700 text-white' : 'text-slate-500 hover:bg-slate-100'
                  }`}
                >
                  Routing
                </button>
              </div>
            </div>

            {filteredActivities.length ? (
              <ol className="relative space-y-0 pt-1">
                {filteredActivities.map((a, index) => {
                  const visuals = getActivityVisuals(a.type, a.title);
                  const Icon = visuals.Icon;
                  const meta2 = a.metadata || {};
                  const duration =
                    typeof meta2.durationSec === 'number'
                      ? `${Math.round((meta2.durationSec as number) / 60)} min`
                      : null;
                  const isRepeat = meta2.repeat || a.title.toLowerCase().includes('repeat');
                  const isRouting = a.type === 'ROUTING_UPDATE';

                  return (
                    <li key={a.id} className={`relative flex gap-3 pb-4.5 last:pb-0 ${isRouting ? 'opacity-85' : ''}`}>
                      {index < filteredActivities.length - 1 ? (
                        <span className="absolute left-[15px] top-7 h-[calc(100%-1.5rem)] w-px bg-slate-200" aria-hidden />
                      ) : null}

                      <span
                        className={`z-10 flex h-7 w-7 shrink-0 items-center justify-center rounded-full border shadow-2xs ${visuals.bgCls} ${visuals.iconCls}`}
                      >
                        <Icon className="h-3.5 w-3.5" />
                      </span>

                      <div className="min-w-0 flex-1 rounded-xl bg-slate-50/70 border border-slate-100/90 p-2.5 transition-colors hover:bg-slate-50">
                        <div className="flex items-center justify-between gap-2 flex-wrap">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <p className="text-xs font-bold text-slate-900">{a.title}</p>
                            <span className={`inline-flex items-center rounded px-1.5 py-0.2 text-[10px] font-bold border ${visuals.badgeCls}`}>
                              {visuals.badgeText}
                            </span>
                            {isRepeat ? (
                              <span className="inline-flex items-center rounded bg-rose-50 border border-rose-200 px-1.5 py-0.2 text-[9px] font-bold text-rose-700 uppercase">
                                Repeat
                              </span>
                            ) : null}
                            {duration ? (
                              <span className="text-[10px] font-medium text-slate-500">
                                ({duration}{meta2.direction === 'INBOUND' ? ', incoming' : ''})
                              </span>
                            ) : null}
                          </div>

                          <span className="text-[10px] font-semibold text-slate-400">
                            {relative(a.createdAt, now)}
                          </span>
                        </div>

                        {a.content ? (
                          <p className="mt-1 whitespace-pre-wrap text-xs text-slate-700 font-medium leading-relaxed">
                            {a.content}
                          </p>
                        ) : null}

                        <div className="mt-1.5 flex items-center gap-1.5 text-[10px] text-slate-400 font-medium">
                          <span>{fmtDateTime(a.createdAt)}</span>
                          <span>•</span>
                          <span>
                            {a.actor?.role === 'CUSTOMER'
                              ? 'Customer Action'
                              : a.actor?.name || (meta2.automated ? 'Automation' : 'System')}
                          </span>
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ol>
            ) : (
              <EmptyState title="No activities match active filter" />
            )}
          </div>

          {/* COMPLETED FOLLOW-UPS ACCORDION */}
          {history.length ? (
            <div className="rounded-2xl border border-slate-200/90 bg-white p-4 shadow-2xs space-y-3">
              <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                  Past Completed Follow-ups ({history.length})
                </h4>
              </div>
              <div className="divide-y divide-slate-100">
                {history.map((f) => (
                  <FollowUpRow
                    key={f.id}
                    followUp={{
                      ...f,
                      contact: lead.customer,
                      lead: {
                        id: lead.id,
                        status: lead.status,
                        leadType: lead.leadType,
                        priority: lead.priority,
                        temperature: lead.temperature,
                        listingTitleSnapshot: lead.listingTitleSnapshot,
                      },
                    }}
                    now={now}
                    showOwner={!isPartner}
                  />
                ))}
              </div>
            </div>
          ) : null}
        </div>

        {/* RIGHT COLUMN: INTELLIGENCE, ASSETS & CONTEXT */}
        <div className="space-y-4">
          {/* CUSTOMER CONTACT CARD */}
          <div className="rounded-2xl border border-slate-200/90 bg-white p-4 shadow-2xs space-y-3">
            <div className="flex items-center justify-between border-b border-slate-100 pb-2.5">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500">Customer Profile</h3>
              {!isPartner ? (
                <Link
                  href={contactHref(base, lead.customer.id)}
                  className="inline-flex items-center gap-1 text-xs font-bold text-amber-700 hover:underline"
                >
                  Customer 360
                  <ExternalLink className="h-3 w-3" />
                </Link>
              ) : null}
            </div>

            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-100 text-amber-900 font-bold text-sm">
                {(lead.customer.name || 'C').slice(0, 2).toUpperCase()}
              </div>
              <div className="min-w-0 flex-1">
                <p className="font-bold text-slate-900 text-sm truncate">{lead.customer.name || 'Customer'}</p>
                <p className="text-xs text-slate-500 font-mono mt-0.5">{lead.customer.mobile || '—'}</p>
                {lead.customer.email ? <p className="text-xs text-slate-500 truncate">{lead.customer.email}</p> : null}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2 pt-1 border-t border-slate-100 text-xs">
              <div>
                <span className="text-[10px] font-bold uppercase text-slate-400">City / State</span>
                <p className="font-semibold text-slate-800 mt-0.5">
                  {[lead.customer.city, lead.customer.state].filter(Boolean).join(', ') || '—'}
                </p>
              </div>
              <div>
                <span className="text-[10px] font-bold uppercase text-slate-400">Lifecycle</span>
                <p className="font-semibold text-slate-800 mt-0.5">
                  {label(lead.customer.crmProfile?.lifecycle || 'Lead')}
                </p>
              </div>
            </div>
          </div>

          {/* ENQUIRED MACHINE CARD */}
          {lead.listing ? (
            <div className="rounded-2xl border border-slate-200/90 bg-white p-4 shadow-2xs space-y-3">
              <div className="flex items-center justify-between border-b border-slate-100 pb-2.5">
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500">Enquired Machine</h3>
                <span className="rounded-md bg-emerald-50 text-emerald-800 border border-emerald-200 px-1.5 py-0.2 text-[10px] font-bold">
                  {fmtInr(lead.listing.price)}
                </span>
              </div>

              <div>
                <h4 className="font-bold text-slate-900 text-sm hover:text-amber-700 transition-colors">
                  {lead.listing.title}
                </h4>
                <p className="text-xs text-slate-500 mt-0.5 font-medium">
                  {lead.listing.brand.name} {lead.listing.model.name} • {lead.listing.manufacturingYear} • {lead.listing.locationCity}
                </p>
              </div>

              <div className="flex items-center justify-between gap-2 pt-1 border-t border-slate-100 text-xs">
                <span className="text-[11px] text-slate-500 font-medium">
                  Status: <strong>{label(lead.listing.status)}</strong>
                </span>
                {!isPartner ? (
                  <Link
                    href={`${adminPrefix}/listings/${lead.listing.id}`}
                    className="inline-flex items-center gap-1 font-bold text-amber-700 hover:underline"
                  >
                    View Listing
                    <ExternalLink className="h-3 w-3" />
                  </Link>
                ) : null}
              </div>
            </div>
          ) : lead.listingTitleSnapshot ? (
            <div className="rounded-2xl border border-slate-200/90 bg-white p-4 shadow-2xs space-y-2">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500">Enquired Machine Snapshot</h3>
              <p className="font-bold text-slate-900 text-sm">{lead.listingTitleSnapshot}</p>
              {lead.listingPriceSnapshot ? (
                <p className="text-xs font-bold text-emerald-700">{fmtInr(lead.listingPriceSnapshot)}</p>
              ) : null}
            </div>
          ) : null}

          {/* BUYER REQUIREMENT & SPECIFICATIONS */}
          <div className="rounded-2xl border border-slate-200/90 bg-white p-4 shadow-2xs space-y-3">
            <div className="flex items-center justify-between border-b border-slate-100 pb-2">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500">
                {lead.leadType === 'SELL' ? 'Machine to Buy (From Customer)' : 'Buyer Requirement'}
              </h3>
              {access?.canManage ? (
                <button
                  type="button"
                  onClick={() => setModal('edit')}
                  className="text-xs font-bold text-amber-700 hover:underline"
                >
                  Edit
                </button>
              ) : null}
            </div>

            <dl className="grid grid-cols-2 gap-x-3 gap-y-2 text-xs">
              <div>
                <dt className="text-[10px] font-bold uppercase text-slate-400">Category</dt>
                <dd className="font-semibold text-slate-800 mt-0.5">{lead.requirement.category?.name || '—'}</dd>
              </div>
              <div>
                <dt className="text-[10px] font-bold uppercase text-slate-400">Brand / Model</dt>
                <dd className="font-semibold text-slate-800 mt-0.5 truncate">
                  {[lead.requirement.brand?.name, lead.requirement.model?.name].filter(Boolean).join(' ') || '—'}
                </dd>
              </div>
              <div>
                <dt className="text-[10px] font-bold uppercase text-slate-400">Year Range</dt>
                <dd className="font-semibold text-slate-800 mt-0.5">
                  {lead.yearFrom || lead.yearTo ? `${lead.yearFrom || '…'} – ${lead.yearTo || '…'}` : '—'}
                </dd>
              </div>
              <div>
                <dt className="text-[10px] font-bold uppercase text-slate-400">Budget Range</dt>
                <dd className="font-semibold text-slate-800 mt-0.5">
                  {lead.budgetMin || lead.budgetMax
                    ? `${lead.budgetMin ? fmtInr(lead.budgetMin) : '…'} – ${lead.budgetMax ? fmtInr(lead.budgetMax) : '…'}`
                    : '—'}
                </dd>
              </div>
              <div>
                <dt className="text-[10px] font-bold uppercase text-slate-400">Required Location</dt>
                <dd className="font-semibold text-slate-800 mt-0.5 truncate">
                  {[lead.requirementCity, lead.requirementState].filter(Boolean).join(', ') || '—'}
                </dd>
              </div>
              <div>
                <dt className="text-[10px] font-bold uppercase text-slate-400">Expected Value</dt>
                <dd className="font-semibold text-slate-800 mt-0.5">
                  {lead.expectedValue ? fmtInr(lead.expectedValue) : '—'}
                </dd>
              </div>
            </dl>

            {lead.requirementNotes || lead.message ? (
              <div className="border-t border-slate-100 pt-2 text-xs text-slate-600 font-medium">
                <span className="text-[10px] font-bold uppercase text-slate-400 block mb-0.5">Notes / Message</span>
                <p className="whitespace-pre-wrap">{lead.requirementNotes || lead.message}</p>
              </div>
            ) : null}

            {lead.tags.length ? (
              <div className="flex flex-wrap gap-1 border-t border-slate-100 pt-2.5">
                {lead.tags.map((t) => (
                  <span
                    key={t}
                    className="inline-flex items-center rounded-md bg-purple-50 text-purple-700 border border-purple-200 px-2 py-0.5 text-[10px] font-bold"
                  >
                    {t}
                  </span>
                ))}
              </div>
            ) : null}
          </div>

          {/* LISTING PAYMENTS PANEL */}
          {!isPartner && payments.length ? (
            <PaymentsPanel
              payments={payments}
              canVerify={canVerifyPayment}
              onChanged={data.reload}
              paymentHref={(id) => `${adminPrefix}/listings/payments/${id}`}
            />
          ) : null}

          {/* MATCHING MACHINES IN INVENTORY */}
          {!isPartner ? (
            <div id="crm-matching-inventory" className="scroll-mt-24 rounded-2xl border border-slate-200/90 bg-white p-4 shadow-2xs space-y-3">
              <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500">Matching Inventory</h3>
                <span className="text-[10px] font-bold text-slate-400">{matches.length} found</span>
              </div>

              {matches.length ? (
                <ul className="divide-y divide-slate-100">
                  {matches.slice(0, 4).map((m) => (
                    <li key={m.id} className="flex items-center justify-between gap-2 py-2 text-xs">
                      <div className="min-w-0">
                        <Link
                          href={`${adminPrefix}/listings/${m.id}`}
                          className="block truncate font-bold text-slate-900 hover:text-amber-700"
                        >
                          {m.title}
                        </Link>
                        <p className="text-[11px] text-slate-500 font-medium">
                          {m.manufacturingYear} • {m.locationCity} • {fmtInr(m.price)}
                        </p>
                      </div>
                      <span className="rounded-md bg-emerald-50 text-emerald-800 border border-emerald-200 px-1.5 py-0.5 text-[10px] font-extrabold shrink-0">
                        {m.matchScore}%
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-xs text-slate-400 py-1">No matching machines found in active inventory.</p>
              )}
            </div>
          ) : null}

          {/* OTHER LEADS OF THIS CUSTOMER */}
          {otherLeads.length ? (
            <div className="rounded-2xl border border-slate-200/90 bg-white p-4 shadow-2xs space-y-2.5">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 border-b border-slate-100 pb-2">
                Customer's Other Inquiries ({otherLeads.length})
              </h3>
              <ul className="divide-y divide-slate-100">
                {otherLeads.map((o) => (
                  <li key={o.id}>
                    <Link
                      href={leadHref(base, o.id)}
                      className="flex items-center justify-between gap-2 py-2 text-xs hover:bg-slate-50/80 transition-colors"
                    >
                      <div className="min-w-0">
                        <span className="font-bold text-slate-900 block truncate">
                          {LEAD_TYPE_LABELS[o.leadType] || o.leadType}
                          {o.listingTitleSnapshot ? ` • ${o.listingTitleSnapshot}` : ''}
                        </span>
                        <span className="text-[10px] text-slate-400">{fmtDate(o.createdAt)}</span>
                      </div>
                      <StatusBadge status={o.status} />
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      </div>

      {/* ALL INTERACTIVE MODALS */}
      {modal === 'status' ? (
        <StatusChangeModal
          leadId={lead.id}
          currentStatus={lead.status}
          initialStatus={targetStatus}
          lead={lead}
          onClose={close}
          onDone={done}
        />
      ) : null}
      {modal === 'schedule' ? <ScheduleFollowUpModal leadId={lead.id} onClose={close} onDone={done} /> : null}
      {modal === 'log' ? (
        <LogActivityModal
          endpoint={`/crm/leads/${lead.id}/activities`}
          initialType={logType}
          onClose={close}
          onDone={done}
        />
      ) : null}
      {modal === 'assign' ? (
        <AssignModal
          leadIds={[lead.id]}
          currentOwnerId={lead.owner?.id ?? null}
          onClose={close}
          onDone={done}
        />
      ) : null}
      {modal === 'edit' ? <EditLeadModal lead={lead} onClose={close} onDone={done} /> : null}
      {modal === 'merge' ? <MergeModal leadId={lead.id} others={otherLeads} onClose={close} /> : null}
      {modal === 'template' ? <TemplateModal leadId={lead.id} onClose={close} onDone={done} /> : null}
      {completing ? (
        <CompleteFollowUpModal
          followUp={{ ...completing, contact: lead.customer }}
          leadStatus={lead.status}
          onClose={() => setCompleting(null)}
          onDone={done}
        />
      ) : null}
      {rescheduling ? (
        <RescheduleModal
          followUp={rescheduling}
          onClose={() => setRescheduling(null)}
          onDone={done}
        />
      ) : null}
    </div>
  );
}

function PaymentsPanel({
  payments,
  canVerify,
  onChanged,
  paymentHref,
}: {
  payments: Payment[];
  canVerify: boolean;
  onChanged: () => void;
  paymentHref: (id: string) => string;
}) {
  const [busy, setBusy] = useState<string | null>(null);
  const update = async (payment: Payment, status: 'APPROVED' | 'REJECTED') => {
    const rejectionReason =
      status === 'REJECTED' ? window.prompt('Why is this payment being declined?')?.trim() : '';
    if (status === 'REJECTED' && !rejectionReason) return;
    setBusy(payment.id);
    try {
      await api.patch(`/superadmin/listing-payments/${payment.id}/status`, { status, rejectionReason });
      toast.success(status === 'APPROVED' ? 'Payment approved.' : 'Payment declined.');
      onChanged();
    } catch (error) {
      toast.error(crmError(error, 'Could not update the payment.'));
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="rounded-2xl border border-slate-200/90 bg-white p-4 shadow-2xs space-y-3">
      <div className="flex items-center justify-between border-b border-slate-100 pb-2">
        <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500">Listing Token Payments</h3>
        <span className="text-[10px] font-bold text-slate-400">{payments.length} record(s)</span>
      </div>

      <ul className="divide-y divide-slate-100">
        {payments.map((p) => (
          <li key={p.id} className="space-y-1.5 py-2.5 text-xs">
            <div className="flex items-center justify-between gap-2">
              <p className="font-bold text-slate-900">
                {fmtInr(p.amount)} <span className="font-normal text-slate-500">({label(p.method)})</span>
              </p>
              <Badge tone={p.status === 'APPROVED' ? 'green' : p.status === 'REJECTED' ? 'red' : 'amber'}>
                {label(p.status)}
              </Badge>
            </div>
            {p.transactionRef ? (
              <p className="text-[11px] text-slate-500 font-mono">UTR / Ref: {p.transactionRef}</p>
            ) : null}
            {p.rejectionReason ? <p className="text-[11px] text-rose-600">{p.rejectionReason}</p> : null}
            <div className="flex flex-wrap gap-2 pt-1">
              {p.receiptUrl ? (
                <a
                  href={getAbsoluteFileUrl(p.receiptUrl)}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 text-[11px] font-semibold text-slate-600 hover:underline"
                >
                  <Receipt className="h-3 w-3" />
                  Receipt
                </a>
              ) : null}
              <Link
                href={paymentHref(p.id)}
                className="inline-flex items-center gap-1 text-[11px] font-semibold text-slate-600 hover:underline"
              >
                <ExternalLink className="h-3 w-3" />
                Details
              </Link>
              {canVerify && p.status === 'PENDING_VERIFICATION' ? (
                <>
                  <Button
                    variant="primary"
                    icon={<CheckCircle2 className="h-3.5 w-3.5" />}
                    busy={busy === p.id}
                    onClick={() => update(p, 'APPROVED')}
                    className="!py-0.5 !text-xs"
                  >
                    Approve
                  </Button>
                  <Button
                    variant="danger"
                    icon={<XCircle className="h-3.5 w-3.5" />}
                    busy={busy === p.id}
                    onClick={() => update(p, 'REJECTED')}
                    className="!py-0.5 !text-xs"
                  >
                    Decline
                  </Button>
                </>
              ) : null}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

function EditLeadModal({
  lead,
  onClose,
  onDone,
}: {
  lead: LeadDetail;
  onClose: () => void;
  onDone: () => void;
}) {
  const { meta } = useCrmMeta();
  const [leadType, setLeadType] = useState(lead.leadType);
  const [priority, setPriority] = useState(lead.priority);
  const [source, setSource] = useState(lead.source);
  const [expectedValue, setExpectedValue] = useState(lead.expectedValue ? String(lead.expectedValue) : '');
  const [tags, setTags] = useState<string[]>(lead.tags);
  const [alerts, setAlerts] = useState(lead.matchAlertsEnabled);
  const [requirement, setRequirement] = useState<RequirementState>({
    ...emptyRequirement(),
    categoryId: lead.categoryId || '',
    brandId: lead.brandId || '',
    modelId: lead.modelId || '',
    yearFrom: lead.yearFrom ? String(lead.yearFrom) : '',
    yearTo: lead.yearTo ? String(lead.yearTo) : '',
    budgetMin: lead.budgetMin ? String(lead.budgetMin) : '',
    budgetMax: lead.budgetMax ? String(lead.budgetMax) : '',
    requirementCity: lead.requirementCity || '',
    requirementState: lead.requirementState || '',
    requirementNotes: lead.requirementNotes || '',
  });
  const [busy, setBusy] = useState(false);

  const save = async () => {
    setBusy(true);
    try {
      await api.patch(`/crm/leads/${lead.id}`, {
        leadType,
        priority,
        source,
        expectedValue: expectedValue ? Number(expectedValue) : null,
        tags,
        matchAlertsEnabled: alerts,
        ...requirementPayload(requirement),
      });
      toast.success('Lead updated.');
      onDone();
    } catch (error) {
      toast.error(crmError(error, 'Could not update the lead.'));
    } finally {
      setBusy(false);
    }
  };

  const tagOptions = [...new Set([...(meta?.config.tags || []), ...tags])];

  return (
    <Modal title="Edit lead details" onClose={onClose} wide>
      <div className="space-y-4 p-4 sm:p-6 text-xs">
        <div className="grid gap-3 md:grid-cols-4">
          <Field label="Lead type">
            <select
              value={leadType}
              onChange={(e) => setLeadType(e.target.value)}
              className={selectClass}
            >
              {(meta?.enums.leadTypes || []).map((t) => (
                <option key={t} value={t}>
                  {LEAD_TYPE_LABELS[t] || t}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Priority">
            <select
              value={priority}
              onChange={(e) => setPriority(e.target.value)}
              className={selectClass}
            >
              {(meta?.enums.priorities || []).map((p) => (
                <option key={p} value={p}>
                  {label(p)}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Source">
            <select
              value={source}
              onChange={(e) => setSource(e.target.value)}
              className={selectClass}
            >
              {[...new Set([...(meta?.config.sources || []), source])].map((s) => (
                <option key={s} value={s}>
                  {label(s)}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Expected value (₹)">
            <input
              type="number"
              min={0}
              value={expectedValue}
              onChange={(e) => setExpectedValue(e.target.value)}
              className={inputClass}
            />
          </Field>
        </div>

        <RequirementFields value={requirement} onChange={setRequirement} />

        <Field label="Tags">
          <div className="flex flex-wrap gap-1.5">
            {tagOptions.map((t) => {
              const on = tags.includes(t);
              return (
                <button
                  key={t}
                  type="button"
                  onClick={() => setTags(on ? tags.filter((x) => x !== t) : [...tags, t])}
                  className={`rounded-md border px-2.5 py-1 text-xs font-semibold ${
                    on ? 'border-slate-900 bg-slate-900 text-white' : 'border-slate-200 bg-white text-slate-600'
                  }`}
                >
                  {t}
                </button>
              );
            })}
          </div>
        </Field>

        {!meta?.access.isPartner ? (
          <Toggle
            checked={alerts}
            onChange={setAlerts}
            label="Send the customer new matching machines (WhatsApp/SMS automation)"
          />
        ) : null}

        <ModalFooter>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" busy={busy} onClick={save}>
            Save Changes
          </Button>
        </ModalFooter>
      </div>
    </Modal>
  );
}

function MergeModal({
  leadId,
  others,
  onClose,
}: {
  leadId: string;
  others: Detail['otherLeads'];
  onClose: () => void;
}) {
  const { base } = useCrmBase();
  const [targetId, setTargetId] = useState('');
  const [busy, setBusy] = useState(false);

  const merge = async () => {
    setBusy(true);
    try {
      await api.post(`/crm/leads/${leadId}/merge`, { targetId });
      toast.success('Merged. This lead is closed as a duplicate.');
      window.location.href = leadHref(base, targetId);
    } catch (error) {
      toast.error(crmError(error, 'Could not merge.'));
      setBusy(false);
    }
  };

  return (
    <Modal
      title="Merge into another lead"
      subtitle="Timeline and follow-ups move to the lead you keep; this one closes as a duplicate."
      onClose={onClose}
    >
      <div className="space-y-4 p-4 sm:p-6 text-xs">
        <Field label="Keep this lead *">
          <select
            value={targetId}
            onChange={(e) => setTargetId(e.target.value)}
            className={selectClass}
          >
            <option value="">Choose target lead…</option>
            {others.map((o) => (
              <option key={o.id} value={o.id}>
                {LEAD_TYPE_LABELS[o.leadType] || o.leadType} · {label(o.status)} · {fmtDate(o.createdAt)}
                {o.listingTitleSnapshot ? ` · ${o.listingTitleSnapshot}` : ''}
              </option>
            ))}
          </select>
        </Field>
        <ModalFooter>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="danger" busy={busy} disabled={!targetId} onClick={merge}>
            Merge
          </Button>
        </ModalFooter>
      </div>
    </Modal>
  );
}

function TemplateModal({
  leadId,
  onClose,
  onDone,
}: {
  leadId: string;
  onClose: () => void;
  onDone: () => void;
}) {
  const templates = useCrmResource(
    () =>
      getJson<
        Array<{
          id: string;
          name: string;
          language: string;
          category: string;
          needsVariables: boolean;
        }>
      >('/crm/templates'),
    'crm-templates'
  );
  const [templateId, setTemplateId] = useState('');
  const [busy, setBusy] = useState(false);
  const usable = (templates.data || []).filter((t) => !t.needsVariables);

  const send = async () => {
    setBusy(true);
    try {
      const result = (
        await api.post(`/crm/leads/${leadId}/whatsapp`, { templateId })
      ).data as { sent: boolean; error: string | null };
      if (result.sent) toast.success('WhatsApp template sent.');
      else toast.error(result.error || 'Not delivered — check WhatsApp logs.');
      onDone();
    } catch (error) {
      toast.error(crmError(error, 'Could not send.'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      title="Send WhatsApp template"
      subtitle="Approved templates without variables. For a direct message use the WhatsApp button."
      onClose={onClose}
    >
      <div className="space-y-4 p-4 sm:p-6 text-xs">
        {templates.loading ? (
          <LoadingState />
        ) : !usable.length ? (
          <EmptyState
            title="No sendable templates"
            description="Approve a template without {{variables}} in Meta and sync it on the WhatsApp page."
          />
        ) : (
          <Field label="Template">
            <select
              value={templateId}
              onChange={(e) => setTemplateId(e.target.value)}
              className={selectClass}
            >
              <option value="">Choose…</option>
              {usable.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name} ({t.language}) · {label(t.category)}
                </option>
              ))}
            </select>
          </Field>
        )}
        <ModalFooter>
          <Button onClick={onClose}>Cancel</Button>
          <Button
            variant="primary"
            icon={<Send className="h-3.5 w-3.5" />}
            busy={busy}
            disabled={!templateId}
            onClick={send}
          >
            Send WhatsApp
          </Button>
        </ModalFooter>
      </div>
    </Modal>
  );
}

export default function CrmLeadDetail({ leadId }: { leadId: string }) {
  return (
    <CrmMetaProvider>
      <Detail leadId={leadId} />
    </CrmMetaProvider>
  );
}
