'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Image from 'next/image';
import axios from 'axios';
import {
  Briefcase,
  Check,
  CheckCheck,
  ChevronDown,
  Eye,
  FileText,
  KeyRound,
  LockKeyhole,
  Megaphone,
  MessageCircle,
  RefreshCw,
  Save,
  Send,
  ShieldCheck,
  Store,
} from 'lucide-react';
import api from '@/lib/api';
import { useAuthStore } from '@/store/authStore';
import { hasPermission } from '@/lib/permissionUtils';
import { useSiteLogo } from '@/hooks/useSiteLogo';
import { useTranslation } from '@/hooks/useTranslation';

type WhatsAppSettings = {
  enabled: boolean;
  ready: boolean;
  graphApiVersion: string;
  phoneNumberId: string;
  businessAccountId: string;
  testRecipientPhoneMasked: string;
  credentials: {
    accessTokenConfigured: boolean;
    webhookVerifyTokenConfigured: boolean;
    appSecretConfigured: boolean;
  };
  updatedAt: string;
};

type DashboardResponse = {
  settings: WhatsAppSettings;
  webhookUrl: string;
  stats: {
    totalMessages: number;
    sentLast7Days: number;
    deliveredLast7Days: number;
    failedLast7Days: number;
  };
  recentMessages: Array<{
    id: string;
    eventCode: string;
    recipientType: string;
    recipientPhone: string;
    status: 'QUEUED' | 'SENT' | 'DELIVERED' | 'READ' | 'FAILED' | 'SKIPPED';
    errorMessage: string | null;
    createdAt: string;
  }>;
};

type WhatsAppLog = {
  id: string;
  eventCode: string;
  relatedEntityType: string | null;
  relatedEntityId: string | null;
  recipientType: string;
  recipientPhone: string;
  status: 'QUEUED' | 'SENT' | 'DELIVERED' | 'READ' | 'FAILED' | 'SKIPPED';
  errorMessage: string | null;
  createdAt: string;
  sentAt: string | null;
  deliveredAt: string | null;
  readAt: string | null;
  outbox: { attempts: number; status: string; processedAt: string | null; lastError: string | null } | null;
};

type SettingsForm = {
  enabled: boolean;
  graphApiVersion: string;
  phoneNumberId: string;
  businessAccountId: string;
  testRecipientPhone: string;
  accessToken: string;
  webhookVerifyToken: string;
  appSecret: string;
};

type MarketplaceTemplate = {
  id: string;
  name: string;
  language: string;
  metaTemplateId: string | null;
  category: string | null;
  status: string;
  components: unknown;
  updatedAt: string;
};

type MarketplaceRule = {
  id: string | null;
  eventCode: string;
  enabled: boolean;
  templateId: string | null;
  recipientPolicy: string | null;
  updatedAt: string | null;
};

type MarketplaceAutomationResponse = { templates: MarketplaceTemplate[]; rules: MarketplaceRule[] };

type WhatsAppCampaign = {
  id: string;
  name: string;
  category: 'MARKETING' | 'JOB_ALERTS';
  status: 'DRAFT' | 'SENDING' | 'COMPLETED' | 'CANCELLED';
  template: { name: string; language: string };
  _count: { recipients: number };
  createdAt: string;
};

type TemplatePurpose = 'MARKETPLACE' | 'RECRUITMENT' | 'MARKETING' | 'JOB_ALERTS';

const templatePurposeOptions: Array<{ value: TemplatePurpose; label: string }> = [
  { value: 'MARKETPLACE', label: 'Marketplace automation' },
  { value: 'RECRUITMENT', label: 'Recruitment automation' },
  { value: 'MARKETING', label: 'Marketing campaigns' },
  { value: 'JOB_ALERTS', label: 'Job alert campaigns' },
];

type WhatsAppCopy = (key: string, defaultText: string, params?: Record<string, string | number | boolean | null | undefined>) => string;

const templateStatusOptions: Array<{ value: string; label: string }> = [
  { value: 'DRAFT', label: 'Draft' },
  { value: 'PENDING', label: 'Pending' },
  { value: 'APPROVED', label: 'Approved' },
  { value: 'REJECTED', label: 'Rejected' },
];

const campaignCategoryOptions: Array<{ value: 'MARKETING' | 'JOB_ALERTS'; label: string }> = [
  { value: 'MARKETING', label: 'Marketing' },
  { value: 'JOB_ALERTS', label: 'Job alerts' },
];

const reminderKindOptions: Array<{ value: string; label: string }> = [
  { value: 'INTERVIEW_48_HOURS', label: 'Interview reminder' },
  { value: 'PRIME_EXPIRY_7_DAYS', label: 'Prime expiry reminder' },
];

const reminderWindowFields: Record<string, { label: string; unit: string; min: number; max: number; defaultValue: string }> = {
  INTERVIEW_48_HOURS: { label: 'Interview window', unit: 'hours ahead', min: 1, max: 720, defaultValue: '48' },
  PRIME_EXPIRY_7_DAYS: { label: 'Prime expiry window', unit: 'days ahead', min: 1, max: 365, defaultValue: '7' },
};

const logStatusOptions: Array<{ value: string; label: string }> = [
  { value: '', label: 'All statuses' },
  { value: 'QUEUED', label: 'QUEUED' },
  { value: 'SENT', label: 'SENT' },
  { value: 'DELIVERED', label: 'DELIVERED' },
  { value: 'READ', label: 'READ' },
  { value: 'FAILED', label: 'FAILED' },
  { value: 'SKIPPED', label: 'SKIPPED' },
];

const approvedTemplatesForPurpose = (templates: MarketplaceTemplate[], purpose: TemplatePurpose) =>
  templates.filter((template) => template.status === 'APPROVED' && template.category === purpose);

const reminderPurpose = (kind: string): TemplatePurpose => (kind === 'INTERVIEW_48_HOURS' ? 'JOB_ALERTS' : 'MARKETING');

const marketplaceEventDetails: Record<string, { title: string; recipient: string; preview: string }> = {
  PARTNER_KYC_STATUS_UPDATED: { title: 'Partner KYC status', recipient: 'Partner', preview: 'KYC status update for the partner.' },
  PARTNER_LISTING_STATUS_UPDATED: { title: 'Listing status', recipient: 'Partner', preview: 'Listing status update for the owner.' },
  LISTING_PAYMENT_SUBMITTED: { title: 'Payment submitted', recipient: 'Customer', preview: 'Payment receipt acknowledgement.' },
  LISTING_PAYMENT_APPROVED: { title: 'Payment approved', recipient: 'Customer + Partner', preview: 'Buyer and listing owner receive approval.' },
  LISTING_PAYMENT_REJECTED: { title: 'Payment rejected', recipient: 'Customer + Partner', preview: 'Buyer and listing owner receive rejection.' },
  CUSTOMER_PRIME_APPROVED: { title: 'Prime activated', recipient: 'Customer', preview: 'Prime subscription activation confirmation.' },
  CUSTOMER_PRIME_REJECTED: { title: 'Prime rejected', recipient: 'Customer', preview: 'Prime payment review result.' },
  MARKETPLACE_NEW_LISTING_PUBLISHED: { title: 'New vehicle listing published', recipient: 'Opted-in customers', preview: 'Announces a newly approved vehicle listing.' },
};

const recruitmentEventDetails: Record<string, { title: string; recipient: string; preview: string }> = {
  RECRUITMENT_APPLICATION_RECEIVED: { title: 'Application acknowledgement', recipient: 'Candidate', preview: 'Confirms the submitted job application.' },
  RECRUITMENT_NEW_APPLICATION_SUPERADMIN: { title: 'New application audit copy', recipient: 'Superadmin', preview: 'Every application is visible to Superadmin.' },
  RECRUITMENT_NEW_APPLICATION_RECRUITER: { title: 'New application alert', recipient: 'Job recruiter', preview: 'Notifies the job creator when applicable.' },
  RECRUITMENT_APPLICATION_STAGE_UPDATED: { title: 'Application stage update', recipient: 'Candidate', preview: 'Shares only the candidate-safe status.' },
  RECRUITMENT_INTERVIEW_SCHEDULED: { title: 'Interview scheduled', recipient: 'Candidate', preview: 'Includes schedule and interview type.' },
  RECRUITMENT_INTERVIEW_RESCHEDULED: { title: 'Interview rescheduled', recipient: 'Candidate', preview: 'Shares the revised schedule.' },
  RECRUITMENT_INTERVIEW_CANCELLED: { title: 'Interview cancelled', recipient: 'Candidate', preview: 'Confirms interview cancellation.' },
  RECRUITMENT_OFFER_SENT: { title: 'Offer sent', recipient: 'Candidate', preview: 'Confirms an employment offer is available.' },
  RECRUITMENT_OFFER_STATUS_UPDATED: { title: 'Offer status update', recipient: 'Candidate', preview: 'Shares the candidate-safe offer status.' },
  RECRUITMENT_NEW_JOB_PUBLISHED: { title: 'New job published', recipient: 'Opted-in job seekers', preview: 'Announces a newly published job opening.' },
};

const emptyForm: SettingsForm = {
  enabled: false,
  graphApiVersion: 'v23.0',
  phoneNumberId: '',
  businessAccountId: '',
  testRecipientPhone: '',
  accessToken: '',
  webhookVerifyToken: '',
  appSecret: '',
};

const statusStyle: Record<DashboardResponse['recentMessages'][number]['status'], string> = {
  QUEUED: 'bg-slate-100 text-slate-700',
  SENT: 'bg-blue-50 text-blue-700',
  DELIVERED: 'bg-emerald-50 text-emerald-700',
  READ: 'bg-violet-50 text-violet-700',
  FAILED: 'bg-red-50 text-red-700',
  SKIPPED: 'bg-amber-50 text-amber-700',
};

