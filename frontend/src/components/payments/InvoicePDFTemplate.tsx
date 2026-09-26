import React from 'react';
import { Document, Page, Text, View, StyleSheet, Image } from '@react-pdf/renderer';

type InvoiceSettings = {
  companyName: string | null;
  gstin: string | null;
  address: string | null;
  state: string | null;
  termsAndConditions: string | null;
};

type InvoicePayment = {
  memberName: string;
  planName: string;
  transactionRef?: string | null;
  customerEmail?: string | null;
  customerMobile?: string | null;
  customerCity?: string | null;
  customerState?: string | null;
};

type InvoicePDFTemplateProps = {
  invoiceSettings: InvoiceSettings;
  payment: InvoicePayment | null;
  logoUrl?: string | null;
  taxableValue: number;
  totalAmount: number;
  gstRate: number;
  isIntraState: boolean;
  cgstAmount: number;
  sgstAmount: number;
  igstAmount: number;
  invoiceNumber: string;
  formattedDate: string;
};

const styles = StyleSheet.create({
  page: {
    padding: 30,
    fontFamily: 'Helvetica',
    fontSize: 10,
    color: '#374151',
    backgroundColor: '#ffffff',
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
    paddingBottom: 15,
    marginBottom: 20,
  },
  logoContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  logo: {
    height: 40,
    width: 120,
    objectFit: 'contain',
  },
  fallbackLogo: {
    height: 36,
    width: 36,
    backgroundColor: '#FFC107',
    borderRadius: 6,
    justifyContent: 'center',
    alignItems: 'center',
    display: 'flex',
  },
  fallbackLogoText: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#000',
  },
  companyTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#111827',
    marginLeft: 10,
  },
  headerRight: {
    alignItems: 'flex-end',
  },
  taxInvoiceBadge: {
    backgroundColor: '#FEF3C7',
    borderWidth: 1,
    borderColor: '#FDE68A',
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: 4,
    marginBottom: 8,
  },
  taxInvoiceText: {
    fontSize: 8,
    color: '#92400E',
    fontWeight: 'bold',
    textTransform: 'uppercase',
  },
  invoiceNoText: {
    fontSize: 10,
    fontWeight: 'bold',
    color: '#111827',
    marginBottom: 2,
  },
  invoiceDateText: {
    fontSize: 9,
    color: '#6B7280',
    marginBottom: 2,
  },
  addressesRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 20,
    gap: 15,
  },
  addressBox: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#F3F4F6',
    backgroundColor: '#F9FAFB',
    borderRadius: 8,
    padding: 12,
  },
  addressBoxTitle: {
    fontSize: 8,
    color: '#92400E',
    fontWeight: 'bold',
    textTransform: 'uppercase',
    marginBottom: 6,
  },
  addressBoxName: {
    fontSize: 11,
    fontWeight: 'bold',
    color: '#111827',
    marginBottom: 4,
  },
  addressBoxText: {
    fontSize: 9,
    color: '#4B5563',
    marginBottom: 2,
    lineHeight: 1.4,
  },
  addressBoxBold: {
    fontWeight: 'bold',
    color: '#111827',
  },
  table: {
    width: '100%',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 8,
    marginBottom: 20,
    overflow: 'hidden',
  },
  tableHeader: {
    flexDirection: 'row',
    backgroundColor: '#111827',
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  tableHeaderCell: {
    color: '#FFFFFF',
    fontSize: 9,
    fontWeight: 'bold',
  },
  tableRow: {
    flexDirection: 'row',
    borderTopWidth: 1,
    borderTopColor: '#F3F4F6',
    paddingVertical: 10,
    paddingHorizontal: 12,
    alignItems: 'center',
  },
  tableCell: {
    fontSize: 9,
    color: '#111827',
  },
  tableCellSub: {
    fontSize: 8,
    color: '#6B7280',
    marginTop: 2,
  },
  col1: { width: '5%' },
  col2: { width: '45%' },
  col3: { width: '20%', textAlign: 'right' },
  col4: { width: '10%', textAlign: 'center' },
  col5: { width: '20%', textAlign: 'right' },
  totalsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 15,
    marginBottom: 20,
  },
  amountWordsBox: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#FEF3C7',
    backgroundColor: '#FFFBEB',
    borderRadius: 8,
    padding: 12,
    justifyContent: 'space-between',
  },
  amountWordsTitle: {
    fontSize: 8,
    color: '#92400E',
    fontWeight: 'bold',
    textTransform: 'uppercase',
    marginBottom: 4,
  },
  amountWordsValue: {
    fontSize: 11,
    fontWeight: 'bold',
    color: '#111827',
    fontStyle: 'italic',
  },
  paymentInfoBox: {
    marginTop: 10,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#FDE68A',
  },
  paymentInfoText: {
    fontSize: 8,
    color: '#4B5563',
    marginBottom: 2,
  },
  paymentInfoStatus: {
    fontSize: 8,
    color: '#059669',
    fontWeight: 'bold',
  },
  calculationsBox: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#F3F4F6',
    backgroundColor: '#F9FAFB',
    borderRadius: 8,
    padding: 12,
  },
  calcRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  calcLabel: {
    fontSize: 9,
    color: '#4B5563',
  },
  calcValue: {
    fontSize: 9,
    color: '#111827',
  },
  calcTotalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 6,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#E5E7EB',
  },
  calcTotalLabel: {
    fontSize: 10,
    fontWeight: 'bold',
    color: '#111827',
  },
  calcTotalValue: {
    fontSize: 10,
    fontWeight: 'bold',
    color: '#111827',
  },
  footer: {
    borderTopWidth: 1,
    borderTopColor: '#F3F4F6',
    paddingTop: 15,
  },
  termsTitle: {
    fontSize: 9,
    fontWeight: 'bold',
    color: '#374151',
    marginBottom: 4,
  },
  termsText: {
    fontSize: 8,
    color: '#4B5563',
    lineHeight: 1.4,
    marginBottom: 10,
  },
  copyrightRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 10,
  },
  copyrightText: {
    fontSize: 7,
    color: '#9CA3AF',
  },
});

