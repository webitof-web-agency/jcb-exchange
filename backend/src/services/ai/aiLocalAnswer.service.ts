import { buildVehicleDocsOperatorAnswer } from './vehicleDocsOperatorAnswer.service';
import { buildTasksOperatorAnswer } from './tasksOperatorAnswer.service';
import { buildVerificationOperatorAnswer } from './verificationOperatorAnswer.service';

type LocalAnswerInput = {
  message: string;
  label: string;
  data: unknown;
  dataAvailability?: 'AVAILABLE' | 'UNAVAILABLE';
  dataAvailabilityMessage?: string;
};

const MAX_LINES = 120;
const MAX_VALUE_LENGTH = 500;

const scalar = (value: unknown): string | null => {
  if (value === null || value === undefined) return null;
  if (typeof value === 'string') return value.trim() || null;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return null;
};

const formatValue = (value: unknown): string => {
  const direct = scalar(value);
  if (direct !== null) return direct.slice(0, MAX_VALUE_LENGTH);
  if (Array.isArray(value)) return `[${value.length} items]`;
  if (value && typeof value === 'object') return '[details]';
  return '—';
};

const displayKey = (key: string) => key;

const linesFor = (value: unknown, prefix = '', depth = 0): string[] => {
  if (depth > 2) return [];
  const direct = scalar(value);
  if (direct !== null) return prefix ? [`- ${displayKey(prefix)}: ${formatValue(value)}`] : [formatValue(value)];
  if (Array.isArray(value)) {
    const lines: string[] = [];
    value.slice(0, 20).forEach((item, index) => {
      if (item && typeof item === 'object' && !Array.isArray(item)) {
        const fields = Object.entries(item as Record<string, unknown>)
          .filter(([, child]) => scalar(child) !== null)
          .slice(0, 12)
          .map(([key, child]) => `${displayKey(key)}: ${formatValue(child)}`);
        lines.push(`- ${prefix || 'Item'} ${index + 1}: ${fields.join(' · ') || '[details]'}`);
      } else {
        lines.push(`- ${prefix || 'Item'} ${index + 1}: ${formatValue(item)}`);
      }
    });
    if (value.length > 20) lines.push(`- ... ${value.length - 20} more item(s) are available in the bounded result.`);
    return lines;
  }
  if (!value || typeof value !== 'object') return prefix ? [`- ${displayKey(prefix)}: ${formatValue(value)}`] : [];

  const lines: string[] = [];
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    const childPrefix = prefix ? `${prefix}.${key}` : key;
    if (Array.isArray(child)) lines.push(...linesFor(child, displayKey(key), depth + 1));
    else if (scalar(child) !== null) lines.push(`- ${displayKey(childPrefix)}: ${formatValue(child)}`);
    else lines.push(...linesFor(child, childPrefix, depth + 1));
    if (lines.length >= MAX_LINES) break;
  }
  return lines.slice(0, MAX_LINES);
};

