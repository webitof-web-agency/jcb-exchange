import { promises as fs } from 'node:fs';
import prisma from '../lib/prisma';
import { getAppSettings } from '../utils/appSettings';
import { resolveLocalBrandingFilePath } from '../utils/brandingStorage';
import {
  buildCustomerPrimeInvoiceData,
  renderCustomerPrimeInvoicePdf,
  type CustomerPrimeInvoiceSettings,
} from '../utils/customerPrimeInvoice';

const getPrimePlanName = (settingsSnapshot: unknown) => {
  const snapshot = settingsSnapshot && typeof settingsSnapshot === 'object'
    ? settingsSnapshot as { validityValue?: unknown; validityUnit?: unknown }
    : {};
  const validityValue = Number(snapshot.validityValue || 0);
  const validityUnit = String(snapshot.validityUnit || 'DAYS').toUpperCase() === 'MONTHS' ? 'MONTHS' : 'DAYS';
  const planDurationLabel = validityValue > 0
    ? `${validityValue} ${validityUnit === 'MONTHS'
      ? (validityValue === 1 ? 'month' : 'months')
      : (validityValue === 1 ? 'day' : 'days')}`
    : 'Prime Membership';
  return `JCB Exchange Prime - ${planDurationLabel}`;
};

export const loadInvoiceLogo = async (logoUrl?: string | null) => {
  if (!logoUrl) return null;

  const localPath = resolveLocalBrandingFilePath(logoUrl);
  if (localPath) {
    try {
      const stats = await fs.stat(localPath);
      if (!stats.isFile() || stats.size > 5 * 1024 * 1024) return null;
      return await fs.readFile(localPath);
    } catch {
      return null;
    }
  }
  if (!/^https?:\/\//i.test(logoUrl)) return null;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 3000);
  try {
    const response = await fetch(logoUrl, { signal: controller.signal });
    if (!response.ok) return null;
    const contentLength = Number(response.headers.get('content-length') || 0);
    if (contentLength > 5 * 1024 * 1024) return null;
    return Buffer.from(await response.arrayBuffer());
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
};

export const buildCustomerPrimeInvoicePdfForSubscription = async (subscriptionId: string) => {
  const subscription = await prisma.customerPrimeSubscription.findUnique({
    where: { id: subscriptionId },
    include: {
      user: {
        select: {
          name: true,
          email: true,
          mobile: true,
          city: true,
          state: true,
        },
      },
    },
  });
  if (!subscription) throw new Error('Prime subscription was not found for invoice generation.');

  const appSettings = await getAppSettings();
  const invoiceSettings: CustomerPrimeInvoiceSettings = appSettings.companyInvoice;
  const memberName = subscription.user.name?.trim() || subscription.user.mobile?.trim() || 'Prime Customer';
  const invoice = buildCustomerPrimeInvoiceData({
    settings: invoiceSettings,
    payment: {
      id: subscription.id,
      memberName,
      planName: getPrimePlanName(subscription.settingsSnapshot),
      amount: Number(subscription.paidAmount || 0),
      submittedAt: subscription.submittedAt,
      transactionRef: subscription.transactionRef,
      customerEmail: subscription.user.email,
      customerMobile: subscription.user.mobile,
      customerCity: subscription.customerCity || subscription.user.city,
      customerState: subscription.customerState || subscription.user.state,
    },
  });
  const logoBuffer = await loadInvoiceLogo(appSettings.siteLogo.darkLogoUrl || appSettings.siteLogo.imageUrl);
  const buffer = await renderCustomerPrimeInvoicePdf(invoice, logoBuffer);

  return {
    buffer,
    fileName: `JCB-Exchange-${invoice.invoiceNumber}.pdf`,
    invoiceNumber: invoice.invoiceNumber,
  };
};
