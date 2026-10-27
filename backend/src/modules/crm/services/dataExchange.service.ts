import prisma from '../../../lib/prisma';
import type { CrmAccess } from '../access';
import { badRequest, CrmHttpError, forbidden } from '../http';
import { LEAD_TYPES, mobileVariants, normalizeMobile, oneOf, parseCsv, PRIORITIES } from '../rules';
import { numberOrNull, textOrNull } from './common';
import { createLeadRecord } from './leads.service';
import { getCrmConfig } from './settings.service';
import { listPipelineStageStatusSets } from './pipelineStages.service';

const MAX_ROWS = 2000;

// Header aliases accepted in uploaded sheets (lower-case, spaces/underscores ignored).
const COLUMNS: Record<string, string[]> = {
  name: ['name', 'customername', 'fullname', 'customer', 'contactname'],
  mobile: ['mobile', 'phone', 'mobilenumber', 'phonenumber', 'contact', 'contactnumber', 'whatsapp'],
  email: ['email', 'emailid'],
  city: ['city', 'district', 'location'],
  state: ['state'],
  leadType: ['leadtype', 'type', 'enquirytype'],
  source: ['source', 'leadsource'],
  priority: ['priority'],
  message: ['message', 'notes', 'requirement', 'remarks', 'comment', 'enquiry'],
  budgetMax: ['budget', 'budgetmax', 'maxbudget'],
  tags: ['tags', 'tag'],
};

const keyOf = (header: string) => header.toLowerCase().replace(/[\s_\-.]/g, '');

type ImportRow = {
  row: number;
  name: string | null;
  mobile: string | null;
  email: string | null;
  city: string | null;
  state: string | null;
  leadType: string;
  source: string;
  priority: string;
  message: string | null;
  budgetMax: number | null;
  tags: string[];
  errors: string[];
  existingContactId: string | null;
  openLeadId: string | null;
};

const parseRows = async (csv: string, defaults: { source: string; leadType: string }) => {
  const table = parseCsv(csv);
  if (table.length < 2) throw badRequest('The file has no data rows. The first row must be the column headers.');
  if (table.length - 1 > MAX_ROWS) throw badRequest(`Import up to ${MAX_ROWS} rows at a time.`);
  const headers = (table[0] as string[]).map(keyOf);
  const index = Object.fromEntries(Object.entries(COLUMNS).map(([field, aliases]) => [field, headers.findIndex((h) => aliases.includes(h))]));
  if ((index.mobile ?? -1) < 0) throw badRequest('Add a "Mobile" column.');
  const cell = (cells: string[], field: string) => {
    const i = index[field] ?? -1;
    return i >= 0 ? (cells[i] ?? '').trim() : '';
  };
  const seen = new Set<string>();
  const rows: ImportRow[] = table.slice(1).map((cells, i) => {
    const errors: string[] = [];
    const mobile = normalizeMobile(cell(cells, 'mobile'));
    if (!mobile) errors.push('Invalid mobile');
    else if (seen.has(mobile)) errors.push('Repeated in this file');
    if (mobile) seen.add(mobile);
    const budgetText = cell(cells, 'budgetMax').replace(/[,₹\s]/g, '');
    const budget = numberOrNull(budgetText);
    if (budgetText && budget === null) errors.push('Budget is not a number');
    return {
      row: i + 2,
      name: textOrNull(cell(cells, 'name'), 120),
      mobile,
      email: textOrNull(cell(cells, 'email'), 160),
      city: textOrNull(cell(cells, 'city'), 80),
      state: textOrNull(cell(cells, 'state'), 80),
      leadType: oneOf(LEAD_TYPES, cell(cells, 'leadType')) ?? defaults.leadType,
      source: (textOrNull(cell(cells, 'source'), 40) ?? defaults.source).toUpperCase(),
      priority: oneOf(PRIORITIES, cell(cells, 'priority')) ?? 'MEDIUM',
      message: textOrNull(cell(cells, 'message'), 2000),
      budgetMax: budget,
      tags: cell(cells, 'tags').split(/[;|]/).map((t) => t.trim()).filter(Boolean).slice(0, 10),
      errors,
      existingContactId: null,
      openLeadId: null,
    };
  });
  const mobiles = rows.map((r) => r.mobile).filter((m): m is string => Boolean(m));
  if (mobiles.length) {
    const { terminal } = await listPipelineStageStatusSets();
    const users = await prisma.user.findMany({ where: { mobile: { in: mobiles.flatMap(mobileVariants) } }, select: { id: true, mobile: true } });
    const byMobile = new Map(users.map((u) => [normalizeMobile(u.mobile) ?? '', u.id]));
    const openLeads = users.length
      ? await prisma.lead.findMany({ where: { customerId: { in: users.map((u) => u.id) }, status: { notIn: [...terminal] }, mergedIntoId: null }, select: { id: true, customerId: true, leadType: true } })
      : [];
    for (const row of rows) {
      const userId = row.mobile ? byMobile.get(row.mobile) ?? null : null;
      row.existingContactId = userId;
      row.openLeadId = openLeads.find((l) => l.customerId === userId && l.leadType === row.leadType)?.id ?? null;
    }
  }
  return rows;
};

