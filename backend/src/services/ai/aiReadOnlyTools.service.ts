import { z } from 'zod';
import { KycStatus } from '@prisma/client';
import prisma from '../../lib/prisma';
import { buildCrmAccess, type CrmAccess } from '../../modules/crm/access';
import * as crmFollowUps from '../../modules/crm/services/followups.service';
import * as crmLeads from '../../modules/crm/services/leads.service';
import * as crmReports from '../../modules/crm/services/reports.service';
import { listRtoTransferTasks } from '../rtoTransfer.service';
import { isTransferTaskDone } from '../rtoTransferTasks';

export const AI_READ_ONLY_TOOL_NAMES = [
  'dashboard.summary',
  'pending.kyc',
  'hot.leads',
  'lead.statistics',
  'listing.statistics',
  'revenue.summary',
  'partner.statistics',
  'rto.pending.tasks',
  'crm.followups',
  'recruitment.summary',
  'listing.search',
  'whatsapp.activity.summary',
] as const;

export type AiReadOnlyToolName = (typeof AI_READ_ONLY_TOOL_NAMES)[number];
export type AiToolRole = 'SUPER_ADMIN' | 'ADMIN' | 'EMPLOYEE';

export type AiToolContext = {
  userId: string;
  role: AiToolRole;
  permissions: string[];
};

export type AiToolRequest = {
  name: string;
  arguments?: unknown;
};

export type AiToolDefinition = {
  name: AiReadOnlyToolName;
  label: string;
  description: string;
  available: boolean;
};

export type AiToolExecutionResult = {
  toolName: AiReadOnlyToolName;
  label: string;
  data: unknown;
};

export class AiToolError extends Error {
  constructor(
    message: string,
    public readonly statusCode = 400,
    public readonly code = 'AI_TOOL_ERROR',
  ) {
    super(message);
    this.name = 'AiToolError';
  }
}

type RangeArguments = { days?: number };
type LimitArguments = { limit?: number };
type FollowUpArguments = { owner?: 'me' | 'all' };
type ListingSearchArguments = { query: string; limit?: number };
type EmptyArguments = Record<string, never>;

export type AiReadOnlyToolDependencies = {
  dashboardSummary: (context: AiToolContext, args: RangeArguments) => Promise<unknown>;
  pendingKycCases: (context: AiToolContext, args: LimitArguments) => Promise<unknown>;
  hotLeads: (context: AiToolContext, args: LimitArguments) => Promise<unknown>;
  leadStatistics: (context: AiToolContext, args: RangeArguments) => Promise<unknown>;
  listingStatistics: (context: AiToolContext, args: RangeArguments) => Promise<unknown>;
  revenueSummary: (context: AiToolContext, args: RangeArguments) => Promise<unknown>;
  partnerStatistics: (context: AiToolContext, args: EmptyArguments) => Promise<unknown>;
  pendingRtoTasks: (context: AiToolContext, args: LimitArguments) => Promise<unknown>;
  crmFollowUps: (context: AiToolContext, args: FollowUpArguments) => Promise<unknown>;
  recruitmentSummary: (context: AiToolContext, args: EmptyArguments) => Promise<unknown>;
  listingSearch: (context: AiToolContext, args: ListingSearchArguments) => Promise<unknown>;
  whatsappActivitySummary: (context: AiToolContext, args: RangeArguments) => Promise<unknown>;
};

type PermissionedDefinition = AiToolDefinition & {
  permissions: readonly string[];
  schema: z.ZodTypeAny;
  execute: (dependencies: AiReadOnlyToolDependencies, context: AiToolContext, args: unknown) => Promise<unknown>;
};

const emptyArguments = z.object({}).strict();
const rangeArguments = z.object({
  days: z.number().int().min(1).max(90).optional(),
}).strict();
const limitArguments = z.object({
  limit: z.number().int().min(1).max(20).optional(),
}).strict();
const followUpArguments = z.object({
  owner: z.enum(['me', 'all']).optional(),
}).strict();
const listingSearchArguments = z.object({
  query: z.string().trim().min(1).max(100),
  limit: z.number().int().min(1).max(20).optional(),
}).strict();

