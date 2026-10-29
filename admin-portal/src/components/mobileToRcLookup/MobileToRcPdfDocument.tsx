import { Document, Page, StyleSheet, Text, View } from '@react-pdf/renderer';
import type { MobileToRcRecord, MobileToRcResult } from '@/lib/mobileToRc';

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
    marginBottom: 18,
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
    padding: 14,
    backgroundColor: '#fffbeb',
    border: '1.5 solid #fde68a',
    borderRadius: 8,
  },
  primaryGrid: {
    display: 'flex',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  primaryBox: {
    width: '48%',
    padding: 10,
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
    fontSize: 14,
    fontWeight: 700,
    color: '#0f172a',
  },
  tableSection: {
    marginBottom: 16,
    border: '1 solid #e2e8f0',
    borderRadius: 6,
    overflow: 'hidden',
  },
  tableHeader: {
    display: 'flex',
    flexDirection: 'row',
    backgroundColor: '#0f172a',
    padding: 8,
    color: '#ffffff',
    fontSize: 8,
    fontWeight: 700,
    textTransform: 'uppercase',
  },
  tableRow: {
    display: 'flex',
    flexDirection: 'row',
    borderTop: '1 solid #f1f5f9',
    padding: 8,
    alignItems: 'center',
  },
  tableRowEven: {
    backgroundColor: '#f8fafc',
  },
  colIndex: {
    width: '12%',
    color: '#64748b',
    fontWeight: 700,
  },
  colRc: {
    width: '58%',
    fontSize: 10,
    fontWeight: 700,
    fontFamily: 'Courier',
    color: '#0f172a',
  },
  colStatus: {
    width: '30%',
    color: '#047857',
    fontWeight: 700,
    fontSize: 8,
    textTransform: 'uppercase',
  },
  section: {
    marginBottom: 16,
    padding: 12,
    backgroundColor: '#f8fafc',
    border: '1 solid #e2e8f0',
    borderRadius: 6,
  },
  sectionTitle: {
    marginBottom: 8,
    color: '#1e293b',
    fontSize: 10,
    fontWeight: 700,
    textTransform: 'uppercase',
  },
  grid: {
    display: 'flex',
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  field: {
    width: '48%',
    padding: 6,
    backgroundColor: '#ffffff',
    border: '1 solid #e2e8f0',
    borderRadius: 4,
  },
  fieldWide: {
    width: '100%',
    padding: 6,
    backgroundColor: '#ffffff',
    border: '1 solid #e2e8f0',
    borderRadius: 4,
  },
  label: {
    marginBottom: 2,
    color: '#64748b',
    fontSize: 7,
    fontWeight: 700,
    textTransform: 'uppercase',
  },
  value: {
    color: '#0f172a',
    fontSize: 8.5,
    fontWeight: 700,
  },
  mono: {
    color: '#334155',
    fontSize: 8,
    fontFamily: 'Courier',
  },
  disclaimerBox: {
    marginTop: 14,
    padding: 8,
    border: '1 dashed #cbd5e1',
    borderRadius: 4,
    backgroundColor: '#f8fafc',
  },
  disclaimerText: {
    color: '#64748b',
    fontSize: 7,
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
  record: MobileToRcRecord;
  result?: MobileToRcResult | null;
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

export function MobileToRcPdfDocument({ record, result }: Props) {
  const mobileNumber = result?.mobileNumber || record.maskedMobileNumber || 'Not available';
  const rcNumbers = result?.rcNumbers || [];
  const count = rcNumbers.length || record.rcNumbersCount || 0;
  const providerClientId = result?.providerClientId || record.providerClientId || 'Not available';

  return (
    <Document title={`Mobile-To-RC-${mobileNumber}`} author="JCB Exchange">
      <Page size="A4" style={styles.page}>
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.eyebrow}>JCB Exchange • Vehicle &amp; Transport Verification</Text>
          <Text style={styles.title}>Mobile to RC Fleet Registry Report</Text>
          <Text style={styles.subtitle}>
            Comprehensive cross-registry record of all vehicle registration numbers associated with this mobile contact.
          </Text>
          <Text style={styles.badge}>{`TOTAL VEHICLES LINKED: ${count}`}</Text>
        </View>

        {/* Primary Contact Card */}
        <View style={styles.primaryCard}>
          <View style={styles.primaryGrid}>
            <View style={styles.primaryBox}>
              <Text style={styles.primaryLabel}>Queried Mobile Number</Text>
              <Text style={styles.primaryValue}>{mobileNumber}</Text>
            </View>
            <View style={styles.primaryBox}>
              <Text style={styles.primaryLabel}>Registered Vehicles Count</Text>
              <Text style={styles.primaryValue}>{`${count} Vehicle${count === 1 ? '' : 's'}`}</Text>
            </View>
          </View>
        </View>

        {/* Linked Vehicles Table */}
        <View style={styles.tableSection}>
          <View style={styles.tableHeader}>
            <Text style={styles.colIndex}>#</Text>
            <Text style={styles.colRc}>Vehicle Registration Number</Text>
            <Text style={styles.colStatus}>Status</Text>
          </View>
          {rcNumbers.length > 0 ? (
            rcNumbers.map((rcNumber, index) => (
              <View key={rcNumber} style={[styles.tableRow, index % 2 === 1 ? styles.tableRowEven : {}]}>
                <Text style={styles.colIndex}>#{index + 1}</Text>
                <Text style={styles.colRc}>{rcNumber}</Text>
                <Text style={styles.colStatus}>LINKED / ACTIVE</Text>
              </View>
            ))
          ) : (
            <View style={styles.tableRow}>
              <Text style={{ width: '100%', color: '#64748b', textAlign: 'center', padding: 8 }}>
                No active vehicle registration records found for this mobile number.
              </Text>
            </View>
          )}
        </View>

        {/* Verification Metadata Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Verification Metadata</Text>
          <View style={styles.grid}>
            <View style={styles.field}>
              <Text style={styles.label}>Provider Service</Text>
              <Text style={styles.value}>Surepass Mobile to RC</Text>
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
            Notice &amp; Disclaimer: This registry report contains transport authority linked vehicle data retrieved under verified operator
            credentials. It is intended strictly for authorized KYC verification, fleet evaluation, ownership verification, and vehicle
            finance auditing.
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
export default MobileToRcPdfDocument;

