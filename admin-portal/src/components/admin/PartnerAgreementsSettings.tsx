/* eslint-disable react-hooks/set-state-in-effect */
'use client';

import axios from 'axios';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  AlertTriangle,
  ArrowUpDown,
  Award,
  Building2,
  Calendar,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  ClipboardCheck,
  Clock,
  Copy,
  Download,
  Eye,
  FileCheck2,
  FileSpreadsheet,
  FileText,
  Filter,
  Globe,
  HelpCircle,
  Layers,
  LayoutGrid,
  ListTodo,
  Loader2,
  Lock,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  ShieldAlert,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  Table as TableIcon,
  Trash2,
  Users,
  X,
} from 'lucide-react';
import { toast } from 'react-toastify';
import api from '@/lib/api';
import BrandLoader from '@/components/ui/BrandLoader';
import { useAuthStore } from '@/store/authStore';

export const AGREEMENT_TYPES = [
  'MARKETPLACE_TERMS',
  'PARTNER_TERMS',
  'LISTING_AUTHENTICITY',
  'MEDIA_OWNERSHIP',
  'SECURITY_DEPOSIT_POLICY',
  'REFUND_POLICY',
  'CUSTOMER_DATA_USAGE',
  'CONTACT_VISIBILITY_POLICY',
  'FRAUD_POLICY',
  'LISTING_SUSPENSION_POLICY',
  'SOLD_MEDIA_DELETION_POLICY',
  'FEATURED_IMAGE_RETENTION_CONSENT',
  'COMMISSION_POLICY',
  'LEAD_OWNERSHIP_POLICY',
] as const;

export type Agreement = {
  id: string;
  agreementType: string;
  title: string;
  summary: string;
  content: string;
  version: string;
  applicablePartnerTypes: string[];
  isRequired: boolean;
  status: 'DRAFT' | 'PUBLISHED' | 'ARCHIVED';
  effectiveFrom: string | null;
  displayOrder: number;
  createdAt?: string;
  updatedAt?: string;
};

type FormState = Omit<Agreement, 'id' | 'effectiveFrom' | 'status'> & { effectiveFrom: string };
type ViewMode = 'table' | 'cards';
type SortField = 'displayOrder_asc' | 'updated_desc' | 'title_asc' | 'version_desc';

const emptyForm: FormState = {
  agreementType: AGREEMENT_TYPES[0],
  title: '',
  summary: '',
  content: '',
  version: 'v1.0',
  applicablePartnerTypes: ['SHOWROOM'],
  isRequired: true,
  effectiveFrom: '',
  displayOrder: 10,
};

const AVAILABLE_PARTNER_TYPES = [
  { value: 'SHOWROOM', label: 'Showroom Partner' },
  { value: 'DEALER', label: 'Independent Dealer' },
  { value: 'BROKER', label: 'Equipment Broker' },
  { value: 'INDIVIDUAL', label: 'Individual Seller' },
];

const labelForType = (value: string) =>
  value
    .replaceAll('_', ' ')
    .toLowerCase()
    .replace(/\b\w/g, (letter) => letter.toUpperCase());

const getAgreementTypeMeta = (type: string) => {
  const metaMap: Record<string, { label: string; group: string; icon: any; tone: string }> = {
    MARKETPLACE_TERMS: {
      label: 'Marketplace Terms & Platform Agreement',
      group: 'Platform Governance',
      icon: Globe,
      tone: 'blue',
    },
    PARTNER_TERMS: {
      label: 'Partner Dealership Agreement',
      group: 'Partner Master',
      icon: Building2,
      tone: 'amber',
    },
    LISTING_AUTHENTICITY: {
      label: 'Listing Authenticity & Inspection Declaration',
      group: 'Inventory Quality',
      icon: CheckCircle2,
      tone: 'emerald',
    },
    MEDIA_OWNERSHIP: {
      label: 'Media Ownership & Copyright Consent',
      group: 'Media & IP',
      icon: FileText,
      tone: 'indigo',
    },
    SECURITY_DEPOSIT_POLICY: {
      label: 'Security Deposit & Collateral Policy',
      group: 'Finance & Deposit',
      icon: ShieldCheck,
      tone: 'purple',
    },
    REFUND_POLICY: {
      label: 'Refund & Settlement Policy',
      group: 'Finance & Deposit',
      icon: FileText,
      tone: 'slate',
    },
    CUSTOMER_DATA_USAGE: {
      label: 'Customer Data Usage & Privacy Policy',
      group: 'Privacy & Data',
      icon: ShieldCheck,
      tone: 'blue',
    },
    CONTACT_VISIBILITY_POLICY: {
      label: 'Contact Visibility & Buyer Access Policy',
      group: 'Lead Flow',
      icon: Eye,
      tone: 'teal',
    },
    FRAUD_POLICY: {
      label: 'Anti-Fraud & Misuse Standards',
      group: 'Compliance & Legal',
      icon: AlertTriangle,
      tone: 'rose',
    },
    LISTING_SUSPENSION_POLICY: {
      label: 'Listing Suspension & Penalty Policy',
      group: 'Inventory Quality',
      icon: AlertCircle,
      tone: 'orange',
    },
    SOLD_MEDIA_DELETION_POLICY: {
      label: 'Sold Vehicle Media Deletion Policy',
      group: 'Media & IP',
      icon: Trash2,
      tone: 'slate',
    },
    FEATURED_IMAGE_RETENTION_CONSENT: {
      label: 'Featured Marketing Image Retention',
      group: 'Media & IP',
      icon: Sparkles,
      tone: 'amber',
    },
    COMMISSION_POLICY: {
      label: 'Brokerage & Platform Commission Policy',
      group: 'Commercial Terms',
      icon: Award,
      tone: 'amber',
    },
    LEAD_OWNERSHIP_POLICY: {
      label: 'Lead Ownership & Exclusivity Policy',
      group: 'Lead Flow',
      icon: Users,
      tone: 'blue',
    },
  };

  return (
    metaMap[type] || {
      label: labelForType(type),
      group: 'General Governance',
      icon: FileText,
      tone: 'slate',
    }
  );
};

const formatDate = (dateString?: string | null) => {
  if (!dateString) return '—';
  const date = new Date(dateString);
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(date);
};