const CRM_READ_PERMISSIONS = ['crm.read', 'crm.manage', 'crm.manage_all', 'crm.assign', 'enquiries.manage'] as const;
const CRM_REPORT_PERMISSIONS = ['crm.reports', 'crm.manage', 'crm.manage_all', 'enquiries.manage'] as const;
const FINANCE_READ_PERMISSIONS = [
  'finance.read',
  'finance.manage',
  'fh.dashboard.read',
  'fh.reports.read',
  'accounts.sell.read',
  'accounts.sell.crud',
] as const;

const definitions: PermissionedDefinition[] = [
  {
    name: 'dashboard.summary',
    label: 'Dashboard summary',
    description: 'Aggregated operational KPIs for the internal dashboard.',
    permissions: ['dashboard.view'],
    available: false,
    schema: rangeArguments,
    execute: (dependencies, context, args) => dependencies.dashboardSummary(context, args as RangeArguments),
  },
  {
    name: 'pending.kyc',
    label: 'Pending KYC cases',
    description: 'Pending KYC counts and non-contact case summaries.',
    permissions: ['kyc.manage', 'kyc.edit.override'],
    available: false,
    schema: limitArguments,
    execute: (dependencies, context, args) => dependencies.pendingKycCases(context, args as LimitArguments),
  },
  {
    name: 'hot.leads',
    label: 'Hot leads',
    description: 'Scoped hot lead signals without customer contact details.',
    permissions: CRM_READ_PERMISSIONS,
    available: false,
    schema: limitArguments,
    execute: (dependencies, context, args) => dependencies.hotLeads(context, args as LimitArguments),
  },
  {
    name: 'lead.statistics',
    label: 'Lead statistics',
    description: 'Scoped lead funnel, source, trend, and follow-up statistics.',
    permissions: CRM_REPORT_PERMISSIONS,
    available: false,
    schema: rangeArguments,
    execute: (dependencies, context, args) => dependencies.leadStatistics(context, args as RangeArguments),
  },
  {
    name: 'listing.statistics',
    label: 'Listing statistics',
    description: 'Aggregated listing counts, statuses, views, and pricing signals.',
    permissions: ['listings.read', 'partners.read', 'kyc.manage'],
    available: false,
    schema: rangeArguments,
    execute: (dependencies, context, args) => dependencies.listingStatistics(context, args as RangeArguments),
  },
  {
    name: 'revenue.summary',
    label: 'Revenue summary',
    description: 'Aggregated sales and margin figures from the existing finance records.',
    permissions: FINANCE_READ_PERMISSIONS,
    available: false,
    schema: rangeArguments,
    execute: (dependencies, context, args) => dependencies.revenueSummary(context, args as RangeArguments),
  },
  {
    name: 'partner.statistics',
    label: 'Partner statistics',
    description: 'Aggregated partner, account, onboarding, and KYC status counts.',
    permissions: ['partners.read', 'MANAGE_PARTNERS'],
    available: false,
    schema: emptyArguments,
    execute: (dependencies, context, args) => dependencies.partnerStatistics(context, args as EmptyArguments),
  },
  {
    name: 'rto.pending.tasks',
    label: 'RTO pending tasks',
    description: 'Pending RTO checklist counts grouped by task and status.',
    permissions: ['accounts.rto.read', 'accounts.rto.crud', 'tasks.read'],
    available: false,
    schema: limitArguments,
    execute: (dependencies, context, args) => dependencies.pendingRtoTasks(context, args as LimitArguments),
  },
  {
    name: 'crm.followups',
    label: 'CRM follow-ups',
    description: 'Scoped follow-up counts for overdue, today, upcoming, done, and missed work.',
    permissions: CRM_READ_PERMISSIONS,
    available: false,
    schema: followUpArguments,
    execute: (dependencies, context, args) => dependencies.crmFollowUps(context, args as FollowUpArguments),
  },
  {
    name: 'recruitment.summary',
    label: 'Recruitment summary',
    description: 'Recruitment pipeline and hiring workload counts without candidate PII.',
    permissions: ['recruitment.dashboard.read'],
    available: false,
    schema: emptyArguments,
    execute: (dependencies, context, args) => dependencies.recruitmentSummary(context, args as EmptyArguments),
  },
  {
    name: 'listing.search',
    label: 'Listing search',
    description: 'Searches published, reserved, or paused inventory through the CRM service scope.',
    permissions: ['crm.manage', 'crm.manage_all', 'enquiries.manage'],
    available: false,
    schema: listingSearchArguments,
    execute: (dependencies, context, args) => dependencies.listingSearch(context, args as ListingSearchArguments),
  },
  {
    name: 'whatsapp.activity.summary',
    label: 'WhatsApp activity summary',
    description: 'Aggregated WhatsApp delivery activity without recipient contact data.',
    permissions: ['whatsapp.read', 'whatsapp.manage'],
    available: false,
    schema: rangeArguments,
    execute: (dependencies, context, args) => dependencies.whatsappActivitySummary(context, args as RangeArguments),
  },
];