const numberToWordsInr = (num: number): string => {
  const rounded = Math.round(num);
  if (rounded === 0) return 'Zero Rupees Only';

  const single = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
  const tens = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];

  const convertLessThanThousand = (n: number): string => {
    if (n === 0) return '';
    if (n < 20) return single[n] + ' ';
    if (n < 100) return tens[Math.floor(n / 10)] + ' ' + (n % 10 !== 0 ? single[n % 10] + ' ' : '');
    return single[Math.floor(n / 100)] + ' Hundred ' + (n % 100 !== 0 ? convertLessThanThousand(n % 100) : '');
  };

  let n = rounded;
  let res = '';

  if (Math.floor(n / 10000000) > 0) {
    res += convertLessThanThousand(Math.floor(n / 10000000)) + 'Crore ';
    n %= 10000000;
  }
  if (Math.floor(n / 100000) > 0) {
    res += convertLessThanThousand(Math.floor(n / 100000)) + 'Lakh ';
    n %= 100000;
  }
  if (Math.floor(n / 1000) > 0) {
    res += convertLessThanThousand(Math.floor(n / 1000)) + 'Thousand ';
    n %= 1000;
  }
  if (n > 0) {
    res += convertLessThanThousand(n);
  }

  return 'Rupees ' + res.trim() + ' Only';
};

