import { z } from 'zod';
import { KycStatus, Prisma } from '@prisma/client';
import prisma from '../../lib/prisma';
import { buildCrmAccess, followUpScopeWhere, leadScopeWhere, type CrmAccess } from '../../modules/crm/access';
import { contactScopeWhere } from '../../modules/crm/services/contacts.service';
import * as crmFollowUps from '../../modules/crm/services/followups.service';
import * as crmLeads from '../../modules/crm/services/leads.service';
import * as crmReports from '../../modules/crm/services/reports.service';
import { listRtoTransferTasks } from '../rtoTransfer.service';
import { isTransferTaskDone } from '../rtoTransferTasks';
import { findVehicleIdentityMatches, toVehicleIdentityKey } from '../listingVehicleIdentity';
import { aiForecastingService, type ForecastArguments } from './aiForecasting.service';
import {
  aiToolObservabilityService,
  type AiToolDataAvailability,
  type AiToolExecutionAuditEvent,
  type AiToolExecutionObservability,
} from './aiToolObservability.service';
import { moduleForAiTool } from './aiReliabilityObservability.service';
import {
  createAiDataContract,
  createAiDataErrorContractForCode,
  type AiDataContract,
} from './aiDataContract.service';
import { sanitizeAiToolData } from './aiFieldSecurity.service';

export type { AiToolExecutionObservability } from './aiToolObservability.service';

export const AI_READ_ONLY_TOOL_NAMES = [
  'dashboard.summary',
  'pending.kyc',
  'hot.leads',
  'crm.leads.summary',
  'crm.lead.detail',
  'customer.summary',
  'customer.detail',
  'enquiry.summary',
  'enquiry.detail',
  'tasks.summary',
  'lead.statistics',
  'listing.summary',
  'listing.statistics',
  'listing.detail',
  'vehicle.identity',
  'sold.vehicles',
  'inventory.trend',
  'revenue.summary',
  'partner.statistics',
  'partner.performance',
  'finance.trend',
  'finance.workspace.summary',
  'invoice.summary',
  'payment.summary',
  'margin.summary',
  'wallet.summary',
  'api.billing.summary',
  'sell.accounts.summary',
  'refund.summary',
  'accounting.summary',
  'journal.summary',
  'categories.summary',
  'brands.summary',
  'models.summary',
  'locations.summary',
  'blogs.summary',
  'translations.summary',
  'settings.summary',
  'users.summary',
  'roles.summary',
  'subscriptions.summary',
  'forecast.operations',
  'rto.pending.tasks',
  'rto.documents.summary',
  'crm.followups',
  'recruitment.summary',
  'listing.search',
  'whatsapp.activity.summary',
  'verification.summary',
  'surepass.status',
  'whatsapp.status',
  'whatsapp.campaigns.summary',
  'communication.delivery.summary',
  'sms.activity.summary',
  'notifications.summary',
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
  contract: AiDataContract<unknown>;
  dataAvailability?: AiToolDataAvailability;
  dataAvailabilityMessage?: string;
  durationMs?: number;
};

export class AiToolError extends Error {
  constructor(
    message: string,
    public readonly statusCode = 400,
    public readonly code = 'AI_TOOL_ERROR',
    public readonly contract: AiDataContract<null> = createAiDataErrorContractForCode(code),
  ) {
    super(message);
    this.name = 'AiToolError';
  }
}

type RangeArguments = { days?: number };
type LimitArguments = { limit?: number };
type FollowUpArguments = { owner?: 'me' | 'all' };
type LeadSummaryArguments = { limit?: number; view?: 'all' | 'open' | 'closed' | 'won' | 'lost' };
type LeadDetailArguments = { leadId?: string; query?: string };
type CustomerDetailArguments = { customerId?: string; query?: string };
type ListingSearchArguments = { query: string; limit?: number };
type ListingSummaryArguments = { limit?: number; status?: 'DRAFT' | 'PENDING_APPROVAL' | 'CHANGES_REQUESTED' | 'PUBLISHED' | 'PAUSED' | 'RESERVED' | 'SOLD' | 'REJECTED' | 'UNLISTED' | 'SUSPENDED' | 'BLOCKED' };
type ListingDetailArguments = {
  listingId?: string;
  query?: string;
  invoiceNumber?: string;
  partnerCode?: string;
};
type RangeLimitArguments = { days?: number; limit?: number };
type ModelSummaryArguments = RangeLimitArguments & { brandId?: string };
type PartnerPerformanceArguments = RangeLimitArguments & { partnerId?: string; partnerCode?: string };
type VehicleIdentityArguments = { listingId?: string; query?: string };
type EmptyArguments = Record<string, never>;