export const importLeads = async (access: CrmAccess, body: Record<string, unknown>) => {
  if (!access.canImport) throw forbidden('You do not have permission to import CRM data.');
  const csv = typeof body.csv === 'string' ? body.csv : '';
  if (!csv.trim()) throw badRequest('Upload a CSV file.');
  if (csv.length > 3_000_000) throw badRequest('The file is too large (3 MB max).');
  const defaults = {
    source: (textOrNull(body.defaultSource, 40) || 'IMPORT').toUpperCase(),
    leadType: oneOf(LEAD_TYPES, body.defaultLeadType) ?? 'BUY',
  };
  const rows = await parseRows(csv, defaults);
  if (body.commit !== true) {
    return {
      preview: true,
      total: rows.length,
      valid: rows.filter((r) => !r.errors.length && !r.openLeadId).length,
      duplicates: rows.filter((r) => !r.errors.length && r.openLeadId).length,
      invalid: rows.filter((r) => r.errors.length).length,
      rows: rows.slice(0, 500),
    };
  }
  const config = await getCrmConfig();
  const ownerId = textOrNull(body.ownerId, 60);
  let createdCount = 0;
  let duplicateCount = 0;
  const errors: Array<{ row: number; error: string }> = [];
  for (const row of rows) {
    if (row.errors.length) { errors.push({ row: row.row, error: row.errors.join(', ') }); continue; }
    if (row.openLeadId) { duplicateCount += 1; continue; }
    try {
      await createLeadRecord(access, {
        contact: { name: row.name, mobile: row.mobile, email: row.email, city: row.city, state: row.state },
        leadType: row.leadType,
        source: row.source,
        priority: row.priority,
        message: row.message,
        budgetMax: row.budgetMax,
        tags: row.tags,
        requirementCity: row.city,
        requirementState: row.state,
        ...(ownerId ? { ownerId } : {}),
      }, config);
      createdCount += 1;
    } catch (error) {
      if (error instanceof CrmHttpError && error.status === 409) duplicateCount += 1;
      else errors.push({ row: row.row, error: error instanceof Error ? error.message : 'Failed' });
    }
  }
  const batch = await prisma.crmImportBatch.create({
    data: {
      fileName: textOrNull(body.fileName, 200),
      totalRows: rows.length,
      createdCount,
      duplicateCount,
      failedCount: errors.length,
      errors: errors.slice(0, 500),
      createdById: access.userId,
    },
  });
  return { preview: false, batchId: batch.id, total: rows.length, created: createdCount, duplicates: duplicateCount, failed: errors.length, errors: errors.slice(0, 200) };
};

export const importHistory = async (access: CrmAccess) => {
  if (!access.canImport) throw forbidden('You do not have permission to import CRM data.');
  return prisma.crmImportBatch.findMany({ orderBy: { createdAt: 'desc' }, take: 50 });
};
