import { Document, Page, StyleSheet, Text, View } from '@react-pdf/renderer';
import type {
  RcChallanHistoryRecord,
  RcChallanRecord,
  RcChallanResult,
} from '@/lib/rcChallan';

const styles = StyleSheet.create({
  page: {
    padding: 32,
    backgroundColor: '#ffffff',
    color: '#0f172a',
    fontSize: 8.5,
    fontFamily: 'Helvetica',
  },
  header: {
    paddingBottom: 14,
    borderBottom: '2 solid #f59e0b',
    marginBottom: 16,
  },
  eyebrow: {
    color: '#d97706',
    fontSize: 7.5,
    fontWeight: 700,
    letterSpacing: 1.5,
    textTransform: 'uppercase',
  },
  title: {
    marginTop: 4,
    fontSize: 18,
    fontWeight: 700,
    color: '#0f172a',
  },
  subtitle: {
    marginTop: 3,
    color: '#475569',
    fontSize: 8.5,
  },
  badge: {
    marginTop: 6,
    alignSelf: 'flex-start',
    backgroundColor: '#ecfdf5',
    color: '#047857',
    border: '1 solid #a7f3d0',
    paddingHorizontal: 8,
    paddingVertical: 2.5,
    borderRadius: 4,
    fontSize: 7.5,
    fontWeight: 700,
    textTransform: 'uppercase',
  },
  summaryCard: {
    marginBottom: 14,
    padding: 12,
    backgroundColor: '#fffbeb',
    border: '1.5 solid #fde68a',
    borderRadius: 6,
  },
  summaryGrid: {
    display: 'flex',
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    gap: 8,
  },
  summaryBox: {
    width: '31%',
    padding: 8,
    backgroundColor: '#ffffff',
    border: '1 solid #fcd34d',
    borderRadius: 5,
  },
  summaryBoxAlert: {
    width: '31%',
    padding: 8,
    backgroundColor: '#fef2f2',
    border: '1 solid #fecaca',
    borderRadius: 5,
  },
  summaryBoxSuccess: {
    width: '31%',
    padding: 8,
    backgroundColor: '#ecfdf5',
    border: '1 solid #a7f3d0',
    borderRadius: 5,
  },
  summaryLabel: {
    fontSize: 7,
    color: '#78350f',
    fontWeight: 700,
    textTransform: 'uppercase',
    marginBottom: 3,
  },
  summaryLabelAlert: {
    fontSize: 7,
    color: '#991b1b',
    fontWeight: 700,
    textTransform: 'uppercase',
    marginBottom: 3,
  },
  summaryLabelSuccess: {
    fontSize: 7,
    color: '#065f46',
    fontWeight: 700,
    textTransform: 'uppercase',
    marginBottom: 3,
  },
  summaryValue: {
    fontSize: 12,
    fontWeight: 700,
    color: '#0f172a',
  },
  summaryValueAlert: {
    fontSize: 12,
    fontWeight: 700,
    color: '#b91c1c',
  },
  summaryValueSuccess: {
    fontSize: 12,
    fontWeight: 700,
    color: '#047857',
  },
  section: {
    marginBottom: 14,
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
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  challanCard: {
    marginBottom: 10,
    backgroundColor: '#ffffff',
    border: '1 solid #cbd5e1',
    borderRadius: 6,
    overflow: 'hidden',
  },
  challanCardHeader: {
    padding: 8,
    backgroundColor: '#0f172a',
    display: 'flex',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  challanCardHeaderTitle: {
    color: '#ffffff',
    fontSize: 9,
    fontWeight: 700,
    fontFamily: 'Courier',
  },
  challanStatusPending: {
    backgroundColor: '#fef3c7',
    color: '#92400e',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 3,
    fontSize: 7,
    fontWeight: 700,
    textTransform: 'uppercase',
  },
  challanStatusPaid: {
    backgroundColor: '#d1fae5',
    color: '#065f46',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 3,
    fontSize: 7,
    fontWeight: 700,
    textTransform: 'uppercase',
  },
  challanBody: {
    padding: 10,
  },
  offenseBox: {
    marginBottom: 8,
    padding: 6,
    backgroundColor: '#fff1f2',
    borderLeft: '3 solid #f43f5e',
    borderRadius: 3,
  },
  offenseLabel: {
    fontSize: 6.5,
    fontWeight: 700,
    color: '#9f1239',
    textTransform: 'uppercase',
    marginBottom: 2,
  },
  offenseText: {
    fontSize: 8.5,
    fontWeight: 700,
    color: '#881337',
  },
  grid: {
    display: 'flex',
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  field: {
    width: '31.5%',
    padding: 5,
    backgroundColor: '#f8fafc',
    borderRadius: 4,
  },
  fieldWide: {
    width: '100%',
    padding: 5,
    backgroundColor: '#f8fafc',
    borderRadius: 4,
  },
  fieldLabel: {
    fontSize: 6.5,
    fontWeight: 700,
    color: '#64748b',
    textTransform: 'uppercase',
    marginBottom: 2,
  },
  fieldValue: {
    fontSize: 8,
    color: '#0f172a',
  },
  fieldValueBold: {
    fontSize: 8.5,
    fontWeight: 700,
    color: '#0f172a',
  },
  fieldValueMono: {
    fontSize: 7.5,
    color: '#334155',
    fontFamily: 'Courier',
  },
  disclaimerBox: {
    marginTop: 10,
    padding: 8,
    backgroundColor: '#f8fafc',
    border: '1 solid #e2e8f0',
    borderRadius: 4,
  },
  disclaimerText: {
    fontSize: 6.5,
    color: '#64748b',
    lineHeight: 1.35,
  },
  footer: {
    position: 'absolute',
    left: 32,
    right: 32,
    bottom: 18,
    paddingTop: 6,
    borderTop: '1 solid #e2e8f0',
    display: 'flex',
    flexDirection: 'row',
    justifyContent: 'space-between',
    color: '#94a3b8',
    fontSize: 7,
  },
});

const formatCurrency = (amount: number | string | null | undefined): string => {
  const num = typeof amount === 'number' ? amount : Number(amount);
  if (!Number.isFinite(num)) return '₹0.00';
  return `₹${num.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};

const formatDateTime = (value: unknown): string => {
  if (typeof value !== 'string' || !value.trim()) return 'Not available';
  try {
    const d = new Date(value);
    if (!Number.isNaN(d.getTime())) {
      return new Intl.DateTimeFormat('en-IN', {
        dateStyle: 'medium',
        timeStyle: value.includes('T') ? 'short' : undefined,
      }).format(d);
    }
  } catch {
    // fallback
  }
  return value;
};

export function RcChallanPdfDocument({
  result,
  record,
}: {
  result: RcChallanResult;
  record: RcChallanHistoryRecord;
}) {
  const rcNumber = result.rcNumber || record.maskedRcNumber || 'RC-RECORD';
  const summary = result.summary || {
    totalChallans: 0,
    totalReturnedAmount: 0,
    knownPendingCount: 0,
    knownPendingAmount: 0,
    courtChallanCount: 0,
    blacklistCount: 0,
  };
  const challans = result.challans || [];
  const hasPending = summary.knownPendingCount > 0;
  const isBlacklisted = summary.blacklistCount > 0;

  return (
    <Document title={`RC-Challan-${rcNumber}`} author="JCB Exchange">
      <Page size="A4" style={styles.page} wrap>
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.eyebrow}>JCB Exchange • Vehicle &amp; Transport Verification</Text>
          <Text style={styles.title}>Traffic Challan &amp; Blacklist Inspection Report</Text>
          <Text style={styles.subtitle}>
            Official traffic violations and blacklist compliance audit retrieved via Surepass National Transport Gateway.
          </Text>
          <Text style={styles.badge}>{record.status === 'SUCCESS' ? 'VERIFICATION COMPLETED' : `STATUS: ${record.status}`}</Text>
        </View>

        {/* Executive Summary Cards */}
        <View style={styles.summaryCard}>
          <View style={styles.summaryGrid}>
            <View style={styles.summaryBox}>
              <Text style={styles.summaryLabel}>Vehicle Registration No</Text>
              <Text style={styles.summaryValue}>{rcNumber}</Text>
            </View>
            <View style={hasPending ? styles.summaryBoxAlert : styles.summaryBoxSuccess}>
              <Text style={hasPending ? styles.summaryLabelAlert : styles.summaryLabelSuccess}>Pending Challan Fine</Text>
              <Text style={hasPending ? styles.summaryValueAlert : styles.summaryValueSuccess}>
                {`${summary.knownPendingCount} Pending • ${formatCurrency(summary.knownPendingAmount)}`}
              </Text>
            </View>
            <View style={styles.summaryBox}>
              <Text style={styles.summaryLabel}>Total Returned Challans</Text>
              <Text style={styles.summaryValue}>{`${summary.totalChallans} (${formatCurrency(summary.totalReturnedAmount)})`}</Text>
            </View>
            <View style={isBlacklisted ? styles.summaryBoxAlert : styles.summaryBoxSuccess}>
              <Text style={isBlacklisted ? styles.summaryLabelAlert : styles.summaryLabelSuccess}>Blacklist Status</Text>
              <Text style={isBlacklisted ? styles.summaryValueAlert : styles.summaryValueSuccess}>
                {isBlacklisted ? `${summary.blacklistCount} Blacklist Record(s)` : 'CLEAN / NOT BLACKLISTED'}
              </Text>
            </View>
            <View style={summary.courtChallanCount > 0 ? styles.summaryBoxAlert : styles.summaryBox}>
              <Text style={summary.courtChallanCount > 0 ? styles.summaryLabelAlert : styles.summaryLabel}>Court Challans</Text>
              <Text style={summary.courtChallanCount > 0 ? styles.summaryValueAlert : styles.summaryValue}>
                {summary.courtChallanCount > 0 ? `${summary.courtChallanCount} Case(s) in Court` : 'None'}
              </Text>
            </View>
            <View style={styles.summaryBox}>
              <Text style={styles.summaryLabel}>Verification Date</Text>
              <Text style={styles.summaryValue}>{formatDateTime(record.completedAt || record.createdAt)}</Text>
            </View>
          </View>
        </View>

        {/* Challan Records Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Challan Records Breakdown ({challans.length})</Text>
          {challans.length > 0 ? (
            challans.map((challan: RcChallanRecord, index: number) => {
              const isPending = (challan.challanStatus || '').toLowerCase().includes('pending');
              const offenses = (challan.offenseDetailsList || [])
                .map((o) => o?.offenseName)
                .filter(Boolean)
                .join(', ') || challan.offenseDetails || 'Traffic Violation';

              return (
                <View key={challan.recordKey || index} style={styles.challanCard} wrap={false}>
                  <View style={styles.challanCardHeader}>
                    <Text style={styles.challanCardHeaderTitle}>
                      {`#${index + 1} • Challan No: ${challan.challanNumber || 'N/A'}`}
                    </Text>
                    <Text style={isPending ? styles.challanStatusPending : styles.challanStatusPaid}>
                      {`${challan.challanStatus || 'UNKNOWN'} • ${formatCurrency(challan.amount)}`}
                    </Text>
                  </View>
                  <View style={styles.challanBody}>
                    <View style={styles.offenseBox}>
                      <Text style={styles.offenseLabel}>Offense Details</Text>
                      <Text style={styles.offenseText}>{offenses}</Text>
                    </View>
                    <View style={styles.grid}>
                      <View style={styles.field}>
                        <Text style={styles.fieldLabel}>Date &amp; Time</Text>
                        <Text style={styles.fieldValueBold}>
                          {challan.challanDateTime || formatDateTime(challan.challanDate)}
                        </Text>
                      </View>
                      <View style={styles.field}>
                        <Text style={styles.fieldLabel}>State &amp; RTO</Text>
                        <Text style={styles.fieldValue}>{`${challan.state || 'N/A'} • ${challan.rto || 'RTO'}`}</Text>
                      </View>
                      <View style={styles.field}>
                        <Text style={styles.fieldLabel}>Challan Place</Text>
                        <Text style={styles.fieldValue}>{challan.challanPlace || 'Not specified'}</Text>
                      </View>
                      <View style={styles.field}>
                        <Text style={styles.fieldLabel}>Accused Name</Text>
                        <Text style={styles.fieldValue}>{challan.accusedName || 'Not available'}</Text>
                      </View>
                      <View style={styles.field}>
                        <Text style={styles.fieldLabel}>Court Case Status</Text>
                        <Text style={styles.fieldValueBold}>
                          {challan.courtChallan ? `Yes • ${challan.courtName || 'Court'}` : 'No'}
                        </Text>
                      </View>
                      <View style={styles.field}>
                        <Text style={styles.fieldLabel}>Provider Code / Serial</Text>
                        <Text style={styles.fieldValueMono}>{challan.upstreamCode || challan.number || 'N/A'}</Text>
                      </View>
                      {challan.providerData ? (
                        <View style={styles.fieldWide}>
                          <Text style={styles.fieldLabel}>Provider Data Source</Text>
                          <Text style={styles.fieldValueMono}>Validated Surepass providerData stream</Text>
                        </View>
                      ) : null}
                    </View>
                  </View>
                </View>
              );
            })
          ) : (
            <Text style={styles.fieldValueBold}>No challan records were returned for this vehicle registration.</Text>
          )}
        </View>

        {/* Blacklist Status Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Blacklist &amp; Impound Registry</Text>
          {result.blacklist && result.blacklist.length > 0 ? (
            <View style={styles.fieldWide}>
              <Text style={styles.fieldLabel}>Blacklist Records</Text>
              <Text style={styles.fieldValueBold}>
                {JSON.stringify(result.blacklist, null, 2)}
              </Text>
            </View>
          ) : (
            <View style={styles.fieldWide}>
              <Text style={styles.summaryValueSuccess}>
                ✓ Clean Status — No blacklist or impound records found for {rcNumber}.
              </Text>
            </View>
          )}
        </View>

        {/* Verification Audit Trail */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Verification Metadata &amp; Provider Audit Trail</Text>
          <View style={styles.grid}>
            <View style={styles.field}>
              <Text style={styles.fieldLabel}>Provider Service</Text>
              <Text style={styles.fieldValue}>Surepass RC Challan Advanced</Text>
            </View>
            <View style={styles.field}>
              <Text style={styles.fieldLabel}>Provider Client ID</Text>
              <Text style={styles.fieldValueMono}>{result.providerClientId || record.providerClientId || 'N/A'}</Text>
            </View>
            <View style={styles.field}>
              <Text style={styles.fieldLabel}>Operator / Verified By</Text>
              <Text style={styles.fieldValue}>{record.requestedBy?.name || record.requestedBy?.email || 'Authorized Operator'}</Text>
            </View>
            <View style={styles.fieldWide}>
              <Text style={styles.fieldLabel}>Audit Reference / System ID</Text>
              <Text style={styles.fieldValueMono}>{record.id}</Text>
            </View>
          </View>
        </View>

        {/* Disclaimer */}
        <View style={styles.disclaimerBox}>
          <Text style={styles.disclaimerText}>
            Notice &amp; Disclaimer: This traffic challan and blacklist report has been retrieved directly from government transport
            registry databases under operator authorization. The data provided reflects the current recorded status at the time of
            query and is intended strictly for authorized fleet, transport, and equipment transfer due diligence.
          </Text>
        </View>

        {/* Footer */}
        <View style={styles.footer} fixed>
          <Text>JCB Exchange Transport Hub • Confidential Inspection Document</Text>
          <Text>Generated on {new Date().toLocaleDateString('en-IN')}</Text>
        </View>
      </Page>
    </Document>
  );
}

export default RcChallanPdfDocument;
