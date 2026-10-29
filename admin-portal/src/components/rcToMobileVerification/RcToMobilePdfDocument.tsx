import { Document, Page, StyleSheet, Text, View } from '@react-pdf/renderer';
import type { RcToMobileRecord, RcToMobileResult } from '@/lib/rcToMobile';

const styles = StyleSheet.create({
  page: {
    padding: 36,
    backgroundColor: '#ffffff',
    color: '#0f172a',
    fontSize: 9,
    fontFamily: 'Helvetica',
  },
  header: {
    paddingBottom: 14,
    borderBottom: '2 solid #f59e0b',
    marginBottom: 20,
  },
  eyebrow: {
    color: '#d97706',
    fontSize: 8,
    fontWeight: 700,
    letterSpacing: 1.5,
    textTransform: 'uppercase',
  },
  title: {
    marginTop: 4,
    fontSize: 20,
    fontWeight: 700,
    color: '#0f172a',
  },
  subtitle: {
    marginTop: 4,
    color: '#475569',
    fontSize: 9,
  },
  badge: {
    marginTop: 8,
    alignSelf: 'flex-start',
    backgroundColor: '#ecfdf5',
    color: '#047857',
    border: '1 solid #a7f3d0',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 4,
    fontSize: 8,
    fontWeight: 700,
    textTransform: 'uppercase',
  },
  primaryCard: {
    marginBottom: 16,
    padding: 16,
    backgroundColor: '#fffbeb',
    border: '1.5 solid #fde68a',
    borderRadius: 8,
  },
  cardTitle: {
    color: '#92400e',
    fontSize: 10,
    fontWeight: 700,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    marginBottom: 10,
  },
  primaryGrid: {
    display: 'flex',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  primaryBox: {
    width: '48%',
    padding: 12,
    backgroundColor: '#ffffff',
    border: '1 solid #fcd34d',
    borderRadius: 6,
  },
  primaryLabel: {
    fontSize: 8,
    color: '#78350f',
    fontWeight: 700,
    textTransform: 'uppercase',
    marginBottom: 4,
  },
  primaryValue: {
    fontSize: 15,
    fontWeight: 700,
    color: '#0f172a',
  },
  section: {
    marginBottom: 16,
    padding: 14,
    backgroundColor: '#f8fafc',
    border: '1 solid #e2e8f0',
    borderRadius: 6,
  },
  sectionTitle: {
    marginBottom: 10,
    color: '#1e293b',
    fontSize: 11,
    fontWeight: 700,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  grid: {
    display: 'flex',
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  field: {
    width: '48%',
    padding: 8,
    backgroundColor: '#ffffff',
    border: '1 solid #e2e8f0',
    borderRadius: 4,
  },
  fieldWide: {
    width: '100%',
    padding: 8,
    backgroundColor: '#ffffff',
    border: '1 solid #e2e8f0',
    borderRadius: 4,
  },
  label: {
    marginBottom: 3,
    color: '#64748b',
    fontSize: 7.5,
    fontWeight: 700,
    textTransform: 'uppercase',
  },
  value: {
    color: '#0f172a',
    fontSize: 9.5,
    fontWeight: 700,
  },
  mono: {
    color: '#334155',
    fontSize: 9,
    fontFamily: 'Courier',
  },
  disclaimerBox: {
    marginTop: 20,
    padding: 10,
    border: '1 dashed #cbd5e1',
    borderRadius: 4,
    backgroundColor: '#f8fafc',
  },
  disclaimerText: {
    color: '#64748b',
    fontSize: 7.5,
    lineHeight: 1.4,
  },
  footer: {
    position: 'absolute',
    left: 36,
    right: 36,
    bottom: 24,
    paddingTop: 8,
    borderTop: '1 solid #e2e8f0',
    display: 'flex',
    flexDirection: 'row',
    justifyContent: 'space-between',
    color: '#94a3b8',
    fontSize: 7.5,
  },
});

type Props = {
  record: RcToMobileRecord;
  result?: RcToMobileResult | null;
};

const formatDateTime = (value: unknown): string => {
  if (typeof value !== 'string') return 'Not available';
  try {
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return value;
    return new Intl.DateTimeFormat('en-IN', {
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(d);
  } catch {
    return value;
  }
};

export function RcToMobilePdfDocument({ record, result }: Props) {
  const rcNumber = String(result?.rcNumber || record.maskedRcNumber || 'Not available');
  const mobileNumber = String(result?.mobileNumber || record.maskedMobileNumber || 'No mobile number returned');
  const providerClientId = String(result?.providerClientId || record.providerClientId || 'Not available');
  const isSuccess = record.status === 'SUCCESS';

  return (
    <Document title={`RC-to-Mobile-${rcNumber}`} author="JCB Exchange">
      <Page size="A4" style={styles.page}>
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.eyebrow}>JCB Exchange • Vehicle &amp; Transport Verification</Text>
          <Text style={styles.title}>RC to Mobile Linkage Certificate</Text>
          <Text style={styles.subtitle}>
            Official cross-verification report linking vehicle registration to registered telecom contact.
          </Text>
          <Text style={styles.badge}>{isSuccess ? 'VERIFICATION SUCCESSFUL' : `STATUS: ${record.status}`}</Text>
        </View>

        {/* Primary Contact Result Card */}
        <View style={styles.primaryCard}>
          <Text style={styles.cardTitle}>Verified Registration Linkage</Text>
          <View style={styles.primaryGrid}>
            <View style={styles.primaryBox}>
              <Text style={styles.primaryLabel}>Vehicle Registration No</Text>
              <Text style={styles.primaryValue}>{rcNumber}</Text>
            </View>
            <View style={styles.primaryBox}>
              <Text style={styles.primaryLabel}>Linked Mobile Number</Text>
              <Text style={styles.primaryValue}>{mobileNumber}</Text>
            </View>
          </View>
        </View>

        {/* Verification Metadata Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Verification Metadata</Text>
          <View style={styles.grid}>
            <View style={styles.field}>
              <Text style={styles.label}>Provider Service</Text>
              <Text style={styles.value}>Surepass RC to Mobile</Text>
            </View>
            <View style={styles.field}>
              <Text style={styles.label}>Provider Client ID</Text>
              <Text style={styles.mono}>{providerClientId}</Text>
            </View>
            <View style={styles.field}>
              <Text style={styles.label}>Verified Date &amp; Time</Text>
              <Text style={styles.value}>{formatDateTime(record.completedAt || record.createdAt)}</Text>
            </View>
            <View style={styles.field}>
              <Text style={styles.label}>Verified By (User)</Text>
              <Text style={styles.value}>{record.requestedBy?.name || record.requestedBy?.email || 'Authorized Operator'}</Text>
            </View>
            <View style={styles.fieldWide}>
              <Text style={styles.label}>System Record Reference ID</Text>
              <Text style={styles.mono}>{record.id}</Text>
            </View>
          </View>
        </View>

        {/* Compliance Disclaimer */}
        <View style={styles.disclaimerBox}>
          <Text style={styles.disclaimerText}>
            Notice &amp; Disclaimer: This record has been verified through authorized registry endpoints under appropriate operator consent.
            The registered contact information is obtained directly from transport authority records and is intended strictly for
            authorized KYC compliance, equipment transfer, and fleet validation purposes.
          </Text>
        </View>

        {/* Page Footer */}
        <View style={styles.footer} fixed>
          <Text>JCB Exchange Transport Hub • Secure Document</Text>
          <Text>Generated on {new Date().toLocaleDateString('en-IN')}</Text>
        </View>
      </Page>
    </Document>
  );
}
export default RcToMobilePdfDocument;
