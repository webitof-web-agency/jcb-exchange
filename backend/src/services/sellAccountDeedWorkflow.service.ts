import crypto from 'node:crypto';
import { Readable } from 'node:stream';
import prisma from '../lib/prisma';
import { extractDriveFileId, streamFileFromDrive } from './googleDrive.service';
import { decryptPanData, encryptPanData } from './panVerification.dataCrypto';
import { getPanVerificationRuntimeConfig } from './panVerificationSettings.service';
import { SurepassClient, SurepassProviderError } from './surepassClient';
import {
  DeedWorkflowValidationError,
  normalizeDeedWorkflowStart,
  type DeedWorkflowSide,
} from './sellAccountDeedWorkflow.validation';

const SOURCE_LINK_TTL_MS = 15 * 60 * 1000;
const asRecord = (value: unknown): Record<string, any> => value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, any> : {};
const hash = (value: string) => crypto.createHash('sha256').update(value).digest('hex');
const token = () => crypto.randomBytes(32).toString('base64url');
const safeError = (error: unknown) => error instanceof Error ? error.message.slice(0, 500) : 'Unable to process deed workflow.';

export class SellAccountDeedWorkflowError extends Error {
  constructor(message: string, public readonly statusCode = 400, public readonly code = 'deed_workflow_error') {
    super(message);
    this.name = 'SellAccountDeedWorkflowError';
  }
}

const deedKeyForSide = (side: DeedWorkflowSide) => side === 'PURCHASE' ? 'purchaseDeed' : 'sellDeed';

const runtimeClient = async () => {
  const config = await getPanVerificationRuntimeConfig();
  if (!config?.enabled) throw new SellAccountDeedWorkflowError('Surepass is not enabled in Settings.', 409, 'surepass_not_configured');
  return { config, client: new SurepassClient({ baseUrl: config.baseUrl, token: config.token, ...(config.customerId ? { customerId: config.customerId } : {}) }) };
};

