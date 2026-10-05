import React from 'react';
import { Document, Page, Text, View, StyleSheet, Image } from '@react-pdf/renderer';

export type InvoiceSettings = {
  companyName: string | null;
  gstin: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  termsAndConditions: string | null;
};

export type InvoicePayment = {
  memberName: string;
  planName: string;
  transactionRef?: string | null;
  customerEmail?: string | null;
  customerMobile?: string | null;
  customerCity?: string | null;
  customerState?: string | null;
};

export type SubscriptionInvoicePDFTemplateProps = {
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
    fontSize: 9,
    color: '#000000',
    backgroundColor: '#ffffff',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 20,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    textTransform: 'uppercase',
  },
  logo: {
    height: 45,
    width: 45,
    objectFit: 'contain',
  },
  fallbackLogo: {
    height: 45,
    width: 45,
    backgroundColor: '#E5E7EB',
  },
  section: {
    borderWidth: 1,
    borderColor: '#000000',
    marginBottom: 15,
  },
  sectionHeader: {
    borderBottomWidth: 1,
    borderBottomColor: '#000000',
    padding: 4,
    backgroundColor: '#F9FAFB',
    fontWeight: 'bold',
    fontSize: 10,
  },
  row: {
    flexDirection: 'row',
  },
  cell: {
    flex: 1,
    padding: 4,
  },
  cellLabel: {
    fontWeight: 'bold',
  },
  addressCol: {
    flex: 1,
  },
  addressColRight: {
    flex: 1,
    borderLeftWidth: 1,
    borderLeftColor: '#000000',
  },
  addressHeader: {
    borderBottomWidth: 1,
    borderBottomColor: '#000000',
    padding: 4,
    fontWeight: 'bold',
  },
  addressBody: {
    padding: 6,
  },
  addressLine: {
    marginBottom: 2,
    textTransform: 'uppercase',
  },
  tableHeaderRow: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: '#000000',
    fontWeight: 'bold',
  },
  th: {
    padding: 4,
    borderRightWidth: 1,
    borderRightColor: '#000000',
  },
  thLast: {
    padding: 4,
  },
  tableRow: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: '#000000',
  },
  td: {
    padding: 4,
    borderRightWidth: 1,
    borderRightColor: '#000000',
  },
  tdLast: {
    padding: 4,
  },
  subTableContainer: {
    backgroundColor: '#F9FAFB',
  },
  subTableHeader: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: '#000000',
    fontWeight: 'bold',
    fontSize: 8,
  },
  subTableValues: {
    flexDirection: 'row',
    padding: 6,
    gap: 4,
    backgroundColor: '#FFFFFF',
  },
  valBox: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#000000',
    padding: 4,
    textAlign: 'right',
  },
  valBoxBold: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#000000',
    padding: 4,
    textAlign: 'right',
    fontWeight: 'bold',
  },
  paymentRow: {
    borderBottomWidth: 1,
    borderBottomColor: '#000000',
    padding: 6,
  },
  termsRow: {
    padding: 6,
    fontSize: 8,
    lineHeight: 1.3,
  }
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