const hasPermission = (context: AiToolContext, permissions: readonly string[]) =>
  context.role === 'SUPER_ADMIN'
  || context.role === 'ADMIN'
  || context.permissions.includes('ALL_ACCESS')
  || permissions.some((permission) => context.permissions.includes(permission));

const definitionFor = (name: string) => definitions.find((definition) => definition.name === name);

const crmAccessFor = (context: AiToolContext): CrmAccess =>
  buildCrmAccess(context.userId, context.role, context.permissions);

const daysBack = (days = 30) => {
  const safeDays = Math.min(90, Math.max(1, Math.floor(days)));
  return new Date(Date.now() - safeDays * 24 * 60 * 60 * 1000);
};

const numeric = (value: unknown) => {
  if (value && typeof value === 'object' && 'toNumber' in value && typeof value.toNumber === 'function') {
    return Number(value.toNumber());
  }
  return Number(value || 0);
};

const asRecord = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};

const safeLead = (value: unknown) => {
  const lead = asRecord(value);
  return {
    leadId: typeof lead.id === 'string' ? lead.id : null,
    status: typeof lead.status === 'string' ? lead.status : null,
    leadType: typeof lead.leadType === 'string' ? lead.leadType : null,
    source: typeof lead.source === 'string' ? lead.source : null,
    priority: typeof lead.priority === 'string' ? lead.priority : null,
    temperature: typeof lead.temperature === 'string' ? lead.temperature : null,
    score: typeof lead.score === 'number' ? lead.score : 0,
    listingTitle: typeof lead.listingTitleSnapshot === 'string' ? lead.listingTitleSnapshot : null,
    requirementCity: typeof lead.requirementCity === 'string' ? lead.requirementCity : null,
    requirementState: typeof lead.requirementState === 'string' ? lead.requirementState : null,
    createdAt: lead.createdAt instanceof Date ? lead.createdAt.toISOString() : lead.createdAt ?? null,
    nextFollowUpAt: lead.nextFollowUpAt instanceof Date ? lead.nextFollowUpAt.toISOString() : lead.nextFollowUpAt ?? null,
  };
};