const providerData = (response: any) => asRecord(response?.data);
const providerUrl = (data: Record<string, any>) => [data.url, data.esign_url, data.redirect_url].find((value) => typeof value === 'string' && /^https:\/\//.test(value.trim())) as string | undefined;

const serialize = (workflow: any, dataSecret?: string) => {
  const { sourceLinkTokenHash, signingUrlCiphertext, ...safe } = workflow;
  let signingUrl: string | null = null;
  if (dataSecret && signingUrlCiphertext) {
    try { signingUrl = decryptPanData(signingUrlCiphertext, dataSecret); } catch { signingUrl = null; }
  }
  return { ...safe, signingUrl, hasSourceDocument: Boolean(workflow.sourceDocument) };
};

export const getSellAccountDeedWorkflow = async (sellAccountId: string, sideInput: unknown) => {
  const side = String(sideInput).toUpperCase() as DeedWorkflowSide;
  if (side !== 'PURCHASE' && side !== 'SALE') throw new SellAccountDeedWorkflowError('Invalid deed side.');
  const workflow = await (prisma as any).sellAccountDeedWorkflow.findUnique({ where: { sellAccountId_side: { sellAccountId, side } } });
  if (!workflow) return null;
  const config = await getPanVerificationRuntimeConfig();
  return serialize(workflow, config?.dataSecret);
};

export const listEstampArticles = async (state: unknown) => {
  const normalized = String(state || '').trim().toUpperCase();
  if (!/^[A-Z]{2}$/.test(normalized)) throw new SellAccountDeedWorkflowError('A two-letter stamp state code is required.');
  const { client } = await runtimeClient();
  return client.getEstampArticles(normalized);
};

export const startSellAccountDeedWorkflow = async (args: { sellAccountId: string; side: unknown; input: unknown; requestedById?: string; publicApiBaseUrl: string }) => {
  const side = String(args.side).toUpperCase() as DeedWorkflowSide;
  if (side !== 'PURCHASE' && side !== 'SALE') throw new SellAccountDeedWorkflowError('Invalid deed side.');
  const account = await (prisma as any).sellAccount.findFirst({ where: { id: args.sellAccountId, deletedAt: null }, select: { id: true, recordNumber: true, vehicleNumber: true, isLocked: true, documents: true } });
  if (!account) throw new SellAccountDeedWorkflowError('Sold Vehicle not found.', 404, 'sell_account_not_found');
  if (account.isLocked) throw new SellAccountDeedWorkflowError('This Sold Vehicle record is locked.', 423, 'record_locked');
  const document = asRecord(account.documents)[deedKeyForSide(side)];
  const normalized = normalizeDeedWorkflowStart({ ...(asRecord(args.input)), side }, document);
  const existing = await (prisma as any).sellAccountDeedWorkflow.findUnique({ where: { sellAccountId_side: { sellAccountId: account.id, side } } });
  if (existing?.esignClientId || existing?.status === 'INITIALIZING' || existing?.status === 'RECONCILIATION_REQUIRED') {
    const config = await getPanVerificationRuntimeConfig();
    return serialize(existing, config?.dataSecret);
  }
  const { config, client } = await runtimeClient();
  const sourceToken = token();
  const sourceExpiry = new Date(Date.now() + SOURCE_LINK_TTL_MS);
  const signature = normalized.signature;
  const baseData = {
    sellAccountId: account.id, side, status: 'INITIALIZING', sourceDocument: document,
    sourceLinkTokenHash: hash(sourceToken), sourceLinkExpiresAt: sourceExpiry,
    executionStateCode: normalized.executionStateCode, executionStateName: normalized.executionStateName, articleId: normalized.articleId,
    stampDuty: normalized.stampDuty, considerationAmount: normalized.considerationAmount,
    signerName: normalized.signerName, signerMobile: normalized.signerMobile, signerEmail: normalized.signerEmail || null,
    signature, providerEnvironment: config.environment, requestedById: args.requestedById || null,
    providerChargeStatus: 'PENDING_RECONCILIATION', lastErrorCode: null, lastErrorMessage: null,
  };
  const workflow = existing
    ? await (prisma as any).sellAccountDeedWorkflow.update({ where: { id: existing.id }, data: baseData })
    : await (prisma as any).sellAccountDeedWorkflow.create({ data: baseData });
  try {
    const initialization = await client.initializeStampedEsign({
      send_email: false, pdf_pre_uploaded: false, testing_mode: config.environment === 'SANDBOX', sign_type: 'aadhaar', state: normalized.executionStateCode,
      config: {
        auth_mode: '1', reason: `${side === 'PURCHASE' ? 'Purchase' : 'Sale'} deed${account.vehicleNumber ? ` for ${account.vehicleNumber}` : ''}`,
        positions: { [String(normalized.signature.page)]: [{ x: normalized.signature.x, y: normalized.signature.y }] },
        stamp_paper_amount: normalized.stampDuty, stamp_paper_state: normalized.executionStateCode,
        stamp_data: { first_party: normalized.signerName, second_party: side === 'PURCHASE' ? 'JCB Exchange' : normalized.signerName, article_id: normalized.articleId, consideration_amount: normalized.considerationAmount, description: `Sold Vehicle ${account.recordNumber}` },
      },
      prefill_options: { full_name: normalized.signerName, mobile_number: normalized.signerMobile, ...(normalized.signerEmail ? { user_email: normalized.signerEmail } : {}) },
    });
    const initData = providerData(initialization);
    const clientId = typeof initData.client_id === 'string' ? initData.client_id : '';
    if (!clientId) throw new SellAccountDeedWorkflowError('Surepass did not return an eSign client ID.', 502, 'provider_invalid_response');
    const sourceUrl = `${args.publicApiBaseUrl.replace(/\/+$/, '')}/api/recruitment/public/esign-source/${sourceToken}`;
    await client.uploadEsignPdfViaLink({ client_id: clientId, link: sourceUrl });
    const saved = await (prisma as any).sellAccountDeedWorkflow.update({ where: { id: workflow.id }, data: { status: 'PENDING_SIGNATURE', esignClientId: clientId, providerStatus: 'client_initiated', signingUrlCiphertext: providerUrl(initData) ? encryptPanData(providerUrl(initData)!, config.dataSecret) : null } });
    return serialize(saved, config.dataSecret);
  } catch (error) {
    const uncertain = error instanceof SurepassProviderError && error.retryable;
    await (prisma as any).sellAccountDeedWorkflow.update({ where: { id: workflow.id }, data: { status: uncertain ? 'RECONCILIATION_REQUIRED' : 'FAILED', lastErrorCode: error instanceof SurepassProviderError ? error.messageCode || error.kind : 'provider_error', lastErrorMessage: safeError(error) } });
    throw error;
  }
};

export const refreshSellAccountDeedWorkflow = async (sellAccountId: string, sideInput: unknown) => {
  const side = String(sideInput).toUpperCase() as DeedWorkflowSide;
  const workflow = await (prisma as any).sellAccountDeedWorkflow.findUnique({ where: { sellAccountId_side: { sellAccountId, side } } });
  if (!workflow?.esignClientId) throw new SellAccountDeedWorkflowError('No eSign request has been started for this deed.', 404, 'esign_not_started');
  const { config, client } = await runtimeClient();
  const response = await client.getEsignStatus(workflow.esignClientId);
  const status = String(providerData(response).status || '').toLowerCase();
  const signed = status === 'esign_completed';
  let signedDocument: Record<string, string> | undefined;
  let auditTrail: Record<string, string> | undefined;
  if (signed) {
    // Surepass links are credentials too. Persist only ciphertext; a future staff-download
    // endpoint can proxy the file after authorization instead of exposing provider URLs.
    const [signedResponse, auditResponse] = await Promise.all([
      client.getSignedEsignDocument(workflow.esignClientId),
      client.getEsignAuditTrail(workflow.esignClientId),
    ]);
    const signedUrl = providerData(signedResponse).url;
    const auditUrl = providerData(auditResponse).url;
    if (typeof signedUrl === 'string' && /^https:\/\//.test(signedUrl)) signedDocument = { urlCiphertext: encryptPanData(signedUrl, config.dataSecret) };
    if (typeof auditUrl === 'string' && /^https:\/\//.test(auditUrl)) auditTrail = { urlCiphertext: encryptPanData(auditUrl, config.dataSecret) };
  }
  const saved = await (prisma as any).sellAccountDeedWorkflow.update({ where: { id: workflow.id }, data: { providerStatus: status || 'unknown', status: signed ? 'SIGNED' : status === 'esign_failed' ? 'FAILED' : 'PENDING_SIGNATURE', ...(signed ? { signedAt: new Date(), ...(signedDocument ? { signedDocument } : {}), ...(auditTrail ? { auditTrail } : {}) } : {}) } });
  return serialize(saved, config.dataSecret);
};

export const getEsignSourceDocument = async (rawToken: string) => {
  if (!/^[A-Za-z0-9_-]{32,}$/.test(rawToken)) return null;
  const workflow = await (prisma as any).sellAccountDeedWorkflow.findFirst({ where: { sourceLinkTokenHash: hash(rawToken), sourceLinkExpiresAt: { gt: new Date() }, status: { in: ['INITIALIZING', 'PENDING_SIGNATURE'] } } });
  if (!workflow) return null;
  const document = asRecord(workflow.sourceDocument);
  const driveId = extractDriveFileId(document.fileUrl || document.absoluteUrl);
  if (!driveId || document.mimeType !== 'application/pdf') return null;
  return { stream: await streamFileFromDrive(driveId), fileName: String(document.fileName || 'deed.pdf'), mimeType: 'application/pdf' };
};

export const getSellAccountDeedArtifact = async (sellAccountId: string, sideInput: unknown, artifact: unknown) => {
  const side = String(sideInput).toUpperCase() as DeedWorkflowSide;
  const workflow = await (prisma as any).sellAccountDeedWorkflow.findUnique({ where: { sellAccountId_side: { sellAccountId, side } } });
  if (!workflow || workflow.status !== 'SIGNED') throw new SellAccountDeedWorkflowError('The signed deed is not available yet.', 404, 'signed_deed_unavailable');
  const stored = asRecord(String(artifact) === 'audit-trail' ? workflow.auditTrail : String(artifact) === 'signed-document' ? workflow.signedDocument : null);
  const ciphertext = typeof stored.urlCiphertext === 'string' ? stored.urlCiphertext : '';
  const config = await getPanVerificationRuntimeConfig();
  if (!ciphertext || !config?.dataSecret) throw new SellAccountDeedWorkflowError('The requested eSign document is unavailable.', 404, 'signed_deed_unavailable');
  let providerUrl: URL;
  try { providerUrl = new URL(decryptPanData(ciphertext, config.dataSecret)); } catch { throw new SellAccountDeedWorkflowError('The stored eSign document cannot be opened.', 502, 'artifact_unavailable'); }
  const host = providerUrl.hostname.toLowerCase();
  if (providerUrl.protocol !== 'https:' || !(host === 'surepass.io' || host.endsWith('.surepass.io') || host === 'amazonaws.com' || host.endsWith('.amazonaws.com'))) throw new SellAccountDeedWorkflowError('The eSign document URL is not trusted.', 502, 'artifact_unavailable');
  const response = await fetch(providerUrl, { redirect: 'error', signal: AbortSignal.timeout(20_000) });
  if (!response.ok || !response.body) throw new SellAccountDeedWorkflowError('Surepass could not provide the eSign document.', 502, 'artifact_unavailable');
  return { stream: Readable.fromWeb(response.body as any), fileName: `${side.toLowerCase()}-deed-${String(artifact) === 'audit-trail' ? 'audit-trail' : 'signed'}.pdf`, mimeType: response.headers.get('content-type') || 'application/pdf' };
};

export const isDeedWorkflowError = (error: unknown): error is SellAccountDeedWorkflowError | DeedWorkflowValidationError => error instanceof SellAccountDeedWorkflowError || error instanceof DeedWorkflowValidationError;