const formatListingDetailLocalAnswer = (item: Record<string, unknown>, question?: string): string => {
  const v = item.vehicleIdentity as Record<string, unknown> | undefined;
  const p = item.pricingAndFinancials as Record<string, unknown> | undefined;
  const r = item.rtoCompliance as Record<string, unknown> | undefined;
  const m = item.media as Record<string, unknown> | undefined;
  const d = item.documents as Record<string, unknown> | undefined;
  const loc = item.location as Record<string, unknown> | undefined;

  const lines: string[] = [
    `### 🚜 ${item.title || 'Vehicle Listing'}`,
    question ? `*Question: ${question}*\n` : '',
    '#### 1. Vehicle Identity & Specifications',
    `- **Registration No:** ${v?.registrationNumber || item.registrationNumber || 'Not assigned'}`,
    `- **Brand & Model:** ${item.brand || '—'} ${item.model || ''}`,
    `- **Year / Hours:** ${item.manufacturingYear || '—'} · ${item.operatingHours ? `${item.operatingHours} hrs` : 'N/A'}`,
    `- **Condition & Status:** ${item.condition || 'Good'} · Status: ${item.status || 'Active'}`,
    `- **Chassis No:** ${v?.chassisNumber || '—'} · **Engine No:** ${v?.engineNumber || '—'}`,
    `- **Owner / Customer:** ${v?.ownerName || item.ownerName || '—'}`,
    `- **Location:** ${[loc?.city, loc?.state].filter(Boolean).join(', ') || '—'}`,
    '',
    '#### 2. Pricing & Commercial Financials',
    `- **Seller Listing Price:** ₹${Number(item.price || 0).toLocaleString('en-IN')}`,
    p?.customerOnRoadAskingPrice ? `- **Customer Asking Price:** ₹${Number(p.customerOnRoadAskingPrice).toLocaleString('en-IN')}` : '',
    p?.adminMarginAmount ? `- **Platform Margin:** ₹${Number(p.adminMarginAmount).toLocaleString('en-IN')}` : '',
    p?.deal ? `- **Deal Status:** ${(p.deal as any).dealStatus || 'CLOSED'} · Deal Price: ₹${Number((p.deal as any).sellPrice || (p.deal as any).soldPrice || 0).toLocaleString('en-IN')}` : '',
    p?.deal && (p.deal as any).netProfit ? `- **Net Profit:** ₹${Number((p.deal as any).netProfit).toLocaleString('en-IN')}` : '',
    '',
    '#### 3. RTO & Transfer Compliance',
    r ? [
      `- **RTO Office & Status:** ${r.rtoOffice || '—'} · ${r.rtoStatus || 'Pending'}`,
      `- **Road Tax:** ${(r.tax as any)?.status || '—'} ${(r.tax as any)?.validUntil ? `(Valid until ${(r.tax as any).validUntil.slice(0, 10)})` : ''}`,
      `- **Fitness:** ${(r.fitness as any)?.status || '—'} ${(r.fitness as any)?.validUntil ? `(Valid until ${(r.fitness as any).validUntil.slice(0, 10)})` : ''}`,
      `- **Insurance:** ${(r.insurance as any)?.status || '—'} ${(r.insurance as any)?.validUntil ? `(Valid until ${(r.insurance as any).validUntil.slice(0, 10)})` : ''}`,
      `- **PUC / HSRP:** ${(r.puc as any)?.status || '—'} · HSRP: ${(r.hsrp as any)?.status || '—'}`,
      r.hypothecation ? `- **Hypothecation / Loan:** ${r.hypothecation}` : '- **Hypothecation / Loan:** No loan hypothecation noted',
    ].join('\n') : '- RTO record not linked yet.',
    '',
    '#### 4. Media & Photos (Available Angles)',
    m?.totalMediaCount ? `- **Total Media Uploaded:** ${m.totalMediaCount} files` : '- No media uploaded yet',
    m?.featuredImageUrl ? `- **Featured Photo:** [View Image](${m.featuredImageUrl})` : '',
    m?.videoUrl ? `- **Vehicle Video:** [Watch Video](${m.videoUrl})` : '',
    m?.slots ? Object.entries(m.slots as Record<string, any>)
      .filter(([, slotItem]) => slotItem?.url)
      .map(([slotKey, slotItem]) => `- **${slotKey}:** [View Photo](${slotItem.url})`)
      .join('\n') : '',
    '',
    '#### 5. Documents & Download Links',
    (d?.invoice as any)?.adminDownloadUrl ? `- **Bill of Supply (Invoice):** [Download Invoice PDF](${(d?.invoice as any).adminDownloadUrl})` : '',
    (d?.deliveryChallan as any)?.adminDownloadUrl ? `- **Delivery Challan:** [Download Delivery Challan](${(d?.deliveryChallan as any).adminDownloadUrl})` : '',
    Array.isArray(d?.moneyReceipts) && d.moneyReceipts.length > 0
      ? d.moneyReceipts.map((rcpt: any) => `- **Money Receipt (${rcpt.receiptNumber}):** ₹${Number(rcpt.amount).toLocaleString('en-IN')} · [Download Receipt](${rcpt.adminDownloadUrl})`).join('\n')
      : '',
    d?.vehicleDocsPdf ? `- **Vehicle Details PDF:** [Download PDF](${d.vehicleDocsPdf})` : '',
    d?.allDocsZip ? `- **Complete Documents ZIP:** [Download ZIP](${d.allDocsZip})` : '',
    '',
    'This answer is based on current live application data.',
  ].filter(Boolean);

  return lines.join('\n');
};

/**
 * Provider-independent answer for live read-only tool results. It keeps the
 * assistant useful when no external model is configured or the provider is
 * temporarily unavailable, without inventing data or turning an unavailable
 * result into zero.
 */
export const buildLocalAiAnswer = (input: LocalAnswerInput): string => {
  if (input.dataAvailability === 'UNAVAILABLE') {
    return `${input.label}: requested data is unavailable right now.${input.dataAvailabilityMessage ? ` ${input.dataAvailabilityMessage}` : ''}`;
  }

  const question = input.message.trim();
  const rawData = input.data as Record<string, unknown> | null;
  if (input.label === 'Listing detail' && rawData?.item && typeof rawData.item === 'object') {
    return formatListingDetailLocalAnswer(rawData.item as Record<string, unknown>, question);
  }
  if ((input.label === 'Vehicle documents' || input.label === 'Vehicle documents detail' || input.label === 'Vehicle documents summary') && rawData) {
    const formatted = buildVehicleDocsOperatorAnswer({
      message: input.message,
      toolName: input.label === 'Vehicle documents summary' ? 'vehicle.documents.summary' : 'vehicle.documents.detail',
      operatorData: rawData,
    });
    if (formatted) return formatted;
  }
  if ((input.label === 'RTO compliance tasks overview' || input.label === 'RTO compliance tasks detail' || input.label === 'tasks.compliance.overview' || input.label === 'tasks.compliance.detail') && rawData) {
    const formatted = buildTasksOperatorAnswer({
      message: input.message,
      toolName: input.label.includes('detail') ? 'tasks.compliance.detail' : 'tasks.compliance.overview',
      operatorData: rawData,
    });
    if (formatted) return formatted;
  }
  if ((input.label === 'Partner verification queue' || input.label === 'Partner verification dossier' || input.label === 'partner.verification.queue' || input.label === 'partner.verification.dossier') && rawData) {
    const formatted = buildVerificationOperatorAnswer({
      message: input.message,
      toolName: input.label.includes('dossier') ? 'partner.verification.dossier' : 'partner.verification.queue',
      operatorData: rawData,
    });
    if (formatted) return formatted;
  }

  const lines = linesFor(input.data);
  return [
    `${input.label} (live read-only data)`,
    question ? `Question: ${question}` : '',
    lines.length ? lines.join('\n') : '- No records were returned for this request.',
    'This answer is based on the current permitted application data; it is not a prediction or a completed action.',
  ].filter(Boolean).join('\n');
};