const defaultDependencies: AiReadOnlyToolDependencies = {
  async dashboardSummary(_context, args) {
    const from = daysBack(args.days);
    const [partners, activePartners, pendingKyc, listings, publishedListings, newListings, leads, hotLeads, pendingRtoTasks, pendingFollowUps] = await Promise.all([
      prisma.partnerProfile.count(),
      prisma.partnerProfile.count({ where: { accountStatus: 'ACTIVE' } }),
      prisma.partnerProfile.count({ where: { kycStatus: { in: ['SUBMITTED', 'UNDER_REVIEW', 'CHANGES_REQUESTED'] } } }),
      prisma.listing.count(),
      prisma.listing.count({ where: { status: 'PUBLISHED' } }),
      prisma.listing.count({ where: { createdAt: { gte: from } } }),
      prisma.lead.count({ where: { mergedIntoId: null } }),
      prisma.lead.count({ where: { mergedIntoId: null, temperature: 'HOT', status: { notIn: ['WON', 'LOST'] } } }),
      prisma.rtoTransferTask.count({ where: { status: { notIn: ['TRANSFERRED', 'NOT_REQUIRED'] } } }),
      prisma.crmFollowUp.count({ where: { status: 'PENDING' } }),
    ]);
    return {
      periodDays: Math.min(90, Math.max(1, Math.floor(args.days ?? 30))),
      partners: { total: partners, active: activePartners, pendingKyc },
      listings: { total: listings, published: publishedListings, createdInPeriod: newListings },
      crm: { totalLeads: leads, hotLeads, pendingFollowUps },
      rto: { pendingTasks: pendingRtoTasks },
    };
  },

  async pendingKycCases(_context, args) {
    const limit = Math.min(20, Math.max(1, Math.floor(args.limit ?? 10)));
    const where = { kycStatus: { in: [KycStatus.SUBMITTED, KycStatus.UNDER_REVIEW, KycStatus.CHANGES_REQUESTED] } };
    const [total, rows] = await Promise.all([
      prisma.partnerProfile.count({ where }),
      prisma.partnerProfile.findMany({
        where,
        orderBy: { updatedAt: 'asc' },
        take: limit,
        select: { id: true, businessName: true, partnerType: true, kycStatus: true, onboardingStatus: true, updatedAt: true },
      }),
    ]);
    return {
      total,
      items: rows.map((row) => ({
        caseId: row.id,
        businessName: row.businessName || 'Unnamed partner',
        partnerType: row.partnerType,
        kycStatus: row.kycStatus,
        onboardingStatus: row.onboardingStatus,
        updatedAt: row.updatedAt.toISOString(),
      })),
    };
  },

  async hotLeads(context, args) {
    const access = crmAccessFor(context);
    if (!access.canRead) throw new AiToolError('You do not have CRM read permission for hot leads.', 403, 'AI_TOOL_PERMISSION_REQUIRED');
    const limit = Math.min(20, Math.max(1, Math.floor(args.limit ?? 10)));
    const result = await crmLeads.listLeads(access, { temperature: 'HOT', view: 'open', sort: 'score', page: '1', pageSize: String(limit) });
    return { total: result.total, items: result.items.map(safeLead) };
  },

  async leadStatistics(context, args) {
    const access = crmAccessFor(context);
    if (!access.canReports) throw new AiToolError('You do not have CRM reports permission for lead statistics.', 403, 'AI_TOOL_PERMISSION_REQUIRED');
    const days = Math.min(90, Math.max(1, Math.floor(args.days ?? 30)));
    const to = new Date();
    const from = daysBack(days);
    const result = await crmReports.getReports(access, { from: from.toISOString(), to: to.toISOString() });
    return {
      range: result.range,
      totals: result.totals,
      funnel: result.funnel,
      bySource: result.bySource,
      byType: result.byType,
      aging: result.aging,
      followUpCompliance: result.followUpCompliance,
      trend: result.trend,
    };
  },

  async listingStatistics(_context, args) {
    const from = daysBack(args.days);
    const [total, createdInPeriod, byStatus, price, views] = await Promise.all([
      prisma.listing.count(),
      prisma.listing.count({ where: { createdAt: { gte: from } } }),
      prisma.listing.groupBy({ by: ['status'], _count: { _all: true } }),
      prisma.listing.aggregate({ _avg: { price: true }, _sum: { views: true } }),
      prisma.listing.aggregate({ where: { createdAt: { gte: from } }, _sum: { views: true } }),
    ]);
    return {
      periodDays: Math.min(90, Math.max(1, Math.floor(args.days ?? 30))),
      total,
      createdInPeriod,
      byStatus: byStatus.map((row) => ({ status: row.status, count: row._count._all })),
      averagePrice: numeric(price._avg.price),
      totalViews: views._sum.views ?? 0,
      viewsInPeriod: views._sum.views ?? 0,
    };
  },

  async revenueSummary(_context, args) {
    const from = daysBack(args.days);
    const dealWhere = { deletedAt: null, isDraft: false, createdAt: { gte: from } };
    const [transactions, deals, dealTotals, byStatus] = await Promise.all([
      prisma.financeTransaction.groupBy({
        by: ['type'],
        where: { status: { not: 'VOIDED' }, transactionDate: { gte: from } },
        _sum: { amount: true },
        _count: { _all: true },
      }),
      prisma.sellAccount.count({ where: dealWhere }),
      prisma.sellAccount.aggregate({ where: dealWhere, _sum: { sellAmount: true, purchaseAmount: true, expenses: true, netProfitAfterGst: true } }),
      prisma.sellAccount.groupBy({ by: ['dealStatus'], where: dealWhere, _count: { _all: true } }),
    ]);
    const totalRevenue = numeric(transactions.find((row) => row.type === 'CREDIT')?._sum.amount);
    const totalExpenses = numeric(transactions.find((row) => row.type === 'DEBIT')?._sum.amount);
    return {
      periodDays: Math.min(90, Math.max(1, Math.floor(args.days ?? 30))),
      deals,
      totals: {
        revenue: totalRevenue,
        expenses: totalExpenses,
        netProfit: totalRevenue - totalExpenses,
        dealVolume: numeric(dealTotals._sum.sellAmount),
        dealPurchases: numeric(dealTotals._sum.purchaseAmount),
        dealExpenses: numeric(dealTotals._sum.expenses),
        dealProfitAfterGst: numeric(dealTotals._sum.netProfitAfterGst),
      },
      byStatus: byStatus.map((row) => ({ status: row.dealStatus, count: row._count._all })),
      transactionCounts: transactions.map((row) => ({ type: row.type, count: row._count._all })),
    };
  },

  async partnerStatistics() {
    const [total, byAccount, byKyc, byType, byOnboarding] = await Promise.all([
      prisma.partnerProfile.count(),
      prisma.partnerProfile.groupBy({ by: ['accountStatus'], _count: { _all: true } }),
      prisma.partnerProfile.groupBy({ by: ['kycStatus'], _count: { _all: true } }),
      prisma.partnerProfile.groupBy({ by: ['partnerType'], _count: { _all: true } }),
      prisma.partnerProfile.groupBy({ by: ['onboardingStatus'], _count: { _all: true } }),
    ]);
    return {
      total,
      byAccountStatus: byAccount.map((row) => ({ status: row.accountStatus, count: row._count._all })),
      byKycStatus: byKyc.map((row) => ({ status: row.kycStatus, count: row._count._all })),
      byPartnerType: byType.map((row) => ({ type: row.partnerType, count: row._count._all })),
      byOnboardingStatus: byOnboarding.map((row) => ({ status: row.onboardingStatus, count: row._count._all })),
    };
  },

  async pendingRtoTasks(_context, args) {
    const limit = Math.min(20, Math.max(1, Math.floor(args.limit ?? 10)));
    const tasks = await listRtoTransferTasks();
    const pending = tasks.filter((task) => !isTransferTaskDone(task.status));
    const statusCounts = new Map<string, number>();
    const labelCounts = new Map<string, number>();
    for (const task of pending) {
      statusCounts.set(task.status, (statusCounts.get(task.status) ?? 0) + 1);
      labelCounts.set(task.label, (labelCounts.get(task.label) ?? 0) + 1);
    }
    return {
      pendingCount: pending.length,
      byStatus: [...statusCounts].map(([status, count]) => ({ status, count })),
      byTask: [...labelCounts].map(([task, count]) => ({ task, count })).slice(0, limit),
    };
  },

  async crmFollowUps(context, args) {
    const access = crmAccessFor(context);
    if (!access.canRead) throw new AiToolError('You do not have CRM read permission for follow-ups.', 403, 'AI_TOOL_PERMISSION_REQUIRED');
    return crmFollowUps.followUpSummary(access, args.owner === 'me' ? 'me' : '');
  },

  async recruitmentSummary() {
    const [activeJobs, totalApplications, newApplications, underReview, interviewsScheduled, selectedCandidates, offersSent, hiredCandidates, applicationsByStage] = await Promise.all([
      prisma.job.count({ where: { status: 'PUBLISHED' } }),
      prisma.jobApplication.count(),
      prisma.jobApplication.count({ where: { currentStage: 'NEW' } }),
      prisma.jobApplication.count({ where: { currentStage: 'UNDER_REVIEW' } }),
      prisma.interview.count({ where: { status: 'SCHEDULED' } }),
      prisma.jobApplication.count({ where: { currentStage: 'SELECTED' } }),
      prisma.offer.count({ where: { status: 'SENT' } }),
      prisma.jobApplication.count({ where: { currentStage: 'HIRED' } }),
      prisma.jobApplication.groupBy({ by: ['currentStage'], _count: { _all: true } }),
    ]);
    return {
      stats: { activeJobs, totalApplications, newApplications, underReview, interviewsScheduled, selectedCandidates, offersSent, hiredCandidates },
      pipeline: applicationsByStage.map((row) => ({ stage: row.currentStage, count: row._count._all })),
    };
  },

  async listingSearch(context, args) {
    const access = crmAccessFor(context);
    if (!access.canManage) throw new AiToolError('You do not have CRM listing-search permission.', 403, 'AI_TOOL_PERMISSION_REQUIRED');
    const result = await crmLeads.searchInventory(access, { q: args.query });
    return result.slice(0, Math.min(20, Math.max(1, Math.floor(args.limit ?? 10))));
  },

  async whatsappActivitySummary(_context, args) {
    const from = daysBack(args.days);
    const [total, sent, delivered, failed, byEvent] = await Promise.all([
      prisma.whatsAppMessageLog.count({ where: { createdAt: { gte: from } } }),
      prisma.whatsAppMessageLog.count({ where: { createdAt: { gte: from }, status: { in: ['SENT', 'DELIVERED', 'READ'] } } }),
      prisma.whatsAppMessageLog.count({ where: { createdAt: { gte: from }, status: { in: ['DELIVERED', 'READ'] } } }),
      prisma.whatsAppMessageLog.count({ where: { createdAt: { gte: from }, status: 'FAILED' } }),
      prisma.whatsAppMessageLog.groupBy({ by: ['eventCode'], where: { createdAt: { gte: from } }, _count: { _all: true }, orderBy: { _count: { eventCode: 'desc' } }, take: 10 }),
    ]);
    return {
      periodDays: Math.min(90, Math.max(1, Math.floor(args.days ?? 30))),
      total,
      sent,
      delivered,
      failed,
      byEvent: byEvent.map((row) => ({ event: row.eventCode, count: row._count._all })),
    };
  },
};