// Interactive WhatsApp Live Phone Preview Component
function WhatsAppPhonePreview({
  title,
  category,
  language,
  status,
  bodyText,
  metaTemplateId,
}: {
  title: string;
  category: string;
  language: string;
  status: string;
  bodyText?: string;
  metaTemplateId?: string;
}) {
  const { t } = useTranslation();
  const wt: WhatsAppCopy = (key, defaultText, params) => t(`whatsappModule.${key}`, defaultText, params);
  const { logoUrl, darkLogoUrl } = useSiteLogo();
  const displayLogo = logoUrl || darkLogoUrl || '/icon.png';

  const getSampleBody = () => {
    if (bodyText && bodyText.trim()) return bodyText;
    switch (category) {
      case 'MARKETPLACE':
        return `Hello {{1}},\n\nYour JCB Machine Listing status (#{{2}}) has been updated on JCB Exchange.\n\nStatus: Approved & Live ✅\n\nThank you for choosing JCB Exchange.`;
      case 'RECRUITMENT':
        return `Hello {{1}},\n\nYour interview for the position of {{2}} has been scheduled.\n\n📅 Date: 18/09/2026\n⏰ Time: 11:00 AM\n📍 Venue: JCB Exchange HQ\n\nPlease confirm your availability.`;
      case 'MARKETING':
        return `🔥 Special Offer from JCB Exchange!\n\nGet up to 20% discount on JCB Prime Membership today.\n\nTap below to claim your offer now!`;
      case 'JOB_ALERTS':
        return `📢 Urgent Job Vacancy Alert!\n\n50+ Heavy JCB Operator positions open in Delhi/NCR.\n\nSalary: ₹25,000 - ₹35,000/month.\n\nTap to apply immediately.`;
      default:
        return `Hello {{1}}, this is an automated WhatsApp notification from JCB Exchange.`;
    }
  };

  const templateNameDisplay = title.trim() ? title : 'template_name_preview';

  return (
    <div className="relative w-full max-w-[275px] sm:max-w-[290px] mx-auto rounded-[42px] border-[7px] border-slate-950 bg-slate-950 p-1 shadow-[0_20px_50px_rgba(0,0,0,0.35)] overflow-hidden transition-all duration-300 hover:shadow-[0_25px_60px_rgba(0,0,0,0.45)]">
      {/* iPhone Dynamic Island Notch */}
      <div className="absolute top-2.5 left-1/2 -translate-x-1/2 w-20 h-4 bg-black rounded-full z-30 flex items-center justify-between px-2 pointer-events-none shadow-xs">
        <div className="h-1.5 w-1.5 rounded-full bg-slate-900 border border-slate-800" />
        <div className="h-1.5 w-1.5 rounded-full bg-[#0d1322]" />
      </div>

      {/* iPhone Screen Container */}
      <div className="rounded-[35px] bg-[#E5DDD5] overflow-hidden flex flex-col min-h-[475px]">
        {/* iPhone Status Bar */}
        <div className="bg-[#075E54] pt-2.5 px-4 pb-1 text-white flex items-center justify-between text-[10px] font-semibold tracking-tight">
          <span>9:41</span>
          <div className="flex items-center gap-1 opacity-85 text-[9px]">
            <span>5G</span>
            <span>100%</span>
          </div>
        </div>

        {/* WhatsApp App Header Bar */}
        <div className="bg-[#075E54] text-white px-3 py-2 flex items-center justify-between shadow-xs border-t border-emerald-700/30">
          <div className="flex items-center gap-2 min-w-0">
            <div className="h-7 w-7 rounded-full bg-white border border-amber-400 p-0.5 shadow-2xs flex items-center justify-center shrink-0 overflow-hidden">
              <Image
                src={displayLogo}
                alt={wt('preview.logoAlt', 'JCB Logo')}
                width={28}
                height={28}
                unoptimized
                className="h-full w-full object-contain"
                onError={(e) => {
                  (e.currentTarget as HTMLElement).style.display = 'none';
                }}
              />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-1">
                <p className="text-xs font-bold leading-none truncate text-white">JCB Exchange</p>
                <span className="bg-sky-400 text-[#075E54] text-[7px] font-black rounded-full h-3 w-3 inline-flex items-center justify-center shrink-0">✓</span>
              </div>
              <p className="text-[8px] text-emerald-200 font-medium leading-tight mt-0.5">{wt('preview.officialBusinessAccount', 'Official Business Account')}</p>
            </div>
          </div>
          <span className="text-[8px] bg-emerald-800/80 text-emerald-100 px-1.5 py-0.5 rounded font-mono shrink-0">{language || 'en_US'}</span>
        </div>

        {/* WhatsApp Chat Wallpaper Screen */}
        <div className="p-2.5 space-y-2.5 flex-1 min-h-[315px] flex flex-col justify-end bg-[radial-gradient(#0000000d_1px,transparent_1px)] [background-size:10px_10px]">
          {/* System Date Pill */}
          <div className="text-center">
            <span className="bg-white/85 text-[8px] font-bold uppercase tracking-wider text-slate-600 px-2.5 py-0.5 rounded-full shadow-2xs">
              {wt('preview.today', 'Today')}
            </span>
          </div>

          {/* WhatsApp Message Bubble */}
          <div className="relative self-end w-[95%] bg-[#DCF8C6] rounded-2xl rounded-tr-none p-2.5 shadow-md border border-emerald-200/60 space-y-1.5">
            {/* Meta Template Header Tag */}
            <div className="flex items-center justify-between border-b border-emerald-300/40 pb-1 gap-1.5">
              <span className="text-[8px] font-extrabold tracking-wider text-emerald-950 uppercase truncate">
                {category.replace('_', ' ')}
              </span>
              <span className={`text-[8px] font-bold px-1.5 py-0.2 rounded ${status === 'APPROVED' ? 'bg-emerald-200 text-emerald-900' : 'bg-amber-200 text-amber-900'}`}>
                {status || 'DRAFT'}
              </span>
            </div>

            {/* Template Name identifier */}
            <p className="text-[9px] font-mono text-emerald-850 font-bold truncate">
              {templateNameDisplay}
            </p>

            {/* Dynamic Body Text */}
            <p className="text-[11px] text-slate-900 whitespace-pre-line leading-relaxed font-normal">
              {getSampleBody()}
            </p>

            {/* Meta Template ID & Footer Timestamp */}
            <div className="flex items-center justify-between text-[8px] text-slate-500 pt-1 border-t border-emerald-200/40">
              <span className="text-[8px] font-mono text-slate-400">
                {metaTemplateId ? wt('preview.metaId', 'ID: {id}', { id: metaTemplateId }) : wt('preview.metaApproved', 'Meta Approved')}
              </span>
              <span className="flex items-center gap-0.5 font-sans font-medium text-slate-600">
                10:42 AM
                <CheckCheck className="h-3 w-3 text-sky-600" />
              </span>
            </div>

            {/* Quick Action Button Mockup */}
            <div className="mt-1 pt-1.5 border-t border-emerald-200/70 text-center">
              <span className="text-[10px] font-bold text-teal-850 flex items-center justify-center gap-1 hover:underline cursor-pointer">
                <span>{wt('preview.viewDetails', 'View Details')}</span>
                <span className="text-[9px]">➔</span>
              </span>
            </div>
          </div>
        </div>

        {/* iPhone Bottom Bar */}
        <div className="py-1 bg-[#E5DDD5] flex justify-center items-center shrink-0">
          <div className="w-24 h-1 bg-slate-900/30 rounded-full" />
        </div>
      </div>
    </div>
  );
}

