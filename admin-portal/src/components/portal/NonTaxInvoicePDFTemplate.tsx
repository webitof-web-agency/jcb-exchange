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

export type NonTaxInvoicePDFTemplateProps = {
  invoiceSettings: InvoiceSettings;
  payment: InvoicePayment | null;
  logoUrl?: string | null;
  totalAmount: number;
  invoiceNumber: string;
  formattedDate: string;
  invoiceTitle?: string;
  itemDescription?: string;
  notes?: string;
};

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

  return res.trim() + ' Rupees Only';
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
    marginBottom: 15,
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    textTransform: 'uppercase',
  },
  logo: {
    height: 40,
    width: 40,
    objectFit: 'contain',
  },
  sectionTable: {
    marginBottom: 12,
  },
  tableRowHeader: {
    flexDirection: 'row',
    backgroundColor: '#000000',
    color: '#ffffff',
    fontWeight: 'bold',
    padding: 5,
  },
  tableRow: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: '#cccccc',
    borderLeftWidth: 1,
    borderLeftColor: '#cccccc',
    borderRightWidth: 1,
    borderRightColor: '#cccccc',
    padding: 5,
  },
  colFull: { width: '100%' },
  colHalf: { width: '50%' },
  colQuarter: { width: '25%' },
  cellLabel: {
    fontWeight: 'bold',
  },
  itemTableHead: {
    flexDirection: 'row',
    backgroundColor: '#f3f4f6',
    borderWidth: 1,
    borderColor: '#cccccc',
    padding: 6,
    fontWeight: 'bold',
  },
  itemTableRow: {
    flexDirection: 'row',
    borderLeftWidth: 1,
    borderLeftColor: '#cccccc',
    borderRightWidth: 1,
    borderRightColor: '#cccccc',
    borderBottomWidth: 1,
    borderBottomColor: '#cccccc',
    padding: 6,
  },
  bold: {
    fontWeight: 'bold',
  },
  right: {
    textAlign: 'right',
  },
  center: {
    textAlign: 'center',
  },
  footerText: {
    marginTop: 20,
    fontSize: 8,
    color: '#555555',
  },
});

export const NonTaxInvoicePDFTemplate = ({
  invoiceSettings,
  payment,
  logoUrl,
  totalAmount,
  invoiceNumber,
  formattedDate,
  invoiceTitle = 'BILL / PAYMENT RECEIPT',
  itemDescription,
  notes,
}: NonTaxInvoicePDFTemplateProps) => {
  const companyName = invoiceSettings.companyName || 'JCB Exchange';
  const companyAddress = invoiceSettings.address || 'Address Details Not Configured';
  const companyCity = invoiceSettings.city || '';
  const companyState = invoiceSettings.state || '';

  const memberName = payment?.memberName || 'Customer';
  const planName = itemDescription || payment?.planName || 'Listing / Subscription Charge';
  const customerEmail = payment?.customerEmail || '';
  const customerMobile = payment?.customerMobile || '';
  const transactionRef = payment?.transactionRef || '';

  const wordsAmount = numberToWordsInr(totalAmount);

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        {/* Header */}
        <View style={styles.header}>
          <View>
            <Text style={styles.headerTitle}>{invoiceTitle}</Text>
            <Text style={{ marginTop: 2, fontSize: 10, fontWeight: 'bold' }}>{companyName}</Text>
            <Text style={{ color: '#444444', width: 260 }}>{companyAddress}, {companyCity}, {companyState}</Text>
          </View>
          {logoUrl ? <Image src={logoUrl} style={styles.logo} /> : null}
        </View>

        {/* 1. Document Details */}
        <View style={styles.sectionTable}>
          <View style={styles.tableRowHeader}>
            <Text style={styles.colFull}>1. RECEIPT / BILL DETAILS</Text>
          </View>
          <View style={styles.tableRow}>
            <View style={styles.colHalf}>
              <Text><Text style={styles.cellLabel}>Receipt No: </Text>{invoiceNumber}</Text>
            </View>
            <View style={styles.colHalf}>
              <Text><Text style={styles.cellLabel}>Date & Time: </Text>{formattedDate}</Text>
            </View>
          </View>
        </View>

        {/* 2. Customer Details */}
        <View style={styles.sectionTable}>
          <View style={styles.tableRowHeader}>
            <Text style={styles.colFull}>2. CUSTOMER / BUYER DETAILS</Text>
          </View>
          <View style={styles.tableRow}>
            <View style={styles.colHalf}>
              <Text><Text style={styles.cellLabel}>Name: </Text>{memberName}</Text>
              {customerMobile ? <Text><Text style={styles.cellLabel}>Mobile: </Text>{customerMobile}</Text> : null}
            </View>
            <View style={styles.colHalf}>
              {customerEmail ? <Text><Text style={styles.cellLabel}>Email: </Text>{customerEmail}</Text> : null}
              {transactionRef ? <Text><Text style={styles.cellLabel}>UTR / Ref No: </Text>{transactionRef}</Text> : null}
            </View>
          </View>
        </View>

        {/* 3. Items Particulars */}
        <View style={{ marginBottom: 15 }}>
          <View style={styles.itemTableHead}>
            <Text style={{ width: '10%' }}>S.No.</Text>
            <Text style={{ width: '60%' }}>Item / Particulars</Text>
            <Text style={{ width: '10%', textAlign: 'center' }}>Qty</Text>
            <Text style={{ width: '20%', textAlign: 'right' }}>Amount (₹)</Text>
          </View>
          <View style={styles.itemTableRow}>
            <Text style={{ width: '10%' }}>1</Text>
            <Text style={{ width: '60%' }}>{planName}</Text>
            <Text style={{ width: '10%', textAlign: 'center' }}>1</Text>
            <Text style={{ width: '20%', textAlign: 'right', fontWeight: 'bold' }}>
              ₹{totalAmount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
            </Text>
          </View>
        </View>

        {/* 4. Total Summary */}
        <View style={{ marginBottom: 15, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <View style={{ width: '55%', padding: 8, backgroundColor: '#f9fafb', borderRadius: 4, borderWidth: 1, borderColor: '#e5e7eb' }}>
            <Text style={{ fontWeight: 'bold', marginBottom: 2 }}>Amount in Words:</Text>
            <Text style={{ fontStyle: 'italic', color: '#1f2937' }}>{wordsAmount}</Text>
          </View>
          <View style={{ width: '40%', borderWidth: 1, borderColor: '#cccccc', borderRadius: 4 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', padding: 6, backgroundColor: '#000000', color: '#ffffff', fontWeight: 'bold' }}>
              <Text>TOTAL PAID:</Text>
              <Text>₹{totalAmount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</Text>
            </View>
          </View>
        </View>

        {/* Notes & Terms */}
        <View style={styles.sectionTable}>
          <View style={styles.tableRowHeader}>
            <Text style={styles.colFull}>TERMS &amp; CONDITIONS</Text>
          </View>
          <View style={styles.tableRow}>
            <Text style={{ width: '100%', color: '#444444' }}>
              {notes || invoiceSettings.termsAndConditions || 'This is an official computer-generated payment receipt and bill. No tax/GST is charged on this receipt.'}
            </Text>
          </View>
        </View>

        <Text style={styles.footerText}>
          Thank you for doing business with {companyName}. For queries, please contact customer support.
        </Text>
      </Page>
    </Document>
  );
};