export class AiReadOnlyToolsService {
  constructor(private readonly dependencies: AiReadOnlyToolDependencies = defaultDependencies) {}

  listTools(context: AiToolContext): AiToolDefinition[] {
    return definitions.map((definition) => ({
      name: definition.name,
      label: definition.label,
      description: definition.description,
      available: hasPermission(context, definition.permissions),
    }));
  }

  async execute(context: AiToolContext, request: AiToolRequest): Promise<AiToolExecutionResult> {
    const definition = definitionFor(request.name);
    if (!definition) throw new AiToolError('This read-only AI tool is not available.', 400, 'AI_TOOL_NOT_AVAILABLE');
    if (!hasPermission(context, definition.permissions)) {
      throw new AiToolError('You do not have permission to use this AI tool.', 403, 'AI_TOOL_PERMISSION_REQUIRED');
    }
    const parsed = definition.schema.safeParse(request.arguments ?? {});
    if (!parsed.success) throw new AiToolError('The AI tool arguments are not valid.', 400, 'AI_TOOL_ARGUMENTS_INVALID');
    return {
      toolName: definition.name,
      label: definition.label,
      data: await definition.execute(this.dependencies, context, parsed.data),
    };
  }
}

export const aiReadOnlyToolsService = new AiReadOnlyToolsService();