// Custom Select Component - Full width & auto-expanding popover
function CustomSelect({
  options,
  value,
  onChange,
  placeholder = 'Select option...',
  disabled = false,
  className = '',
  ariaLabel,
}: {
  options: Array<{ value: string; label: string }>;
  value: string;
  onChange: (val: string) => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  ariaLabel?: string;
}) {
  const { t } = useTranslation();
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const selectedOption = options.find((opt) => opt.value === value);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <div ref={containerRef} className={`relative inline-block ${className}`}>
      <button
        type="button"
        aria-label={ariaLabel}
        disabled={disabled}
        onClick={() => setIsOpen((prev) => !prev)}
        className="flex w-full items-center justify-between gap-2 rounded-xl border border-gray-300 bg-white px-3.5 py-2.5 text-left text-sm font-medium text-gray-900 shadow-sm transition hover:border-gray-400 hover:bg-gray-50/50 focus:outline-none focus:ring-2 focus:ring-gray-300 disabled:cursor-not-allowed disabled:bg-gray-100 disabled:opacity-60"
      >
        <span className="truncate" title={selectedOption ? selectedOption.label : placeholder}>
          {selectedOption ? selectedOption.label : <span className="text-gray-400">{placeholder}</span>}
        </span>
        <ChevronDown className={`h-4 w-4 shrink-0 text-gray-500 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {isOpen && !disabled && (
        <div className="absolute left-0 right-0 sm:right-auto z-50 mt-1.5 min-w-full w-max max-w-[calc(100vw-2.5rem)] max-h-64 overflow-y-auto rounded-2xl border border-gray-300 bg-white p-1.5 shadow-xl ring-1 ring-black/5 animate-in fade-in slide-in-from-top-1 duration-150">
          {options.length === 0 ? (
            <div className="px-3 py-2 text-xs text-gray-400">{t('whatsappModule.common.noOptionsAvailable', 'No options available')}</div>
          ) : (
            options.map((option) => {
              const isSelected = option.value === value;
              return (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => {
                    onChange(option.value);
                    setIsOpen(false);
                  }}
                  className={`flex w-full items-center justify-between gap-3 rounded-lg px-3 py-2.5 text-left text-xs sm:text-sm font-medium transition-colors ${
                    isSelected ? 'bg-gray-100 text-gray-900 font-bold border border-gray-200' : 'text-gray-700 hover:bg-gray-50 hover:text-gray-900'
                  }`}
                >
                  <span className="whitespace-normal break-words text-left">{option.label}</span>
                  {isSelected && <Check className="h-4 w-4 shrink-0 text-gray-900" />}
                </button>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  placeholder,
  type = 'text',
  secret = false,
  inputMode,
}: {
  label: string;
  value: string;
  onChange: (val: string) => void;
  placeholder: string;
  type?: string;
  secret?: boolean;
  inputMode?: 'text' | 'numeric';
}) {
  const { t } = useTranslation();
  const [show, setShow] = useState(false);
  const inputType = secret ? (show ? 'text' : 'password') : type;

  return (
    <div>
      <label className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-gray-700">{label}</label>
      <div className="relative">
        <input
          type={inputType}
          inputMode={inputMode}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className="w-full rounded-xl border border-gray-300 bg-white px-3.5 py-2.5 text-sm text-gray-900 outline-none transition placeholder:text-gray-400 focus:border-gray-400 focus:ring-2 focus:ring-gray-200"
        />
        {secret && (
          <button
            type="button"
            onClick={() => setShow(!show)}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-bold text-gray-500 hover:text-gray-900"
          >
            {show ? t('whatsappModule.common.hide', 'Hide') : t('whatsappModule.common.show', 'Show')}
          </button>
        )}
      </div>
    </div>
  );
}

export default function SuperAdminWhatsAppPage() {
  const { t } = useTranslation();
  const wt = useCallback<WhatsAppCopy>((key, defaultText, params) => t(`whatsappModule.${key}`, defaultText, params), [t]);
  const [activeTab, setActiveTab] = useState<'SETTINGS' | 'MARKETPLACE' | 'RECRUITMENT' | 'CAMPAIGN' | 'LOGS'>('SETTINGS');
  const [dashboard, setDashboard] = useState<DashboardResponse | null>(null);
  const [form, setForm] = useState<SettingsForm>(emptyForm);
  const [testMessage, setTestMessage] = useState('JCB Exchange WhatsApp Cloud API test message.');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [marketplace, setMarketplace] = useState<MarketplaceAutomationResponse | null>(null);
  const [recruitment, setRecruitment] = useState<MarketplaceAutomationResponse | null>(null);
  const [templates, setTemplates] = useState<MarketplaceTemplate[]>([]);
  const [marketplaceSaving, setMarketplaceSaving] = useState<string | null>(null);
  const [templateForm, setTemplateForm] = useState({
    name: '',
    language: 'en_US',
    metaTemplateId: '',
    category: 'MARKETPLACE' as TemplatePurpose,
    status: 'APPROVED',
    bodyText: '',
  });
  const [logs, setLogs] = useState<WhatsAppLog[]>([]);
  const [logStatus, setLogStatus] = useState('');
  const [logEvent, setLogEvent] = useState('');
  const [logsLoading, setLogsLoading] = useState(false);
  const [retryingLogId, setRetryingLogId] = useState<string | null>(null);
  const [campaigns, setCampaigns] = useState<WhatsAppCampaign[]>([]);
  const [campaignForm, setCampaignForm] = useState<{ name: string; category: 'MARKETING' | 'JOB_ALERTS'; templateId: string }>({
    name: '',
    category: 'MARKETING',
    templateId: '',
  });
  const [reminderForm, setReminderForm] = useState({ kind: 'INTERVIEW_48_HOURS', windowValue: '48', templateId: '' });
  const [consentForm, setConsentForm] = useState({ phone: '', category: 'MARKETING', optedIn: true });
  const [campaignSaving, setCampaignSaving] = useState(false);
  const [activePreviewTemplate, setActivePreviewTemplate] = useState<MarketplaceTemplate | null>(null);
  const [customPreviewText, setCustomPreviewText] = useState<string | null>(null);
  const [logSearchQuery, setLogSearchQuery] = useState('');
  const [recentSearchQuery, setRecentSearchQuery] = useState('');
  const [recentStatusFilter, setRecentStatusFilter] = useState('');
  const [recentEventFilter, setRecentEventFilter] = useState('');

  const recentMessages = useMemo(() => dashboard?.recentMessages ?? [], [dashboard?.recentMessages]);

  const availableEventOptions = useMemo(() => {
    const codesSet = new Set<string>();
    logs.forEach((log) => { if (log.eventCode) codesSet.add(log.eventCode); });
    recentMessages.forEach((log) => { if (log.eventCode) codesSet.add(log.eventCode); });
    marketplace?.rules?.forEach((r) => { if (r.eventCode) codesSet.add(r.eventCode); });
    recruitment?.rules?.forEach((r) => { if (r.eventCode) codesSet.add(r.eventCode); });
    const sorted = Array.from(codesSet).sort();
    return [
      { value: '', label: wt('filters.allEventCodes', 'All Event Codes') },
      ...sorted.map((code) => ({ value: code, label: code })),
    ];
  }, [logs, recentMessages, marketplace?.rules, recruitment?.rules, wt]);

  const filteredLogs = useMemo(() => {
    return logs.filter((log) => {
      if (logSearchQuery.trim()) {
        const q = logSearchQuery.toLowerCase();
        const matchPhone = log.recipientPhone?.toLowerCase().includes(q);
        const matchType = log.recipientType?.toLowerCase().includes(q);
        const matchEvent = log.eventCode?.toLowerCase().includes(q);
        const matchStatus = log.status?.toLowerCase().includes(q);
        if (!matchPhone && !matchType && !matchEvent && !matchStatus) return false;
      }
      return true;
    });
  }, [logs, logSearchQuery]);

  const filteredRecentMessages = useMemo(() => {
    return recentMessages.filter((message) => {
      if (recentStatusFilter && message.status !== recentStatusFilter) return false;
      if (recentEventFilter && message.eventCode !== recentEventFilter) return false;
      if (recentSearchQuery.trim()) {
        const q = recentSearchQuery.toLowerCase();
        const matchPhone = message.recipientPhone?.toLowerCase().includes(q);
        const matchType = message.recipientType?.toLowerCase().includes(q);
        const matchEvent = message.eventCode?.toLowerCase().includes(q);
        if (!matchPhone && !matchType && !matchEvent) return false;
      }
      return true;
    });
  }, [recentMessages, recentStatusFilter, recentEventFilter, recentSearchQuery]);

  const previewTemplateById = useCallback(
    (templateId?: string | null) => {
      if (!templateId) return;
      const found = templates.find((t) => t.id === templateId);
      if (found) {
        setActivePreviewTemplate(found);
        setCustomPreviewText(null);
      }
    },
    [templates]
  );

  const hydrate = useCallback((response: DashboardResponse) => {
    setDashboard(response);
    setForm((current) => ({
      ...current,
      enabled: response.settings.enabled,
      graphApiVersion: response.settings.graphApiVersion || 'v23.0',
      phoneNumberId: response.settings.phoneNumberId,
      businessAccountId: response.settings.businessAccountId,
    }));
  }, []);

  const loadDashboard = useCallback(async () => {
    try {
      const response = await api.get<DashboardResponse>('/whatsapp/dashboard');
      hydrate(response.data);
      setError('');
    } catch (requestError) {
      setError(
        axios.isAxiosError(requestError) ? requestError.response?.data?.error || 'Unable to load WhatsApp settings.' : 'Unable to load WhatsApp settings.'
      );
    } finally {
      setLoading(false);
    }
  }, [hydrate]);

  useEffect(() => {
    let active = true;
    void api
      .get<DashboardResponse>('/whatsapp/dashboard')
      .then((response) => {
        if (!active) return;
        hydrate(response.data);
        setError('');
      })
      .catch((requestError) => {
        if (!active) return;
        setError(
          axios.isAxiosError(requestError) ? requestError.response?.data?.error || 'Unable to load WhatsApp settings.' : 'Unable to load WhatsApp settings.'
        );
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [hydrate]);

  const loadMarketplace = useCallback(async () => {
    const response = await api.get<MarketplaceAutomationResponse>('/whatsapp/marketplace-automations');
    setMarketplace(response.data);
  }, []);

  const loadRecruitment = useCallback(async () => {
    const response = await api.get<MarketplaceAutomationResponse>('/whatsapp/recruitment-automations');
    setRecruitment(response.data);
  }, []);

  const loadTemplates = useCallback(async () => {
    const response = await api.get<{ templates: MarketplaceTemplate[] }>('/whatsapp/templates');
    setTemplates(response.data.templates);
  }, []);

  const loadLogs = useCallback(
    async (filters?: { status?: string; eventCode?: string }) => {
      setLogsLoading(true);
      try {
        const params = new URLSearchParams({ limit: '50' });
        const status = filters?.status ?? logStatus;
        const eventCode = filters?.eventCode ?? logEvent;
        if (status) params.set('status', status);
        if (eventCode.trim()) params.set('eventCode', eventCode.trim());
        const response = await api.get<{ logs: WhatsAppLog[] }>(`/whatsapp/logs?${params.toString()}`);
        setLogs(response.data.logs);
      } catch (requestError) {
        setError(axios.isAxiosError(requestError) ? requestError.response?.data?.error || 'Unable to load WhatsApp logs.' : 'Unable to load WhatsApp logs.');
      } finally {
        setLogsLoading(false);
      }
    },
    [logEvent, logStatus]
  );

  const loadCampaigns = useCallback(async () => {
    const response = await api.get<{ campaigns: WhatsAppCampaign[] }>('/whatsapp/campaigns');
    setCampaigns(response.data.campaigns);
  }, []);

  useEffect(() => {
    let active = true;
    void api
      .get<MarketplaceAutomationResponse>('/whatsapp/marketplace-automations')
      .then((response) => {
        if (active) setMarketplace(response.data);
      })
      .catch(() => {
        if (active) setError('Unable to load marketplace WhatsApp automations.');
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    let active = true;
    void api
      .get<{ campaigns: WhatsAppCampaign[] }>('/whatsapp/campaigns')
      .then((response) => {
        if (active) setCampaigns(response.data.campaigns);
      })
      .catch(() => {
        if (active) setError('Unable to load WhatsApp campaigns.');
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    let active = true;
    void api
      .get<{ templates: MarketplaceTemplate[] }>('/whatsapp/templates')
      .then((response) => {
        if (active) setTemplates(response.data.templates);
      })
      .catch(() => {
        if (active) setError('Unable to load WhatsApp templates.');
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    let active = true;
    void api
      .get<{ logs: WhatsAppLog[] }>('/whatsapp/logs?limit=50')
      .then((response) => {
        if (active) setLogs(response.data.logs);
      })
      .catch(() => {
        if (active) setError('Unable to load WhatsApp logs.');
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    let active = true;
    void api
      .get<MarketplaceAutomationResponse>('/whatsapp/recruitment-automations')
      .then((response) => {
        if (active) setRecruitment(response.data);
      })
      .catch(() => {
        if (active) setError('Unable to load recruitment WhatsApp automations.');
      });
    return () => {
      active = false;
    };
  }, []);

  const updateField = <K extends keyof SettingsForm>(key: K, value: SettingsForm[K]) => {
    setForm((current) => ({ ...current, [key]: value }));
  };

  const saveSettings = async () => {
    setSaving(true);
    setError('');
    setNotice('');
    try {
      const payload: Partial<SettingsForm> = { ...form };
      if (!form.testRecipientPhone.trim()) delete payload.testRecipientPhone;
      const response = await api.put<{ message: string; settings: WhatsAppSettings }>('/whatsapp/settings', payload);
      setDashboard((current) => (current ? { ...current, settings: response.data.settings } : current));
      setForm((current) => ({ ...current, accessToken: '', webhookVerifyToken: '', appSecret: '', testRecipientPhone: '' }));
      setNotice(response.data.message);
      await loadDashboard();
    } catch (requestError) {
      setError(axios.isAxiosError(requestError) ? requestError.response?.data?.error || 'Unable to save WhatsApp settings.' : 'Unable to save WhatsApp settings.');
    } finally {
      setSaving(false);
    }
  };

  const sendTest = async () => {
    setSending(true);
    setError('');
    setNotice('');
    try {
      const response = await api.post<{ message: string }>('/whatsapp/settings/test-message', { message: testMessage });
      setNotice(response.data.message);
      await loadDashboard();
    } catch (requestError) {
      setError(axios.isAxiosError(requestError) ? requestError.response?.data?.error || 'Unable to send test message.' : 'Unable to send test message.');
    } finally {
      setSending(false);
    }
  };

  const saveMarketplaceRule = async (rule: MarketplaceRule, changes: Partial<Pick<MarketplaceRule, 'enabled' | 'templateId'>>) => {
    const key = `rule-${rule.eventCode}`;
    setMarketplaceSaving(key);
    setError('');
    try {
      const response = await api.put<{ message: string }>('/whatsapp/marketplace-automations', {
        eventCode: rule.eventCode,
        enabled: changes.enabled ?? rule.enabled,
        templateId: changes.templateId ?? rule.templateId,
      });
      setNotice(response.data.message);
      await loadMarketplace();
    } catch (requestError) {
      setError(axios.isAxiosError(requestError) ? requestError.response?.data?.error || 'Unable to save automation.' : 'Unable to save automation.');
    } finally {
      setMarketplaceSaving(null);
    }
  };

  const saveTemplate = async () => {
    setMarketplaceSaving('template');
    setError('');
    try {
      const response = await api.post<{ message: string }>('/whatsapp/marketplace-templates', templateForm);
      setNotice(response.data.message);
      setTemplateForm({ name: '', language: 'en_US', metaTemplateId: '', category: 'MARKETPLACE', status: 'APPROVED', bodyText: '' });
      await Promise.all([loadMarketplace(), loadRecruitment(), loadTemplates()]);
    } catch (requestError) {
      setError(axios.isAxiosError(requestError) ? requestError.response?.data?.error || 'Unable to save template.' : 'Unable to save template.');
    } finally {
      setMarketplaceSaving(null);
    }
  };

  const saveRecruitmentRule = async (rule: MarketplaceRule, changes: Partial<Pick<MarketplaceRule, 'enabled' | 'templateId'>>) => {
    const key = `recruitment-${rule.eventCode}`;
    setMarketplaceSaving(key);
    setError('');
    try {
      const response = await api.put<{ message: string }>('/whatsapp/recruitment-automations', {
        eventCode: rule.eventCode,
        enabled: changes.enabled ?? rule.enabled,
        templateId: changes.templateId ?? rule.templateId,
      });
      setNotice(response.data.message);
      await loadRecruitment();
    } catch (requestError) {
      setError(axios.isAxiosError(requestError) ? requestError.response?.data?.error || 'Unable to save recruitment automation.' : 'Unable to save recruitment automation.');
    } finally {
      setMarketplaceSaving(null);
    }
  };

  const retryLog = async (log: WhatsAppLog) => {
    setRetryingLogId(log.id);
    setError('');
    setNotice('');
    try {
      const response = await api.post<{ message: string }>(`/whatsapp/logs/${log.id}/retry`);
      setNotice(response.data.message);
      await Promise.all([loadDashboard(), loadLogs()]);
    } catch (requestError) {
      setError(axios.isAxiosError(requestError) ? requestError.response?.data?.error || 'Unable to retry WhatsApp message.' : 'Unable to retry WhatsApp message.');
    } finally {
      setRetryingLogId(null);
    }
  };

  const saveConsent = async () => {
    setCampaignSaving(true);
    setError('');
    setNotice('');
    try {
      const response = await api.post<{ message: string }>('/whatsapp/campaign-consents', consentForm);
      setNotice(response.data.message);
      setConsentForm((current) => ({ ...current, phone: '' }));
    } catch (requestError) {
      setError(axios.isAxiosError(requestError) ? requestError.response?.data?.error || 'Unable to save consent.' : 'Unable to save consent.');
    } finally {
      setCampaignSaving(false);
    }
  };

  const createCampaign = async () => {
    setCampaignSaving(true);
    setError('');
    setNotice('');
    try {
      const response = await api.post<{ message: string }>('/whatsapp/campaigns', campaignForm);
      setNotice(response.data.message);
      setCampaignForm({ name: '', category: 'MARKETING', templateId: '' });
      await loadCampaigns();
    } catch (requestError) {
      setError(axios.isAxiosError(requestError) ? requestError.response?.data?.error || 'Unable to create campaign.' : 'Unable to create campaign.');
    } finally {
      setCampaignSaving(false);
    }
  };

  const confirmCampaign = async (campaign: WhatsAppCampaign) => {
    setCampaignSaving(true);
    setError('');
    setNotice('');
    try {
      const response = await api.post<{ message: string }>(`/whatsapp/campaigns/${campaign.id}/confirm`);
      setNotice(response.data.message);
      await Promise.all([loadCampaigns(), loadDashboard(), loadLogs()]);
    } catch (requestError) {
      setError(axios.isAxiosError(requestError) ? requestError.response?.data?.error || 'Unable to confirm campaign.' : 'Unable to confirm campaign.');
    } finally {
      setCampaignSaving(false);
    }
  };

  const createReminderCampaign = async () => {
    setCampaignSaving(true);
    setError('');
    setNotice('');
    try {
      const response = await api.post<{ message: string }>('/whatsapp/campaign-reminders', {
        ...reminderForm,
        windowValue: Number(reminderForm.windowValue),
      });
      setNotice(response.data.message);
      setReminderForm({ kind: 'INTERVIEW_48_HOURS', windowValue: '48', templateId: '' });
      await loadCampaigns();
    } catch (requestError) {
      setError(axios.isAxiosError(requestError) ? requestError.response?.data?.error || 'Unable to create reminder draft.' : 'Unable to create reminder draft.');
    } finally {
      setCampaignSaving(false);
    }
  };

  const { user: currentUser } = useAuthStore();
  const canManageWhatsApp = currentUser?.role === 'SUPER_ADMIN' || hasPermission(currentUser?.permissions, 'whatsapp.manage');
  const configuredCredentials = dashboard?.settings.credentials;
  const marketplaceTemplates = useMemo(() => approvedTemplatesForPurpose(marketplace?.templates || [], 'MARKETPLACE'), [marketplace]);
  const recruitmentTemplates = useMemo(() => approvedTemplatesForPurpose(recruitment?.templates || [], 'RECRUITMENT'), [recruitment]);
  const localizedTemplatePurposeOptions = useMemo(
    () => templatePurposeOptions.map((option) => ({
      ...option,
      label: wt(`options.templatePurpose.${option.value}`, option.label),
    })),
    [wt]
  );
  const localizedTemplateStatusOptions = useMemo(
    () => templateStatusOptions.map((option) => ({
      ...option,
      label: wt(`options.templateStatus.${option.value}`, option.label),
    })),
    [wt]
  );
  const localizedCampaignCategoryOptions = useMemo(
    () => campaignCategoryOptions.map((option) => ({
      ...option,
      label: wt(`options.campaignCategory.${option.value}`, option.label),
    })),
    [wt]
  );
  const localizedReminderKindOptions = useMemo(
    () => reminderKindOptions.map((option) => ({
      ...option,
      label: wt(`options.reminderKind.${option.value}`, option.label),
    })),
    [wt]
  );
  const localizedLogStatusOptions = useMemo(
    () => logStatusOptions.map((option) => ({
      ...option,
      label: option.value ? option.label : wt('filters.allStatuses', option.label),
    })),
    [wt]
  );
  const localizedMarketplaceEventDetails = useMemo(
    () =>
      Object.fromEntries(
        Object.entries(marketplaceEventDetails).map(([code, details]) => [
          code,
          {
            title: wt(`events.marketplace.${code}.title`, details.title),
            recipient: wt(`events.marketplace.${code}.recipient`, details.recipient),
            preview: wt(`events.marketplace.${code}.preview`, details.preview),
          },
        ])
      ) as typeof marketplaceEventDetails,
    [wt]
  );
  const localizedRecruitmentEventDetails = useMemo(
    () =>
      Object.fromEntries(
        Object.entries(recruitmentEventDetails).map(([code, details]) => [
          code,
          {
            title: wt(`events.recruitment.${code}.title`, details.title),
            recipient: wt(`events.recruitment.${code}.recipient`, details.recipient),
            preview: wt(`events.recruitment.${code}.preview`, details.preview),
          },
        ])
      ) as typeof recruitmentEventDetails,
    [wt]
  );

  const marketplaceSelectOptions = useMemo(
    () => [{ value: '', label: wt('placeholders.selectMarketplaceTemplate', 'Select marketplace template') }, ...marketplaceTemplates.map((template) => ({ value: template.id, label: template.name }))],
    [marketplaceTemplates, wt]
  );

  const recruitmentSelectOptions = useMemo(
    () => [{ value: '', label: wt('placeholders.selectRecruitmentTemplate', 'Select recruitment template') }, ...recruitmentTemplates.map((template) => ({ value: template.id, label: template.name }))],
    [recruitmentTemplates, wt]
  );

  const campaignTemplates = useMemo(
    () => approvedTemplatesForPurpose(templates, campaignForm.category as TemplatePurpose),
    [campaignForm.category, templates]
  );

  const campaignTemplateOptions = useMemo(
    () => [
      { value: '', label: campaignForm.category === 'JOB_ALERTS' ? wt('placeholders.approvedJobAlertTemplate', 'Approved job alert template') : wt('placeholders.approvedMarketingTemplate', 'Approved marketing template') },
      ...campaignTemplates.map((t) => ({ value: t.id, label: t.name })),
    ],
    [campaignForm.category, campaignTemplates, wt]
  );

  const reminderTemplates = useMemo(
    () => approvedTemplatesForPurpose(templates, reminderPurpose(reminderForm.kind)),
    [reminderForm.kind, templates]
  );

  const reminderTemplateOptions = useMemo(
    () => [
      { value: '', label: reminderForm.kind === 'INTERVIEW_48_HOURS' ? wt('placeholders.approvedJobAlertTemplate', 'Approved job alert template') : wt('placeholders.approvedMarketingTemplate', 'Approved marketing template') },
      ...reminderTemplates.map((t) => ({ value: t.id, label: t.name })),
    ],
    [reminderForm.kind, reminderTemplates, wt]
  );

  const tabs = [
    { id: 'SETTINGS', label: wt('tabs.settings', 'Setup & Credentials'), icon: KeyRound },
    { id: 'MARKETPLACE', label: wt('tabs.marketplace', 'Marketplace Rules'), icon: Store },
    { id: 'RECRUITMENT', label: wt('tabs.recruitment', 'Recruitment Rules'), icon: Briefcase },
    { id: 'CAMPAIGN', label: wt('tabs.campaign', 'Opt-in Campaigns'), icon: Megaphone },
    { id: 'LOGS', label: wt('tabs.logs', 'Logs & Delivery'), icon: FileText },
  ] as const;

  const showSidePreview = activeTab === 'SETTINGS' || activeTab === 'MARKETPLACE' || activeTab === 'RECRUITMENT';

  return (
    <div className="mx-auto max-w-7xl space-y-6 pb-12">
      {/* Stats Row */}
      <section className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        {[
          [wt('stats.allMessageLogs', 'All message logs'), dashboard?.stats.totalMessages ?? 0, wt('stats.allMessageLogsHelp', 'Recorded safely in the admin audit trail')],
          ['Sent · last 7 days', dashboard?.stats.sentLast7Days ?? 0, 'Meta accepted messages'],
          ['Delivered · last 7 days', dashboard?.stats.deliveredLast7Days ?? 0, 'Delivery webhook confirmations'],
          ['Failed · last 7 days', dashboard?.stats.failedLast7Days ?? 0, 'Retry details appear in logs'],
        ].map(([label, value, helper]) => (
          <div key={label} className="rounded-2xl border border-gray-200 bg-white p-3.5 sm:p-5 shadow-sm min-w-0">
            <p className="text-xs sm:text-sm font-semibold text-gray-500 truncate">{label}</p>
            <p className="mt-1 sm:mt-2 text-xl sm:text-3xl font-black tracking-tight text-gray-900">{loading ? '…' : value}</p>
            <p className="mt-1 text-[10px] sm:text-xs text-gray-500 truncate hidden sm:block">{helper}</p>
          </div>
        ))}
      </section>

      {/* Seamless Sticky Tab Navigation Bar */}
      <div className="sticky -top-4 sm:-top-6 z-30 -mx-4 sm:-mx-6 bg-gray-100 px-3 sm:px-6 pt-2.5 sm:pt-3 pb-2.5 sm:pb-3 border-b border-gray-200/80 shadow-sm">
        <nav aria-label="WhatsApp portal tabs" className="flex items-center flex-nowrap overflow-x-auto [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden gap-1.5 sm:gap-2 rounded-2xl border border-gray-200 bg-white p-1.5 sm:p-2 shadow-sm w-full">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => {
                  setActiveTab(tab.id);
                  setActivePreviewTemplate(null);
                  setCustomPreviewText(null);
                }}
                className={`flex flex-1 min-w-max items-center justify-center gap-1.5 sm:gap-2 rounded-xl px-3 py-2 sm:px-4 sm:py-2.5 text-xs sm:text-sm font-semibold sm:font-bold whitespace-nowrap transition-all ${
                  isActive ? 'bg-[#FFC107] text-black shadow-2xs font-bold' : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
                }`}
              >
                <Icon className="h-4 w-4 shrink-0" />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </nav>
      </div>

      {error ? <div role="alert" className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">{error}</div> : null}
      {notice ? <div role="status" className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-700">{notice}</div> : null}

      {/* Spacious Tab Content Area with Conditional Mobile Preview Sidebar */}
      <div className={showSidePreview ? 'grid gap-6 xl:grid-cols-[minmax(0,1fr)_300px] items-start' : 'w-full space-y-6'}>
        {/* Left Column: Active Tab Content */}
        <div className="space-y-6 min-w-0">
          {/* TAB 1: Setup & Credentials */}
          {activeTab === 'SETTINGS' && (
            <div className="space-y-6">
              <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm sm:p-6">
                <div className="mb-6 flex flex-col gap-3 border-b border-gray-100 pb-5 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <h3 className="text-lg font-bold text-gray-900">{wt('settings.secureConnectionSettings', 'Secure connection settings')}</h3>
                    <p className="mt-1 text-xs text-gray-500">{wt('settings.secretsEncrypted', 'Secrets are encrypted on the server.')}</p>
                  </div>
                  <label className="inline-flex w-fit cursor-pointer items-center gap-3 rounded-xl border border-gray-200 bg-gray-50 px-3 py-2">
                    <span className={`text-xs font-bold ${form.enabled ? 'text-emerald-700' : 'text-gray-600'}`}>{form.enabled ? wt('settings.enabled', 'ENABLED') : wt('settings.disabled', 'DISABLED')}</span>
                    <input className="sr-only" type="checkbox" checked={form.enabled} onChange={(event) => updateField('enabled', event.target.checked)} />
                    <span className={`relative h-6 w-11 rounded-full transition ${form.enabled ? 'bg-emerald-500' : 'bg-gray-300'}`}>
                      <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition ${form.enabled ? 'left-5' : 'left-0.5'}`} />
                    </span>
                  </label>
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label={wt('settings.graphApiVersion', 'Graph API version')} value={form.graphApiVersion} onChange={(value) => updateField('graphApiVersion', value)} placeholder="v23.0" />
                  <Field label={wt('settings.phoneNumberId', 'Phone Number ID')} value={form.phoneNumberId} onChange={(value) => updateField('phoneNumberId', value)} placeholder={wt('settings.phoneNumberIdPlaceholder', 'Meta Phone Number ID')} />
                  <Field label={wt('settings.businessAccountId', 'Business Account ID')} value={form.businessAccountId} onChange={(value) => updateField('businessAccountId', value)} placeholder={wt('settings.optionalRecommended', 'Optional but recommended')} />
                  <Field
                    label={wt('settings.testRecipientNumber', 'Test recipient number')}
                    value={form.testRecipientPhone}
                    onChange={(value) => updateField('testRecipientPhone', value)}
                    placeholder={dashboard?.settings.testRecipientPhoneMasked ? wt('settings.currentMasked', 'Current: {value}', { value: dashboard.settings.testRecipientPhoneMasked }) : '919876543210'}
                    inputMode="numeric"
                  />
                  <Field
                    label={wt('settings.permanentAccessToken', 'Permanent access token')}
                    value={form.accessToken}
                    onChange={(value) => updateField('accessToken', value)}
                    placeholder={configuredCredentials?.accessTokenConfigured ? wt('settings.configuredReplaceOnly', 'Configured - add only to replace') : wt('settings.permanentAccessTokenPlaceholder', 'Meta permanent access token')}
                    secret
                  />
                  <Field
                    label={wt('settings.webhookVerifyToken', 'Webhook verify token')}
                    value={form.webhookVerifyToken}
                    onChange={(value) => updateField('webhookVerifyToken', value)}
                    placeholder={configuredCredentials?.webhookVerifyTokenConfigured ? wt('settings.configuredReplaceOnly', 'Configured - add only to replace') : wt('settings.webhookVerifyTokenPlaceholder', 'Create a secure verification token')}
                    secret
                  />
                  <div className="sm:col-span-2">
                    <Field
                      label={wt('settings.metaAppSecret', 'Meta app secret')}
                      value={form.appSecret}
                      onChange={(value) => updateField('appSecret', value)}
                      placeholder={configuredCredentials?.appSecretConfigured ? wt('settings.configuredReplaceOnly', 'Configured - add only to replace') : wt('settings.metaAppSecretPlaceholder', 'Meta App Secret')}
                      secret
                    />
                  </div>
                </div>

                <div className="mt-5 flex flex-col gap-3 rounded-xl border border-amber-100 bg-amber-50 p-4 text-sm text-amber-900 sm:flex-row sm:items-center sm:justify-between">
                  <span className="flex gap-2">
                    <LockKeyhole className="mt-0.5 h-4 w-4 shrink-0" />
                    {wt('settings.enableAllowedAfterCredentials', 'Enable is allowed only after all required credentials are saved.')}
                  </span>
                  <button
                    type="button"
                    disabled={saving || !canManageWhatsApp}
                    onClick={() => void saveSettings()}
                    className="inline-flex items-center justify-center gap-2 rounded-lg bg-[#FFC107] px-4 py-2.5 font-bold text-black transition hover:bg-[#E5AD06] disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    <Save className="h-4 w-4" />
                    {saving ? wt('common.saving', 'Saving...') : wt('settings.saveSettings', 'Save settings')}
                  </button>
                </div>
              </section>

              <div className="grid gap-6 sm:grid-cols-2">
                <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
                  <div className="flex items-start gap-3">
                    <div className="rounded-xl bg-sky-50 p-2 text-sky-700">
                      <ShieldCheck className="h-5 w-5" />
                    </div>
                    <div>
                      <h3 className="font-bold text-gray-900">{wt('settings.webhookUrl', 'Webhook URL')}</h3>
                      <p className="mt-1 text-xs text-gray-500">{wt('settings.liveApiDomainEndpoint', 'Live API domain endpoint.')}</p>
                    </div>
                  </div>
                  <code className="mt-4 block overflow-x-auto rounded-lg bg-gray-900 px-3 py-3 text-xs text-amber-200">
                    {dashboard?.webhookUrl || wt('settings.loadingWebhookUrl', 'Loading webhook URL...')}
                  </code>
                </section>

                <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
                  <div className="flex items-center gap-3">
                    <div className="rounded-xl bg-[#FFC107]/20 p-2 text-[#9A7100]">
                      <KeyRound className="h-5 w-5" />
                    </div>
                    <div>
                      <h3 className="font-bold text-gray-900">{wt('settings.safeTestMessage', 'Safe test message')}</h3>
                      <p className="text-xs text-gray-500">{wt('settings.previewUpdatesLive', 'Preview updates live on side phone screen.')}</p>
                    </div>
                  </div>
                  <textarea
                    value={testMessage}
                    onChange={(event) => {
                      setTestMessage(event.target.value);
                      setCustomPreviewText(event.target.value);
                    }}
                    maxLength={500}
                    rows={3}
                    placeholder={wt('settings.typeTestMessage', 'Type test message text here...')}
                    className="mt-3 w-full rounded-xl border border-gray-300 px-3 py-2 text-xs sm:text-sm text-gray-900 outline-none transition focus:border-[#FFC107]"
                  />
                  <button
                    type="button"
                    disabled={sending || !dashboard?.settings.enabled || !dashboard?.settings.ready || !canManageWhatsApp}
                    onClick={() => void sendTest()}
                    className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-xl border border-gray-900 bg-gray-900 px-4 py-2 text-xs font-bold text-white transition hover:bg-black disabled:opacity-50"
                  >
                    <Send className="h-3.5 w-3.5" />
                    {sending ? 'Sending…' : 'Send test message'}
                  </button>
                </section>
              </div>
            </div>
          )}

          {/* TAB 2: Marketplace Automations */}
          {activeTab === 'MARKETPLACE' && (
            <div className="space-y-6">
              {/* Register Meta Template Form */}
              <section className="rounded-2xl border border-amber-100 bg-amber-50/50 p-5 sm:p-6 shadow-sm space-y-4">
                <div className="flex items-center justify-between border-b border-amber-200/50 pb-3">
                  <div>
                    <h3 className="text-base font-bold text-gray-900 flex items-center gap-2">
                      <FileText className="h-4 w-4 text-amber-600" />
                      {wt('templates.registerMetaTemplate', 'Register Meta Template')}
                    </h3>
                    <p className="text-xs text-gray-600">{wt('templates.detailsRenderLive', 'Details typed here render in real-time on the side phone display.')}</p>
                  </div>
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <label className="block text-xs font-bold text-gray-700 uppercase mb-1">{wt('templates.templateName', 'Template Name')}</label>
                    <input
                      value={templateForm.name}
                      onChange={(event) => setTemplateForm((current) => ({ ...current, name: event.target.value }))}
                      placeholder="e.g. jcb_listing_approved"
                      className="w-full rounded-xl border border-gray-300 bg-white px-3.5 py-2.5 text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-gray-700 uppercase mb-1">{wt('templates.metaTemplateId', 'Meta Template ID')}</label>
                    <input
                      value={templateForm.metaTemplateId}
                      onChange={(event) => setTemplateForm((current) => ({ ...current, metaTemplateId: event.target.value }))}
                      placeholder="e.g. 9876543210"
                      className="w-full rounded-xl border border-gray-300 bg-white px-3.5 py-2.5 text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-gray-700 uppercase mb-1">{wt('templates.category', 'Category')}</label>
                    <CustomSelect
                      value={templateForm.category}
                      options={localizedTemplatePurposeOptions}
                      onChange={(val) => setTemplateForm((current) => ({ ...current, category: val as TemplatePurpose }))}
                      className="w-full"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-bold text-gray-700 uppercase mb-1">{wt('templates.language', 'Language')}</label>
                      <input
                        value={templateForm.language}
                        onChange={(event) => setTemplateForm((current) => ({ ...current, language: event.target.value }))}
                        placeholder="en_US"
                        className="w-full rounded-xl border border-gray-300 bg-white px-3.5 py-2.5 text-sm"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-gray-700 uppercase mb-1">{wt('templates.status', 'Status')}</label>
                      <CustomSelect
                        value={templateForm.status}
                        options={localizedTemplateStatusOptions}
                        onChange={(val) => setTemplateForm((current) => ({ ...current, status: val }))}
                        className="w-full"
                      />
                    </div>
                  </div>
                  <div className="sm:col-span-2">
                    <label className="block text-xs font-bold text-gray-700 uppercase mb-1">{wt('templates.sampleMessageBody', 'Sample Message Body (Live Preview Text)')}</label>
                    <textarea
                      value={templateForm.bodyText}
                      onChange={(event) => setTemplateForm((current) => ({ ...current, bodyText: event.target.value }))}
                      rows={3}
                      placeholder={wt('templates.typeSampleMessage', 'Type sample message text here...')}
                      className="w-full rounded-xl border border-gray-300 bg-white px-3.5 py-2 text-xs sm:text-sm text-gray-900 outline-none focus:ring-2 focus:ring-amber-400"
                    />
                  </div>
                </div>

                <button
                  type="button"
                  disabled={marketplaceSaving === 'template' || !canManageWhatsApp}
                  onClick={() => void saveTemplate()}
                  className="w-full rounded-xl bg-[#FFC107] px-4 py-2.5 text-sm font-bold text-black transition hover:bg-amber-400 disabled:opacity-60 shadow-xs"
                >
                  {marketplaceSaving === 'template' ? wt('templates.savingTemplate', 'Saving Template...') : wt('templates.saveTemplate', 'Save Template')}
                </button>
              </section>

              {/* Registered Templates Gallery */}
              <section className="rounded-2xl border border-gray-200 bg-white shadow-sm p-5 sm:p-6">
                <div className="flex items-center justify-between mb-3">
                  <h4 className="font-bold text-gray-900 text-sm">{wt('templates.allRegisteredTemplates', 'All Registered Templates ({count})', { count: templates.length })}</h4>
                  <p className="text-xs text-gray-500">{wt('templates.clickPreviewHelp', 'Click Preview to view on side phone.')}</p>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  {templates.length ? (
                    templates.map((tpl) => (
                      <div
                        key={tpl.id}
                        className={`rounded-xl border p-3 shadow-xs flex items-center justify-between transition ${
                          activePreviewTemplate?.id === tpl.id
                            ? 'border-emerald-500 bg-emerald-50/60 ring-2 ring-emerald-200'
                            : 'border-gray-200 bg-white hover:border-gray-300'
                        }`}
                      >
                        <div className="min-w-0 pr-2">
                          <p className="text-xs font-bold text-gray-900 truncate">{tpl.name}</p>
                          <p className="text-[10px] text-gray-500">{tpl.category || 'GENERAL'} · {tpl.language}</p>
                        </div>
                        <button
                          type="button"
                          onClick={() => previewTemplateById(tpl.id)}
                          className="inline-flex items-center gap-1 text-xs font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2.5 py-1.5 rounded-lg hover:bg-emerald-100 shrink-0 shadow-2xs"
                        >
                          <Eye className="h-3.5 w-3.5" />
                          {activePreviewTemplate?.id === tpl.id ? wt('common.viewing', 'Viewing') : wt('common.preview', 'Preview')}
                        </button>
                      </div>
                    ))
                  ) : (
                    <p className="text-xs text-gray-500 col-span-full">{wt('templates.noTemplates', 'No templates registered yet.')}</p>
                  )}
                </div>
              </section>

              {/* Event Rules & Automation Triggers Section */}
              <section className="rounded-2xl border border-gray-200 bg-white shadow-sm">
                <div className="border-b border-gray-100 p-5 sm:p-6">
                  <h3 className="text-base font-bold text-gray-900">{wt('rules.eventRulesTriggers', 'Event Rules & Triggers')}</h3>
                  <p className="mt-0.5 text-xs text-gray-500">{wt('rules.selectTemplateTurnOn', 'Select template and turn ON to automate.')}</p>
                </div>
                <div className="space-y-3 p-5 sm:p-6">
                {marketplace?.rules.map((rule) => {
                  const details = localizedMarketplaceEventDetails[rule.eventCode];
                  return (
                    <div key={rule.eventCode} className="rounded-2xl border border-gray-200 bg-white p-4 sm:p-5 shadow-xs transition hover:border-gray-300">
                      <div className="flex flex-col gap-4 lg:flex-row lg:items-center">
                        <div className="min-w-0 flex-1">
                          <p className="text-base font-bold text-gray-900">{details?.title || rule.eventCode}</p>
                          <p className="mt-1 text-xs font-medium text-gray-500">
                            {wt('rules.to', 'To')}: <span className="font-semibold text-gray-700">{details?.recipient || wt('rules.configuredRecipient', 'Configured recipient')}</span> - {wt('common.preview', 'Preview')}: {details?.preview || wt('rules.marketplaceEventUpdate', 'Marketplace event update.')}
                          </p>
                        </div>
                        <div className="flex items-center gap-2 w-full lg:w-auto">
                          <CustomSelect
                            ariaLabel={`${details?.title || rule.eventCode} template`}
                            value={rule.templateId || ''}
                            options={marketplaceSelectOptions}
                            disabled={marketplaceSaving === `rule-${rule.eventCode}` || !canManageWhatsApp}
                            onChange={(val) => {
                              void saveMarketplaceRule(rule, { templateId: val || null, enabled: false });
                              if (val) previewTemplateById(val);
                            }}
                            className="w-full lg:w-64"
                          />
                          {rule.templateId ? (
                            <button
                              type="button"
                              onClick={() => previewTemplateById(rule.templateId)}
                              title={wt('templates.previewSelectedTemplateOnPhone', 'Preview selected template on phone screen')}
                              className="inline-flex items-center gap-1 text-xs font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2.5 py-2.5 rounded-xl hover:bg-emerald-100 shrink-0 transition"
                            >
                              <Eye className="h-4 w-4 text-emerald-600" />
                              {wt('common.preview', 'Preview')}
                            </button>
                          ) : null}
                        </div>
                        <label className="inline-flex cursor-pointer items-center gap-2 text-sm font-bold text-gray-700 shrink-0">
                          <input
                            type="checkbox"
                            checked={rule.enabled}
                            disabled={marketplaceSaving === `rule-${rule.eventCode}` || !canManageWhatsApp}
                            onChange={(event) => void saveMarketplaceRule(rule, { enabled: event.target.checked })}
                            className="h-4 w-4 rounded border-gray-300 text-amber-500 focus:ring-amber-400"
                          />
                          {rule.enabled ? wt('common.on', 'On') : wt('common.off', 'Off')}
                        </label>
                      </div>
                    </div>
                  );
                }) || <p className="text-sm text-gray-500">{wt('rules.loadingAutomationControls', 'Loading automation controls...')}</p>}
              </div>
            </section>
          </div>
        )}

        {/* TAB 3: Recruitment Automations */}
        {activeTab === 'RECRUITMENT' && (
          <section className="rounded-2xl border border-gray-200 bg-white shadow-sm">
            <div className="border-b border-gray-100 p-5 sm:p-6">
              <p className="text-xs font-bold uppercase tracking-[0.16em] text-amber-700">{wt('recruitment.recruitmentAutomations', 'Recruitment Automations')}</p>
              <h3 className="mt-1 text-base font-bold text-gray-900">{wt('recruitment.workflowControls', 'Candidate and hiring workflow controls')}</h3>
            </div>
            <div className="space-y-4 p-5 sm:p-6">
              {recruitment?.rules.map((rule) => {
                const details = localizedRecruitmentEventDetails[rule.eventCode];
                return (
                  <div key={rule.eventCode} className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm transition hover:border-gray-300">
                    <div className="flex flex-col gap-4 lg:flex-row lg:items-center">
                      <div className="min-w-0 flex-1">
                        <p className="text-base font-bold text-gray-900">{details?.title || rule.eventCode}</p>
                        <p className="mt-1 text-xs font-medium text-gray-500">
                          {wt('rules.to', 'To')}: <span className="font-semibold text-gray-700">{details?.recipient || wt('rules.configuredRecipient', 'Configured recipient')}</span> - {wt('common.preview', 'Preview')}: {details?.preview || wt('rules.recruitmentUpdate', 'Recruitment update.')}
                        </p>
                      </div>
                      <div className="flex items-center gap-2 w-full lg:w-auto">
                        <CustomSelect
                          ariaLabel={`${details?.title || rule.eventCode} template`}
                          value={rule.templateId || ''}
                          options={recruitmentSelectOptions}
                          disabled={marketplaceSaving === `recruitment-${rule.eventCode}` || !canManageWhatsApp}
                          onChange={(val) => {
                            void saveRecruitmentRule(rule, { templateId: val || null, enabled: false });
                            if (val) previewTemplateById(val);
                          }}
                          className="w-full lg:w-64"
                        />
                        {rule.templateId ? (
                          <button
                            type="button"
                            onClick={() => previewTemplateById(rule.templateId)}
                            title={wt('templates.previewSelectedTemplateOnPhone', 'Preview selected template on phone screen')}
                            className="inline-flex items-center gap-1 text-xs font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2.5 py-2.5 rounded-xl hover:bg-emerald-100 shrink-0 transition"
                          >
                            <Eye className="h-4 w-4 text-emerald-600" />
                            {wt('common.preview', 'Preview')}
                          </button>
                        ) : null}
                      </div>
                      <label className="inline-flex cursor-pointer items-center gap-2 text-sm font-bold text-gray-700 shrink-0">
                        <input
                          type="checkbox"
                          checked={rule.enabled}
                          disabled={marketplaceSaving === `recruitment-${rule.eventCode}` || !canManageWhatsApp}
                          onChange={(event) => void saveRecruitmentRule(rule, { enabled: event.target.checked })}
                          className="h-4 w-4 rounded border-gray-300 text-amber-500 focus:ring-amber-400"
                        />
                        {rule.enabled ? wt('common.on', 'On') : wt('common.off', 'Off')}
                      </label>
                    </div>
                  </div>
                );
              }) || <p className="text-sm text-gray-500">{wt('recruitment.loadingAutomationControls', 'Loading recruitment automation controls...')}</p>}
            </div>
          </section>
        )}

        {/* TAB 4: Opt-in Campaigns */}
        {activeTab === 'CAMPAIGN' && (
          <section className="rounded-2xl border border-gray-200 bg-white shadow-sm">
            <div className="border-b border-gray-100 p-5 sm:p-6">
              <p className="text-xs font-bold uppercase tracking-[0.16em] text-amber-700">{wt('campaign.optInCampaigns', 'Opt-in Campaigns')}</p>
              <h3 className="mt-1 text-base font-bold text-gray-900">{wt('campaign.consentDraftConfirmation', 'Consent, draft and explicit confirmation')}</h3>
            </div>
            <div className="grid gap-6 p-5 sm:p-6 xl:grid-cols-3">
              {/* Record Consent */}
              <div className="rounded-2xl border border-gray-200 p-5">
                <h4 className="font-bold text-gray-900">{wt('campaign.recordRevokeConsent', 'Record or revoke consent')}</h4>
                <div className="mt-4 space-y-3">
                  <input
                    value={consentForm.phone}
                    onChange={(event) => setConsentForm((current) => ({ ...current, phone: event.target.value }))}
                    placeholder="919876543210"
                    className="w-full rounded-xl border border-gray-300 px-3.5 py-2.5 text-sm"
                  />
                  <CustomSelect
                    value={consentForm.category}
                    options={localizedCampaignCategoryOptions}
                    onChange={(val) => setConsentForm((current) => ({ ...current, category: val }))}
                    className="w-full"
                  />
                  <button
                    type="button"
                    disabled={campaignSaving || !canManageWhatsApp}
                    onClick={() => void saveConsent()}
                    className="w-full rounded-xl border border-gray-900 bg-gray-900 px-4 py-2.5 text-sm font-bold text-white transition hover:bg-black disabled:opacity-60"
                  >
                    {wt('campaign.saveOptIn', 'Save opt-in')}
                  </button>
                </div>
              </div>

              {/* Campaign Draft */}
              <div className="rounded-2xl border border-amber-100 bg-amber-50/60 p-5">
                <h4 className="font-bold text-gray-900">{wt('campaign.createCampaignDraft', 'Create campaign draft')}</h4>
                <div className="mt-4 space-y-3">
                  <input
                    value={campaignForm.name}
                    onChange={(event) => setCampaignForm((current) => ({ ...current, name: event.target.value }))}
                    placeholder={wt('campaign.campaignName', 'Campaign name')}
                    className="w-full rounded-xl border border-gray-300 bg-white px-3.5 py-2.5 text-sm"
                  />
                  <CustomSelect
                    value={campaignForm.category}
                    options={localizedCampaignCategoryOptions}
                    onChange={(val) =>
                      setCampaignForm((current) => ({ ...current, category: val as 'MARKETING' | 'JOB_ALERTS', templateId: '' }))
                    }
                    className="w-full"
                  />
                  <div className="flex items-center gap-2">
                    <CustomSelect
                      value={campaignForm.templateId}
                      options={campaignTemplateOptions}
                      onChange={(val) => {
                        setCampaignForm((current) => ({ ...current, templateId: val }));
                        if (val) previewTemplateById(val);
                      }}
                      className="w-full"
                    />
                    {campaignForm.templateId ? (
                      <button
                        type="button"
                        onClick={() => previewTemplateById(campaignForm.templateId)}
                        title={wt('templates.previewSelectedTemplate', 'Preview selected template')}
                        className="inline-flex items-center gap-1 text-xs font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2.5 py-2.5 rounded-xl hover:bg-emerald-100 shrink-0"
                      >
                        <Eye className="h-4 w-4 text-emerald-600" />
                        {wt('common.preview', 'Preview')}
                      </button>
                    ) : null}
                  </div>
                  <button
                    type="button"
                    disabled={campaignSaving || !canManageWhatsApp}
                    onClick={() => void createCampaign()}
                    className="w-full rounded-xl bg-[#FFC107] px-4 py-2.5 text-sm font-bold text-black transition hover:bg-amber-400 disabled:opacity-60"
                  >
                    {wt('campaign.createSafeDraft', 'Create safe draft')}
                  </button>
                </div>
              </div>

              {/* Reminder Draft */}
              <div className="rounded-2xl border border-sky-100 bg-sky-50/60 p-5">
                <h4 className="font-bold text-gray-900">{wt('campaign.prepareReminderDraft', 'Prepare reminder draft')}</h4>
                <p className="mt-1 text-xs text-gray-600">{wt('campaign.onlyDueOptInsIncluded', 'Only opt-in candidates/customers whose reminder is due are included.')}</p>
                <div className="mt-4 space-y-3">
                  <CustomSelect
                    value={reminderForm.kind}
                    options={localizedReminderKindOptions}
                    disabled={!canManageWhatsApp}
                    onChange={(val) => setReminderForm((current) => ({
                      ...current,
                      kind: val,
                      windowValue: reminderWindowFields[val]?.defaultValue || '1',
                      templateId: '',
                    }))}
                    className="w-full"
                  />
                  <div>
                    <label htmlFor="reminder-window" className="mb-1 block text-xs font-bold uppercase tracking-wide text-gray-700">
                      {reminderForm.kind === 'INTERVIEW_48_HOURS' ? wt('campaign.interviewWindow', 'Interview window') : wt('campaign.primeExpiryWindow', 'Prime expiry window')}
                    </label>
                    <div className="flex items-center gap-2">
                      <input
                        id="reminder-window"
                        type="number"
                        min={reminderWindowFields[reminderForm.kind]?.min || 1}
                        max={reminderWindowFields[reminderForm.kind]?.max || 365}
                        step="1"
                        value={reminderForm.windowValue}
                        disabled={!canManageWhatsApp}
                        onChange={(event) => setReminderForm((current) => ({ ...current, windowValue: event.target.value }))}
                        className="w-full rounded-xl border border-gray-300 bg-white px-3.5 py-2.5 text-sm text-gray-900 outline-none transition focus:border-sky-500 focus:ring-2 focus:ring-sky-100 disabled:cursor-not-allowed disabled:bg-gray-100 disabled:opacity-60"
                      />
                      <span className="shrink-0 text-xs font-semibold text-gray-600">{reminderForm.kind === 'INTERVIEW_48_HOURS' ? wt('campaign.hoursAhead', 'hours ahead') : wt('campaign.daysAhead', 'days ahead')}</span>
                    </div>
                    <p className="mt-1 text-[11px] text-gray-500">
                      {wt('campaign.customWindowHelp', 'Choose either reminder type above, then enter a custom whole-number window.')}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <CustomSelect
                      value={reminderForm.templateId}
                      options={reminderTemplateOptions}
                      disabled={!canManageWhatsApp}
                      onChange={(val) => {
                        setReminderForm((current) => ({ ...current, templateId: val }));
                        if (val) previewTemplateById(val);
                      }}
                      className="w-full"
                    />
                    {reminderForm.templateId ? (
                      <button
                        type="button"
                        onClick={() => previewTemplateById(reminderForm.templateId)}
                        title={wt('templates.previewSelectedTemplate', 'Preview selected template')}
                        className="inline-flex items-center gap-1 text-xs font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2.5 py-2.5 rounded-xl hover:bg-emerald-100 shrink-0"
                      >
                        <Eye className="h-4 w-4 text-emerald-600" />
                        {wt('common.preview', 'Preview')}
                      </button>
                    ) : null}
                  </div>
                  <button
                    type="button"
                    disabled={campaignSaving || !canManageWhatsApp}
                    onClick={() => void createReminderCampaign()}
                    className="w-full rounded-xl border border-sky-700 bg-sky-700 px-4 py-2.5 text-sm font-bold text-white transition hover:bg-sky-800 disabled:opacity-60"
                  >
                    {wt('campaign.createReminderDraft', 'Create reminder draft')}
                  </button>
                </div>
              </div>
            </div>

            <div className="border-t border-gray-100 p-5 sm:p-6">
              <div className="overflow-x-auto">
                <table className="min-w-full text-left text-sm">
                  <thead className="bg-gray-50 text-xs uppercase tracking-wide text-gray-500">
                    <tr>
                      <th className="px-4 py-3">{wt('table.campaign', 'Campaign')}</th>
                      <th className="px-4 py-3">{wt('table.audience', 'Audience')}</th>
                      <th className="px-4 py-3">{wt('table.status', 'Status')}</th>
                      <th className="px-4 py-3">{wt('table.action', 'Action')}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {campaigns.length ? (
                      campaigns.map((campaign) => (
                        <tr key={campaign.id}>
                          <td className="px-4 py-3 font-semibold text-gray-900">
                            {campaign.name}
                            <p className="mt-1 text-xs font-normal text-gray-500">
                              {campaign.template.name} · {campaign.category}
                            </p>
                          </td>
                          <td className="px-4 py-3 text-gray-600">{wt('campaign.optedInCount', '{count} opted-in', { count: campaign._count.recipients })}</td>
                          <td className="px-4 py-3 text-gray-600">{campaign.status}</td>
                          <td className="px-4 py-3">
                            {campaign.status === 'DRAFT' && campaign._count.recipients > 0 ? (
                              <button
                                type="button"
                                disabled={campaignSaving || !canManageWhatsApp}
                                onClick={() => void confirmCampaign(campaign)}
                                className="rounded-lg bg-[#FFC107] px-3 py-1.5 text-xs font-bold text-black hover:bg-amber-400 disabled:opacity-60"
                              >
                                {wt('campaign.confirmSend', 'Confirm & send')}
                              </button>
                            ) : null}
                          </td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan={4} className="px-4 py-8 text-center text-gray-500">
                          {wt('campaign.noDrafts', 'No campaign drafts yet.')}
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </section>
        )}

        {/* TAB 5: Logs & Delivery */}
        {activeTab === 'LOGS' && (
          <div className="space-y-6">
            <section className="rounded-2xl border border-gray-200 bg-white shadow-sm">
              <div className="flex flex-col gap-4 border-b border-gray-100 p-5 sm:p-6 lg:flex-row lg:items-center lg:justify-between">
                <div>
                  <p className="text-xs font-bold uppercase tracking-[0.16em] text-amber-700">{wt('logs.deliveryOperations', 'Delivery Operations')}</p>
                  <h3 className="mt-1 text-base font-bold text-gray-900">{wt('logs.searchableMessageLogs', 'Searchable message logs')}</h3>
                </div>
                <div className="flex flex-wrap gap-2 items-center">
                  <input
                    value={logSearchQuery}
                    onChange={(event) => setLogSearchQuery(event.target.value)}
                    placeholder={wt('logs.searchPlaceholder', 'Search phone number / event...')}
                    className="rounded-xl border border-gray-300 px-3.5 py-2 text-xs font-medium w-full sm:w-56"
                  />
                  <CustomSelect
                    value={logStatus}
                    options={localizedLogStatusOptions}
                    onChange={(val) => {
                      setLogStatus(val);
                      void loadLogs({ status: val });
                    }}
                    className="w-full sm:w-44"
                  />
                  <CustomSelect
                    value={logEvent}
                    options={availableEventOptions}
                    onChange={(val) => {
                      setLogEvent(val);
                      void loadLogs({ eventCode: val });
                    }}
                    className="w-full sm:w-48"
                  />
                  <button
                    type="button"
                    onClick={() => void loadLogs()}
                    disabled={logsLoading}
                    className="rounded-xl border border-gray-900 bg-gray-900 px-4 py-2 text-xs font-bold text-white transition hover:bg-black disabled:opacity-60"
                  >
                    {logsLoading ? wt('common.loading', 'Loading...') : wt('logs.apply', 'Apply')}
                  </button>
                </div>
              </div>
              <div className="overflow-x-auto">
                <table className="min-w-full text-left text-sm">
                  <thead className="bg-gray-50 text-xs uppercase tracking-wide text-gray-500">
                    <tr>
                      <th className="px-5 py-3 font-bold">{wt('table.event', 'Event')}</th>
                      <th className="px-5 py-3 font-bold">{wt('table.recipient', 'Recipient')}</th>
                      <th className="px-5 py-3 font-bold">{wt('table.delivery', 'Delivery')}</th>
                      <th className="px-5 py-3 font-bold">{wt('table.attempts', 'Attempts')}</th>
                      <th className="px-5 py-3 font-bold">{wt('table.time', 'Time')}</th>
                      <th className="px-5 py-3 font-bold">
                        <span className="sr-only">{wt('table.action', 'Action')}</span>
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {filteredLogs.length ? (
                      filteredLogs.map((log) => (
                        <tr key={log.id}>
                          <td className="px-5 py-4 font-semibold text-gray-900">
                            {log.eventCode}
                            <p className="mt-1 max-w-xs truncate text-xs font-normal text-red-600">{log.errorMessage || ''}</p>
                          </td>
                          <td className="px-5 py-4 text-gray-600">
                            {log.recipientType} · {log.recipientPhone}
                          </td>
                          <td className="px-5 py-4">
                            <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${statusStyle[log.status]}`}>{log.status}</span>
                          </td>
                          <td className="px-5 py-4 text-gray-600">{log.outbox ? `${log.outbox.attempts}/3` : '—'}</td>
                          <td className="whitespace-nowrap px-5 py-4 text-gray-500">{new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date(log.createdAt))}</td>
                          <td className="px-5 py-4">
                            {log.status === 'FAILED' && (log.outbox?.attempts || 0) < 3 ? (
                              <button
                                type="button"
                                disabled={retryingLogId === log.id || !canManageWhatsApp}
                                onClick={() => void retryLog(log)}
                                className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-1.5 text-xs font-bold text-amber-900 disabled:opacity-60"
                              >
                                {retryingLogId === log.id ? wt('logs.retrying', 'Retrying...') : wt('logs.retry', 'Retry')}
                              </button>
                            ) : (
                              <span className="text-gray-400">—</span>
                            )}
                          </td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan={6} className="px-5 py-10 text-center text-sm text-gray-500">
                          {logsLoading ? wt('logs.loadingLogs', 'Loading logs...') : wt('logs.noMatchingLogs', 'No matching WhatsApp logs.')}
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </section>

            <section className="rounded-2xl border border-gray-200 bg-white shadow-sm">
              <div className="flex flex-col gap-4 border-b border-gray-100 p-5 sm:p-6 lg:flex-row lg:items-center lg:justify-between">
                <div>
                  <h3 className="text-base font-bold text-gray-900">{wt('logs.recentMessageActivity', 'Recent message activity')}</h3>
                </div>
                <div className="flex flex-wrap gap-2 items-center">
                  <input
                    value={recentSearchQuery}
                    onChange={(event) => setRecentSearchQuery(event.target.value)}
                    placeholder={wt('logs.searchPlaceholder', 'Search phone number / event...')}
                    className="rounded-xl border border-gray-300 px-3.5 py-2 text-xs font-medium w-full sm:w-56"
                  />
                  <CustomSelect
                    value={recentStatusFilter}
                    options={localizedLogStatusOptions}
                    onChange={(val) => setRecentStatusFilter(val)}
                    className="w-full sm:w-40"
                  />
                  <CustomSelect
                    value={recentEventFilter}
                    options={availableEventOptions}
                    onChange={(val) => setRecentEventFilter(val)}
                    className="w-full sm:w-44"
                  />
                  <button
                    type="button"
                    onClick={() => void loadDashboard()}
                    className="inline-flex items-center gap-1.5 rounded-xl border border-gray-200 px-3 py-2 text-xs font-semibold text-gray-700 hover:bg-gray-50"
                  >
                    <RefreshCw className="h-3.5 w-3.5" />
                    {wt('logs.refresh', 'Refresh')}
                  </button>
                </div>
              </div>
              <div className="overflow-x-auto">
                <table className="min-w-full text-left text-sm">
                  <thead className="bg-gray-50 text-xs uppercase tracking-wide text-gray-500">
                    <tr>
                      <th className="px-5 py-3 font-bold">{wt('table.event', 'Event')}</th>
                      <th className="px-5 py-3 font-bold">{wt('table.recipient', 'Recipient')}</th>
                      <th className="px-5 py-3 font-bold">{wt('table.status', 'Status')}</th>
                      <th className="px-5 py-3 font-bold">{wt('table.time', 'Time')}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {filteredRecentMessages.length ? (
                      filteredRecentMessages.map((message) => (
                        <tr key={message.id}>
                          <td className="px-5 py-4 font-semibold text-gray-900">{message.eventCode}</td>
                          <td className="px-5 py-4 text-gray-600">
                            {message.recipientType} · {message.recipientPhone}
                          </td>
                          <td className="px-5 py-4">
                            <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${statusStyle[message.status]}`}>{message.status}</span>
                          </td>
                          <td className="whitespace-nowrap px-5 py-4 text-gray-500">{new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date(message.createdAt))}</td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan={4} className="px-5 py-10 text-center text-sm text-gray-500">
                          {wt('logs.noActivity', 'No WhatsApp message activity yet.')}
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </section>
          </div>
        )}
        </div>

        {/* Right Column: Sticky iPhone 16 Pro WhatsApp Preview Panel (Shown ONLY on relevant tabs) */}
        {showSidePreview ? (
          <aside className="sticky top-6 rounded-2xl border border-emerald-100 bg-white p-3.5 shadow-sm space-y-3 flex flex-col items-center justify-center shrink-0 w-full max-w-sm mx-auto xl:max-w-none mt-6 xl:mt-0">
            <div className="w-full flex items-center justify-between pb-1.5 border-b border-gray-100">
              <p className="text-xs font-bold uppercase tracking-wider text-emerald-950 flex items-center gap-1.5">
                <MessageCircle className="h-4 w-4 text-emerald-600" />
                {wt('preview.liveWhatsAppDisplay', 'Live WhatsApp Display')}
              </p>
            </div>

            <WhatsAppPhonePreview
              title={activePreviewTemplate ? activePreviewTemplate.name : (activeTab === 'SETTINGS' ? (testMessage ? 'safe_test_message' : wt('settings.testMessageTitle', 'Test Message')) : templateForm.name)}
              category={activePreviewTemplate ? (activePreviewTemplate.category || 'MARKETPLACE') : templateForm.category}
              language={activePreviewTemplate ? activePreviewTemplate.language : templateForm.language}
              status={activePreviewTemplate ? activePreviewTemplate.status : templateForm.status}
              bodyText={customPreviewText || (activePreviewTemplate ? undefined : (activeTab === 'SETTINGS' ? testMessage : templateForm.bodyText))}
              metaTemplateId={activePreviewTemplate ? (activePreviewTemplate.metaTemplateId || undefined) : templateForm.metaTemplateId}
            />

            {activePreviewTemplate || customPreviewText ? (
              <button
                type="button"
                onClick={() => {
                  setActivePreviewTemplate(null);
                  setCustomPreviewText(null);
                }}
                className="w-full text-center text-xs font-bold text-emerald-800 bg-emerald-50 border border-emerald-200 py-1.5 rounded-xl hover:bg-emerald-100 transition shadow-2xs"
              >
                {wt('preview.resetLivePreview', 'Reset Live Preview')}
              </button>
            ) : null}
          </aside>
        ) : null}
      </div>
    </div>
  );
}