export const SubscriptionInvoicePDFTemplate = ({
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
}: SubscriptionInvoicePDFTemplateProps) => {
  return (
    <Document>
      <Page size="A4" style={styles.page}>
        
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Subscription Invoice</Text>
          {logoUrl ? (
            <Image src={logoUrl} style={styles.logo} />
          ) : (
            <View style={styles.fallbackLogo} />
          )}
        </View>

        {/* 1. Invoice Details */}
        <View style={styles.section}>
          <Text style={styles.sectionHeader}>1. INVOICE Details</Text>
          <View style={styles.row}>
            <View style={styles.cell}>
              <Text><Text style={styles.cellLabel}>Invoice No: </Text>{invoiceNumber}</Text>
            </View>
            <View style={styles.cell}>
              <Text><Text style={styles.cellLabel}>Generated Date: </Text>{formattedDate}</Text>
            </View>
          </View>
          <View style={styles.row}>
            <View style={styles.cell}>
              <Text><Text style={styles.cellLabel}>GSTIN: </Text>{invoiceSettings?.gstin || 'URP'}</Text>
            </View>
            <View style={styles.cell}>
              <Text><Text style={styles.cellLabel}>Generated By: </Text>System</Text>
            </View>
          </View>
          <View style={styles.row}>
            <View style={styles.cell}>
              <Text><Text style={styles.cellLabel}>Payment Status: </Text>PAID &amp; VERIFIED</Text>
            </View>
            {payment?.transactionRef ? (
              <View style={styles.cell}>
                <Text><Text style={styles.cellLabel}>Txn Ref: </Text>{payment.transactionRef}</Text>
              </View>
            ) : <View style={styles.cell} />}
          </View>
        </View>

        {/* 2. Address Details */}
        <View style={styles.section}>
          <Text style={styles.sectionHeader}>2. Address Details</Text>
          <View style={styles.row}>
            {/* FROM */}
            <View style={styles.addressCol}>
              <Text style={[styles.addressHeader, { color: '#b45309' }]}>BILLED FROM (SUPPLIER)</Text>
              <View style={styles.addressBody}>
                <Text style={[styles.addressLine, { fontWeight: 'bold' }]}>{invoiceSettings?.companyName || 'JCB Exchange'}</Text>
                {invoiceSettings?.address && <Text style={styles.addressLine}>{invoiceSettings.address}</Text>}
                <Text style={styles.addressLine}>
                  {[invoiceSettings?.city, invoiceSettings?.state].filter(Boolean).join(', ') || 'Maharashtra'}
                </Text>
              </View>
            </View>
            {/* TO */}
            <View style={styles.addressColRight}>
              <Text style={[styles.addressHeader, { color: '#b45309' }]}>BILLED TO (CUSTOMER)</Text>
              <View style={styles.addressBody}>
                <Text style={[styles.addressLine, { fontWeight: 'bold' }]}>{payment?.memberName || 'Customer'}</Text>
                <Text style={styles.addressLine}>
                  {[payment?.customerCity, payment?.customerState || invoiceSettings?.state].filter(Boolean).join(', ') || 'Maharashtra'}
                </Text>
                {payment?.customerMobile && <Text style={styles.addressLine}>Mobile: {payment.customerMobile}</Text>}
                {payment?.customerEmail && <Text style={styles.addressLine}>Email: {payment.customerEmail}</Text>}
              </View>
            </View>
          </View>
        </View>

        {/* 3. Service Details */}
        <View style={styles.section}>
          <Text style={styles.sectionHeader}>3. Service Details</Text>
          
          <View style={styles.tableHeaderRow}>
            <Text style={[styles.th, { width: '8%', textAlign: 'center' }]}>S.No</Text>
            <Text style={[styles.th, { width: '52%' }]}>Service Name &amp; Desc.</Text>
            <Text style={[styles.th, { width: '22%', textAlign: 'right' }]}>Taxable Amount Rs.</Text>
            <Text style={[styles.thLast, { width: '18%', textAlign: 'center' }]}>Tax Rate (C+S+I)</Text>
          </View>
          
          <View style={styles.tableRow}>
            <Text style={[styles.td, { width: '8%', textAlign: 'center' }]}>1</Text>
            <Text style={[styles.td, { width: '52%', textTransform: 'uppercase' }]}>{payment?.planName}</Text>
            <Text style={[styles.td, { width: '22%', textAlign: 'right' }]}>{taxableValue?.toFixed(2)}</Text>
            <Text style={[styles.tdLast, { width: '18%', textAlign: 'center' }]}>{gstRate}%</Text>
          </View>

          {/* Totals Sub-table */}
          <View style={styles.subTableContainer}>
            <View style={styles.subTableHeader}>
              <Text style={[styles.th, { width: '14.28%' }]}>Tot. Tax'ble Amt</Text>
              <Text style={[styles.th, { width: '14.28%' }]}>CGST Amt</Text>
              <Text style={[styles.th, { width: '14.28%' }]}>SGST Amt</Text>
              <Text style={[styles.th, { width: '14.28%' }]}>IGST Amt</Text>
              <Text style={[styles.th, { width: '14.28%' }]}>CESS Amt</Text>
              <Text style={[styles.th, { width: '14.28%' }]}>Other Amt</Text>
              <Text style={[styles.thLast, { width: '14.32%' }]}>Total Inv.Amt</Text>
            </View>
            <View style={styles.subTableValues}>
              <Text style={styles.valBox}>{taxableValue?.toFixed(2)}</Text>
              <Text style={styles.valBox}>{cgstAmount?.toFixed(2)}</Text>
              <Text style={styles.valBox}>{sgstAmount?.toFixed(2)}</Text>
              <Text style={styles.valBox}>{igstAmount?.toFixed(2)}</Text>
              <Text style={styles.valBox}>0.00</Text>
              <Text style={styles.valBox}>0.00</Text>
              <Text style={styles.valBoxBold}>{totalAmount?.toFixed(2)}</Text>
            </View>
          </View>
        </View>

        {/* 4. Payment & Conditions */}
        <View style={styles.section}>
          <Text style={styles.sectionHeader}>4. Payment &amp; Conditions</Text>
          <View style={styles.paymentRow}>
            <Text><Text style={styles.cellLabel}>Amount in Words: </Text>{numberToWordsInr(totalAmount || 0)}</Text>
          </View>
          <View style={styles.termsRow}>
            <Text style={[styles.cellLabel, { marginBottom: 3 }]}>Terms &amp; Conditions:</Text>
            {(invoiceSettings?.termsAndConditions || `1. This invoice is issued by JCB Exchange (OPC) Private Limited for platform, listing, subscription, advertising, lead generation, verification, promotional or other applicable services availed by the recipient.\n2. GST and other applicable taxes shall be charged as per prevailing laws and the Place of Supply determined from the information provided by the recipient.`)
              .split(/\r?\n/)
              .map((line, idx) => (
                <Text key={idx} style={{ marginBottom: 2 }}>{line.trim()}</Text>
              ))}
          </View>
        </View>

      </Page>
    </Document>
  );
};