export const InvoicePDFTemplate = ({
  invoiceSettings,
  payment,
  logoUrl,
  taxableValue,
  totalAmount,
  gstRate,
  isIntraState,
  cgstAmount,
  sgstAmount,
  igstAmount,
  invoiceNumber,
  formattedDate,
}: InvoicePDFTemplateProps) => {
  return (
    <Document>
      <Page size="A4" style={styles.page}>
        
        {/* Header */}
        <View style={styles.headerRow}>
          <View style={styles.logoContainer}>
            {logoUrl ? (
              <Image src={logoUrl} style={styles.logo} />
            ) : (
              <View style={styles.fallbackLogo}>
                <Text style={styles.fallbackLogoText}>JCB</Text>
              </View>
            )}
            <Text style={styles.companyTitle}>{invoiceSettings?.companyName || 'JCB Exchange'}</Text>
          </View>
          <View style={styles.headerRight}>
            <View style={styles.taxInvoiceBadge}>
              <Text style={styles.taxInvoiceText}>TAX INVOICE</Text>
            </View>
            <Text style={styles.invoiceNoText}>Invoice No: {invoiceNumber}</Text>
            <Text style={styles.invoiceDateText}>Date: {formattedDate}</Text>
            {payment?.transactionRef && (
              <Text style={styles.invoiceDateText}>Txn Ref: {payment.transactionRef}</Text>
            )}
          </View>
        </View>

        {/* Addresses */}
        <View style={styles.addressesRow}>
          <View style={styles.addressBox}>
            <Text style={styles.addressBoxTitle}>Billed From (Supplier)</Text>
            <Text style={styles.addressBoxName}>{invoiceSettings?.companyName || 'JCB Exchange'}</Text>
            {invoiceSettings?.address && (
              <Text style={styles.addressBoxText}>{invoiceSettings.address}</Text>
            )}
            <Text style={styles.addressBoxText}>
              State: <Text style={styles.addressBoxBold}>{invoiceSettings?.state || 'Maharashtra'}</Text>
            </Text>
            {invoiceSettings?.gstin && (
              <Text style={styles.addressBoxText}>GSTIN: {invoiceSettings.gstin}</Text>
            )}
          </View>

          <View style={styles.addressBox}>
            <Text style={styles.addressBoxTitle}>Billed To (Customer)</Text>
            <Text style={styles.addressBoxName}>{payment?.memberName || 'Valued Customer'}</Text>
            {payment?.customerMobile && (
              <Text style={styles.addressBoxText}>Mobile: {payment.customerMobile}</Text>
            )}
            {payment?.customerCity && (
              <Text style={styles.addressBoxText}>City: {payment.customerCity}</Text>
            )}
            {payment?.customerEmail && (
              <Text style={styles.addressBoxText}>Email: {payment.customerEmail}</Text>
            )}
            <Text style={styles.addressBoxText}>
              State: <Text style={styles.addressBoxBold}>{payment?.customerState || invoiceSettings?.state || 'Maharashtra'}</Text>
            </Text>
            <Text style={styles.addressBoxText}>
              Place of Supply: {payment?.customerState || invoiceSettings?.state || 'Maharashtra'}
            </Text>
          </View>
        </View>

        {/* Table */}
        <View style={styles.table}>
          <View style={styles.tableHeader}>
            <Text style={[styles.tableHeaderCell, styles.col1]}>#</Text>
            <Text style={[styles.tableHeaderCell, styles.col2]}>Service Description</Text>
            <Text style={[styles.tableHeaderCell, styles.col3]}>Taxable Value</Text>
            <Text style={[styles.tableHeaderCell, styles.col4]}>GST %</Text>
            <Text style={[styles.tableHeaderCell, styles.col5]}>Total (Rs)</Text>
          </View>
          <View style={styles.tableRow}>
            <Text style={[styles.tableCell, styles.col1]}>1</Text>
            <View style={styles.col2}>
              <Text style={styles.tableCell}>{payment?.planName || 'Plan Name'}</Text>
              <Text style={styles.tableCellSub}>Digital Subscription &amp; Machinery Platform Service</Text>
            </View>
            <Text style={[styles.tableCell, styles.col3]}>Rs {taxableValue?.toFixed(2) || '0.00'}</Text>
            <Text style={[styles.tableCell, styles.col4]}>{gstRate}%</Text>
            <Text style={[styles.tableCell, { ...styles.col5, fontWeight: 'bold' }]}>Rs {totalAmount?.toFixed(2) || '0.00'}</Text>
          </View>
        </View>

        {/* Totals */}
        <View style={styles.totalsRow}>
          <View style={styles.amountWordsBox}>
            <View>
              <Text style={styles.amountWordsTitle}>Amount in Words</Text>
              <Text style={styles.amountWordsValue}>{numberToWordsInr(totalAmount || 0)}</Text>
            </View>
            <View style={styles.paymentInfoBox}>
              <Text style={styles.paymentInfoText}>
                Payment Method: <Text style={styles.addressBoxBold}>UPI / Online Transfer</Text>
              </Text>
              <Text style={styles.paymentInfoText}>
                Status: <Text style={styles.paymentInfoStatus}>PAID &amp; VERIFIED</Text>
              </Text>
            </View>
          </View>

          <View style={styles.calculationsBox}>
            <View style={styles.calcRow}>
              <Text style={styles.calcLabel}>Taxable Amount:</Text>
              <Text style={styles.calcValue}>Rs {taxableValue?.toFixed(2) || '0.00'}</Text>
            </View>
            
            {isIntraState ? (
              <>
                <View style={styles.calcRow}>
                  <Text style={styles.calcLabel}>CGST ({gstRate / 2}%):</Text>
                  <Text style={styles.calcValue}>Rs {cgstAmount?.toFixed(2) || '0.00'}</Text>
                </View>
                <View style={styles.calcRow}>
                  <Text style={styles.calcLabel}>SGST ({gstRate / 2}%):</Text>
                  <Text style={styles.calcValue}>Rs {sgstAmount?.toFixed(2) || '0.00'}</Text>
                </View>
              </>
            ) : (
              <View style={styles.calcRow}>
                <Text style={styles.calcLabel}>IGST ({gstRate}%):</Text>
                <Text style={styles.calcValue}>Rs {igstAmount?.toFixed(2) || '0.00'}</Text>
              </View>
            )}

            <View style={styles.calcTotalRow}>
              <Text style={styles.calcTotalLabel}>Total Amount (Incl. GST):</Text>
              <Text style={styles.calcTotalValue}>Rs {totalAmount?.toFixed(2) || '0.00'}</Text>
            </View>
          </View>
        </View>

        {/* Footer */}
        <View style={styles.footer}>
          <Text style={styles.termsTitle}>Terms &amp; Conditions:</Text>
          <Text style={styles.termsText}>
            {invoiceSettings?.termsAndConditions || 'This is a computer-generated tax invoice and does not require a physical signature.'}
          </Text>
          
          <View style={styles.copyrightRow}>
            <Text style={styles.copyrightText}>
              © {new Date().getFullYear()} {invoiceSettings?.companyName || 'JCB Exchange'}. All rights reserved.
            </Text>
            <Text style={styles.copyrightText}>
              Standard Tax Invoice (Indian GST Compliant)
            </Text>
          </View>
        </View>
        
      </Page>
    </Document>
  );
};