export type AiReadOnlyToolDependencies = {
  dashboardSummary: (context: AiToolContext, args: RangeArguments) => Promise<unknown>;
  pendingKycCases: (context: AiToolContext, args: LimitArguments) => Promise<unknown>;
  hotLeads: (context: AiToolContext, args: LimitArguments) => Promise<unknown>;
  crmLeadsSummary: (context: AiToolContext, args: LeadSummaryArguments) => Promise<unknown>;
  crmLeadDetail: (context: AiToolContext, args: LeadDetailArguments) => Promise<unknown>;
  customerSummary: (context: AiToolContext, args: LimitArguments) => Promise<unknown>;
  customerDetail: (context: AiToolContext, args: CustomerDetailArguments) => Promise<unknown>;
  enquirySummary: (context: AiToolContext, args: LeadSummaryArguments) => Promise<unknown>;
  enquiryDetail: (context: AiToolContext, args: LeadDetailArguments) => Promise<unknown>;
  tasksSummary: (context: AiToolContext, args: LimitArguments) => Promise<unknown>;
  leadStatistics: (context: AiToolContext, args: RangeArguments) => Promise<unknown>;
  listingSummary: (context: AiToolContext, args: ListingSummaryArguments) => Promise<unknown>;
  listingStatistics: (context: AiToolContext, args: RangeArguments) => Promise<unknown>;
  listingDetail: (context: AiToolContext, args: ListingDetailArguments) => Promise<unknown>;
  vehicleIdentity: (context: AiToolContext, args: VehicleIdentityArguments) => Promise<unknown>;
  soldVehicles: (context: AiToolContext, args: RangeLimitArguments) => Promise<unknown>;
  inventoryTrend: (context: AiToolContext, args: RangeArguments) => Promise<unknown>;
  revenueSummary: (context: AiToolContext, args: RangeArguments) => Promise<unknown>;
  partnerStatistics: (context: AiToolContext, args: EmptyArguments) => Promise<unknown>;
  partnerPerformance: (context: AiToolContext, args: PartnerPerformanceArguments) => Promise<unknown>;
  financeTrend: (context: AiToolContext, args: RangeArguments) => Promise<unknown>;
  financeWorkspaceSummary: (context: AiToolContext, args: RangeLimitArguments) => Promise<unknown>;
  invoiceSummary: (context: AiToolContext, args: RangeLimitArguments) => Promise<unknown>;
  paymentSummary: (context: AiToolContext, args: RangeLimitArguments) => Promise<unknown>;
  marginSummary: (context: AiToolContext, args: RangeLimitArguments) => Promise<unknown>;
  walletSummary: (context: AiToolContext, args: RangeLimitArguments) => Promise<unknown>;
  apiBillingSummary: (context: AiToolContext, args: RangeLimitArguments) => Promise<unknown>;
  sellAccountsSummary: (context: AiToolContext, args: RangeLimitArguments) => Promise<unknown>;
  refundSummary: (context: AiToolContext, args: RangeLimitArguments) => Promise<unknown>;
  accountingSummary: (context: AiToolContext, args: RangeLimitArguments) => Promise<unknown>;
  journalSummary: (context: AiToolContext, args: RangeLimitArguments) => Promise<unknown>;
  categoriesSummary: (context: AiToolContext, args: RangeLimitArguments) => Promise<unknown>;
  brandsSummary: (context: AiToolContext, args: RangeLimitArguments) => Promise<unknown>;
  modelsSummary: (context: AiToolContext, args: ModelSummaryArguments) => Promise<unknown>;
  locationsSummary: (context: AiToolContext, args: RangeLimitArguments) => Promise<unknown>;
  blogsSummary: (context: AiToolContext, args: RangeLimitArguments) => Promise<unknown>;
  translationsSummary: (context: AiToolContext, args: RangeLimitArguments) => Promise<unknown>;
  settingsSummary: (context: AiToolContext, args: RangeLimitArguments) => Promise<unknown>;
  usersSummary: (context: AiToolContext, args: RangeLimitArguments) => Promise<unknown>;
  rolesSummary: (context: AiToolContext, args: RangeLimitArguments) => Promise<unknown>;
  subscriptionsSummary: (context: AiToolContext, args: RangeLimitArguments) => Promise<unknown>;
  forecastOperations: (context: AiToolContext, args: ForecastArguments) => Promise<unknown>;
  pendingRtoTasks: (context: AiToolContext, args: LimitArguments) => Promise<unknown>;
  rtoDocumentsSummary: (context: AiToolContext, args: RangeLimitArguments) => Promise<unknown>;
  crmFollowUps: (context: AiToolContext, args: FollowUpArguments) => Promise<unknown>;
  recruitmentSummary: (context: AiToolContext, args: EmptyArguments) => Promise<unknown>;
  listingSearch: (context: AiToolContext, args: ListingSearchArguments) => Promise<unknown>;
  whatsappActivitySummary: (context: AiToolContext, args: RangeArguments) => Promise<unknown>;
  verificationSummary: (context: AiToolContext, args: RangeArguments) => Promise<unknown>;
  surepassStatus: (context: AiToolContext, args: EmptyArguments) => Promise<unknown>;
  whatsappStatus: (context: AiToolContext, args: RangeArguments) => Promise<unknown>;
  whatsappCampaignsSummary: (context: AiToolContext, args: RangeArguments) => Promise<unknown>;
  communicationDeliverySummary: (context: AiToolContext, args: RangeArguments) => Promise<unknown>;
  smsActivitySummary: (context: AiToolContext, args: RangeArguments) => Promise<unknown>;
  notificationsSummary: (context: AiToolContext, args: RangeArguments) => Promise<unknown>;
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
const leadSummaryArguments = z.object({
  limit: z.number().int().min(1).max(20).optional(),
  view: z.enum(['all', 'open', 'closed', 'won', 'lost']).optional(),
}).strict();
const leadDetailArguments = z.object({
  leadId: z.string().uuid().optional(),
  query: z.string().trim().min(1).max(100).optional(),
}).strict().refine((value) => Boolean(value.leadId || value.query), {
  message: 'Provide a lead ID or a lead search query.',
});
const customerDetailArguments = z.object({
  customerId: z.string().uuid().optional(),
  query: z.string().trim().min(1).max(100).optional(),
}).strict().refine((value) => Boolean(value.customerId || value.query), {
  message: 'Provide a customer ID or a customer search query.',
});
const listingSearchArguments = z.object({
  query: z.string().trim().min(1).max(100),
  limit: z.number().int().min(1).max(20).optional(),
}).strict();
const listingSummaryArguments = z.object({
  limit: z.number().int().min(1).max(20).optional(),
  status: z.enum(['DRAFT', 'PENDING_APPROVAL', 'CHANGES_REQUESTED', 'PUBLISHED', 'PAUSED', 'RESERVED', 'SOLD', 'REJECTED', 'UNLISTED', 'SUSPENDED', 'BLOCKED']).optional(),
}).strict();
const listingDetailArguments = z.object({
  listingId: z.string().uuid().optional(),
  query: z.string().trim().min(1).max(100).optional(),
  invoiceNumber: z.string().trim().min(3).max(100).optional(),
  partnerCode: z.string().trim().min(2).max(100).optional(),
}).strict().refine((value) => Boolean(value.listingId || value.query || value.invoiceNumber || value.partnerCode), {
  message: 'Provide a listing ID, invoice number, partner code, or search query.',
});
const vehicleIdentityArguments = z.object({
  listingId: z.string().uuid().optional(),
  query: z.string().trim().min(1).max(100).optional(),
}).strict().refine((value) => Boolean(value.listingId || value.query), {
  message: 'Provide a listing ID or vehicle search query.',
});
const rangeLimitArguments = z.object({
  days: z.number().int().min(1).max(90).optional(),
  limit: z.number().int().min(1).max(20).optional(),
}).strict();
const modelSummaryArguments = rangeLimitArguments.extend({
  brandId: z.string().uuid().optional(),
});
const partnerPerformanceArguments = rangeLimitArguments.extend({
  partnerId: z.string().uuid().optional(),
  partnerCode: z.string().trim().min(2).max(100).optional(),
});
const forecastArguments = z.object({
  metric: z.enum(['sales', 'inventory', 'finance', 'leads', 'kyc', 'partners', 'collections']).optional(),
  days: z.number().int().min(7).max(90).optional(),
  horizon: z.number().int().min(1).max(30).optional(),
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
const FINANCE_HUB_READ_PERMISSIONS = [
  'finance.read',
  'finance.manage',
  'fh.dashboard.read',
  'fh.reports.read',
  'fh.books.read',
  'fh.sales.read',
  'fh.purchases.read',
  'fh.arap.read',
  'fh.banking.read',
  'accounts.sell.read',
  'accounts.sell.crud',
] as const;
const MASTER_DATA_READ_PERMISSIONS = ['categories.read', 'brands.read', 'listings.read', 'analytics.read'] as const;
const CONTENT_READ_PERMISSIONS = ['blog.read', 'translations.manage'] as const;
const SETTINGS_READ_PERMISSIONS = ['settings.manage'] as const;
const USER_ROLE_READ_PERMISSIONS = ['users.read', 'roles.read', 'MANAGE_ADMINS'] as const;
const SUBSCRIPTION_READ_PERMISSIONS = ['visitors.read', 'finance.read', 'finance.manage'] as const;
const LISTING_READ_PERMISSIONS = ['listings.read', 'partners.read', 'kyc.manage'] as const;
const VEHICLE_IDENTITY_PERMISSIONS = ['listings.read', 'partners.read', 'kyc.manage'] as const;
const RTO_DOCUMENTS_PERMISSIONS = ['accounts.rto.read', 'accounts.rto.crud', 'tasks.read'] as const;
const SOLD_VEHICLE_PERMISSIONS = ['listings.read', 'accounts.sell.read', 'accounts.sell.crud', ...FINANCE_READ_PERMISSIONS] as const;
const PARTNER_READ_PERMISSIONS = ['partners.read', 'MANAGE_PARTNERS'] as const;
const FORECAST_ACCESS_PERMISSIONS = [...LISTING_READ_PERMISSIONS, ...FINANCE_READ_PERMISSIONS, ...CRM_REPORT_PERMISSIONS, ...PARTNER_READ_PERMISSIONS, 'kyc.manage'] as const;
const VERIFICATION_READ_PERMISSIONS = [
  'pan.verification.read',
  'gst.verification.read',
  'aadhaar.digilocker.read',
  'driving-license.verification.read',
  'rc.owner-history.read',
  'rc.challan.verification.read',
  'rc.chassis-to-rc.read',
  'rc.to-mobile.read',
] as const;
const COMMUNICATION_READ_PERMISSIONS = ['whatsapp.read', 'whatsapp.manage', 'sms.read', 'sms.manage'] as const;
const CUSTOMER_READ_PERMISSIONS = ['visitors.read', ...CRM_READ_PERMISSIONS] as const;
const TASKS_READ_PERMISSIONS = [
  'tasks.read',
  'accounts.rto.read',
  'accounts.rto.crud',
  ...CRM_READ_PERMISSIONS,
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
    name: 'crm.leads.summary',
    label: 'CRM lead summary',
    description: 'Returns scoped CRM lead totals, status counts, and safe lead rows for list questions.',
    permissions: CRM_READ_PERMISSIONS,
    available: false,
    schema: leadSummaryArguments,
    execute: (dependencies, context, args) => dependencies.crmLeadsSummary(context, args as LeadSummaryArguments),
  },
  {
    name: 'crm.lead.detail',
    label: 'CRM lead detail',
    description: 'Returns a specific scoped lead and related listing details without contact PII.',
    permissions: CRM_READ_PERMISSIONS,
    available: false,
    schema: leadDetailArguments,
    execute: (dependencies, context, args) => dependencies.crmLeadDetail(context, args as LeadDetailArguments),
  },
  {
    name: 'customer.summary',
    label: 'Customer summary',
    description: 'Returns customer and visitor counts plus safe, non-contact customer rows.',
    permissions: CUSTOMER_READ_PERMISSIONS,
    available: false,
    schema: limitArguments,
    execute: (dependencies, context, args) => dependencies.customerSummary(context, args as LimitArguments),
  },
  {
    name: 'customer.detail',
    label: 'Customer detail',
    description: 'Returns a specific customer or visitor profile summary without mobile, email, or document data.',
    permissions: CUSTOMER_READ_PERMISSIONS,
    available: false,
    schema: customerDetailArguments,
    execute: (dependencies, context, args) => dependencies.customerDetail(context, args as CustomerDetailArguments),
  },
  {
    name: 'enquiry.summary',
    label: 'Enquiry summary',
    description: 'Returns scoped enquiry totals, statuses, types, and safe enquiry rows from CRM leads.',
    permissions: CRM_READ_PERMISSIONS,
    available: false,
    schema: leadSummaryArguments,
    execute: (dependencies, context, args) => dependencies.enquirySummary(context, args as LeadSummaryArguments),
  },
  {
    name: 'enquiry.detail',
    label: 'Enquiry detail',
    description: 'Returns a specific scoped enquiry and related listing information without contact PII.',
    permissions: CRM_READ_PERMISSIONS,
    available: false,
    schema: leadDetailArguments,
    execute: (dependencies, context, args) => dependencies.enquiryDetail(context, args as LeadDetailArguments),
  },
  {
    name: 'tasks.summary',
    label: 'Operational task summary',
    description: 'Combines scoped CRM follow-ups and RTO transfer tasks without notes, contacts, or document URLs.',
    permissions: TASKS_READ_PERMISSIONS,
    available: false,
    schema: limitArguments,
    execute: (dependencies, context, args) => dependencies.tasksSummary(context, args as LimitArguments),
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
    name: 'listing.summary',
    label: 'Listing summary',
    description: 'Returns inventory totals, status counts, and safe listing rows for list questions.',
    permissions: LISTING_READ_PERMISSIONS,
    available: false,
    schema: listingSummaryArguments,
    execute: (dependencies, context, args) => dependencies.listingSummary(context, args as ListingSummaryArguments),
  },
  {
    name: 'listing.statistics',
    label: 'Listing statistics',
    description: 'Aggregated listing counts, statuses, views, and pricing signals.',
    permissions: LISTING_READ_PERMISSIONS,
    available: false,
    schema: rangeArguments,
    execute: (dependencies, context, args) => dependencies.listingStatistics(context, args as RangeArguments),
  },
  {
    name: 'listing.detail',
    label: 'Listing detail',
    description: 'Returns safe listing specifications and status without buyer or vehicle identity data.',
    permissions: LISTING_READ_PERMISSIONS,
    available: false,
    schema: listingDetailArguments,
    execute: (dependencies, context, args) => dependencies.listingDetail(context, args as ListingDetailArguments),
  },
  {
    name: 'vehicle.identity',
    label: 'Vehicle identity status',
    description: 'Returns vehicle verification and duplicate/resale status without exposing raw registration, chassis, engine, owner, or phone values.',
    permissions: VEHICLE_IDENTITY_PERMISSIONS,
    available: false,
    schema: vehicleIdentityArguments,
    execute: (dependencies, context, args) => dependencies.vehicleIdentity(context, args as VehicleIdentityArguments),
  },
  {
    name: 'sold.vehicles',
    label: 'Sold vehicles',
    description: 'Summarizes sold inventory and sale values without buyer contact details.',
    permissions: SOLD_VEHICLE_PERMISSIONS,
    available: false,
    schema: rangeLimitArguments,
    execute: (dependencies, context, args) => dependencies.soldVehicles(context, args as RangeLimitArguments),
  },
  {
    name: 'inventory.trend',
    label: 'Inventory trend',
    description: 'Shows listing creation trend and current inventory status distribution.',
    permissions: LISTING_READ_PERMISSIONS,
    available: false,
    schema: rangeArguments,
    execute: (dependencies, context, args) => dependencies.inventoryTrend(context, args as RangeArguments),
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
    permissions: PARTNER_READ_PERMISSIONS,
    available: false,
    schema: emptyArguments,
    execute: (dependencies, context, args) => dependencies.partnerStatistics(context, args as EmptyArguments),
  },
  {
    name: 'partner.performance',
    label: 'Partner performance',
    description: 'Ranks partner inventory activity using scoped listing counts, sales, views, and prices.',
    permissions: PARTNER_READ_PERMISSIONS,
    available: false,
    schema: partnerPerformanceArguments,
    execute: (dependencies, context, args) => dependencies.partnerPerformance(context, args as PartnerPerformanceArguments),
  },
  {
    name: 'finance.trend',
    label: 'Finance trend',
    description: 'Aggregated daily inflow, outflow, net movement, and transaction counts.',
    permissions: FINANCE_READ_PERMISSIONS,
    available: false,
    schema: rangeArguments,
    execute: (dependencies, context, args) => dependencies.financeTrend(context, args as RangeArguments),
  },
  {
    name: 'finance.workspace.summary',
    label: 'Finance workspace summary',
    description: 'Shows safe Finance Hub readiness, financial-year, period, bank, party, and posting aggregates.',
    permissions: FINANCE_HUB_READ_PERMISSIONS,
    available: false,
    schema: rangeLimitArguments,
    execute: (dependencies, context, args) => dependencies.financeWorkspaceSummary(context, args as RangeLimitArguments),
  },
  {
    name: 'invoice.summary',
    label: 'Invoices and bills summary',
    description: 'Summarizes sales invoices, purchase bills, credit notes, and listing bills without party or customer PII.',
    permissions: FINANCE_READ_PERMISSIONS,
    available: false,
    schema: rangeLimitArguments,
    execute: (dependencies, context, args) => dependencies.invoiceSummary(context, args as RangeLimitArguments),
  },
  {
    name: 'payment.summary',
    label: 'Payments summary',
    description: 'Summarizes sale receipts, listing payment submissions, and payment methods without bank references or contact data.',
    permissions: FINANCE_READ_PERMISSIONS,
    available: false,
    schema: rangeLimitArguments,
    execute: (dependencies, context, args) => dependencies.paymentSummary(context, args as RangeLimitArguments),
  },
  {
    name: 'margin.summary',
    label: 'Margin summary',
    description: 'Shows purchase, sales, expense, gross profit, post-GST profit, and margin percentages for sold accounts.',
    permissions: FINANCE_READ_PERMISSIONS,
    available: false,
    schema: rangeLimitArguments,
    execute: (dependencies, context, args) => dependencies.marginSummary(context, args as RangeLimitArguments),
  },
  {
    name: 'wallet.summary',
    label: 'API wallet summary',
    description: 'Shows the platform API wallet balance and safe debit/credit aggregates without user IDs, tokens, or idempotency data.',
    permissions: FINANCE_HUB_READ_PERMISSIONS,
    available: false,
    schema: rangeLimitArguments,
    execute: (dependencies, context, args) => dependencies.walletSummary(context, args as RangeLimitArguments),
  },
  {
    name: 'api.billing.summary',
    label: 'API billing summary',
    description: 'Shows verification usage, configured service-price status, and webhook processing aggregates without provider identifiers.',
    permissions: FINANCE_HUB_READ_PERMISSIONS,
    available: false,
    schema: rangeLimitArguments,
    execute: (dependencies, context, args) => dependencies.apiBillingSummary(context, args as RangeLimitArguments),
  },
  {
    name: 'sell.accounts.summary',
    label: 'Sell accounts summary',
    description: 'Summarizes commercial sell-account status, lock state, invoice state, and safe financial totals without vehicle or party identity.',
    permissions: FINANCE_READ_PERMISSIONS,
    available: false,
    schema: rangeLimitArguments,
    execute: (dependencies, context, args) => dependencies.sellAccountsSummary(context, args as RangeLimitArguments),
  },
  {
    name: 'refund.summary',
    label: 'Refund summary',
    description: 'Summarizes refund requests, paid refunds, forfeits, methods, and amounts without notes, references, or user IDs.',
    permissions: FINANCE_READ_PERMISSIONS,
    available: false,
    schema: rangeLimitArguments,
    execute: (dependencies, context, args) => dependencies.refundSummary(context, args as RangeLimitArguments),
  },
  {
    name: 'accounting.summary',
    label: 'Accounting summary',
    description: 'Shows chart-of-accounts, bank, category-map, and voucher status aggregates from the Finance Hub books.',
    permissions: FINANCE_HUB_READ_PERMISSIONS,
    available: false,
    schema: rangeLimitArguments,
    execute: (dependencies, context, args) => dependencies.accountingSummary(context, args as RangeLimitArguments),
  },
  {
    name: 'journal.summary',
    label: 'Journal summary',
    description: 'Shows journal voucher type/status, debit, credit, and total movement aggregates for a bounded period.',
    permissions: FINANCE_HUB_READ_PERMISSIONS,
    available: false,
    schema: rangeLimitArguments,
    execute: (dependencies, context, args) => dependencies.journalSummary(context, args as RangeLimitArguments),
  },
  {
    name: 'categories.summary',
    label: 'Categories summary',
    description: 'Lists global listing categories with safe listing counts and no icon SVG payloads.',
    permissions: MASTER_DATA_READ_PERMISSIONS,
    available: false,
    schema: rangeLimitArguments,
    execute: (dependencies, context, args) => dependencies.categoriesSummary(context, args as RangeLimitArguments),
  },
  {
    name: 'brands.summary',
    label: 'Brands summary',
    description: 'Lists vehicle brands with model and listing counts.',
    permissions: MASTER_DATA_READ_PERMISSIONS,
    available: false,
    schema: rangeLimitArguments,
    execute: (dependencies, context, args) => dependencies.brandsSummary(context, args as RangeLimitArguments),
  },
  {
    name: 'models.summary',
    label: 'Models summary',
    description: 'Lists vehicle models and safe listing counts, optionally scoped to a brand ID.',
    permissions: MASTER_DATA_READ_PERMISSIONS,
    available: false,
    schema: modelSummaryArguments,
    execute: (dependencies, context, args) => dependencies.modelsSummary(context, args as ModelSummaryArguments),
  },
  {
    name: 'locations.summary',
    label: 'Locations summary',
    description: 'Lists distinct listing locations and inventory counts without addresses or contact data.',
    permissions: ['listings.read', 'analytics.read'],
    available: false,
    schema: rangeLimitArguments,
    execute: (dependencies, context, args) => dependencies.locationsSummary(context, args as RangeLimitArguments),
  },
  {
    name: 'blogs.summary',
    label: 'Blogs summary',
    description: 'Summarizes blog publication and reader-question moderation status without article bodies or author identity.',
    permissions: CONTENT_READ_PERMISSIONS,
    available: false,
    schema: rangeLimitArguments,
    execute: (dependencies, context, args) => dependencies.blogsSummary(context, args as RangeLimitArguments),
  },
  {
    name: 'translations.summary',
    label: 'Translations summary',
    description: 'Summarizes translation registry and override coverage by application and locale without translation payloads.',
    permissions: ['translations.manage'],
    available: false,
    schema: rangeLimitArguments,
    execute: (dependencies, context, args) => dependencies.translationsSummary(context, args as RangeLimitArguments),
  },
  {
    name: 'settings.summary',
    label: 'Platform settings summary',
    description: 'Shows safe platform-settings readiness flags and timestamps without raw payloads, credentials, or secrets.',
    permissions: SETTINGS_READ_PERMISSIONS,
    available: false,
    schema: rangeLimitArguments,
    execute: (dependencies, context, args) => dependencies.settingsSummary(context, args as RangeLimitArguments),
  },
  {
    name: 'users.summary',
    label: 'Users summary',
    description: 'Summarizes managed user roles and account statuses without names, emails, mobiles, or user IDs.',
    permissions: ['users.read', 'MANAGE_ADMINS'],
    available: false,
    schema: rangeLimitArguments,
    execute: (dependencies, context, args) => dependencies.usersSummary(context, args as RangeLimitArguments),
  },
  {
    name: 'roles.summary',
    label: 'Roles summary',
    description: 'Lists custom roles and assigned-user counts without exposing permission arrays.',
    permissions: USER_ROLE_READ_PERMISSIONS,
    available: false,
    schema: rangeLimitArguments,
    execute: (dependencies, context, args) => dependencies.rolesSummary(context, args as RangeLimitArguments),
  },
  {
    name: 'subscriptions.summary',
    label: 'Subscriptions summary',
    description: 'Summarizes customer subscription statuses, amounts, and expiry coverage without customer or payment references.',
    permissions: SUBSCRIPTION_READ_PERMISSIONS,
    available: false,
    schema: rangeLimitArguments,
    execute: (dependencies, context, args) => dependencies.subscriptionsSummary(context, args as RangeLimitArguments),
  },
  {
    name: 'forecast.operations',
    label: 'Operations forecast',
    description: 'Projects sales, inventory creation, or net finance movement with a confidence score and uncertainty band.',
    permissions: FORECAST_ACCESS_PERMISSIONS,
    available: false,
    schema: forecastArguments,
    execute: (dependencies, context, args) => {
      const forecastArgs = args as ForecastArguments;
      if (!hasPermission(context, forecastPermissionsFor(forecastArgs.metric))) {
        throw new AiToolError('You do not have permission to forecast this operational metric.', 403, 'AI_TOOL_PERMISSION_REQUIRED');
      }
      return dependencies.forecastOperations(context, forecastArgs);
    },
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
    name: 'rto.documents.summary',
    label: 'RTO and document summary',
    description: 'Summarizes RTO workflow status, document readiness, and transfer task progress without customer or vehicle identifiers.',
    permissions: RTO_DOCUMENTS_PERMISSIONS,
    available: false,
    schema: rangeLimitArguments,
    execute: (dependencies, context, args) => dependencies.rtoDocumentsSummary(context, args as RangeLimitArguments),
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
  {
    name: 'verification.summary',
    label: 'Verification summary',
    description: 'Aggregated PAN, GST, Aadhaar, driving-license, and RC verification statuses without raw identity data.',
    permissions: VERIFICATION_READ_PERMISSIONS,
    available: false,
    schema: rangeArguments,
    execute: (dependencies, context, args) => dependencies.verificationSummary(context, args as RangeArguments),
  },
  {
    name: 'surepass.status',
    label: 'Surepass status',
    description: 'Shows safe local Surepass configuration and stored verification availability without revealing credentials or triggering a provider lookup.',
    permissions: VERIFICATION_READ_PERMISSIONS,
    available: false,
    schema: emptyArguments,
    execute: (dependencies, context, args) => dependencies.surepassStatus(context, args as EmptyArguments),
  },
  {
    name: 'whatsapp.status',
    label: 'WhatsApp integration status',
    description: 'Shows WhatsApp configuration readiness, template status, automation, outbox, and recent delivery aggregates without phone numbers or secrets.',
    permissions: ['whatsapp.read', 'whatsapp.manage'],
    available: false,
    schema: rangeArguments,
    execute: (dependencies, context, args) => dependencies.whatsappStatus(context, args as RangeArguments),
  },
  {
    name: 'whatsapp.campaigns.summary',
    label: 'WhatsApp campaign summary',
    description: 'Returns safe WhatsApp campaign status and recipient delivery aggregates without audience filters or phone numbers.',
    permissions: ['whatsapp.read', 'whatsapp.manage'],
    available: false,
    schema: rangeArguments,
    execute: (dependencies, context, args) => dependencies.whatsappCampaignsSummary(context, args as RangeArguments),
  },
  {
    name: 'communication.delivery.summary',
    label: 'Communication delivery summary',
    description: 'Combines WhatsApp and SMS delivery-log aggregates without recipient phones, message bodies, payloads, or provider credentials.',
    permissions: COMMUNICATION_READ_PERMISSIONS,
    available: false,
    schema: rangeArguments,
    execute: (dependencies, context, args) => dependencies.communicationDeliverySummary(context, args as RangeArguments),
  },
  {
    name: 'sms.activity.summary',
    label: 'SMS activity summary',
    description: 'Shows SMS integration readiness and delivery aggregates without phone numbers, message bodies, or API keys.',
    permissions: ['sms.read', 'sms.manage'],
    available: false,
    schema: rangeArguments,
    execute: (dependencies, context, args) => dependencies.smsActivitySummary(context, args as RangeArguments),
  },
  {
    name: 'notifications.summary',
    label: 'Notifications summary',
    description: 'Shows the signed-in operator notification counts and trends without exposing notification text or links.',
    permissions: ['dashboard.view'],
    available: false,
    schema: rangeArguments,
    execute: (dependencies, context, args) => dependencies.notificationsSummary(context, args as RangeArguments),
  },
];

const hasPermission = (context: AiToolContext, permissions: readonly string[]) =>
  context.role === 'SUPER_ADMIN'
  || context.role === 'ADMIN'
  || context.permissions.includes('ALL_ACCESS')
  || permissions.some((permission) => context.permissions.includes(permission));

const definitionFor = (name: string) => definitions.find((definition) => definition.name === name);

const dataAvailabilityFor = (value: unknown): { status: AiToolDataAvailability; message?: string } => {
  if (Array.isArray(value)) {
    return value.length ? { status: 'AVAILABLE' } : { status: 'UNAVAILABLE', message: 'No matching records were found.' };
  }
  if (!value || typeof value !== 'object') return { status: 'AVAILABLE' };
  const record = value as Record<string, unknown>;
  if (record.found === false || record.status === 'DATA_UNAVAILABLE') {
    return { status: 'UNAVAILABLE', message: 'The requested data is unavailable.' };
  }
  const arrays = Object.values(record).filter(Array.isArray) as unknown[][];
  if (!arrays.length || arrays.some((items) => items.length > 0)) return { status: 'AVAILABLE' };
  const hasPositiveIndicator = (candidate: unknown): boolean => {
    if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) return false;
    return Object.entries(candidate as Record<string, unknown>).some(([key, item]) => {
      if (/^(total|count|pending|created|active|published|transactions|observations|records)/iu.test(key)
        && typeof item === 'number'
        && item > 0) {
        return true;
      }
      return hasPositiveIndicator(item);
    });
  };
  const positiveIndicator = hasPositiveIndicator(record);
  return positiveIndicator
    ? { status: 'AVAILABLE' }
    : { status: 'UNAVAILABLE', message: 'No matching records were found.' };
};

const errorCodeFor = (error: unknown) => error instanceof AiToolError ? error.code : 'AI_TOOL_DATA_UNAVAILABLE';

const forecastPermissionsFor = (metric: ForecastArguments['metric']) => {
  if (metric === 'finance' || metric === 'collections') return FINANCE_READ_PERMISSIONS;
  if (metric === 'leads') return CRM_REPORT_PERMISSIONS;
  if (metric === 'partners') return PARTNER_READ_PERMISSIONS;
  if (metric === 'kyc') return ['kyc.manage', 'kyc.edit.override'] as const;
  return LISTING_READ_PERMISSIONS;
};

const forecastConfidenceFor = (value: unknown): number | undefined => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const score = (value as Record<string, unknown>).confidenceScore;
  return typeof score === 'number' && Number.isFinite(score)
    ? Math.min(100, Math.max(0, Math.round(score)))
    : undefined;
};

const crmAccessFor = (context: AiToolContext): CrmAccess =>
  buildCrmAccess(context.userId, context.role, context.permissions);

const hasVisitorWideAccess = (context: AiToolContext) =>
  context.role === 'SUPER_ADMIN'
  || context.role === 'ADMIN'
  || context.permissions.includes('ALL_ACCESS')
  || context.permissions.includes('visitors.read');

export const customerScopeWhereForAi = (context: AiToolContext): Prisma.UserWhereInput => {
  if (hasVisitorWideAccess(context)) return {};
  const access = crmAccessFor(context);
  if (!access.canRead) throw new AiToolError('You do not have permission to view customers.', 403, 'AI_TOOL_PERMISSION_REQUIRED');
  return contactScopeWhere(access);
};

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

const maskedFieldsFor = (value: unknown): string[] => {
  const fields = asRecord(value).maskedFields;
  return Array.isArray(fields) ? fields.filter((field): field is string => typeof field === 'string') : [];
};

const requestedLimitFor = (value: unknown): number | undefined => {
  const limit = asRecord(value).limit;
  return typeof limit === 'number' && Number.isInteger(limit) ? limit : undefined;
};

const safeLead = (value: unknown) => {
  const lead = asRecord(value);
  return {
    leadId: typeof lead.id === 'string' ? lead.id : null,
    status: typeof lead.status === 'string' ? lead.status : null,
    leadType: typeof lead.leadType === 'string' ? lead.leadType : null,
    enquiryType: typeof lead.enquiryType === 'string' ? lead.enquiryType : null,
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

const safeCustomer = (value: unknown) => {
  const customer = asRecord(value);
  const crmProfile = asRecord(customer.crmProfile);
  const createdAt = customer.createdAt instanceof Date ? customer.createdAt.toISOString() : customer.createdAt ?? null;
  const updatedAt = customer.updatedAt instanceof Date ? customer.updatedAt.toISOString() : customer.updatedAt ?? null;
  return {
    customerId: typeof customer.id === 'string' ? customer.id : null,
    customerName: typeof customer.name === 'string' ? customer.name : null,
    status: typeof customer.status === 'string' ? customer.status : null,
    city: typeof customer.city === 'string' ? customer.city : null,
    state: typeof customer.state === 'string' ? customer.state : null,
    lifecycle: typeof crmProfile.lifecycle === 'string' ? crmProfile.lifecycle : null,
    source: typeof crmProfile.source === 'string' ? crmProfile.source : null,
    leadCount: typeof customer.leadCount === 'number' ? customer.leadCount : 0,
    createdAt,
    updatedAt,
  };
};

const safeListingSummaryItem = (value: unknown) => {
  const listing = asRecord(value);
  const brand = asRecord(listing.brand);
  const model = asRecord(listing.model);
  const category = asRecord(listing.category);
  const partner = asRecord(listing.partner);
  const partnerProfile = asRecord(partner.partnerProfile);
  const soldAt = listing.soldAt instanceof Date ? listing.soldAt.toISOString() : listing.soldAt ?? null;
  const createdAt = listing.createdAt instanceof Date ? listing.createdAt.toISOString() : listing.createdAt ?? null;
  return {
    listingId: typeof listing.id === 'string' ? listing.id : null,
    title: typeof listing.title === 'string' ? listing.title : null,
    category: typeof category.name === 'string' ? category.name : null,
    brand: typeof brand.name === 'string' ? brand.name : null,
    model: typeof model.name === 'string' ? model.name : null,
    price: numeric(listing.price),
    negotiable: listing.isNegotiable === true,
    manufacturingYear: typeof listing.manufacturingYear === 'number' ? listing.manufacturingYear : null,
    operatingHours: typeof listing.operatingHours === 'number' ? listing.operatingHours : null,
    location: {
      city: typeof listing.locationCity === 'string' ? listing.locationCity : null,
      state: typeof listing.locationState === 'string' ? listing.locationState : null,
    },
    condition: typeof listing.condition === 'string' ? listing.condition : null,
    grossPower: typeof listing.grossPower === 'string' ? listing.grossPower : null,
    status: typeof listing.status === 'string' ? listing.status : null,
    soldAt,
    views: typeof listing.views === 'number' ? listing.views : 0,
    createdAt,
    partner: typeof partnerProfile.businessName === 'string' || typeof partnerProfile.partnerCode === 'string'
      ? {
        businessName: typeof partnerProfile.businessName === 'string' ? partnerProfile.businessName : null,
        partnerCode: typeof partnerProfile.partnerCode === 'string' ? partnerProfile.partnerCode : null,
      }
      : null,
  };
};

export const safePartnerSummaryItem = (value: unknown) => {
  const partner = asRecord(value);
  const createdAt = partner.createdAt instanceof Date ? partner.createdAt.toISOString() : partner.createdAt ?? null;
  return {
    partnerCode: typeof partner.partnerCode === 'string' ? partner.partnerCode : null,
    businessName: typeof partner.businessName === 'string' ? partner.businessName : null,
    partnerType: typeof partner.partnerType === 'string' ? partner.partnerType : null,
    accountStatus: typeof partner.accountStatus === 'string' ? partner.accountStatus : null,
    kycStatus: typeof partner.kycStatus === 'string' ? partner.kycStatus : null,
    onboardingStatus: typeof partner.onboardingStatus === 'string' ? partner.onboardingStatus : null,
    createdAt,
  };
};

const isoDate = (value: unknown) => value instanceof Date ? value.toISOString() : value ?? null;

export const safeVerificationItem = (value: unknown) => {
  const record = asRecord(value);
  const identifier = [
    record.maskedIdentifier,
    record.maskedPan,
    record.maskedAadhaar,
    record.maskedGstin,
    record.maskedLicenseNumber,
    record.maskedRcNumber,
    record.maskedChassisNumber,
    record.maskedMobileNumber,
  ].find((candidate) => typeof candidate === 'string') ?? null;
  const item: Record<string, unknown> = {
    recordId: typeof record.id === 'string' ? record.id : null,
    source: typeof record.source === 'string' ? record.source : null,
    status: typeof record.status === 'string' ? record.status : null,
    maskedIdentifier: identifier,
    messageCode: typeof record.messageCode === 'string' ? record.messageCode : null,
    safeMessage: typeof record.safeMessage === 'string' ? record.safeMessage : null,
    createdAt: isoDate(record.createdAt),
    completedAt: isoDate(record.completedAt),
  };
  const optionalFields: Record<string, string[]> = {
    gstinStatus: ['gstinStatus'],
    businessName: ['businessName'],
    legalName: ['legalName'],
    side: ['side'],
    currentStatus: ['currentStatus'],
    state: ['state'],
    rcStatus: ['rcStatus'],
    vehicleCategory: ['vehicleCategory'],
    registrationDate: ['registrationDate'],
    totalChallans: ['totalChallans'],
    knownPendingCount: ['knownPendingCount'],
    rcNumbersCount: ['rcNumbersCount'],
    isMobileNumberMatch: ['isMobileNumberMatch'],
  };
  for (const [outputKey, inputKeys] of Object.entries(optionalFields)) {
    const sourceKey = inputKeys.find((key) => record[key] !== undefined);
    if (sourceKey) item[outputKey] = record[sourceKey];
  }
  return item;
};

export const safeWhatsAppActivityItem = (value: unknown) => {
  const record = asRecord(value);
  return {
    messageId: typeof record.id === 'string' ? record.id : null,
    eventCode: typeof record.eventCode === 'string' ? record.eventCode : null,
    relatedEntityType: typeof record.relatedEntityType === 'string' ? record.relatedEntityType : null,
    status: typeof record.status === 'string' ? record.status : null,
    createdAt: isoDate(record.createdAt),
    sentAt: isoDate(record.sentAt),
    deliveredAt: isoDate(record.deliveredAt),
    readAt: isoDate(record.readAt),
  };
};

export const safeSmsActivityItem = (value: unknown) => {
  const record = asRecord(value);
  return {
    messageId: typeof record.id === 'string' ? record.id : null,
    eventCode: typeof record.eventCode === 'string' ? record.eventCode : null,
    status: typeof record.status === 'string' ? record.status : null,
    createdAt: isoDate(record.createdAt),
    sentAt: isoDate(record.sentAt),
  };
};

export const safeRecruitmentApplicationItem = (value: unknown) => {
  const record = asRecord(value);
  const candidate = asRecord(record.candidate);
  const job = asRecord(record.job);
  return {
    applicationId: typeof record.id === 'string' ? record.id : null,
    applicationRef: typeof record.applicationRef === 'string' ? record.applicationRef : null,
    stage: typeof record.currentStage === 'string' ? record.currentStage : null,
    jobTitle: typeof job.title === 'string' ? job.title : null,
    jobCode: typeof job.jobCode === 'string' ? job.jobCode : null,
    candidateId: typeof candidate.id === 'string' ? candidate.id : null,
    appliedAt: isoDate(record.appliedAt),
    overallRating: typeof record.overallRating === 'number' ? record.overallRating : null,
  };
};

export const safeFinanceTransactionItem = (value: unknown) => {
  const transaction = asRecord(value);
  const transactionDate = transaction.transactionDate instanceof Date
    ? transaction.transactionDate.toISOString()
    : transaction.transactionDate ?? null;
  return {
    transactionId: typeof transaction.id === 'string' ? transaction.id : null,
    transactionDate,
    type: typeof transaction.type === 'string' ? transaction.type : null,
    amount: numeric(transaction.amount),
    balance: transaction.balance == null ? null : numeric(transaction.balance),
    accountName: typeof transaction.accountName === 'string' ? transaction.accountName : null,
    paymentMethod: typeof transaction.paymentMethod === 'string' ? transaction.paymentMethod : null,
    category: typeof transaction.category === 'string' ? transaction.category : null,
    status: typeof transaction.status === 'string' ? transaction.status : null,
  };
};

const safeLeadDetail = (value: unknown) => {
  const result = asRecord(value);
  const lead = asRecord(result.lead);
  const listing = asRecord(lead.listing);
  const activities = Array.isArray(lead.activities) ? lead.activities : [];
  const followUps = Array.isArray(lead.followUps) ? lead.followUps : [];
  const lastActivity = asRecord(activities[0]);
  const requirement = asRecord(lead.requirement);
  const safeListing = listing.id ? safeListingSummaryItem(listing) : null;
  return {
    found: Boolean(result.lead),
    lead: result.lead ? {
      ...safeLead({
        ...lead,
        id: lead.id,
        listingTitleSnapshot: lead.listingTitleSnapshot ?? listing.title,
      }),
      enquiryType: typeof lead.enquiryType === 'string' ? lead.enquiryType : null,
      listingId: typeof lead.listingId === 'string' ? lead.listingId : null,
      listing: safeListing,
      requirement: {
        category: asRecord(requirement.category).name ?? null,
        brand: asRecord(requirement.brand).name ?? null,
        model: asRecord(requirement.model).name ?? null,
      },
      timeline: {
        activityCount: activities.length,
        lastActivityAt: lastActivity.createdAt instanceof Date ? lastActivity.createdAt.toISOString() : lastActivity.createdAt ?? null,
        followUpCount: followUps.length,
      },
    } : null,
    relatedLeadCount: Array.isArray(result.otherLeads) ? result.otherLeads.length : 0,
    maskedFields: ['customerName', 'mobileNumber', 'whatsappNumber', 'email', 'message', 'documentUrl'],
  };
};

type VerificationStatusRow = {
  status: string;
  _count: { _all: number };
};

type VerificationSummaryModel = {
  count: (args: { where: { createdAt: { gte: Date } } }) => Promise<number>;
  groupBy: (args: {
    by: readonly ['status'];
    where: { createdAt: { gte: Date } };
    _count: { _all: true };
  }) => Promise<VerificationStatusRow[]>;
};

type VerificationSource = {
  key: string;
  label: string;
  permissions: readonly string[];
  model: VerificationSummaryModel;
};

const verificationModel = (model: unknown): VerificationSummaryModel => model as VerificationSummaryModel;

const verificationSources: VerificationSource[] = [
  { key: 'pan', label: 'PAN', permissions: ['pan.verification.read'], model: verificationModel(prisma.panVerificationRecord) },
  { key: 'mobile-to-pan', label: 'Mobile to PAN', permissions: ['pan.verification.read'], model: verificationModel(prisma.mobileToPanLookupRecord) },
  { key: 'gst', label: 'GST', permissions: ['gst.verification.read'], model: verificationModel(prisma.gstVerificationRecord) },
  { key: 'aadhaar', label: 'Aadhaar', permissions: ['aadhaar.digilocker.read'], model: verificationModel(prisma.aadhaarVerificationRecord) },
  { key: 'driving-license', label: 'Driving license', permissions: ['driving-license.verification.read'], model: verificationModel(prisma.drivingLicenseVerificationRecord) },
  { key: 'rc-owner-history', label: 'RC owner history', permissions: ['rc.owner-history.read'], model: verificationModel(prisma.rcOwnerHistoryRecord) },
  { key: 'rc-challan', label: 'RC challan', permissions: ['rc.challan.verification.read'], model: verificationModel(prisma.rcChallanVerificationRecord) },
  { key: 'chassis-to-rc', label: 'Chassis to RC', permissions: ['rc.chassis-to-rc.read'], model: verificationModel(prisma.chassisToRcVerificationRecord) },
  { key: 'rc-to-mobile', label: 'RC to mobile', permissions: ['rc.to-mobile.read'], model: verificationModel(prisma.rcToMobileVerificationRecord) },
  { key: 'mobile-to-rc', label: 'Mobile to RC', permissions: ['rc.to-mobile.read'], model: verificationModel(prisma.mobileToRcLookupRecord) },
  { key: 'rc-mobile-check', label: 'RC mobile check', permissions: ['rc.to-mobile.read'], model: verificationModel(prisma.rcMobileNumberCheckRecord) },
];

const VERIFICATION_MASKED_FIELDS = [
  'pan',
  'aadhaar',
  'gstin',
  'licenseNumber',
  'rcNumber',
  'chassisNumber',
  'mobileNumber',
  'ownerName',
];

const countForStatus = (rows: VerificationStatusRow[], status: string) =>
  rows.find((row) => row.status === status)?._count._all ?? 0;

const verificationSummaryFor = async (context: AiToolContext, args: RangeArguments) => {
  const periodDays = Math.min(90, Math.max(1, Math.floor(args.days ?? 30)));
  const permittedSources = verificationSources.filter((source) => hasPermission(context, source.permissions));
  if (!permittedSources.length) {
    throw new AiToolError('You do not have permission to view verification summaries.', 403, 'AI_TOOL_PERMISSION_REQUIRED');
  }
  const where = { createdAt: { gte: daysBack(periodDays) } };
  const sources = await Promise.all(permittedSources.map(async (source) => {
    const [total, statuses] = await Promise.all([
      source.model.count({ where }),
      source.model.groupBy({ by: ['status'], where, _count: { _all: true } }),
    ]);
    return {
      key: source.key,
      label: source.label,
      total,
      success: countForStatus(statuses, 'SUCCESS'),
      pending: countForStatus(statuses, 'PENDING'),
      failed: countForStatus(statuses, 'FAILED'),
    };
  }));
  return {
    periodDays,
    total: sources.reduce((sum, source) => sum + source.total, 0),
    sources,
    maskedFields: VERIFICATION_MASKED_FIELDS,
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

  async crmLeadsSummary(context, args) {
    const access = crmAccessFor(context);
    if (!access.canRead) throw new AiToolError('You do not have CRM read permission for lead summaries.', 403, 'AI_TOOL_PERMISSION_REQUIRED');
    const limit = Math.min(20, Math.max(1, Math.floor(args.limit ?? 20)));
    const query: Record<string, string> = { page: '1', pageSize: String(limit) };
    if (args.view && args.view !== 'all') query.view = args.view;
    const result = await crmLeads.listLeads(access, query);
    return {
      total: result.total,
      returned: result.items.length,
      hasMore: result.total > result.items.length,
      statusCounts: result.statusCounts,
      viewCounts: result.viewCounts,
      items: result.items.map(safeLead),
    };
  },

  async crmLeadDetail(context, args) {
    const access = crmAccessFor(context);
    if (!access.canRead) throw new AiToolError('You do not have CRM read permission for lead details.', 403, 'AI_TOOL_PERMISSION_REQUIRED');
    let leadId = args.leadId;
    if (!leadId && args.query) {
      let matches = await crmLeads.listLeads(access, { q: args.query, page: '1', pageSize: '6' });
      if (!matches.items.length) {
        const terms = [...new Set(args.query.split(/\s+/u).map((term) => term.trim()).filter((term) => term.length >= 2))];
        const tokenMatches = await Promise.all(terms.map((term) => crmLeads.listLeads(access, { q: term, page: '1', pageSize: '20' })));
        const uniqueItems = new Map<string, (typeof tokenMatches[number]['items'])[number]>();
        for (const tokenResult of tokenMatches) {
          for (const item of tokenResult.items) uniqueItems.set(item.id, item);
        }
        matches = { ...matches, items: [...uniqueItems.values()] };
      }
      if (!matches.items.length) {
        return { found: false, requested: args.query, matches: [] };
      }
      if (matches.items.length > 1) {
        throw new AiToolError(
          'Multiple CRM leads match that search. Please provide a lead ID or a more specific name/listing.',
          409,
          'AI_TOOL_AMBIGUOUS',
        );
      }
      leadId = matches.items[0]?.id;
    }
    if (!leadId) throw new AiToolError('A lead ID or search query is required.', 400, 'AI_TOOL_ARGUMENTS_INVALID');
    const result = await crmLeads.getLead(access, leadId);
    return safeLeadDetail(result);
  },

  async customerSummary(context, args) {
    const limit = Math.min(20, Math.max(1, Math.floor(args.limit ?? 20)));
    const where: Prisma.UserWhereInput = {
      AND: [
        { role: 'CUSTOMER', status: { not: 'CLOSED' } },
        customerScopeWhereForAi(context),
      ],
    };
    const [total, active, rows] = await Promise.all([
      prisma.user.count({ where }),
      prisma.user.count({ where: { AND: [where, { status: 'ACTIVE' }] } }),
      prisma.user.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: limit,
        select: {
          id: true,
          name: true,
          status: true,
          city: true,
          state: true,
          createdAt: true,
          updatedAt: true,
          crmProfile: { select: { lifecycle: true, source: true } },
          _count: { select: { leads: true } },
        },
      }),
    ]);
    return {
      total,
      active,
      returned: rows.length,
      hasMore: total > rows.length,
      items: rows.map((row) => safeCustomer({
        ...row,
        leadCount: row._count.leads,
      })),
      maskedFields: ['customerName', 'mobile', 'whatsappNumber', 'email', 'documentUrl'],
    };
  },

  async customerDetail(context, args) {
    const search = args.query || '';
    const where: Prisma.UserWhereInput = {
      AND: [
        customerScopeWhereForAi(context),
        {
          role: 'CUSTOMER',
          status: { not: 'CLOSED' },
          ...(args.customerId
            ? { id: args.customerId }
            : {
              OR: [
                { name: { contains: search, mode: 'insensitive' } },
                { city: { contains: search, mode: 'insensitive' } },
                { state: { contains: search, mode: 'insensitive' } },
              ],
            }),
        },
      ],
    };
    const matches = await prisma.user.findMany({
      where,
      orderBy: { updatedAt: 'desc' },
      take: 6,
      select: {
        id: true,
        name: true,
        status: true,
        city: true,
        state: true,
        createdAt: true,
        updatedAt: true,
        crmProfile: { select: { lifecycle: true, source: true } },
        _count: { select: { leads: true } },
      },
    });
    if (!matches.length) return { found: false, requested: args.customerId || args.query || null, matches: [] };
    if (matches.length > 1 && !args.customerId) {
      throw new AiToolError(
        'Multiple customers match that search. Please provide a customer ID or a more specific name.',
        409,
        'AI_TOOL_AMBIGUOUS',
      );
    }
    const customer = matches[0]!;
    const access = crmAccessFor(context);
    const activityWhere = hasVisitorWideAccess(context) ? {} : { AND: [followUpScopeWhere(access)] };
    const leadActivityWhere = hasVisitorWideAccess(context) ? {} : leadScopeWhere(access);
    const [followUpCount, leadsByStatus] = await Promise.all([
      prisma.crmFollowUp.count({ where: { AND: [{ contactUserId: customer.id }, activityWhere] } }),
      prisma.lead.groupBy({ by: ['status'], where: { AND: [{ customerId: customer.id, mergedIntoId: null }, leadActivityWhere] }, _count: { _all: true } }),
    ]);
    return {
      found: true,
      customer: safeCustomer({ ...customer, leadCount: customer._count.leads }),
      activity: {
        leadCount: customer._count.leads,
        followUpCount,
        leadsByStatus: leadsByStatus.map((row) => ({ status: row.status, count: row._count._all })),
      },
      maskedFields: ['customerName', 'mobile', 'whatsappNumber', 'email', 'notes', 'documentUrl'],
    };
  },

  async enquirySummary(context, args) {
    const access = crmAccessFor(context);
    if (!access.canRead) throw new AiToolError('You do not have CRM read permission for enquiries.', 403, 'AI_TOOL_PERMISSION_REQUIRED');
    const limit = Math.min(20, Math.max(1, Math.floor(args.limit ?? 20)));
    const query: Record<string, string> = { page: '1', pageSize: String(limit) };
    if (args.view && args.view !== 'all') query.view = args.view;
    const result = await crmLeads.listLeads(access, query);
    const enquiryTypeCounts = new Map<string, number>();
    for (const item of result.items) {
      const enquiryType = typeof item.enquiryType === 'string' ? item.enquiryType : 'UNSPECIFIED';
      enquiryTypeCounts.set(enquiryType, (enquiryTypeCounts.get(enquiryType) || 0) + 1);
    }
    return {
      total: result.total,
      returned: result.items.length,
      hasMore: result.total > result.items.length,
      statusCounts: result.statusCounts,
      enquiryTypeCounts: [...enquiryTypeCounts.entries()].map(([type, count]) => ({ type, count })),
      items: result.items.map(safeLead),
      maskedFields: ['customerName', 'mobileNumber', 'whatsappNumber', 'email', 'message', 'documentUrl'],
    };
  },

  async enquiryDetail(context, args) {
    const access = crmAccessFor(context);
    if (!access.canRead) throw new AiToolError('You do not have CRM read permission for enquiry details.', 403, 'AI_TOOL_PERMISSION_REQUIRED');
    let leadId = args.leadId;
    if (!leadId && args.query) {
      const matches = await crmLeads.listLeads(access, { q: args.query, page: '1', pageSize: '6' });
      if (!matches.items.length) return { found: false, requested: args.query, matches: [] };
      if (matches.items.length > 1) {
        throw new AiToolError(
          'Multiple enquiries match that search. Please provide a lead ID or a more specific name/listing.',
          409,
          'AI_TOOL_AMBIGUOUS',
        );
      }
      leadId = matches.items[0]?.id;
    }
    if (!leadId) throw new AiToolError('A lead ID or enquiry search query is required.', 400, 'AI_TOOL_ARGUMENTS_INVALID');
    return safeLeadDetail(await crmLeads.getLead(access, leadId));
  },

  async tasksSummary(context, args) {
    const limit = Math.min(20, Math.max(1, Math.floor(args.limit ?? 20)));
    const access = crmAccessFor(context);
    const includeCrm = access.canRead;
    const includeRto = hasPermission(context, ['accounts.rto.read', 'accounts.rto.crud', 'tasks.read']);
    const [crm, rto] = await Promise.all([
      includeCrm
        ? Promise.all([
          prisma.crmFollowUp.count({ where: followUpScopeWhere(access) }),
          prisma.crmFollowUp.groupBy({ by: ['status'], where: followUpScopeWhere(access), _count: { _all: true } }),
          prisma.crmFollowUp.findMany({
            where: followUpScopeWhere(access),
            orderBy: { dueAt: 'asc' },
            take: limit,
            select: { id: true, leadId: true, type: true, status: true, dueAt: true, createdAt: true },
          }),
        ])
        : Promise.resolve(null),
      includeRto
        ? Promise.all([
          prisma.rtoTransferTask.count(),
          prisma.rtoTransferTask.groupBy({ by: ['status'], _count: { _all: true } }),
          prisma.rtoTransferTask.findMany({
            orderBy: { updatedAt: 'desc' },
            take: limit,
            select: { id: true, taskKey: true, label: true, status: true, isOptional: true, createdAt: true, updatedAt: true },
          }),
        ])
        : Promise.resolve(null),
    ]);
    if (!crm && !rto) throw new AiToolError('You do not have permission to view operational tasks.', 403, 'AI_TOOL_PERMISSION_REQUIRED');
    const items = [
      ...(crm?.[2] || []).map((task) => ({
        taskId: task.id,
        source: 'CRM_FOLLOW_UP',
        leadId: task.leadId,
        type: task.type,
        status: task.status,
        dueAt: task.dueAt.toISOString(),
        createdAt: task.createdAt.toISOString(),
      })),
      ...(rto?.[2] || []).map((task) => ({
        taskId: task.id,
        source: 'RTO_TRANSFER',
        taskKey: task.taskKey,
        label: task.label,
        status: task.status,
        optional: task.isOptional,
        createdAt: task.createdAt.toISOString(),
        updatedAt: task.updatedAt.toISOString(),
      })),
    ].slice(0, limit);
    return {
      total: (crm?.[0] || 0) + (rto?.[0] || 0),
      sources: {
        crmFollowUps: crm ? { total: crm[0], byStatus: crm[1].map((row) => ({ status: row.status, count: row._count._all })) } : null,
        rtoTransferTasks: rto ? { total: rto[0], byStatus: rto[1].map((row) => ({ status: row.status, count: row._count._all })) } : null,
      },
      returned: items.length,
      items,
      maskedFields: ['contactUserId', 'mobileNumber', 'email', 'notes', 'remark', 'documentUrl'],
    };
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

  async listingSummary(_context, args) {
    const limit = Math.min(20, Math.max(1, Math.floor(args.limit ?? 20)));
    const where: Prisma.ListingWhereInput = args.status ? { status: args.status } : {};
    const [total, byStatus, rows] = await Promise.all([
      prisma.listing.count({ where }),
      prisma.listing.groupBy({ by: ['status'], where, _count: { _all: true } }),
      prisma.listing.findMany({
        where,
        orderBy: [{ updatedAt: 'desc' }, { createdAt: 'desc' }],
        take: limit,
        select: {
          id: true,
          title: true,
          price: true,
          isNegotiable: true,
          manufacturingYear: true,
          operatingHours: true,
          locationState: true,
          locationCity: true,
          condition: true,
          grossPower: true,
          status: true,
          soldAt: true,
          views: true,
          createdAt: true,
          brand: { select: { name: true } },
          model: { select: { name: true } },
          category: { select: { name: true } },
          partner: { select: { partnerProfile: { select: { businessName: true, partnerCode: true } } } },
        },
      }),
    ]);
    return {
      total,
      returned: rows.length,
      hasMore: total > rows.length,
      ...(args.status ? { statusFilter: args.status } : {}),
      byStatus: byStatus.map((row) => ({ status: row.status, count: row._count._all })),
      items: rows.map(safeListingSummaryItem),
    };
  },

  async listingDetail(_context, args) {
    const query = args.query?.trim();
    const searchQuery = query || '';
    const where: Prisma.ListingWhereInput = args.listingId
      ? { id: args.listingId }
      : args.invoiceNumber
        ? {
          OR: [
            { saleRecord: { is: { invoiceNo: { equals: args.invoiceNumber.trim(), mode: 'insensitive' } } } },
            { sellAccount: { is: { invoiceNumber: { equals: args.invoiceNumber.trim(), mode: 'insensitive' } } } },
          ],
        }
        : args.partnerCode
          ? { partner: { partnerProfile: { is: { partnerCode: { equals: args.partnerCode.trim(), mode: 'insensitive' } } } } }
          : {
        OR: [
          { title: { contains: searchQuery, mode: 'insensitive' as const } },
          { locationCity: { contains: searchQuery, mode: 'insensitive' as const } },
          { locationState: { contains: searchQuery, mode: 'insensitive' as const } },
          { brand: { name: { contains: searchQuery, mode: 'insensitive' as const } } },
          { model: { name: { contains: searchQuery, mode: 'insensitive' as const } } },
        ],
      };
    const listing = await prisma.listing.findFirst({
      where,
      orderBy: { updatedAt: 'desc' },
      select: {
        id: true,
        title: true,
        price: true,
        isNegotiable: true,
        manufacturingYear: true,
        operatingHours: true,
        locationState: true,
        locationCity: true,
        condition: true,
        grossPower: true,
        status: true,
        soldAt: true,
        views: true,
        createdAt: true,
        updatedAt: true,
        brand: { select: { name: true } },
        model: { select: { name: true } },
        category: { select: { name: true } },
        partner: { select: { partnerProfile: { select: { businessName: true, partnerCode: true } } } },
        saleRecord: { select: { soldPrice: true, soldAt: true, invoiceNo: true } },
        sellAccount: { select: { invoiceNumber: true } },
      },
    });
    if (!listing) return {
      found: false,
      requested: args.listingId ?? args.invoiceNumber ?? args.partnerCode ?? query ?? null,
    };
    return {
      found: true,
      item: {
        listingId: listing.id,
        title: listing.title,
        category: listing.category.name,
        brand: listing.brand.name,
        model: listing.model.name,
        price: numeric(listing.price),
        negotiable: listing.isNegotiable,
        manufacturingYear: listing.manufacturingYear,
        operatingHours: listing.operatingHours,
        location: { city: listing.locationCity, state: listing.locationState },
        condition: listing.condition,
        grossPower: listing.grossPower,
        status: listing.status,
        soldAt: listing.saleRecord?.soldAt?.toISOString() ?? listing.soldAt?.toISOString() ?? null,
        soldPrice: listing.saleRecord ? numeric(listing.saleRecord.soldPrice) : null,
        invoiceNo: listing.saleRecord?.invoiceNo ?? listing.sellAccount?.invoiceNumber ?? null,
        views: listing.views,
        createdAt: listing.createdAt.toISOString(),
        updatedAt: listing.updatedAt.toISOString(),
        partner: listing.partner.partnerProfile
          ? { businessName: listing.partner.partnerProfile.businessName, partnerCode: listing.partner.partnerProfile.partnerCode }
          : null,
      },
    };
  },

  async vehicleIdentity(_context, args) {
    const query = args.query?.trim() || null;
    const identifierKey = query ? toVehicleIdentityKey(query) : null;
    const listingSelect = {
      id: true,
      title: true,
      status: true,
      registrationNumberKey: true,
      chassisNumberKey: true,
      vehicleVerification: {
        select: {
          status: true,
          verificationSource: true,
          verifiedRegistrationNumber: true,
          verifiedChassisNumber: true,
          verifiedEngineNumber: true,
          lastVerifiedAt: true,
          updatedAt: true,
        },
      },
      brand: { select: { name: true } },
      model: { select: { name: true } },
    } as const;

    let listings: Array<any> = [];
    let soldRecordCount = 0;
    if (args.listingId) {
      const listing = await prisma.listing.findUnique({ where: { id: args.listingId }, select: listingSelect });
      listings = listing ? [listing] : [];
    } else if (identifierKey) {
      const matches = await findVehicleIdentityMatches(prisma, {
        registrationKeys: [identifierKey],
        chassisKeys: [identifierKey],
      });
      soldRecordCount = matches.soldRecords.length;
      const listingIds = [...new Set(matches.listings.map((item) => item.listingId))];
      listings = listingIds.length
        ? await prisma.listing.findMany({ where: { id: { in: listingIds } }, select: listingSelect, orderBy: { updatedAt: 'desc' }, take: 20 })
        : [];
    } else if (query) {
      listings = await prisma.listing.findMany({
        where: {
          OR: [
            { title: { contains: query, mode: 'insensitive' as const } },
            { brand: { name: { contains: query, mode: 'insensitive' as const } } },
            { model: { name: { contains: query, mode: 'insensitive' as const } } },
          ],
        },
        select: listingSelect,
        orderBy: { updatedAt: 'desc' },
        take: 20,
      });
    }

    const matches = listings.map((listing) => {
      const verification = listing.vehicleVerification;
      return {
        listingId: listing.id,
        title: listing.title,
        brand: listing.brand.name,
        model: listing.model.name,
        status: listing.status,
        verificationStatus: verification?.status || 'NOT_VERIFIED',
        verificationSource: verification?.verificationSource || null,
        lastVerifiedAt: verification?.lastVerifiedAt?.toISOString() || null,
        fields: {
          registration: { present: Boolean(listing.registrationNumberKey || verification?.verifiedRegistrationNumber), value: null },
          chassis: { present: Boolean(listing.chassisNumberKey || verification?.verifiedChassisNumber), value: null },
          engine: { present: Boolean(verification?.verifiedEngineNumber), value: null },
        },
      };
    });

    return {
      found: matches.length > 0 || soldRecordCount > 0,
      searchType: args.listingId ? 'listing_id' : identifierKey ? 'vehicle_identifier' : 'listing_text',
      soldRecordCount,
      matches,
      maskedFields: ['registrationNumber', 'chassisNumber', 'engineNumber', 'ownerName', 'mobileNumber'],
    };
  },

  async soldVehicles(_context, args) {
    const periodDays = Math.min(90, Math.max(1, Math.floor(args.days ?? 30)));
    const from = daysBack(periodDays);
    const limit = Math.min(20, Math.max(1, Math.floor(args.limit ?? 10)));
    const where = { status: 'SOLD' as const, soldAt: { gte: from } };
    const [total, saleTotals, rows] = await Promise.all([
      prisma.listing.count({ where }),
      prisma.saleRecord.aggregate({ where: { soldAt: { gte: from } }, _count: { _all: true }, _sum: { soldPrice: true } }),
      prisma.listing.findMany({
        where,
        orderBy: { soldAt: 'desc' },
        take: limit,
        select: {
          id: true,
          title: true,
          manufacturingYear: true,
          locationCity: true,
          locationState: true,
          soldAt: true,
          brand: { select: { name: true } },
          model: { select: { name: true } },
          partner: { select: { partnerProfile: { select: { businessName: true, partnerCode: true } } } },
          saleRecord: { select: { soldPrice: true, soldAt: true, invoiceNo: true } },
        },
      }),
    ]);
    return {
      periodDays,
      total,
      saleRecordCount: saleTotals._count._all,
      totalSoldValue: numeric(saleTotals._sum.soldPrice),
      items: rows.map((row) => ({
        listingId: row.id,
        title: row.title,
        brand: row.brand.name,
        model: row.model.name,
        manufacturingYear: row.manufacturingYear,
        location: { city: row.locationCity, state: row.locationState },
        soldAt: row.saleRecord?.soldAt?.toISOString() ?? row.soldAt?.toISOString() ?? null,
        soldPrice: row.saleRecord ? numeric(row.saleRecord.soldPrice) : null,
        invoiceNo: row.saleRecord?.invoiceNo ?? null,
        partner: row.partner.partnerProfile
          ? { businessName: row.partner.partnerProfile.businessName, partnerCode: row.partner.partnerProfile.partnerCode }
          : null,
      })),
    };
  },

  async inventoryTrend(_context, args) {
    const periodDays = Math.min(90, Math.max(1, Math.floor(args.days ?? 30)));
    const from = daysBack(periodDays);
    const [daily, byStatus] = await Promise.all([
      prisma.$queryRaw<Array<{ date: string; created: number | bigint }>>(Prisma.sql`
        SELECT TO_CHAR(DATE_TRUNC('day', "createdAt"), 'YYYY-MM-DD') AS "date",
               COUNT(*)::int AS "created"
        FROM "Listing"
        WHERE "createdAt" >= ${from}
        GROUP BY 1
        ORDER BY 1 ASC
      `),
      prisma.listing.groupBy({ by: ['status'], _count: { _all: true } }),
    ]);
    return {
      periodDays,
      createdInPeriod: daily.reduce((sum, row) => sum + Number(row.created), 0),
      trend: daily.map((row) => ({ date: row.date, created: Number(row.created) })),
      inventoryByStatus: byStatus.map((row) => ({ status: row.status, count: row._count._all })),
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
    const [total, byAccount, byKyc, byType, byOnboarding, partners] = await Promise.all([
      prisma.partnerProfile.count(),
      prisma.partnerProfile.groupBy({ by: ['accountStatus'], _count: { _all: true } }),
      prisma.partnerProfile.groupBy({ by: ['kycStatus'], _count: { _all: true } }),
      prisma.partnerProfile.groupBy({ by: ['partnerType'], _count: { _all: true } }),
      prisma.partnerProfile.groupBy({ by: ['onboardingStatus'], _count: { _all: true } }),
      prisma.partnerProfile.findMany({
        orderBy: [{ updatedAt: 'desc' }, { createdAt: 'desc' }],
        take: 20,
        select: {
          partnerCode: true,
          businessName: true,
          partnerType: true,
          accountStatus: true,
          kycStatus: true,
          onboardingStatus: true,
          createdAt: true,
        },
      }),
    ]);
    return {
      total,
      returned: partners.length,
      hasMore: total > partners.length,
      items: partners.map(safePartnerSummaryItem),
      byAccountStatus: byAccount.map((row) => ({ status: row.accountStatus, count: row._count._all })),
      byKycStatus: byKyc.map((row) => ({ status: row.kycStatus, count: row._count._all })),
      byPartnerType: byType.map((row) => ({ type: row.partnerType, count: row._count._all })),
      byOnboardingStatus: byOnboarding.map((row) => ({ status: row.onboardingStatus, count: row._count._all })),
    };
  },

  async partnerPerformance(_context, args) {
    const periodDays = Math.min(90, Math.max(1, Math.floor(args.days ?? 30)));
    const limit = Math.min(20, Math.max(1, Math.floor(args.limit ?? 10)));
    const from = daysBack(periodDays);
    const partnerWhere: Prisma.PartnerProfileWhereInput = args.partnerId
      ? { userId: args.partnerId }
      : args.partnerCode
        ? { partnerCode: { equals: args.partnerCode.trim(), mode: 'insensitive' } }
        : {};
    const [partners, rows] = await Promise.all([
      prisma.partnerProfile.findMany({
        where: partnerWhere,
        take: 5_000,
        select: { userId: true, businessName: true, partnerCode: true, accountStatus: true, kycStatus: true },
      }),
      prisma.listing.groupBy({
        by: ['partnerId', 'status'],
        where: { createdAt: { gte: from } },
        _count: { _all: true },
        _sum: { views: true, price: true },
      }),
    ]);
    const grouped = new Map<string, { total: number; published: number; reserved: number; paused: number; sold: number; views: number; priceTotal: number }>();
    for (const row of rows) {
      const current = grouped.get(row.partnerId) ?? { total: 0, published: 0, reserved: 0, paused: 0, sold: 0, views: 0, priceTotal: 0 };
      const count = row._count._all;
      current.total += count;
      current.published += row.status === 'PUBLISHED' ? count : 0;
      current.reserved += row.status === 'RESERVED' ? count : 0;
      current.paused += row.status === 'PAUSED' ? count : 0;
      current.sold += row.status === 'SOLD' ? count : 0;
      current.views += row._sum.views ?? 0;
      current.priceTotal += numeric(row._sum.price);
      grouped.set(row.partnerId, current);
    }
    const performance = partners.map((partner) => {
      const stats = grouped.get(partner.userId) ?? { total: 0, published: 0, reserved: 0, paused: 0, sold: 0, views: 0, priceTotal: 0 };
      return {
        partnerId: partner.userId,
        businessName: partner.businessName,
        partnerCode: partner.partnerCode,
        accountStatus: partner.accountStatus,
        kycStatus: partner.kycStatus,
        listingsCreatedInPeriod: stats.total,
        published: stats.published,
        reserved: stats.reserved,
        paused: stats.paused,
        sold: stats.sold,
        totalViews: stats.views,
        averageListingPrice: stats.total ? Math.round((stats.priceTotal / stats.total) * 100) / 100 : 0,
        sellThroughRate: stats.total ? Math.round((stats.sold / stats.total) * 1000) / 10 : 0,
      };
    }).sort((a, b) => b.sold - a.sold || b.published - a.published || b.totalViews - a.totalViews);
    return { periodDays, partners: performance.slice(0, limit) };
  },

  async financeTrend(_context, args) {
    const periodDays = Math.min(90, Math.max(1, Math.floor(args.days ?? 30)));
    const from = daysBack(periodDays);
    const [daily, transactions] = await Promise.all([
      prisma.$queryRaw<Array<{ date: string; inflow: unknown; outflow: unknown; transfers: unknown; transactions: number | bigint }>>(Prisma.sql`
      SELECT TO_CHAR(DATE_TRUNC('day', "transactionDate"), 'YYYY-MM-DD') AS "date",
             COALESCE(SUM(CASE WHEN "type" = 'CREDIT' THEN "amount" ELSE 0 END), 0) AS "inflow",
             COALESCE(SUM(CASE WHEN "type" = 'DEBIT' THEN "amount" ELSE 0 END), 0) AS "outflow",
             COALESCE(SUM(CASE WHEN "type" = 'TRANSFER' THEN "amount" ELSE 0 END), 0) AS "transfers",
             COUNT(*)::int AS "transactions"
      FROM "FinanceTransaction"
      WHERE "status" <> 'VOIDED' AND "transactionDate" >= ${from}
      GROUP BY 1
      ORDER BY 1 ASC
      `),
      prisma.financeTransaction.findMany({
        where: { status: { not: 'VOIDED' }, transactionDate: { gte: from } },
        orderBy: { transactionDate: 'desc' },
        take: 20,
        select: {
          id: true,
          transactionDate: true,
          type: true,
          amount: true,
          balance: true,
          accountName: true,
          paymentMethod: true,
          category: true,
          status: true,
        },
      }),
    ]);
    const trend = daily.map((row) => {
      const inflow = numeric(row.inflow);
      const outflow = numeric(row.outflow);
      return {
        date: row.date,
        inflow,
        outflow,
        transfers: numeric(row.transfers),
        net: inflow - outflow,
        transactionCount: Number(row.transactions),
      };
    });
    return {
      periodDays,
      totals: {
        inflow: trend.reduce((sum, row) => sum + row.inflow, 0),
        outflow: trend.reduce((sum, row) => sum + row.outflow, 0),
        transfers: trend.reduce((sum, row) => sum + row.transfers, 0),
        net: trend.reduce((sum, row) => sum + row.net, 0),
        transactions: trend.reduce((sum, row) => sum + row.transactionCount, 0),
      },
      trend,
      returned: transactions.length,
      hasMore: transactions.length === 20,
      transactions: transactions.map(safeFinanceTransactionItem),
    };
  },

  async financeWorkspaceSummary(_context, args) {
    const periodDays = Math.min(90, Math.max(1, Math.floor(args.days ?? 30)));
    const from = daysBack(periodDays);
    const [settings, years, periods, accounts, banks, parties, costCentres, vouchers] = await Promise.all([
      prisma.finSettings.findUnique({ where: { id: 'default' }, select: { postingMode: true, baseCurrency: true, booksBeginDate: true } }),
      prisma.finFinancialYear.findMany({
        orderBy: [{ isCurrent: 'desc' }, { startDate: 'desc' }],
        take: 20,
        select: { label: true, status: true, isCurrent: true, startDate: true, endDate: true },
      }),
      prisma.finPeriod.groupBy({ by: ['status'], _count: { _all: true } }),
      prisma.finAccount.count(),
      prisma.finBankAccount.count({ where: { isActive: true } }),
      prisma.finParty.count({ where: { isActive: true } }),
      prisma.finCostCentre.count({ where: { isActive: true } }),
      prisma.finVoucher.count({ where: { date: { gte: from } } }),
    ]);
    return {
      periodDays,
      settings: {
        postingMode: settings?.postingMode ?? 'OFF',
        baseCurrency: settings?.baseCurrency ?? 'INR',
        booksBeginDate: isoDate(settings?.booksBeginDate),
      },
      currentYears: years.map((year) => ({
        label: year.label,
        status: year.status,
        isCurrent: year.isCurrent,
        startDate: isoDate(year.startDate),
        endDate: isoDate(year.endDate),
      })),
      counts: {
        accounts,
        activeBankAccounts: banks,
        activeParties: parties,
        activeCostCentres: costCentres,
        vouchersInPeriod: vouchers,
      },
      periodsByStatus: periods.map((row) => ({ status: row.status, count: row._count._all })),
      maskedFields: ['config', 'notes', 'partyNames', 'accountNumbers', 'userIds'],
    };
  },

  async invoiceSummary(_context, args) {
    const periodDays = Math.min(90, Math.max(1, Math.floor(args.days ?? 30)));
    const from = daysBack(periodDays);
    const limit = Math.min(20, Math.max(1, Math.floor(args.limit ?? 10)));
    const [documents, documentTotals, listingBills, sellInvoices, rows] = await Promise.all([
      prisma.finDocument.groupBy({ by: ['docType', 'status'], where: { date: { gte: from } }, _count: { _all: true }, _sum: { total: true } }),
      prisma.finDocument.aggregate({ where: { date: { gte: from } }, _count: { _all: true }, _sum: { total: true } }),
      prisma.listingBill.groupBy({ by: ['billType'], where: { createdAt: { gte: from } }, _count: { _all: true } }),
      prisma.sellAccount.count({ where: { deletedAt: null, invoiceGeneratedAt: { gte: from } } }),
      prisma.finDocument.findMany({
        where: { date: { gte: from } },
        orderBy: { date: 'desc' },
        take: limit,
        select: { number: true, docType: true, status: true, date: true, total: true },
      }),
    ]);
    return {
      periodDays,
      totals: {
        financeDocuments: documentTotals._count._all,
        financeDocumentValue: numeric(documentTotals._sum.total),
        sellAccountInvoices: sellInvoices,
      },
      byDocument: documents.map((row) => ({ docType: row.docType, status: row.status, count: row._count._all, total: numeric(row._sum.total) })),
      listingBills: listingBills.map((row) => ({ billType: row.billType, count: row._count._all })),
      documents: rows.map((row) => ({ number: row.number, docType: row.docType, status: row.status, date: isoDate(row.date), total: numeric(row.total) })),
      returned: rows.length,
      hasMore: rows.length === limit,
      maskedFields: ['partyId', 'partyName', 'notes', 'lineDescriptions', 'createdById'],
    };
  },

  async paymentSummary(_context, args) {
    const periodDays = Math.min(90, Math.max(1, Math.floor(args.days ?? 30)));
    const from = daysBack(periodDays);
    const [salePayments, listingPayments, saleTotal, listingTotal] = await Promise.all([
      prisma.sellAccountPayment.groupBy({ by: ['side', 'method', 'receiptStatus'], where: { paymentDate: { gte: from }, cancelledAt: null }, _count: { _all: true }, _sum: { amount: true } }),
      prisma.listingPaymentSubmission.groupBy({ by: ['status', 'method'], where: { submittedAt: { gte: from } }, _count: { _all: true }, _sum: { amount: true } }),
      prisma.sellAccountPayment.aggregate({ where: { paymentDate: { gte: from }, cancelledAt: null }, _count: { _all: true }, _sum: { amount: true } }),
      prisma.listingPaymentSubmission.aggregate({ where: { submittedAt: { gte: from } }, _count: { _all: true }, _sum: { amount: true } }),
    ]);
    return {
      periodDays,
      totals: {
        saleReceipts: saleTotal._count._all,
        saleReceiptAmount: numeric(saleTotal._sum.amount),
        listingSubmissions: listingTotal._count._all,
        listingSubmissionAmount: numeric(listingTotal._sum.amount),
        amount: numeric(saleTotal._sum.amount) + numeric(listingTotal._sum.amount),
      },
      saleReceiptsByStatus: salePayments.map((row) => ({ side: row.side, method: row.method, receiptStatus: row.receiptStatus, count: row._count._all, amount: numeric(row._sum.amount) })),
      listingPaymentsByStatus: listingPayments.map((row) => ({ status: row.status, method: row.method, count: row._count._all, amount: numeric(row._sum.amount) })),
      maskedFields: ['reference', 'drawnOn', 'note', 'paymentNote', 'transactionRef', 'buyerId', 'partnerId'],
    };
  },

  async marginSummary(_context, args) {
    const periodDays = Math.min(90, Math.max(1, Math.floor(args.days ?? 30)));
    const from = daysBack(periodDays);
    const [totals, byStatus] = await Promise.all([
      prisma.sellAccount.aggregate({
        where: { deletedAt: null, sellDate: { gte: from } },
        _count: { _all: true },
        _sum: { purchaseAmount: true, sellAmount: true, expenses: true, netProfit: true, netProfitAfterGst: true, balanceAmount: true },
      }),
      prisma.sellAccount.groupBy({
        by: ['dealStatus'],
        where: { deletedAt: null, sellDate: { gte: from } },
        _count: { _all: true },
        _sum: { sellAmount: true, netProfitAfterGst: true },
      }),
    ]);
    const sales = numeric(totals._sum.sellAmount);
    const profitAfterGst = numeric(totals._sum.netProfitAfterGst);
    return {
      periodDays,
      deals: totals._count._all,
      totals: {
        purchaseAmount: numeric(totals._sum.purchaseAmount),
        sellAmount: sales,
        expenses: numeric(totals._sum.expenses),
        netProfit: numeric(totals._sum.netProfit),
        netProfitAfterGst: profitAfterGst,
        balanceAmount: numeric(totals._sum.balanceAmount),
        marginPercent: sales ? Math.round((profitAfterGst / sales) * 10000) / 100 : 0,
        averageProfitAfterGst: totals._count._all ? Math.round((profitAfterGst / totals._count._all) * 100) / 100 : 0,
      },
      byDealStatus: byStatus.map((row) => ({ status: row.dealStatus, count: row._count._all, sellAmount: numeric(row._sum.sellAmount), netProfitAfterGst: numeric(row._sum.netProfitAfterGst) })),
    };
  },

  async walletSummary(_context, args) {
    const periodDays = Math.min(90, Math.max(1, Math.floor(args.days ?? 30)));
    const from = daysBack(periodDays);
    const [wallet, usage, ledger] = await Promise.all([
      prisma.apiWallet.findUnique({ where: { id: 'platform' }, select: { currency: true, balancePaise: true, mode: true, updatedAt: true } }),
      prisma.apiUsageRecord.aggregate({ where: { createdAt: { gte: from } }, _count: { _all: true }, _sum: { amountPaise: true } }),
      prisma.apiWalletLedger.groupBy({ by: ['type', 'serviceKey'], where: { createdAt: { gte: from } }, _count: { _all: true }, _sum: { amountPaise: true } }),
    ]);
    return {
      periodDays,
      wallet: wallet ? { currency: wallet.currency, balance: wallet.balancePaise / 100, mode: wallet.mode, updatedAt: isoDate(wallet.updatedAt) } : null,
      usage: { count: usage._count._all, chargedAmount: numeric(usage._sum.amountPaise) / 100 },
      ledger: ledger.map((row) => ({ type: row.type, serviceKey: row.serviceKey, count: row._count._all, amount: numeric(row._sum.amountPaise) / 100 })),
      maskedFields: ['requestedById', 'externalTransactionId', 'idempotencyKey', 'metadata', 'verificationRecordId', 'providerAttemptId'],
    };
  },

  async apiBillingSummary(_context, args) {
    const periodDays = Math.min(90, Math.max(1, Math.floor(args.days ?? 30)));
    const from = daysBack(periodDays);
    const [usage, prices, webhookByStatus, webhookByType] = await Promise.all([
      prisma.apiUsageRecord.groupBy({ by: ['serviceKey'], where: { createdAt: { gte: from } }, _count: { _all: true }, _sum: { amountPaise: true } }),
      prisma.apiServicePrice.findMany({ orderBy: { serviceKey: 'asc' }, select: { serviceKey: true, amountPaise: true, active: true, version: true, updatedAt: true } }),
      prisma.apiBillingWebhookEvent.groupBy({ by: ['status'], where: { createdAt: { gte: from } }, _count: { _all: true } }),
      prisma.apiBillingWebhookEvent.groupBy({ by: ['eventType'], where: { createdAt: { gte: from } }, _count: { _all: true } }),
    ]);
    return {
      periodDays,
      usage: usage.map((row) => ({ serviceKey: row.serviceKey, count: row._count._all, amount: numeric(row._sum.amountPaise) / 100 })),
      configuredPrices: prices.map((row) => ({ serviceKey: row.serviceKey, amount: row.amountPaise / 100, active: row.active, version: row.version, updatedAt: isoDate(row.updatedAt) })),
      webhooks: {
        byStatus: webhookByStatus.map((row) => ({ status: row.status, count: row._count._all })),
        byEventType: webhookByType.map((row) => ({ eventType: row.eventType, count: row._count._all })),
      },
      maskedFields: ['eventId', 'payloadChecksum', 'outcome', 'providerAttemptId', 'verificationRecordId'],
    };
  },

  async sellAccountsSummary(_context, args) {
    const periodDays = Math.min(90, Math.max(1, Math.floor(args.days ?? 30)));
    const from = daysBack(periodDays);
    const limit = Math.min(20, Math.max(1, Math.floor(args.limit ?? 10)));
    const where = { deletedAt: null, createdAt: { gte: from } };
    const [total, byStatus, byDraft, byLock, totals, rows] = await Promise.all([
      prisma.sellAccount.count({ where }),
      prisma.sellAccount.groupBy({ by: ['dealStatus'], where, _count: { _all: true } }),
      prisma.sellAccount.groupBy({ by: ['isDraft'], where, _count: { _all: true } }),
      prisma.sellAccount.groupBy({ by: ['isLocked'], where, _count: { _all: true } }),
      prisma.sellAccount.aggregate({ where, _sum: { purchaseAmount: true, sellAmount: true, expenses: true, netProfitAfterGst: true } }),
      prisma.sellAccount.findMany({
        where,
        orderBy: { updatedAt: 'desc' },
        take: limit,
        select: { recordNumber: true, sellDate: true, dealStatus: true, isDraft: true, isLocked: true, invoiceNumber: true, creditNoteNumber: true, purchaseAmount: true, sellAmount: true, expenses: true, netProfitAfterGst: true },
      }),
    ]);
    return {
      periodDays,
      total,
      totals: { purchaseAmount: numeric(totals._sum.purchaseAmount), sellAmount: numeric(totals._sum.sellAmount), expenses: numeric(totals._sum.expenses), netProfitAfterGst: numeric(totals._sum.netProfitAfterGst) },
      byStatus: byStatus.map((row) => ({ status: row.dealStatus, count: row._count._all })),
      byDraftState: byDraft.map((row) => ({ isDraft: row.isDraft, count: row._count._all })),
      byLockState: byLock.map((row) => ({ isLocked: row.isLocked, count: row._count._all })),
      items: rows.map((row) => ({ recordNumber: row.recordNumber, sellDate: isoDate(row.sellDate), dealStatus: row.dealStatus, isDraft: row.isDraft, isLocked: row.isLocked, hasInvoice: Boolean(row.invoiceNumber), hasCreditNote: Boolean(row.creditNoteNumber), purchaseAmount: numeric(row.purchaseAmount), sellAmount: numeric(row.sellAmount), expenses: numeric(row.expenses), netProfitAfterGst: numeric(row.netProfitAfterGst) })),
      returned: rows.length,
      hasMore: rows.length === limit,
      maskedFields: ['listingTitle', 'vehicleNumber', 'chassisNumber', 'ownerName', 'sellerName', 'purchaserName', 'remarks', 'documents'],
    };
  },

  async refundSummary(_context, args) {
    const periodDays = Math.min(90, Math.max(1, Math.floor(args.days ?? 30)));
    const from = daysBack(periodDays);
    const limit = Math.min(20, Math.max(1, Math.floor(args.limit ?? 10)));
    const where = { createdAt: { gte: from } };
    const [total, byStatus, byReason, byMethod, totals, rows] = await Promise.all([
      prisma.sellAccountRefund.count({ where }),
      prisma.sellAccountRefund.groupBy({ by: ['status'], where, _count: { _all: true }, _sum: { amount: true, forfeitAmount: true } }),
      prisma.sellAccountRefund.groupBy({ by: ['reason'], where, _count: { _all: true }, _sum: { amount: true } }),
      prisma.sellAccountRefund.groupBy({ by: ['method'], where, _count: { _all: true }, _sum: { amount: true } }),
      prisma.sellAccountRefund.aggregate({ where, _sum: { amount: true, forfeitAmount: true } }),
      prisma.sellAccountRefund.findMany({ where, orderBy: { createdAt: 'desc' }, take: limit, select: { refundNumber: true, status: true, reason: true, amount: true, forfeitAmount: true, method: true, refundDate: true, paidAt: true } }),
    ]);
    return {
      periodDays,
      total,
      totals: { amount: numeric(totals._sum.amount), forfeitAmount: numeric(totals._sum.forfeitAmount) },
      byStatus: byStatus.map((row) => ({ status: row.status, count: row._count._all, amount: numeric(row._sum.amount), forfeitAmount: numeric(row._sum.forfeitAmount) })),
      byReason: byReason.map((row) => ({ reason: row.reason, count: row._count._all, amount: numeric(row._sum.amount) })),
      byMethod: byMethod.map((row) => ({ method: row.method, count: row._count._all, amount: numeric(row._sum.amount) })),
      items: rows.map((row) => ({ refundNumber: row.refundNumber, status: row.status, reason: row.reason, amount: numeric(row.amount), forfeitAmount: numeric(row.forfeitAmount), method: row.method, refundDate: isoDate(row.refundDate), paidAt: isoDate(row.paidAt) })),
      returned: rows.length,
      hasMore: rows.length === limit,
      maskedFields: ['sellAccountId', 'reference', 'drawnOn', 'note', 'requestedById', 'approvedById', 'rejectReason'],
    };
  },

  async accountingSummary(_context, args) {
    const periodDays = Math.min(90, Math.max(1, Math.floor(args.days ?? 30)));
    const from = daysBack(periodDays);
    const [accounts, groups, banks, categoryMaps, vouchers] = await Promise.all([
      prisma.finAccount.groupBy({ by: ['kind', 'isActive'], _count: { _all: true } }),
      prisma.finAccountGroup.count(),
      prisma.finBankAccount.count({ where: { isActive: true } }),
      prisma.finCategoryMap.count(),
      prisma.finVoucher.groupBy({ by: ['status'], where: { date: { gte: from } }, _count: { _all: true }, _sum: { totalAmount: true } }),
    ]);
    return {
      periodDays,
      chartOfAccounts: {
        groups,
        categoryMaps,
        activeBankAccounts: banks,
        byKindAndState: accounts.map((row) => ({ kind: row.kind, isActive: row.isActive, count: row._count._all })),
      },
      vouchers: vouchers.map((row) => ({ status: row.status, count: row._count._all, totalAmount: numeric(row._sum.totalAmount) })),
      maskedFields: ['accountDescriptions', 'partyIds', 'notes', 'attachments', 'userIds'],
    };
  },

  async journalSummary(_context, args) {
    const periodDays = Math.min(90, Math.max(1, Math.floor(args.days ?? 30)));
    const from = daysBack(periodDays);
    const limit = Math.min(20, Math.max(1, Math.floor(args.limit ?? 10)));
    const [vouchers, lines, rows] = await Promise.all([
      prisma.finVoucher.groupBy({ by: ['type', 'status'], where: { date: { gte: from } }, _count: { _all: true }, _sum: { totalAmount: true } }),
      prisma.finVoucherLine.aggregate({ where: { voucher: { date: { gte: from }, status: { not: 'REJECTED' } } }, _count: { _all: true }, _sum: { debit: true, credit: true } }),
      prisma.finVoucher.findMany({ where: { date: { gte: from } }, orderBy: { date: 'desc' }, take: limit, select: { number: true, type: true, date: true, status: true, totalAmount: true, paymentMethod: true } }),
    ]);
    return {
      periodDays,
      totals: { vouchers: vouchers.reduce((sum, row) => sum + row._count._all, 0), lines: lines._count._all, debit: numeric(lines._sum.debit), credit: numeric(lines._sum.credit) },
      byTypeAndStatus: vouchers.map((row) => ({ type: row.type, status: row.status, count: row._count._all, totalAmount: numeric(row._sum.totalAmount) })),
      items: rows.map((row) => ({ number: row.number, type: row.type, date: isoDate(row.date), status: row.status, totalAmount: numeric(row.totalAmount), paymentMethod: row.paymentMethod })),
      returned: rows.length,
      hasMore: rows.length === limit,
      maskedFields: ['narration', 'reference', 'partyId', 'sellAccountId', 'idempotencyKey', 'attachments', 'createdById'],
    };
  },

  async forecastOperations(context, args) {
    const metric = args.metric ?? 'sales';
    const permissions = forecastPermissionsFor(metric);
    if (!hasPermission(context, permissions)) {
      throw new AiToolError('You do not have permission to forecast this operational metric.', 403, 'AI_TOOL_PERMISSION_REQUIRED');
    }
    return aiForecastingService.forecast(args);
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

  async rtoDocumentsSummary(_context, args) {
    const periodDays = Math.min(90, Math.max(1, Math.floor(args.days ?? 30)));
    const limit = Math.min(20, Math.max(1, Math.floor(args.limit ?? 10)));
    const from = daysBack(periodDays);
    const [total, byStatus, records, tasks] = await Promise.all([
      prisma.vehicleRtoRecord.count({ where: { createdAt: { gte: from } } }),
      prisma.vehicleRtoRecord.groupBy({ by: ['rtoStatus'], where: { createdAt: { gte: from } }, _count: { _all: true } }),
      prisma.vehicleRtoRecord.findMany({
        where: { createdAt: { gte: from } },
        orderBy: { updatedAt: 'desc' },
        take: limit,
        select: {
          id: true,
          listingId: true,
          rtoStatus: true,
          isLocked: true,
          documentSendDate: true,
          taxStatus: true,
          fitnessStatus: true,
          insuranceStatus: true,
          pucStatus: true,
          hsrpStatus: true,
          updatedAt: true,
          listing: { select: { title: true } },
          transferTasks: { select: { status: true, isOptional: true, documents: true } },
        },
      }),
      prisma.rtoTransferTask.findMany({
        where: { rtoRecord: { createdAt: { gte: from } } },
        select: { status: true, isOptional: true, documents: true },
      }),
    ]);
    const completedStatuses = new Set(['TRANSFERRED', 'NOT_REQUIRED']);
    const taskSummary = tasks.reduce((summary, task) => {
      const documents = Array.isArray(task.documents) ? task.documents.length : task.documents ? 1 : 0;
      summary.total += 1;
      summary.completed += completedStatuses.has(task.status) ? 1 : 0;
      summary.pending += completedStatuses.has(task.status) ? 0 : 1;
      summary.optionalPending += !completedStatuses.has(task.status) && task.isOptional ? 1 : 0;
      summary.documentsUploaded += documents;
      return summary;
    }, { total: 0, completed: 0, pending: 0, optionalPending: 0, documentsUploaded: 0 });

    return {
      periodDays,
      total,
      byStatus: byStatus.map((row) => ({ status: row.rtoStatus, count: row._count._all })),
      taskSummary,
      items: records.map((record) => {
        const recordTasks = record.transferTasks;
        const completed = recordTasks.filter((task) => completedStatuses.has(task.status)).length;
        return {
          rtoRecordId: record.id,
          listingId: record.listingId,
          listingTitle: record.listing?.title || null,
          status: record.rtoStatus,
          locked: record.isLocked,
          documentSendDate: record.documentSendDate?.toISOString() || null,
          compliance: {
            tax: record.taxStatus,
            fitness: record.fitnessStatus,
            insurance: record.insuranceStatus,
            puc: record.pucStatus,
            hsrp: record.hsrpStatus,
          },
          taskProgress: { total: recordTasks.length, completed, pending: recordTasks.length - completed },
          updatedAt: record.updatedAt.toISOString(),
        };
      }),
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

  async categoriesSummary(_context, args) {
    const limit = Math.min(20, Math.max(1, Math.floor(args.limit ?? 20)));
    const [total, rows] = await Promise.all([
      prisma.category.count({ where: { partnerProfileId: null } }),
      prisma.category.findMany({
        where: { partnerProfileId: null },
        orderBy: { name: 'asc' },
        take: limit,
        select: { id: true, name: true, _count: { select: { listings: true } } },
      }),
    ]);
    return {
      total,
      returned: rows.length,
      hasMore: total > rows.length,
      items: rows.map((row) => ({ categoryId: row.id, name: row.name, listingCount: row._count.listings })),
      maskedFields: ['iconId', 'svgData', 'partnerProfileId'],
    };
  },

  async brandsSummary(_context, args) {
    const limit = Math.min(20, Math.max(1, Math.floor(args.limit ?? 20)));
    const [total, rows] = await Promise.all([
      prisma.brand.count(),
      prisma.brand.findMany({
        orderBy: { name: 'asc' },
        take: limit,
        select: { id: true, name: true, _count: { select: { models: true, listings: true } } },
      }),
    ]);
    return {
      total,
      returned: rows.length,
      hasMore: total > rows.length,
      items: rows.map((row) => ({ brandId: row.id, name: row.name, modelCount: row._count.models, listingCount: row._count.listings })),
    };
  },

  async modelsSummary(_context, args) {
    const limit = Math.min(20, Math.max(1, Math.floor(args.limit ?? 20)));
    const where = args.brandId ? { brandId: args.brandId } : {};
    const [total, rows] = await Promise.all([
      prisma.model.count({ where }),
      prisma.model.findMany({
        where,
        orderBy: [{ brand: { name: 'asc' } }, { name: 'asc' }],
        take: limit,
        select: { id: true, name: true, brand: { select: { id: true, name: true } }, _count: { select: { listings: true } } },
      }),
    ]);
    return {
      total,
      returned: rows.length,
      hasMore: total > rows.length,
      ...(args.brandId ? { brandFilter: args.brandId } : {}),
      items: rows.map((row) => ({ modelId: row.id, name: row.name, brand: row.brand, listingCount: row._count.listings })),
    };
  },

  async locationsSummary(_context, args) {
    const limit = Math.min(20, Math.max(1, Math.floor(args.limit ?? 20)));
    const rows = await prisma.listing.groupBy({
      by: ['locationState', 'locationCity'],
      _count: { _all: true },
      orderBy: { _count: { id: 'desc' } },
      take: limit,
    });
    return {
      total: rows.length,
      returned: rows.length,
      hasMore: rows.length === limit,
      items: rows.map((row) => ({ state: row.locationState, city: row.locationCity, listingCount: row._count._all })),
    };
  },

  async blogsSummary(_context, args) {
    const periodDays = Math.min(90, Math.max(1, Math.floor(args.days ?? 30)));
    const from = daysBack(periodDays);
    const limit = Math.min(20, Math.max(1, Math.floor(args.limit ?? 10)));
    const [total, published, questions, rows] = await Promise.all([
      prisma.blogPost.count(),
      prisma.blogPost.groupBy({ by: ['isPublished'], _count: { _all: true } }),
      prisma.blogQuestion.groupBy({ by: ['status'], where: { createdAt: { gte: from } }, _count: { _all: true } }),
      prisma.blogPost.findMany({
        orderBy: { updatedAt: 'desc' },
        take: limit,
        select: { id: true, title: true, slug: true, isPublished: true, publishedAt: true, createdAt: true, updatedAt: true, _count: { select: { questions: true } } },
      }),
    ]);
    return {
      periodDays,
      total,
      publication: published.map((row) => ({ isPublished: row.isPublished, count: row._count._all })),
      questions: questions.map((row) => ({ status: row.status, count: row._count._all })),
      items: rows.map((row) => ({ blogId: row.id, title: row.title, slug: row.slug, isPublished: row.isPublished, publishedAt: isoDate(row.publishedAt), createdAt: isoDate(row.createdAt), updatedAt: isoDate(row.updatedAt), questionCount: row._count.questions })),
      returned: rows.length,
      hasMore: rows.length === limit,
      maskedFields: ['contentHtml', 'coverImageUrl', 'askedById', 'question', 'answer', 'createdById'],
    };
  },

  async translationsSummary(_context, args) {
    const limit = Math.min(20, Math.max(1, Math.floor(args.limit ?? 20)));
    const [registryTotal, overrideTotal, registry, overrides] = await Promise.all([
      prisma.translationKeyRegistry.count(),
      prisma.translationOverride.count(),
      prisma.translationKeyRegistry.groupBy({ by: ['app', 'namespace'], _count: { _all: true }, _max: { updatedAt: true }, orderBy: { app: 'asc' }, take: limit }),
      prisma.translationOverride.groupBy({ by: ['app', 'locale'], _count: { _all: true }, _max: { updatedAt: true }, orderBy: { app: 'asc' }, take: limit }),
    ]);
    return {
      totalKeys: registryTotal,
      overrides: overrideTotal,
      registryByNamespace: registry.map((row) => ({ app: row.app, namespace: row.namespace, count: row._count._all, updatedAt: isoDate(row._max.updatedAt) })),
      overridesByLocale: overrides.map((row) => ({ app: row.app, locale: row.locale, count: row._count._all, updatedAt: isoDate(row._max.updatedAt) })),
      maskedFields: ['baseValue', 'value', 'translationKey'],
    };
  },

  async settingsSummary() {
    const [runtimeCount, latestRuntime, email, pan] = await Promise.all([
      prisma.platformRuntimeSettings.count(),
      prisma.platformRuntimeSettings.findFirst({ orderBy: { updatedAt: 'desc' }, select: { updatedAt: true } }),
      prisma.emailOtpIntegrationSettings.findUnique({ where: { id: 'default' }, select: { enabled: true, smtpHost: true, smtpPort: true, smtpSecure: true, senderName: true, otpExpiryMinutes: true, otpLength: true, updatedAt: true } }),
      prisma.panVerificationSettings.findUnique({ where: { id: 'default' }, select: { enabled: true, activeEnvironment: true, baseUrl: true, sandboxBaseUrl: true, productionBaseUrl: true, encryptedToken: true, encryptedSandboxToken: true, encryptedProductionToken: true, encryptedCustomerId: true, encryptedSandboxCustomerId: true, encryptedProductionCustomerId: true, encryptedDataSecret: true, updatedAt: true } }),
    ]);
    return {
      runtimeSettings: { count: runtimeCount, latestUpdatedAt: isoDate(latestRuntime?.updatedAt) },
      emailOtp: email ? { enabled: email.enabled, smtpConfigured: Boolean(email.smtpHost && email.smtpPort), secureTransport: email.smtpSecure, senderConfigured: Boolean(email.senderName), otpExpiryMinutes: email.otpExpiryMinutes, otpLength: email.otpLength, updatedAt: isoDate(email.updatedAt) } : null,
      panVerification: pan ? { enabled: pan.enabled, environment: pan.activeEnvironment, baseUrlConfigured: Boolean(pan.baseUrl || pan.sandboxBaseUrl || pan.productionBaseUrl), credentialsConfigured: Boolean(pan.encryptedToken || pan.encryptedSandboxToken || pan.encryptedProductionToken), customerIdConfigured: Boolean(pan.encryptedCustomerId || pan.encryptedSandboxCustomerId || pan.encryptedProductionCustomerId), dataEncryptionConfigured: Boolean(pan.encryptedDataSecret), updatedAt: isoDate(pan.updatedAt) } : null,
      maskedFields: ['payload', 'encryptedToken', 'encryptedCustomerId', 'encryptedDataSecret', 'senderEmail'],
    };
  },

  async usersSummary(_context, args) {
    const periodDays = Math.min(90, Math.max(1, Math.floor(args.days ?? 30)));
    const from = daysBack(periodDays);
    const [total, recent, byRoleStatus] = await Promise.all([
      prisma.user.count({ where: { archivedAt: null } }),
      prisma.user.count({ where: { archivedAt: null, createdAt: { gte: from } } }),
      prisma.user.groupBy({ by: ['role', 'status'], where: { archivedAt: null }, _count: { _all: true } }),
    ]);
    return {
      periodDays,
      total,
      createdInPeriod: recent,
      byRoleAndStatus: byRoleStatus.map((row) => ({ role: row.role, status: row.status, count: row._count._all })),
      maskedFields: ['id', 'name', 'email', 'mobile', 'whatsappNumber', 'password', 'fcmToken', 'pushSubscription'],
    };
  },

  async rolesSummary(_context, args) {
    const limit = Math.min(20, Math.max(1, Math.floor(args.limit ?? 20)));
    const [total, rows] = await Promise.all([
      prisma.customRole.count(),
      prisma.customRole.findMany({ orderBy: { createdAt: 'desc' }, take: limit, select: { name: true, description: true, createdAt: true, updatedAt: true, _count: { select: { users: true } } } }),
    ]);
    return {
      total,
      returned: rows.length,
      hasMore: total > rows.length,
      items: rows.map((row) => ({ name: row.name, description: row.description, assignedUserCount: row._count.users, createdAt: isoDate(row.createdAt), updatedAt: isoDate(row.updatedAt) })),
      maskedFields: ['permissions', 'userIds'],
    };
  },

  async subscriptionsSummary(_context, args) {
    const periodDays = Math.min(90, Math.max(1, Math.floor(args.days ?? 30)));
    const from = daysBack(periodDays);
    const [total, submissions, amounts, expiring] = await Promise.all([
      prisma.customerPrimeSubscription.count(),
      prisma.customerPrimeSubscription.groupBy({ by: ['status'], where: { submittedAt: { gte: from } }, _count: { _all: true }, _sum: { paidAmount: true } }),
      prisma.customerPrimeSubscription.aggregate({ where: { submittedAt: { gte: from } }, _sum: { paidAmount: true } }),
      prisma.customerPrimeSubscription.count({ where: { expiresAt: { gte: new Date(), lte: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) }, status: 'ACTIVE' } }),
    ]);
    return {
      periodDays,
      total,
      submittedInPeriod: submissions.reduce((sum, row) => sum + row._count._all, 0),
      paidAmountInPeriod: numeric(amounts._sum.paidAmount),
      activeExpiringWithin30Days: expiring,
      byStatus: submissions.map((row) => ({ status: row.status, count: row._count._all, paidAmount: numeric(row._sum.paidAmount) })),
      maskedFields: ['userId', 'transactionRef', 'paymentNote', 'receiptUrl', 'paidUpiId', 'settingsSnapshot', 'rejectionReason'],
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

  async verificationSummary(context, args) {
    return verificationSummaryFor(context, args);
  },

  async surepassStatus(context) {
    const [settings, storedVerification] = await Promise.all([
      prisma.panVerificationSettings.findUnique({
        where: { id: 'default' },
        select: {
          enabled: true,
          activeEnvironment: true,
          baseUrl: true,
          sandboxBaseUrl: true,
          productionBaseUrl: true,
          encryptedToken: true,
          encryptedSandboxToken: true,
          encryptedProductionToken: true,
          encryptedDataSecret: true,
          updatedAt: true,
        },
      }),
      verificationSummaryFor(context, { days: 30 }),
    ]);
    const tokenConfigured = Boolean(settings?.encryptedToken || settings?.encryptedSandboxToken || settings?.encryptedProductionToken);
    const baseUrlConfigured = Boolean(settings?.baseUrl || settings?.sandboxBaseUrl || settings?.productionBaseUrl);
    return {
      provider: 'SUREPASS',
      enabled: Boolean(settings?.enabled),
      configured: Boolean(tokenConfigured && baseUrlConfigured),
      readyForExternalVerification: Boolean(settings?.enabled && tokenConfigured && baseUrlConfigured && settings?.encryptedDataSecret),
      environment: settings?.activeEnvironment || null,
      baseUrlConfigured,
      tokenConfigured,
      encryptionConfigured: Boolean(settings?.encryptedDataSecret),
      storedVerification: {
        periodDays: storedVerification.periodDays,
        total: storedVerification.total,
        sources: storedVerification.sources,
      },
      externalLookupTriggered: false,
      maskedFields: [...VERIFICATION_MASKED_FIELDS, 'apiToken', 'customerId', 'dataSecret', 'baseUrl'],
      updatedAt: settings?.updatedAt?.toISOString() || null,
    };
  },

  async whatsappStatus(_context, args) {
    const periodDays = Math.min(90, Math.max(1, Math.floor(args.days ?? 30)));
    const from = daysBack(periodDays);
    const [settings, templates, enabledRules, messageStatuses, outboxStatuses] = await Promise.all([
      prisma.whatsAppIntegrationSettings.findUnique({
        where: { id: 'default' },
        select: {
          enabled: true,
          graphApiVersion: true,
          phoneNumberId: true,
          businessAccountId: true,
          encryptedAccessToken: true,
          encryptedWebhookVerifyToken: true,
          encryptedAppSecret: true,
          updatedAt: true,
        },
      }),
      prisma.whatsAppMetaTemplate.groupBy({ by: ['status'], _count: { _all: true } }),
      prisma.whatsAppAutomationRule.count({ where: { enabled: true } }),
      prisma.whatsAppMessageLog.groupBy({ by: ['status'], where: { createdAt: { gte: from } }, _count: { _all: true } }),
      prisma.whatsAppOutbox.groupBy({ by: ['status'], where: { createdAt: { gte: from } }, _count: { _all: true } }),
    ]);
    const accessTokenConfigured = Boolean(settings?.encryptedAccessToken);
    const readyForDelivery = Boolean(settings?.enabled && settings?.phoneNumberId && accessTokenConfigured);
    return {
      periodDays,
      integration: {
        enabled: Boolean(settings?.enabled),
        readyForDelivery,
        graphApiVersion: settings?.graphApiVersion || null,
        phoneNumberConfigured: Boolean(settings?.phoneNumberId),
        businessAccountConfigured: Boolean(settings?.businessAccountId),
        accessTokenConfigured,
        webhookVerifyTokenConfigured: Boolean(settings?.encryptedWebhookVerifyToken),
        appSecretConfigured: Boolean(settings?.encryptedAppSecret),
      },
      templatesByStatus: templates.map((row) => ({ status: row.status, count: row._count._all })),
      enabledAutomationRules: enabledRules,
      messageByStatus: messageStatuses.map((row) => ({ status: row.status, count: row._count._all })),
      outboxByStatus: outboxStatuses.map((row) => ({ status: row.status, count: row._count._all })),
      maskedFields: ['accessToken', 'webhookVerifyToken', 'appSecret', 'recipientPhone', 'payloadSnapshot'],
      updatedAt: settings?.updatedAt?.toISOString() || null,
    };
  },

  async whatsappCampaignsSummary(_context, args) {
    const periodDays = Math.min(90, Math.max(1, Math.floor(args.days ?? 30)));
    const from = daysBack(periodDays);
    const [total, byStatus, campaigns, recipientByStatus] = await Promise.all([
      prisma.whatsAppCampaign.count({ where: { createdAt: { gte: from } } }),
      prisma.whatsAppCampaign.groupBy({ by: ['status'], where: { createdAt: { gte: from } }, _count: { _all: true } }),
      prisma.whatsAppCampaign.findMany({
        where: { createdAt: { gte: from } },
        orderBy: { createdAt: 'desc' },
        take: 20,
        select: {
          id: true,
          name: true,
          category: true,
          status: true,
          createdAt: true,
          updatedAt: true,
          template: { select: { name: true, language: true, status: true } },
          _count: { select: { recipients: true } },
        },
      }),
      prisma.whatsAppCampaignRecipient.groupBy({
        by: ['status'],
        where: { createdAt: { gte: from } },
        _count: { _all: true },
      }),
    ]);
    return {
      periodDays,
      total,
      byStatus: byStatus.map((row) => ({ status: row.status, count: row._count._all })),
      recipientByStatus: recipientByStatus.map((row) => ({ status: row.status, count: row._count._all })),
      returned: campaigns.length,
      hasMore: total > campaigns.length,
      campaigns: campaigns.map((campaign) => ({
        campaignId: campaign.id,
        name: campaign.name,
        category: campaign.category,
        status: campaign.status,
        template: {
          name: campaign.template.name,
          language: campaign.template.language,
          status: campaign.template.status,
        },
        recipientCount: campaign._count.recipients,
        createdAt: campaign.createdAt.toISOString(),
        updatedAt: campaign.updatedAt.toISOString(),
      })),
      maskedFields: ['audienceFilters', 'createdByUserId', 'confirmedByUserId', 'recipientPhone', 'errorMessage'],
    };
  },

  async communicationDeliverySummary(context, args) {
    const periodDays = Math.min(90, Math.max(1, Math.floor(args.days ?? 30)));
    const from = daysBack(periodDays);
    const canReadWhatsApp = hasPermission(context, ['whatsapp.read', 'whatsapp.manage']);
    const canReadSms = hasPermission(context, ['sms.read', 'sms.manage']);
    if (!canReadWhatsApp && !canReadSms) {
      throw new AiToolError('You do not have permission to view communication delivery logs.', 403, 'AI_TOOL_PERMISSION_REQUIRED');
    }
    const [whatsapp, sms] = await Promise.all([
      canReadWhatsApp
        ? Promise.all([
          prisma.whatsAppMessageLog.count({ where: { createdAt: { gte: from } } }),
          prisma.whatsAppMessageLog.groupBy({ by: ['status'], where: { createdAt: { gte: from } }, _count: { _all: true } }),
          prisma.whatsAppMessageLog.groupBy({ by: ['eventCode'], where: { createdAt: { gte: from } }, _count: { _all: true }, orderBy: { _count: { eventCode: 'desc' } }, take: 10 }),
        ])
        : Promise.resolve(null),
      canReadSms
        ? Promise.all([
          prisma.smsMessageLog.count({ where: { createdAt: { gte: from } } }),
          prisma.smsMessageLog.groupBy({ by: ['status'], where: { createdAt: { gte: from } }, _count: { _all: true } }),
          prisma.smsMessageLog.groupBy({ by: ['eventCode'], where: { createdAt: { gte: from } }, _count: { _all: true }, orderBy: { _count: { eventCode: 'desc' } }, take: 10 }),
        ])
        : Promise.resolve(null),
    ]);
    type DeliveryStatusRow = { status: string; _count: { _all: number } };
    type DeliveryEventRow = { eventCode: string; _count: { _all: number } };
    const channel = (value: [number, DeliveryStatusRow[], DeliveryEventRow[]] | null) => value
      ? {
        total: value[0],
        byStatus: value[1].map((row) => ({ status: row.status, count: row._count._all })),
        byEvent: value[2].map((row) => ({ event: row.eventCode, count: row._count._all })),
      }
      : null;
    return {
      periodDays,
      total: (whatsapp?.[0] || 0) + (sms?.[0] || 0),
      channels: { whatsapp: channel(whatsapp), sms: channel(sms) },
      maskedFields: ['recipientPhone', 'messageBody', 'payloadSnapshot', 'errorMessage', 'providerMessageId'],
    };
  },

  async smsActivitySummary(_context, args) {
    const periodDays = Math.min(90, Math.max(1, Math.floor(args.days ?? 30)));
    const from = daysBack(periodDays);
    const [settings, total, sent, failed, queued, skipped, byStatus, byEvent] = await Promise.all([
      prisma.smsIntegrationSettings.findUnique({
        where: { id: 'default' },
        select: { enabled: true, baseUrl: true, senderId: true, encryptedApiKey: true, updatedAt: true },
      }),
      prisma.smsMessageLog.count({ where: { createdAt: { gte: from } } }),
      prisma.smsMessageLog.count({ where: { createdAt: { gte: from }, status: 'SENT' } }),
      prisma.smsMessageLog.count({ where: { createdAt: { gte: from }, status: 'FAILED' } }),
      prisma.smsMessageLog.count({ where: { createdAt: { gte: from }, status: 'QUEUED' } }),
      prisma.smsMessageLog.count({ where: { createdAt: { gte: from }, status: 'SKIPPED' } }),
      prisma.smsMessageLog.groupBy({ by: ['status'], where: { createdAt: { gte: from } }, _count: { _all: true } }),
      prisma.smsMessageLog.groupBy({ by: ['eventCode'], where: { createdAt: { gte: from } }, _count: { _all: true }, orderBy: { _count: { eventCode: 'desc' } }, take: 10 }),
    ]);
    const apiKeyConfigured = Boolean(settings?.encryptedApiKey);
    return {
      periodDays,
      integration: {
        enabled: Boolean(settings?.enabled),
        readyForDelivery: Boolean(settings?.enabled && settings?.senderId && apiKeyConfigured),
        baseUrlConfigured: Boolean(settings?.baseUrl),
        senderConfigured: Boolean(settings?.senderId),
        apiKeyConfigured,
      },
      total,
      sent,
      failed,
      queued,
      skipped,
      byStatus: byStatus.map((row) => ({ status: row.status, count: row._count._all })),
      byEvent: byEvent.map((row) => ({ event: row.eventCode, count: row._count._all })),
      maskedFields: ['apiKey', 'recipientPhone', 'payloadSnapshot', 'messageBody'],
      updatedAt: settings?.updatedAt?.toISOString() || null,
    };
  },

  async notificationsSummary(context, args) {
    const periodDays = Math.min(90, Math.max(1, Math.floor(args.days ?? 30)));
    const where = { userId: context.userId, createdAt: { gte: daysBack(periodDays) } };
    const [total, unread, read, byType] = await Promise.all([
      prisma.notification.count({ where }),
      prisma.notification.count({ where: { ...where, isRead: false } }),
      prisma.notification.count({ where: { ...where, isRead: true } }),
      prisma.notification.groupBy({ by: ['type'], where, _count: { _all: true } }),
    ]);
    return {
      periodDays,
      total,
      unread,
      read,
      byType: byType.map((row) => ({ type: row.type || 'UNSPECIFIED', count: row._count._all })),
      scope: 'signed_in_user',
      maskedFields: ['title', 'message', 'link', 'userId'],
    };
  },
};

export class AiReadOnlyToolsService {
  private readonly observability: AiToolExecutionObservability;

  constructor(
    private readonly dependencies: AiReadOnlyToolDependencies = defaultDependencies,
    observability?: AiToolExecutionObservability,
  ) {
    this.observability = observability || (dependencies === defaultDependencies ? aiToolObservabilityService : {
      recordExecution: async () => undefined,
    });
  }

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
    const startedAt = Date.now();
    const recordExecution = async (event: Omit<AiToolExecutionAuditEvent, 'durationMs'>) => {
      try {
        await this.observability.recordExecution({
          ...event,
          module: event.module || moduleForAiTool(definition.name),
          durationMs: Math.max(0, Date.now() - startedAt),
        });
      } catch {
        throw new AiToolError('AI audit logging is unavailable.', 503, 'AI_AUDIT_UNAVAILABLE');
      }
    };
    if (!hasPermission(context, definition.permissions)) {
      await recordExecution({
        actorUserId: context.userId,
        role: context.role,
        toolName: definition.name,
        permission: 'DENIED',
        status: 'FAILED',
        arguments: request.arguments,
        errorCode: 'AI_TOOL_PERMISSION_REQUIRED',
      });
      throw new AiToolError('You do not have permission to use this AI tool.', 403, 'AI_TOOL_PERMISSION_REQUIRED');
    }
    const parsed = definition.schema.safeParse(request.arguments ?? {});
    if (!parsed.success) {
      await recordExecution({
        actorUserId: context.userId,
        role: context.role,
        toolName: definition.name,
        permission: 'ALLOWED',
        status: 'FAILED',
        arguments: request.arguments,
        errorCode: 'AI_TOOL_ARGUMENTS_INVALID',
      });
      throw new AiToolError('The AI tool arguments are not valid.', 400, 'AI_TOOL_ARGUMENTS_INVALID');
    }
    let data: unknown;
    let databaseLatencyMs = 0;
    const databaseStartedAt = Date.now();
    try {
      data = await definition.execute(this.dependencies, context, parsed.data);
      databaseLatencyMs = Math.max(0, Date.now() - databaseStartedAt);
    } catch (error) {
      databaseLatencyMs = Math.max(0, Date.now() - databaseStartedAt);
      await recordExecution({
        actorUserId: context.userId,
        role: context.role,
        toolName: definition.name,
        permission: 'ALLOWED',
        status: 'FAILED',
        arguments: parsed.data,
        errorCode: errorCodeFor(error),
        databaseLatencyMs,
      });
      if (error instanceof AiToolError) throw error;
      throw new AiToolError('The requested data is unavailable right now.', 503, 'AI_TOOL_DATA_UNAVAILABLE');
    }
    const secured = sanitizeAiToolData(data, context);
    data = secured.data;
    const availability = dataAvailabilityFor(data);
    const durationMs = Math.max(0, Date.now() - startedAt);
    const forecastConfidence = forecastConfidenceFor(data);
    const contract = createAiDataContract({
      status: availability.status === 'AVAILABLE' ? 'success' : 'empty',
      source: 'database',
      fetchedAt: new Date(),
      freshness: 'current',
      data,
      maskedFields: [...new Set([...maskedFieldsFor(data), ...secured.maskedFields])],
      permission: 'allowed',
      ...(requestedLimitFor(parsed.data) !== undefined ? { requestedLimit: requestedLimitFor(parsed.data) } : {}),
    });
    await recordExecution({
      actorUserId: context.userId,
      role: context.role,
      toolName: definition.name,
      permission: 'ALLOWED',
      status: 'SUCCEEDED',
      arguments: parsed.data,
      result: data,
      dataAvailability: availability.status,
      databaseLatencyMs,
      emptyData: availability.status === 'UNAVAILABLE',
      ...(forecastConfidence !== undefined ? { forecastConfidence } : {}),
      ...(secured.maskedFields.length ? { maskedFields: secured.maskedFields } : {}),
    });
    return {
      toolName: definition.name,
      label: definition.label,
      data,
      contract,
      dataAvailability: availability.status,
      ...(availability.message ? { dataAvailabilityMessage: availability.message } : {}),
      durationMs,
    };
  }
}

export const aiReadOnlyToolsService = new AiReadOnlyToolsService();