export default function PartnerAgreementsSettings() {
  const user = useAuthStore((state) => state.user);

  // Core Permissions
  const isSuperAdmin = user?.role === 'SUPER_ADMIN';
  const permissions = user?.permissions || [];
  const canView =
    isSuperAdmin ||
    permissions.includes('ALL_ACCESS') ||
    permissions.includes('partner.agreements.read') ||
    permissions.includes('partner.agreements.manage');
  const canManage =
    isSuperAdmin ||
    permissions.includes('ALL_ACCESS') ||
    permissions.includes('partner.agreements.manage');

  // State
  const [agreements, setAgreements] = useState<Agreement[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [lastSyncedAt, setLastSyncedAt] = useState<Date | null>(null);

  // Filter & Search
  const [search, setSearch] = useState('');
  const [statusTab, setStatusTab] = useState<'ALL' | 'PUBLISHED' | 'MANDATORY' | 'DRAFT'>('ALL');
  const [partnerTypeFilter, setPartnerTypeFilter] = useState('ALL');
  const [sortField, setSortField] = useState<SortField>('displayOrder_asc');
  const [viewMode, setViewMode] = useState<ViewMode>('table');
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Form & Modals
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [formTab, setFormTab] = useState<'editor' | 'preview'>('editor');
  const [previewingAgreement, setPreviewingAgreement] = useState<Agreement | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Agreement | null>(null);

  // Load agreements from API
  const loadAgreements = useCallback(
    async (isManualRefresh = false) => {
      try {
        if (isManualRefresh) setRefreshing(true);
        else setLoading(true);
        setError('');

        const response = await api.get<{ agreements: Agreement[] }>('/superadmin/partner-agreements');
        const loaded = response.data?.agreements || [];
        setAgreements(loaded);
        setLastSyncedAt(new Date());

        if (isManualRefresh) {
          toast.success(`Refreshed ${loaded.length} partner policy agreements`);
        }
      } catch (err: unknown) {
        const message = axios.isAxiosError(err)
          ? err.response?.data?.error || 'Unable to load partner agreements.'
          : 'Unable to load partner agreements.';
        setError(message);
        toast.error(message);
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [],
  );

  useEffect(() => {
    if (canView) void loadAgreements();
  }, [canView, loadAgreements]);

  // Copy helper
  const copyText = (text: string, id: string) => {
    if (!text) return;
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    toast.success('Copied to clipboard');
    setTimeout(() => setCopiedId(null), 2000);
  };

  const activeAgreements = useMemo(
    () => agreements.filter((agreement) => agreement.status !== 'ARCHIVED'),
    [agreements],
  );

  const availableTypes = useMemo(() => {
    if (editingId) return AGREEMENT_TYPES;
    const used = new Set(activeAgreements.map((agreement) => agreement.agreementType));
    return AGREEMENT_TYPES.filter((type) => !used.has(type));
  }, [activeAgreements, editingId]);

  // Executive Metric Ribbon Calculations
  const metrics = useMemo(() => {
    const total = activeAgreements.length;
    const published = activeAgreements.filter((a) => a.status === 'PUBLISHED').length;
    const mandatory = activeAgreements.filter((a) => a.isRequired).length;
    const drafts = activeAgreements.filter((a) => a.status === 'DRAFT').length;

    const partnerTypesCovered = new Set(
      activeAgreements.flatMap((a) => a.applicablePartnerTypes || []),
    ).size;

    return {
      total,
      published,
      mandatory,
      drafts,
      partnerTypesCovered,
      publishedRate: total > 0 ? Math.round((published / total) * 100) : 0,
      mandatoryRate: total > 0 ? Math.round((mandatory / total) * 100) : 0,
    };
  }, [activeAgreements]);

  // Filtered & Sorted Agreements
  const filteredAgreements = useMemo(() => {
    const query = search.trim().toLowerCase();

    return activeAgreements
      .filter((agreement) => {
        // Status Tab Filter
        if (statusTab === 'PUBLISHED' && agreement.status !== 'PUBLISHED') return false;
        if (statusTab === 'DRAFT' && agreement.status !== 'DRAFT') return false;
        if (statusTab === 'MANDATORY' && !agreement.isRequired) return false;

        // Partner Type Filter
        if (partnerTypeFilter !== 'ALL') {
          const types = agreement.applicablePartnerTypes || [];
          if (!types.includes(partnerTypeFilter) && types.length > 0) return false;
        }

        // Full-Text Search
        if (query) {
          const typeMeta = getAgreementTypeMeta(agreement.agreementType);
          const haystack = [
            agreement.title,
            agreement.summary,
            agreement.agreementType,
            agreement.version,
            typeMeta.label,
            typeMeta.group,
            agreement.content,
            (agreement.applicablePartnerTypes || []).join(' '),
          ]
            .filter(Boolean)
            .join(' ')
            .toLowerCase();

          if (!haystack.includes(query)) return false;
        }

        return true;
      })
      .sort((a, b) => {
        if (sortField === 'displayOrder_asc') {
          return (a.displayOrder || 0) - (b.displayOrder || 0);
        }
        if (sortField === 'updated_desc') {
          return new Date(b.updatedAt || 0).getTime() - new Date(a.updatedAt || 0).getTime();
        }
        if (sortField === 'title_asc') {
          return (a.title || '').localeCompare(b.title || '');
        }
        if (sortField === 'version_desc') {
          return (b.version || '').localeCompare(a.version || '');
        }
        return 0;
      });
  }, [activeAgreements, search, statusTab, partnerTypeFilter, sortField]);

  // Form Controls
  const openCreate = () => {
    setEditingId(null);
    setForm({
      ...emptyForm,
      agreementType: availableTypes[0] || AGREEMENT_TYPES[0],
      displayOrder: (activeAgreements.length + 1) * 10,
    });
    setFormTab('editor');
    setIsFormOpen(true);
  };

  const openEdit = (agreement: Agreement) => {
    setEditingId(agreement.id);
    setForm({
      agreementType: agreement.agreementType,
      title: agreement.title,
      summary: agreement.summary || '',
      content: agreement.content,
      version: agreement.version,
      applicablePartnerTypes: agreement.applicablePartnerTypes || [],
      isRequired: agreement.isRequired,
      effectiveFrom: agreement.effectiveFrom ? agreement.effectiveFrom.slice(0, 16) : '',
      displayOrder: agreement.displayOrder,
    });
    setFormTab('editor');
    setIsFormOpen(true);
  };

  const updateForm = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((current) => ({ ...current, [key]: value }));

  const togglePartnerType = (type: string) => {
    const current = form.applicablePartnerTypes;
    if (current.includes(type)) {
      updateForm(
        'applicablePartnerTypes',
        current.filter((item) => item !== type),
      );
    } else {
      updateForm('applicablePartnerTypes', [...current, type]);
    }
  };

  // Submit Save Form
  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaving(true);
    try {
      const payload = {
        ...form,
        status: 'PUBLISHED' as const,
        effectiveFrom: form.effectiveFrom || null,
      };

      if (editingId) {
        await api.put(`/superadmin/partner-agreements/${editingId}`, payload);
        toast.success(`Updated “${form.title}” successfully`);
      } else {
        await api.post('/superadmin/partner-agreements', payload);
        toast.success(`Published “${form.title}” into agreement catalogue`);
      }

      setIsFormOpen(false);
      await loadAgreements();
    } catch (requestError: unknown) {
      const message = axios.isAxiosError(requestError)
        ? requestError.response?.data?.error || 'Unable to save partner agreement.'
        : 'Unable to save partner agreement.';
      toast.error(message);
    } finally {
      setSaving(false);
    }
  };

  // Toggle Published Switch
  const togglePublished = async (agreement: Agreement) => {
    const nextStatus = agreement.status === 'PUBLISHED' ? 'DRAFT' : 'PUBLISHED';
    try {
      setUpdatingId(agreement.id);
      await api.put(`/superadmin/partner-agreements/${agreement.id}`, {
        agreementType: agreement.agreementType,
        title: agreement.title,
        summary: agreement.summary,
        content: agreement.content,
        version: agreement.version,
        applicablePartnerTypes: agreement.applicablePartnerTypes,
        isRequired: agreement.isRequired,
        displayOrder: agreement.displayOrder,
        status: nextStatus,
        effectiveFrom: agreement.effectiveFrom,
      });

      setAgreements((prev) =>
        prev.map((a) => (a.id === agreement.id ? { ...a, status: nextStatus } : a)),
      );

      toast.success(
        nextStatus === 'PUBLISHED'
          ? `Published “${agreement.title}” for dealer onboarding`
          : `Unpublished “${agreement.title}” (now in Draft mode)`,
      );
    } catch (requestError: unknown) {
      const message = axios.isAxiosError(requestError)
        ? requestError.response?.data?.error || 'Unable to update agreement status.'
        : 'Unable to update agreement status.';
      toast.error(message);
    } finally {
      setUpdatingId(null);
    }
  };

  // Remove / Archive Agreement
  const removeAgreement = async (agreement: Agreement) => {
    try {
      setUpdatingId(agreement.id);
      await api.delete(`/superadmin/partner-agreements/${agreement.id}`);
      toast.success(`Archived “${agreement.title}” from active catalogue`);
      setDeleteTarget(null);
      await loadAgreements();
    } catch (requestError: unknown) {
      const message = axios.isAxiosError(requestError)
        ? requestError.response?.data?.error || 'Unable to delete partner agreement.'
        : 'Unable to delete partner agreement.';
      toast.error(message);
    } finally {
      setUpdatingId(null);
    }
  };

  // Export to CSV
  const exportAgreementsToCsv = () => {
    if (!filteredAgreements.length) {
      toast.info('No agreements to export in the current view.');
      return;
    }

    const headers = [
      'Order',
      'Agreement Type Key',
      'Title',
      'Version',
      'Requirement',
      'Status',
      'Applicable Tiers',
      'Summary',
      'Effective Date',
    ];

    const rows = filteredAgreements.map((a) => [
      a.displayOrder,
      `"${a.agreementType}"`,
      `"${a.title.replace(/"/g, '""')}"`,
      `"${a.version}"`,
      a.isRequired ? 'Mandatory' : 'Optional',
      `"${a.status}"`,
      `"${(a.applicablePartnerTypes || []).join(', ')}"`,
      `"${(a.summary || '').replace(/"/g, '""')}"`,
      `"${a.effectiveFrom ? formatDate(a.effectiveFrom) : 'Immediate'}"`,
    ]);

    const csvContent =
      'data:text/csv;charset=utf-8,' +
      [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute(
      'download',
      `partner-agreements-catalogue-${new Date().toISOString().slice(0, 10)}.csv`,
    );
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast.success(`Exported ${filteredAgreements.length} agreements to CSV`);
  };

  // Check if filters are active
  const hasActiveFilters =
    search.trim() !== '' ||
    statusTab !== 'ALL' ||
    partnerTypeFilter !== 'ALL' ||
    sortField !== 'displayOrder_asc';

  const resetAllFilters = () => {
    setSearch('');
    setStatusTab('ALL');
    setPartnerTypeFilter('ALL');
    setSortField('displayOrder_asc');
  };

  if (!canView) {
    return (
      <div className="rounded-xl border border-slate-200 bg-white p-8 text-center text-slate-700 shadow-2xs">
        <ShieldAlert className="mx-auto h-10 w-10 text-rose-500" />
        <h3 className="mt-3 text-base font-bold text-slate-900">Access Restricted</h3>
        <p className="mt-1 text-xs text-slate-500">
          You do not have permission to view partner agreements and governance policies.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3.5 pb-12">
      {/* 1. EXECUTIVE HEADER */}
      <div className="rounded-xl border border-slate-200/90 bg-white p-3.5 shadow-2xs sm:p-4">
        <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
          <div>
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center gap-1.5 rounded-md bg-amber-500/10 px-2 py-0.5 text-[10px] font-black uppercase tracking-wider text-amber-900 border border-amber-300">
                <ShieldCheck className="h-3 w-3 text-amber-600" />
                Legal & Governance
              </span>
              <span className="text-slate-300">/</span>
              <span className="text-xs font-semibold text-slate-500">
                Partner Onboarding Gateways
              </span>
            </div>

            <div className="mt-1 flex flex-wrap items-baseline gap-2">
              <h1 className="text-xl font-black tracking-tight text-slate-900 sm:text-2xl">
                Partner Agreements & Policies
              </h1>
              <span className="inline-flex items-center rounded-full bg-slate-100 px-2.5 py-0.5 text-[11px] font-bold text-slate-700">
                {activeAgreements.length} Active Policies
              </span>
              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-0.5 text-[11px] font-bold text-emerald-800 border border-emerald-200">
                <CheckCircle2 className="h-3 w-3 text-emerald-600" />
                {metrics.published} Published Live
              </span>
            </div>
            <p className="mt-0.5 text-xs text-slate-500">
              Manage statutory marketplace terms, dealer conduct rules, media copyright consents, and commission governance across dealer onboarding.
            </p>
          </div>

          {/* Action Toolbar */}
          <div className="flex flex-wrap items-center gap-2">
            {/* View Mode Toggle */}
            <div className="inline-flex items-center rounded-lg border border-slate-200 bg-slate-50/80 p-0.5">
              <button
                type="button"
                onClick={() => setViewMode('table')}
                className={`inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-bold transition-all ${
                  viewMode === 'table'
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-500 hover:text-slate-900'
                }`}
                title="Dense Table View"
              >
                <TableIcon className="h-3.5 w-3.5" />
                Table
              </button>
              <button
                type="button"
                onClick={() => setViewMode('cards')}
                className={`inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-bold transition-all ${
                  viewMode === 'cards'
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-500 hover:text-slate-900'
                }`}
                title="Policy Cards View"
              >
                <LayoutGrid className="h-3.5 w-3.5" />
                Cards
              </button>
            </div>

            {/* Export CSV */}
            <button
              type="button"
              onClick={exportAgreementsToCsv}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-50 hover:border-slate-300 transition-colors"
              title="Export policies catalogue to CSV"
            >
              <Download className="h-3.5 w-3.5 text-slate-500" />
              Export
            </button>

            {/* Refresh */}
            <button
              type="button"
              disabled={refreshing}
              onClick={() => void loadAgreements(true)}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-50 hover:border-slate-300 transition-colors shadow-2xs disabled:opacity-50"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? 'animate-spin' : ''}`} />
              Refresh
            </button>

            {/* Create Policy Button */}
            {canManage && (
              <button
                type="button"
                onClick={openCreate}
                disabled={availableTypes.length === 0}
                className="inline-flex items-center gap-1.5 rounded-lg bg-[#FFC107] px-3.5 py-1.5 text-xs font-black text-slate-950 hover:bg-[#E5AD06] transition-colors shadow-2xs disabled:opacity-50"
              >
                <Plus className="h-3.5 w-3.5 stroke-[3]" />
                Create Policy
              </button>
            )}
          </div>
        </div>

        {/* Sync Info Strip */}
        {lastSyncedAt && (
          <div className="mt-2.5 flex items-center justify-between border-t border-slate-100 pt-2 text-[11px] text-slate-400">
            <span className="flex items-center gap-1">
              <Clock className="h-3 w-3" />
              Catalogue synchronized: {formatDate(lastSyncedAt.toISOString())}
            </span>
            <span>
              {metrics.mandatory} Mandatory Gates • {metrics.drafts} Drafts Pending Live
            </span>
          </div>
        )}
      </div>

      {/* 2. EXECUTIVE 5-CARD KPI METRIC RIBBON */}
      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-5">
        {/* Total Policies */}
        <div className="rounded-xl border border-slate-200/90 bg-white p-3 shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
              Total Policies
            </span>
            <span className="flex h-6 w-6 items-center justify-center rounded-md bg-slate-100 text-slate-600">
              <Layers className="h-3.5 w-3.5" />
            </span>
          </div>
          <div className="mt-1 flex items-baseline gap-1.5">
            <span className="text-xl font-black text-slate-900">{metrics.total}</span>
            <span className="text-[11px] font-semibold text-slate-500">agreements</span>
          </div>
          <p className="mt-1 text-[11px] text-slate-500 truncate">
            Across {AGREEMENT_TYPES.length} statutory types
          </p>
        </div>

        {/* Published & Live */}
        <div
          onClick={() => setStatusTab(statusTab === 'PUBLISHED' ? 'ALL' : 'PUBLISHED')}
          className={`cursor-pointer rounded-xl border p-3 shadow-2xs transition-all ${
            statusTab === 'PUBLISHED'
              ? 'border-emerald-400 bg-emerald-50/50 ring-2 ring-emerald-400/20'
              : 'border-slate-200/90 bg-white hover:border-emerald-300'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-800">
              Published & Active
            </span>
            <span className="flex h-6 w-6 items-center justify-center rounded-md bg-emerald-100 text-emerald-800">
              <CheckCircle2 className="h-3.5 w-3.5" />
            </span>
          </div>
          <div className="mt-1 flex items-baseline gap-1.5">
            <span className="text-xl font-black text-emerald-800">{metrics.published}</span>
            <span className="text-[11px] font-bold text-emerald-700">
              {metrics.publishedRate}%
            </span>
          </div>
          <p className="mt-1 text-[11px] text-emerald-700 truncate">Enforced in partner KYC</p>
        </div>

        {/* Mandatory Onboarding Gates */}
        <div
          onClick={() => setStatusTab(statusTab === 'MANDATORY' ? 'ALL' : 'MANDATORY')}
          className={`cursor-pointer rounded-xl border p-3 shadow-2xs transition-all ${
            statusTab === 'MANDATORY'
              ? 'border-amber-400 bg-amber-50/50 ring-2 ring-amber-400/20'
              : 'border-slate-200/90 bg-white hover:border-amber-300'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold uppercase tracking-wider text-amber-900">
              Mandatory Gates
            </span>
            <span className="flex h-6 w-6 items-center justify-center rounded-md bg-amber-100 text-amber-800">
              <Lock className="h-3.5 w-3.5" />
            </span>
          </div>
          <div className="mt-1 flex items-baseline gap-1.5">
            <span className="text-xl font-black text-amber-900">{metrics.mandatory}</span>
            <span className="text-[11px] font-bold text-amber-700">
              {metrics.mandatoryRate}%
            </span>
          </div>
          <p className="mt-1 text-[11px] text-amber-800 truncate">Blocking dealer onboarding</p>
        </div>

        {/* Draft Policies */}
        <div
          onClick={() => setStatusTab(statusTab === 'DRAFT' ? 'ALL' : 'DRAFT')}
          className={`cursor-pointer rounded-xl border p-3 shadow-2xs transition-all ${
            statusTab === 'DRAFT'
              ? 'border-slate-400 bg-slate-50/80 ring-2 ring-slate-400/20'
              : 'border-slate-200/90 bg-white hover:border-slate-300'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-600">
              Drafts & Staging
            </span>
            <span className="flex h-6 w-6 items-center justify-center rounded-md bg-slate-100 text-slate-700">
              <Clock className="h-3.5 w-3.5" />
            </span>
          </div>
          <div className="mt-1 flex items-baseline gap-1.5">
            <span className="text-xl font-black text-slate-800">{metrics.drafts}</span>
            <span className="text-[11px] font-semibold text-slate-500">drafts</span>
          </div>
          <p className="mt-1 text-[11px] text-slate-500 truncate">Hidden from onboarding</p>
        </div>

        {/* Coverage Scope */}
        <div className="col-span-2 sm:col-span-1 rounded-xl border border-slate-200/90 bg-white p-3 shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
              Tier Coverage
            </span>
            <span className="flex h-6 w-6 items-center justify-center rounded-md bg-blue-50 text-blue-700">
              <Building2 className="h-3.5 w-3.5" />
            </span>
          </div>
          <div className="mt-1 flex items-baseline gap-1.5">
            <span className="text-xl font-black text-slate-900">
              {metrics.partnerTypesCovered || 1}
            </span>
            <span className="text-[11px] font-semibold text-slate-500">partner tiers</span>
          </div>
          <p className="mt-1 text-[11px] text-slate-500 truncate">Showrooms & Dealerships</p>
        </div>
      </div>

      {/* 3. MULTI-FILTER TOOLBAR */}
      <div className="rounded-xl border border-slate-200/90 bg-white p-3 shadow-2xs">
        <div className="flex flex-col gap-3">
          {/* Top Row: Quick Status Tabs + Search */}
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-2.5">
            {/* Quick Status Chips */}
            <div className="flex flex-wrap items-center gap-1.5">
              <button
                type="button"
                onClick={() => setStatusTab('ALL')}
                className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-bold transition-all ${
                  statusTab === 'ALL'
                    ? 'bg-slate-900 text-white shadow-2xs'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                All Policies
                <span className="rounded-full bg-black/15 px-1.5 py-0.2 text-[10px]">
                  {metrics.total}
                </span>
              </button>

              <button
                type="button"
                onClick={() => setStatusTab('PUBLISHED')}
                className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-bold transition-all ${
                  statusTab === 'PUBLISHED'
                    ? 'bg-emerald-700 text-white shadow-2xs'
                    : 'bg-emerald-50 text-emerald-800 hover:bg-emerald-100'
                }`}
              >
                Published
                <span className="rounded-full bg-emerald-950/15 px-1.5 py-0.2 text-[10px]">
                  {metrics.published}
                </span>
              </button>

              <button
                type="button"
                onClick={() => setStatusTab('MANDATORY')}
                className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-bold transition-all ${
                  statusTab === 'MANDATORY'
                    ? 'bg-amber-500 text-slate-950 shadow-2xs'
                    : 'bg-amber-50 text-amber-900 hover:bg-amber-100'
                }`}
              >
                Mandatory
                <span className="rounded-full bg-amber-950/15 px-1.5 py-0.2 text-[10px]">
                  {metrics.mandatory}
                </span>
              </button>

              <button
                type="button"
                onClick={() => setStatusTab('DRAFT')}
                className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-bold transition-all ${
                  statusTab === 'DRAFT'
                    ? 'bg-slate-700 text-white shadow-2xs'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                Drafts
                <span className="rounded-full bg-slate-900/15 px-1.5 py-0.2 text-[10px]">
                  {metrics.drafts}
                </span>
              </button>
            </div>

            {/* Instant Search Bar */}
            <div className="relative w-full lg:w-80">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search policy name, summary, clauses..."
                className="h-8.5 w-full rounded-lg border border-slate-200 bg-slate-50/60 pl-8.5 pr-8 text-xs text-slate-900 placeholder:text-slate-400 outline-none focus:border-amber-400 focus:bg-white focus:ring-2 focus:ring-amber-400/20"
              />
              {search && (
                <button
                  type="button"
                  onClick={() => setSearch('')}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          </div>

          {/* Bottom Row: Partner Tier Filter + Sort + Count */}
          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-2.5 text-xs">
            <div className="flex flex-wrap items-center gap-2">
              {/* Partner Tier Filter */}
              <div className="flex items-center gap-1">
                <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                  Target Tier:
                </span>
                <select
                  value={partnerTypeFilter}
                  onChange={(e) => setPartnerTypeFilter(e.target.value)}
                  className="h-7.5 rounded-md border border-slate-200 bg-slate-50 px-2 text-xs font-semibold text-slate-700 outline-none focus:border-amber-400"
                >
                  <option value="ALL">All Partner Tiers</option>
                  {AVAILABLE_PARTNER_TYPES.map((t) => (
                    <option key={t.value} value={t.value}>
                      {t.label}
                    </option>
                  ))}
                </select>
              </div>

              {/* Sort By */}
              <div className="flex items-center gap-1">
                <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                  Sort:
                </span>
                <select
                  value={sortField}
                  onChange={(e) => setSortField(e.target.value as SortField)}
                  className="h-7.5 rounded-md border border-slate-200 bg-slate-50 px-2 text-xs font-semibold text-slate-700 outline-none focus:border-amber-400"
                >
                  <option value="displayOrder_asc">Display Order (Onboarding Flow)</option>
                  <option value="updated_desc">Recently Updated</option>
                  <option value="title_asc">Title (A-Z)</option>
                  <option value="version_desc">Version (High to Low)</option>
                </select>
              </div>

              {/* Reset Filters */}
              {hasActiveFilters && (
                <button
                  type="button"
                  onClick={resetAllFilters}
                  className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-bold text-rose-600 hover:bg-rose-50 transition-colors"
                >
                  <X className="h-3 w-3" />
                  Reset
                </button>
              )}
            </div>

            {/* Results Count */}
            <div className="flex items-center gap-2 text-slate-500 text-[11px]">
              <span>
                Showing <strong className="text-slate-900">{filteredAgreements.length}</strong> of{' '}
                {activeAgreements.length} policies
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* 4. MAIN CONTENT AREA */}
      {loading ? (
        <div className="flex min-h-[360px] items-center justify-center rounded-xl border border-slate-200/90 bg-white p-12">
          <BrandLoader size="sm" text="Loading legal agreement catalogue..." />
        </div>
      ) : error ? (
        <div className="rounded-xl border border-rose-200 bg-rose-50/70 p-8 text-center shadow-2xs">
          <AlertCircle className="mx-auto h-8 w-8 text-rose-600" />
          <h3 className="mt-2 text-sm font-bold text-rose-900">Failed to load agreements</h3>
          <p className="mt-1 text-xs text-rose-700 max-w-md mx-auto">{error}</p>
          <button
            type="button"
            onClick={() => void loadAgreements()}
            className="mt-3 inline-flex items-center gap-1.5 rounded-lg bg-rose-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-rose-700 shadow-2xs"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            Try Again
          </button>
        </div>
      ) : filteredAgreements.length === 0 ? (
        <div className="rounded-xl border border-slate-200/90 bg-white p-12 text-center shadow-2xs">
          <ClipboardCheck className="mx-auto h-10 w-10 text-slate-300" />
          <h3 className="mt-3 text-sm font-bold text-slate-800">No partner policies match</h3>
          <p className="mt-1 text-xs text-slate-500 max-w-sm mx-auto">
            {hasActiveFilters
              ? 'Try relaxing your search terms or clearing status filters.'
              : 'No partner agreement definitions are currently configured.'}
          </p>
          {hasActiveFilters && (
            <button
              type="button"
              onClick={resetAllFilters}
              className="mt-3.5 inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-bold text-white hover:bg-slate-800 shadow-2xs"
            >
              <RefreshCw className="h-3 w-3" />
              Reset All Filters
            </button>
          )}
        </div>
      ) : viewMode === 'table' ? (
        /* ================= HIGH-DENSITY TABLE VIEW ================= */
        <div className="overflow-hidden rounded-xl border border-slate-200/90 bg-white shadow-2xs">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1050px] text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-slate-200/90 bg-slate-50/90 text-[11px] font-bold uppercase tracking-wider text-slate-600">
                  <th className="py-2.5 pl-4 pr-2 w-16">Seq #</th>
                  <th className="py-2.5 px-3">Agreement Title & Type</th>
                  <th className="py-2.5 px-3">Version</th>
                  <th className="py-2.5 px-3">Gate Rule</th>
                  <th className="py-2.5 px-3">Target Tiers</th>
                  <th className="py-2.5 px-3">Summary / Scope</th>
                  <th className="py-2.5 px-3">Status</th>
                  <th className="py-2.5 pr-4 pl-3 text-right">Governance</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-normal">
                {filteredAgreements.map((agreement) => {
                  const meta = getAgreementTypeMeta(agreement.agreementType);
                  const isPublished = agreement.status === 'PUBLISHED';
                  const isUpdatingThis = updatingId === agreement.id;

                  return (
                    <tr
                      key={agreement.id}
                      className="group transition-colors hover:bg-amber-50/30"
                    >
                      {/* 1. Seq # */}
                      <td className="py-2.5 pl-4 pr-2 align-top">
                        <span className="inline-flex items-center justify-center rounded bg-slate-100 px-2 py-0.5 font-mono text-[11px] font-bold text-slate-700">
                          #{agreement.displayOrder}
                        </span>
                      </td>

                      {/* 2. Agreement Title & Type */}
                      <td className="py-2.5 px-3 align-top">
                        <div className="flex items-start gap-2">
                          <div className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-amber-500/10 text-amber-900 border border-amber-300">
                            <meta.icon className="h-3.5 w-3.5" />
                          </div>
                          <div className="min-w-0">
                            <div className="font-bold text-slate-900 group-hover:text-amber-900 transition-colors">
                              {agreement.title}
                            </div>
                            <div className="flex items-center gap-1.5 mt-0.5">
                              <span className="font-mono text-[10px] text-slate-400">
                                {agreement.agreementType}
                              </span>
                              <span className="text-slate-300">•</span>
                              <span className="text-[10px] font-semibold text-amber-800">
                                {meta.group}
                              </span>
                            </div>
                          </div>
                        </div>
                      </td>

                      {/* 3. Version */}
                      <td className="py-2.5 px-3 align-top">
                        <span className="inline-block rounded-md border border-slate-200 bg-slate-50 px-2 py-0.5 font-mono text-[11px] font-bold text-slate-700">
                          {agreement.version}
                        </span>
                      </td>

                      {/* 4. Gate Rule */}
                      <td className="py-2.5 px-3 align-top">
                        {agreement.isRequired ? (
                          <span className="inline-flex items-center gap-1 rounded px-2 py-0.5 text-[10px] font-black uppercase tracking-wider bg-rose-50 text-rose-800 border border-rose-300">
                            <Lock className="h-2.5 w-2.5" />
                            Mandatory
                          </span>
                        ) : (
                          <span className="inline-flex items-center rounded px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider bg-slate-100 text-slate-600 border border-slate-200">
                            Optional
                          </span>
                        )}
                      </td>

                      {/* 5. Target Tiers */}
                      <td className="py-2.5 px-3 align-top">
                        <div className="flex flex-wrap gap-1">
                          {agreement.applicablePartnerTypes.length > 0 ? (
                            agreement.applicablePartnerTypes.map((tier) => (
                              <span
                                key={tier}
                                className="rounded bg-amber-50 px-1.5 py-0.5 text-[10px] font-bold text-amber-900 border border-amber-200"
                              >
                                {tier}
                              </span>
                            ))
                          ) : (
                            <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold text-slate-600">
                              All Partners
                            </span>
                          )}
                        </div>
                      </td>

                      {/* 6. Summary / Scope */}
                      <td className="py-2.5 px-3 align-top">
                        <p
                          className="line-clamp-2 text-[11px] text-slate-600 leading-snug max-w-[260px]"
                          title={agreement.summary || agreement.content.slice(0, 150)}
                        >
                          {agreement.summary || 'Standard terms enforced during dealer registration.'}
                        </p>
                      </td>

                      {/* 7. Status Toggle */}
                      <td className="py-2.5 px-3 align-top">
                        {canManage ? (
                          <button
                            type="button"
                            disabled={isUpdatingThis}
                            onClick={() => void togglePublished(agreement)}
                            className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11px] font-bold border transition-colors shadow-2xs ${
                              isPublished
                                ? 'bg-emerald-50 text-emerald-800 border-emerald-300 hover:bg-emerald-100'
                                : 'bg-slate-100 text-slate-600 border-slate-300 hover:bg-slate-200'
                            }`}
                            title="Click to toggle between Published and Draft"
                          >
                            <span
                              className={`h-1.5 w-1.5 rounded-full ${
                                isPublished ? 'bg-emerald-500' : 'bg-slate-400'
                              }`}
                            />
                            {isPublished ? 'Published' : 'Draft'}
                          </button>
                        ) : (
                          <span
                            className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11px] font-bold border ${
                              isPublished
                                ? 'bg-emerald-50 text-emerald-800 border-emerald-300'
                                : 'bg-slate-100 text-slate-600 border-slate-300'
                            }`}
                          >
                            <span
                              className={`h-1.5 w-1.5 rounded-full ${
                                isPublished ? 'bg-emerald-500' : 'bg-slate-400'
                              }`}
                            />
                            {isPublished ? 'Published' : 'Draft'}
                          </span>
                        )}
                      </td>

                      {/* 8. Governance Actions */}
                      <td className="py-2.5 pr-4 pl-3 align-top text-right">
                        <div className="flex items-center justify-end gap-1">
                          {/* Preview Full Text */}
                          <button
                            type="button"
                            onClick={() => setPreviewingAgreement(agreement)}
                            className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                            title="Inspect full legal text"
                          >
                            <Eye className="h-3.5 w-3.5" />
                          </button>

                          {/* Edit */}
                          {canManage && (
                            <button
                              type="button"
                              onClick={() => openEdit(agreement)}
                              className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                              title="Edit policy clauses"
                            >
                              <Pencil className="h-3.5 w-3.5" />
                            </button>
                          )}

                          {/* Delete */}
                          {canManage && (
                            <button
                              type="button"
                              onClick={() => setDeleteTarget(agreement)}
                              className="rounded p-1 text-slate-400 hover:bg-rose-50 hover:text-rose-600"
                              title="Archive from catalogue"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Table Footer */}
          <div className="border-t border-slate-200/90 bg-slate-50/70 px-4 py-2.5 text-xs text-slate-500 flex items-center justify-between">
            <span>
              Total <strong className="text-slate-900">{filteredAgreements.length}</strong> policies in current catalogue
            </span>
            <span>All accepted records are cryptographically timestamped in partner dossiers</span>
          </div>
        </div>
      ) : (
        /* ================= POLICY CARDS VIEW ================= */
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {filteredAgreements.map((agreement) => {
            const meta = getAgreementTypeMeta(agreement.agreementType);
            const isPublished = agreement.status === 'PUBLISHED';
            const isUpdatingThis = updatingId === agreement.id;

            return (
              <div
                key={agreement.id}
                className="group flex flex-col justify-between rounded-xl border border-slate-200/90 bg-white p-4 shadow-2xs hover:shadow-xs transition-shadow"
              >
                <div>
                  {/* Top: Order, Title, Version & Status */}
                  <div className="flex items-start justify-between gap-2 border-b border-slate-100 pb-3">
                    <div className="flex items-start gap-2 min-w-0">
                      <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-amber-50 text-amber-800 border border-amber-200">
                        <meta.icon className="h-4 w-4" />
                      </div>
                      <div className="min-w-0">
                        <span className="font-mono text-[10px] font-bold text-slate-400">
                          #{agreement.displayOrder} • {agreement.version}
                        </span>
                        <h4 className="font-bold text-slate-900 truncate" title={agreement.title}>
                          {agreement.title}
                        </h4>
                      </div>
                    </div>

                    <div className="shrink-0">
                      {isPublished ? (
                        <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-bold text-emerald-800 border border-emerald-300">
                          Published
                        </span>
                      ) : (
                        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-600 border border-slate-300">
                          Draft
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Summary */}
                  <p className="mt-2.5 text-xs text-slate-600 leading-relaxed line-clamp-3">
                    {agreement.summary || agreement.content.slice(0, 180)}
                  </p>

                  {/* Badges: Gate + Tiers */}
                  <div className="mt-3 flex flex-wrap items-center gap-1.5">
                    {agreement.isRequired ? (
                      <span className="inline-flex items-center gap-1 rounded bg-rose-50 px-1.5 py-0.5 text-[10px] font-black uppercase text-rose-800 border border-rose-300">
                        <Lock className="h-2.5 w-2.5" />
                        Mandatory Gate
                      </span>
                    ) : (
                      <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold text-slate-600">
                        Optional
                      </span>
                    )}

                    {agreement.applicablePartnerTypes.length > 0 ? (
                      agreement.applicablePartnerTypes.map((tier) => (
                        <span
                          key={tier}
                          className="rounded bg-amber-50 px-1.5 py-0.5 text-[10px] font-bold text-amber-900 border border-amber-200"
                        >
                          {tier}
                        </span>
                      ))
                    ) : (
                      <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold text-slate-600">
                        All Tiers
                      </span>
                    )}
                  </div>
                </div>

                {/* Card Footer Actions */}
                <div className="mt-4 flex items-center justify-between border-t border-slate-100 pt-3">
                  <button
                    type="button"
                    onClick={() => setPreviewingAgreement(agreement)}
                    className="inline-flex items-center gap-1 text-xs font-bold text-amber-800 hover:text-amber-900"
                  >
                    <Eye className="h-3.5 w-3.5" />
                    Inspect Clauses
                  </button>

                  {canManage && (
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => openEdit(agreement)}
                        className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-800"
                        title="Edit Policy"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => setDeleteTarget(agreement)}
                        className="rounded p-1 text-slate-400 hover:bg-rose-50 hover:text-rose-600"
                        title="Archive Policy"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* 5. FULL LEGAL CLAUSE PREVIEW MODAL */}
      {previewingAgreement && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 p-4 backdrop-blur-xs"
          onClick={() => setPreviewingAgreement(null)}
        >
          <div
            className="flex max-h-[90vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl animate-in fade-in zoom-in-95 duration-150"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-start justify-between gap-3 border-b border-slate-100 p-4 sm:p-5">
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-mono text-xs font-bold text-amber-800 bg-amber-50 px-2 py-0.5 rounded border border-amber-200">
                    {previewingAgreement.version}
                  </span>
                  <span className="font-mono text-xs text-slate-400">
                    {previewingAgreement.agreementType}
                  </span>
                  {previewingAgreement.isRequired && (
                    <span className="rounded bg-rose-50 text-rose-800 border border-rose-300 px-2 py-0.5 text-[10px] font-black uppercase">
                      Mandatory Gate
                    </span>
                  )}
                </div>
                <h3 className="mt-1 text-base font-bold text-slate-900">
                  {previewingAgreement.title}
                </h3>
                {previewingAgreement.summary && (
                  <p className="mt-0.5 text-xs text-slate-500">{previewingAgreement.summary}</p>
                )}
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => copyText(previewingAgreement.content, previewingAgreement.id)}
                  className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-50"
                  title="Copy legal text"
                >
                  <Copy className="h-3.5 w-3.5" />
                  <span>Copy</span>
                </button>
                <button
                  type="button"
                  onClick={() => setPreviewingAgreement(null)}
                  className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>

            {/* Content Body */}
            <div className="flex-1 overflow-y-auto p-5 text-xs text-slate-800 leading-relaxed bg-slate-50/50">
              <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-2xs">
                <pre className="whitespace-pre-wrap font-sans text-xs text-slate-800">
                  {previewingAgreement.content}
                </pre>
              </div>
            </div>

            {/* Footer */}
            <div className="flex items-center justify-between border-t border-slate-100 bg-white p-3 px-5 text-xs text-slate-500">
              <span>Display Order #{previewingAgreement.displayOrder}</span>
              <button
                type="button"
                onClick={() => setPreviewingAgreement(null)}
                className="rounded-lg bg-slate-900 px-4 py-1.5 text-xs font-bold text-white hover:bg-slate-800"
              >
                Close Preview
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 6. CREATE / EDIT AGREEMENT MODAL */}
      {isFormOpen && canManage && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 p-4 backdrop-blur-xs">
          <div className="flex max-h-[92vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl animate-in fade-in zoom-in-95 duration-150">
            {/* Modal Header */}
            <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
              <div className="flex items-center gap-2.5">
                <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-amber-100 text-amber-900">
                  <Pencil className="h-4.5 w-4.5" />
                </span>
                <div>
                  <h3 className="text-base font-bold text-slate-900">
                    {editingId ? 'Edit Partner Agreement Policy' : 'Create Partner Agreement Policy'}
                  </h3>
                  <p className="text-xs text-slate-500">
                    Define statutory clauses presented during partner KYC onboarding.
                  </p>
                </div>
              </div>

              {/* Editor vs Preview Mode Tabs */}
              <div className="flex items-center gap-2">
                <div className="inline-flex rounded-lg border border-slate-200 bg-slate-50 p-0.5 text-xs font-bold">
                  <button
                    type="button"
                    onClick={() => setFormTab('editor')}
                    className={`rounded-md px-2.5 py-1 ${
                      formTab === 'editor' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-500'
                    }`}
                  >
                    Editor
                  </button>
                  <button
                    type="button"
                    onClick={() => setFormTab('preview')}
                    className={`rounded-md px-2.5 py-1 ${
                      formTab === 'preview' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-500'
                    }`}
                  >
                    Live Preview
                  </button>
                </div>
                <button
                  type="button"
                  onClick={() => setIsFormOpen(false)}
                  className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>

            {/* Modal Body */}
            <div className="flex-1 overflow-y-auto p-5">
              {formTab === 'editor' ? (
                <form id="agreement-form" onSubmit={save} className="space-y-4">
                  <div className="grid gap-3.5 sm:grid-cols-2">
                    {/* Agreement Type */}
                    <div>
                      <label className="mb-1 block text-xs font-bold text-slate-700 uppercase tracking-wider">
                        Agreement Type Key *
                      </label>
                      <select
                        value={form.agreementType}
                        onChange={(e) => updateForm('agreementType', e.target.value)}
                        disabled={!!editingId}
                        className="w-full rounded-lg border border-slate-200 bg-slate-50/50 p-2 text-xs font-semibold text-slate-900 outline-none focus:border-amber-400 focus:bg-white focus:ring-2 focus:ring-amber-400/20 disabled:bg-slate-100 disabled:text-slate-500"
                        required
                      >
                        {availableTypes.map((type) => (
                          <option key={type} value={type}>
                            {labelForType(type)} ({type})
                          </option>
                        ))}
                      </select>
                    </div>

                    {/* Version */}
                    <div>
                      <label className="mb-1 block text-xs font-bold text-slate-700 uppercase tracking-wider">
                        Version (e.g. v1.0, v1.1) *
                      </label>
                      <input
                        type="text"
                        pattern="^v\d+\.\d+$"
                        title="Format must be v1.0, v1.1, etc."
                        required
                        value={form.version}
                        onChange={(e) => updateForm('version', e.target.value)}
                        className="w-full rounded-lg border border-slate-200 bg-slate-50/50 p-2 text-xs font-mono font-bold text-slate-900 outline-none focus:border-amber-400 focus:bg-white focus:ring-2 focus:ring-amber-400/20"
                      />
                    </div>

                    {/* Title */}
                    <div className="sm:col-span-2">
                      <label className="mb-1 block text-xs font-bold text-slate-700 uppercase tracking-wider">
                        Policy Title *
                      </label>
                      <input
                        type="text"
                        required
                        value={form.title}
                        onChange={(e) => updateForm('title', e.target.value)}
                        placeholder="e.g. Marketplace Terms & Dealership Conduct Agreement"
                        className="w-full rounded-lg border border-slate-200 bg-slate-50/50 p-2 text-xs font-semibold text-slate-900 outline-none focus:border-amber-400 focus:bg-white focus:ring-2 focus:ring-amber-400/20"
                      />
                    </div>

                    {/* Summary */}
                    <div className="sm:col-span-2">
                      <label className="mb-1 block text-xs font-bold text-slate-700 uppercase tracking-wider">
                        Executive Summary (Shown in partner onboarding overview)
                      </label>
                      <input
                        type="text"
                        value={form.summary}
                        onChange={(e) => updateForm('summary', e.target.value)}
                        placeholder="e.g. Outlines partner obligations regarding authentic listing details, media rights, and platform commission."
                        className="w-full rounded-lg border border-slate-200 bg-slate-50/50 p-2 text-xs font-semibold text-slate-900 outline-none focus:border-amber-400 focus:bg-white focus:ring-2 focus:ring-amber-400/20"
                      />
                    </div>

                    {/* Content */}
                    <div className="sm:col-span-2">
                      <div className="flex items-center justify-between mb-1">
                        <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider">
                          Full Agreement Clauses & Terms *
                        </label>
                        <span className="text-[10px] text-slate-400 font-mono">
                          {form.content.length} characters
                        </span>
                      </div>
                      <textarea
                        rows={10}
                        required
                        value={form.content}
                        onChange={(e) => updateForm('content', e.target.value)}
                        placeholder="Enter the full statutory legal agreement clauses here..."
                        className="w-full rounded-lg border border-slate-200 bg-slate-50/50 p-3 font-mono text-xs text-slate-900 outline-none focus:border-amber-400 focus:bg-white focus:ring-2 focus:ring-amber-400/20 leading-relaxed"
                      />
                    </div>

                    {/* Display Order */}
                    <div>
                      <label className="mb-1 block text-xs font-bold text-slate-700 uppercase tracking-wider">
                        Display Order (10, 20, 30...) *
                      </label>
                      <input
                        type="number"
                        min="0"
                        required
                        value={form.displayOrder}
                        onChange={(e) => updateForm('displayOrder', Number(e.target.value))}
                        className="w-full rounded-lg border border-slate-200 bg-slate-50/50 p-2 text-xs font-semibold text-slate-900 outline-none focus:border-amber-400 focus:bg-white focus:ring-2 focus:ring-amber-400/20"
                      />
                    </div>

                    {/* Effective Date */}
                    <div>
                      <label className="mb-1 block text-xs font-bold text-slate-700 uppercase tracking-wider">
                        Effective From (Optional)
                      </label>
                      <input
                        type="datetime-local"
                        value={form.effectiveFrom}
                        onChange={(e) => updateForm('effectiveFrom', e.target.value)}
                        className="w-full rounded-lg border border-slate-200 bg-slate-50/50 p-2 text-xs font-semibold text-slate-900 outline-none focus:border-amber-400 focus:bg-white focus:ring-2 focus:ring-amber-400/20"
                      />
                    </div>

                    {/* Applicable Partner Types */}
                    <div className="sm:col-span-2">
                      <label className="mb-1.5 block text-xs font-bold text-slate-700 uppercase tracking-wider">
                        Target Partner Tiers
                      </label>
                      <div className="flex flex-wrap gap-2">
                        {AVAILABLE_PARTNER_TYPES.map((type) => {
                          const checked = form.applicablePartnerTypes.includes(type.value);
                          return (
                            <button
                              key={type.value}
                              type="button"
                              onClick={() => togglePartnerType(type.value)}
                              className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-bold transition-all ${
                                checked
                                  ? 'border-amber-400 bg-amber-50 text-amber-950 ring-2 ring-amber-400/20'
                                  : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                              }`}
                            >
                              <span
                                className={`flex h-4 w-4 items-center justify-center rounded border ${
                                  checked
                                    ? 'border-amber-500 bg-amber-500 text-white'
                                    : 'border-slate-300 bg-white'
                                }`}
                              >
                                {checked && <Check className="h-3 w-3 stroke-[3]" />}
                              </span>
                              <span>{type.label}</span>
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    {/* Is Required Checkbox */}
                    <div className="sm:col-span-2 rounded-lg bg-amber-50/60 p-3 border border-amber-200/80">
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={form.isRequired}
                          onChange={(e) => updateForm('isRequired', e.target.checked)}
                          className="h-4 w-4 rounded border-amber-400 text-amber-600 focus:ring-amber-500"
                        />
                        <div>
                          <span className="text-xs font-black text-amber-950">
                            Required Gate for Partner Onboarding
                          </span>
                          <p className="text-[11px] text-amber-800">
                            When enabled, the partner must explicitly review and accept this agreement before their dealership account can be verified and approved.
                          </p>
                        </div>
                      </label>
                    </div>
                  </div>
                </form>
              ) : (
                /* Live Preview Tab */
                <div className="rounded-xl border border-slate-200 bg-slate-50/50 p-5 space-y-4">
                  <div className="border-b border-slate-200 pb-3">
                    <span className="font-mono text-xs font-bold text-amber-800 bg-amber-100 px-2 py-0.5 rounded">
                      {form.version}
                    </span>
                    <h2 className="mt-1 text-lg font-black text-slate-900">{form.title || 'Untitled Policy'}</h2>
                    {form.summary && <p className="text-xs text-slate-600 mt-0.5">{form.summary}</p>}
                  </div>
                  <div className="rounded-xl border border-slate-200 bg-white p-4 text-xs font-sans text-slate-800 leading-relaxed max-h-[350px] overflow-y-auto">
                    <pre className="whitespace-pre-wrap font-sans">
                      {form.content || 'No clauses entered yet.'}
                    </pre>
                  </div>
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="flex items-center justify-end gap-2.5 border-t border-slate-100 bg-white px-5 py-3">
              <button
                type="button"
                onClick={() => setIsFormOpen(false)}
                className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                type="submit"
                form="agreement-form"
                disabled={saving}
                className="inline-flex items-center gap-1.5 rounded-lg bg-[#FFC107] px-5 py-2 text-xs font-black text-slate-950 hover:bg-[#E5AD06] shadow-2xs disabled:opacity-50"
              >
                {saving ? 'Publishing...' : editingId ? 'Update & Publish' : 'Save & Publish Policy'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 7. ARCHIVE / DELETE CONFIRMATION MODAL */}
      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 p-4 backdrop-blur-xs">
          <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-5 shadow-2xl animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center gap-2.5 border-b border-slate-100 pb-3">
              <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-rose-100 text-rose-700">
                <Trash2 className="h-4.5 w-4.5" />
              </span>
              <div>
                <h3 className="text-sm font-bold text-slate-900">Archive Policy Agreement</h3>
                <p className="text-[11px] text-slate-500">Remove from active onboarding catalogue</p>
              </div>
            </div>

            <div className="mt-3.5 space-y-2 text-xs text-slate-600">
              <p>
                Are you sure you want to remove{' '}
                <strong className="text-slate-900 font-bold">“{deleteTarget.title}”</strong> from the active policy catalogue?
              </p>
              <div className="rounded-lg bg-amber-50 p-2.5 text-[11px] text-amber-800 border border-amber-200/80">
                <strong className="font-bold">Audit Protected:</strong> Existing partner acceptances and signed agreements in partner dossiers will remain permanently preserved for regulatory compliance.
              </div>
            </div>

            <div className="mt-5 flex items-center justify-end gap-2 border-t border-slate-100 pt-3">
              <button
                type="button"
                onClick={() => setDeleteTarget(null)}
                className="rounded-lg border border-slate-200 bg-white px-3.5 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={updatingId === deleteTarget.id}
                onClick={() => void removeAgreement(deleteTarget)}
                className="inline-flex items-center gap-1.5 rounded-lg bg-rose-600 px-4 py-1.5 text-xs font-bold text-white hover:bg-rose-700 shadow-2xs disabled:opacity-50"
              >
                {updatingId === deleteTarget.id ? 'Archiving...' : 'Archive Agreement'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
