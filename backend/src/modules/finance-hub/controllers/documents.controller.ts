import type { FinDocumentType } from '@prisma/client';
import type { Request } from 'express';
import { badRequest, getRequestPermissions, handle, hasAnyOf } from '../http';
import { FH_PERMISSIONS as P } from '../permissions';
import { actorFromRequest, requestBody } from '../services/context';
import { getDealTerms, listDealTerms, saveDealTerms } from '../services/dealTerms.service';
import { cancelDocument, createDocument, deleteDocument, getDocument, listDocuments, postDocument, updateDocument } from '../services/documents.service';
import type { LedgerAccess } from '../services/ledger.service';
import { cancelSettlement, createSettlement, listSettlements, openPayables, paySettlement } from '../services/settlements.service';

const ALL_TYPES: FinDocumentType[] = ['PURCHASE_BILL', 'DEBIT_NOTE', 'SALES_INVOICE', 'CREDIT_NOTE'];

const idParam = (req: Request) => {
  const value = req.params.id;
  if (typeof value !== 'string' || !value.trim() || value.length > 60) throw badRequest('Record id is required.');
  return value.trim();
};

const query = (req: Request) => req.query as Record<string, unknown>;

const access = async (req: Request) => {
  const permissions = await getRequestPermissions(req);
  const ledger: LedgerAccess = {
    actor: actorFromRequest(req),
    isSuperAdmin: req.user?.role === 'SUPER_ADMIN',
    canPostSoftClosed: hasAnyOf(permissions, [P.periodLock]),
    canApprove: hasAnyOf(permissions, [P.approve]),
  };
  // Purchases staff enter supplier bills and debit notes; sales staff enter invoices and credit notes.
  const editable: FinDocumentType[] = [
    ...(hasAnyOf(permissions, [P.purchasesManage]) ? (['PURCHASE_BILL', 'DEBIT_NOTE'] as const) : []),
    ...(hasAnyOf(permissions, [P.salesManage]) ? (['SALES_INVOICE', 'CREDIT_NOTE'] as const) : []),
  ];
  const postable = hasAnyOf(permissions, [P.booksPost]) ? ALL_TYPES : [];
  return { ledger, editable, postable };
};

export const documents = handle((req) => listDocuments(query(req)));
export const documentById = handle((req) => getDocument(idParam(req)));
export const newDocument = handle(async (req) => {
  const { ledger, editable } = await access(req);
  return createDocument(requestBody(req), ledger, editable);
}, 201);
export const editDocument = handle(async (req) => {
  const { ledger, editable } = await access(req);
  return updateDocument(idParam(req), requestBody(req), ledger, editable);
});
export const removeDocument = handle(async (req) => {
  const { ledger, editable } = await access(req);
  return deleteDocument(idParam(req), ledger, editable);
});
export const postDocumentToBooks = handle(async (req) => {
  const { ledger, postable } = await access(req);
  return postDocument(idParam(req), ledger, postable);
});
export const cancelPostedDocument = handle(async (req) => {
  const { ledger, postable } = await access(req);
  return cancelDocument(idParam(req), requestBody(req), ledger, postable);
});

export const dealTerms = handle((req) => getDealTerms(idParam(req)));
export const putDealTerms = handle((req) => saveDealTerms(idParam(req), requestBody(req), actorFromRequest(req)));
export const dealTermsList = handle(async (req) => ({ deals: await listDealTerms(query(req)) }));

export const payables = handle(async (req) => ({ parties: await openPayables(typeof req.query.partyId === 'string' && req.query.partyId ? req.query.partyId : null) }));
export const settlements = handle(async (req) => ({ settlements: await listSettlements(query(req)) }));
export const newSettlement = handle(async (req) => createSettlement(requestBody(req), (await access(req)).ledger), 201);
export const paySettlementNow = handle(async (req) => paySettlement(idParam(req), (await access(req)).ledger));
export const cancelSettlementNow = handle(async (req) => cancelSettlement(idParam(req), requestBody(req), (await access(req)).ledger));
