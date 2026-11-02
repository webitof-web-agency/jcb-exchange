import { Document, Page, StyleSheet, Text, View } from '@react-pdf/renderer';
import type { ChassisToRcRecord } from '@/lib/chassisToRc';

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
    lineHeight: 1.35,
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
    gap: 8,
  },
  summaryBox: {
    width: '31.5%',
    padding: 8,
    backgroundColor: '#ffffff',
    border: '1 solid #fcd34d',
    borderRadius: 5,
  },
  summaryLabel: {
    fontSize: 7,
    color: '#78350f',
    fontWeight: 700,
    textTransform: 'uppercase',
    marginBottom: 3,
  },
  summaryValue: {
    fontSize: 9.5,
    fontWeight: 700,
    color: '#0f172a',
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
  grid: {
    display: 'flex',
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  field: {
    width: '31.5%',
    padding: 6,
    backgroundColor: '#ffffff',
    borderRadius: 4,
  },
  fieldWide: {
    width: '100%',
    padding: 6,
    backgroundColor: '#ffffff',
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
    lineHeight: 1.25,
  },
  fieldValueMono: {
    fontSize: 7.5,
    color: '#334155',
    fontFamily: 'Courier',
    lineHeight: 1.25,
  },
  disclaimerBox: {
    marginTop: 4,
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

type PdfResult = Record<string, unknown>;

type Props = {
  result: PdfResult;
  record: ChassisToRcRecord;
};

const dateKeys = new Set([
  'registrationDate',
  'registrationUpto',
  'fitUpTo',
  'insuranceUpto',
  'latestBy',
  'taxUpto',
  'taxPaidUpto',
  'puccUpto',
  'permitIssueDate',
  'permitValidFrom',
  'permitValidUpto',
  'nationalPermitUpto',
  'nonUseFrom',
  'nonUseTo',
]);

const knownResultKeys = new Set([
  'providerClientId',
  'rcNumber',
  'registrationDate',
  'registrationUpto',
  'fitUpTo',
  'rcStatus',
  'ownerNumber',
  'latestBy',
  'ownerName',
  'fatherName',
  'mobileNumber',
  'presentAddress',
  'permanentAddress',
  'vehicleCategory',
  'vehicleCategoryDescription',
  'makerDescription',
  'makerModel',
  'variant',
  'bodyType',
  'fuelType',
  'color',
  'normsType',
  'vehicleChasiNumber',
  'vehicleEngineNumber',
  'financed',
  'financer',
  'cubicCapacity',
  'vehicleGrossWeight',
  'noCylinders',
  'seatCapacity',
  'sleeperCapacity',
  'standingCapacity',
  'wheelbase',
  'unladenWeight',
  'manufacturingDate',
  'manufacturingDateFormatted',
  'insuranceCompany',
  'insurancePolicyNumber',
  'insuranceUpto',
  'taxUpto',
  'taxPaidUpto',
  'puccUpto',
  'puccNumber',
  'permitIssueDate',
  'permitValidFrom',
  'permitValidUpto',
  'permitType',
  'permitNumber',
  'nationalPermitNumber',
  'nationalPermitUpto',
  'nationalPermitIssuedBy',
  'blacklistStatus',
  'nonUseStatus',
  'nonUseFrom',
  'nonUseTo',
  'registeredAt',
  'nocDetails',
  'maskedName',
  'lessInfo',
  'challanDetails',
  'ownerHistory',
]);

const formatDate = (value: unknown) => {
  if (typeof value !== 'string' || !value.trim()) return 'Not available';
  const date = new Date(`${value.slice(0, 10)}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium' }).format(date);
};

const formatKey = (key: string) => key
  .replace(/([a-z])([A-Z])/g, '$1 $2')
  .replace(/[_-]+/g, ' ')
  .replace(/\b\w/g, (letter) => letter.toUpperCase());

const formatValue = (value: unknown): string => {
  if (value === null || value === undefined || value === '') return 'Not available';
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return String(value);
  try {
    return JSON.stringify(value, null, 2) || 'Not available';
  } catch {
    return String(value);
  }
};

function PdfField({ label, value, wide = false, mono = false }: { label: string; value: unknown; wide?: boolean; mono?: boolean }) {
  return (
    <View style={wide ? styles.fieldWide : styles.field}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <Text style={mono ? styles.fieldValueMono : styles.fieldValue}>{formatValue(value)}</Text>
    </View>
  );
}

function PdfSection({ title, fields }: { title: string; fields: Array<{ key: string; label: string; value: unknown; wide?: boolean; mono?: boolean }> }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      <View style={styles.grid}>
        {fields.map((field) => (
          <PdfField
            key={field.key}
            label={field.label}
            value={field.value}
            wide={field.wide}
            mono={field.mono}
          />
        ))}
      </View>
    </View>
  );
}

export function ChassisToRcPdfDocument({ result, record }: Props) {
  const rcNumber = result.rcNumber || record.rcNumber || 'Not available';
  const chassisNumber = result.vehicleChasiNumber || record.maskedChassisNumber || 'Not available';
  const dateValue = (key: string) => dateKeys.has(key) ? formatDate(result[key]) : result[key];
  const additionalFields = Object.entries(result)
    .filter(([key]) => !knownResultKeys.has(key))
    .map(([key, value]) => ({ key, label: formatKey(key), value, wide: typeof value === 'object', mono: typeof value === 'string' && key.toLowerCase().includes('id') }));

  const registrationFields = [
    { key: 'rcNumber', label: 'RC number', value: rcNumber, mono: true },
    { key: 'registrationDate', label: 'Registration date', value: dateValue('registrationDate') },
    { key: 'registrationUpto', label: 'Registration valid up to', value: dateValue('registrationUpto') },
    { key: 'fitUpTo', label: 'Fit valid up to', value: dateValue('fitUpTo') },
    { key: 'rcStatus', label: 'RC status', value: result.rcStatus },
    { key: 'ownerNumber', label: 'Owner number', value: result.ownerNumber },
    { key: 'latestBy', label: 'Latest record date', value: dateValue('latestBy') },
  ];

  const ownerFields = [
    { key: 'ownerName', label: 'Owner name', value: result.ownerName },
    { key: 'fatherName', label: 'Father name', value: result.fatherName },
    { key: 'mobileNumber', label: 'Mobile number', value: result.mobileNumber, mono: true },
    { key: 'presentAddress', label: 'Present address', value: result.presentAddress, wide: true },
    { key: 'permanentAddress', label: 'Permanent address', value: result.permanentAddress, wide: true },
  ];

  const vehicleFields = [
    { key: 'vehicleCategoryDescription', label: 'Category description', value: result.vehicleCategoryDescription },
    { key: 'vehicleCategory', label: 'Category code', value: result.vehicleCategory },
    { key: 'makerDescription', label: 'Maker', value: result.makerDescription },
    { key: 'makerModel', label: 'Model', value: result.makerModel },
    { key: 'variant', label: 'Variant', value: result.variant },
    { key: 'bodyType', label: 'Body type', value: result.bodyType },
    { key: 'fuelType', label: 'Fuel type', value: result.fuelType },
    { key: 'color', label: 'Color', value: result.color },
    { key: 'normsType', label: 'Emission norms', value: result.normsType },
    { key: 'vehicleChasiNumber', label: 'Chassis number', value: chassisNumber, wide: true, mono: true },
    { key: 'vehicleEngineNumber', label: 'Engine number', value: result.vehicleEngineNumber, wide: true, mono: true },
    { key: 'financed', label: 'Financed', value: typeof result.financed === 'boolean' ? (result.financed ? 'Yes' : 'No') : result.financed },
    { key: 'financer', label: 'Financer', value: result.financer },
    { key: 'cubicCapacity', label: 'Cubic capacity', value: result.cubicCapacity },
    { key: 'vehicleGrossWeight', label: 'Gross weight', value: result.vehicleGrossWeight },
    { key: 'noCylinders', label: 'Cylinders', value: result.noCylinders },
    { key: 'seatCapacity', label: 'Seat capacity', value: result.seatCapacity },
    { key: 'sleeperCapacity', label: 'Sleeper capacity', value: result.sleeperCapacity },
    { key: 'standingCapacity', label: 'Standing capacity', value: result.standingCapacity },
    { key: 'wheelbase', label: 'Wheelbase', value: result.wheelbase },
    { key: 'unladenWeight', label: 'Unladen weight', value: result.unladenWeight },
  ];

  const complianceFields = [
    { key: 'manufacturingDateFormatted', label: 'Manufacturing month', value: result.manufacturingDateFormatted },
    { key: 'manufacturingDate', label: 'Manufacturing date', value: result.manufacturingDate },
    { key: 'insuranceUpto', label: 'Insurance valid up to', value: dateValue('insuranceUpto') },
    { key: 'taxUpto', label: 'Tax valid up to', value: dateValue('taxUpto') },
    { key: 'taxPaidUpto', label: 'Tax paid up to', value: dateValue('taxPaidUpto') },
    { key: 'puccUpto', label: 'PUCC valid up to', value: dateValue('puccUpto') },
    { key: 'permitIssueDate', label: 'Permit issue date', value: dateValue('permitIssueDate') },
    { key: 'permitValidFrom', label: 'Permit valid from', value: dateValue('permitValidFrom') },
    { key: 'permitValidUpto', label: 'Permit valid up to', value: dateValue('permitValidUpto') },
    { key: 'permitType', label: 'Permit type', value: result.permitType },
    { key: 'blacklistStatus', label: 'Blacklist status', value: result.blacklistStatus },
    { key: 'nonUseStatus', label: 'Non-use status', value: result.nonUseStatus },
    { key: 'nonUseFrom', label: 'Non-use from', value: dateValue('nonUseFrom') },
    { key: 'nonUseTo', label: 'Non-use to', value: dateValue('nonUseTo') },
  ];

  const providerFields = [
    { key: 'providerClientId', label: 'Provider client ID', value: result.providerClientId || record.providerClientId, mono: true },
    { key: 'registeredAt', label: 'Registered at', value: result.registeredAt },
    { key: 'insuranceCompany', label: 'Insurance company', value: result.insuranceCompany },
    { key: 'insurancePolicyNumber', label: 'Insurance policy number', value: result.insurancePolicyNumber, mono: true },
    { key: 'puccNumber', label: 'PUCC number', value: result.puccNumber, mono: true },
    { key: 'permitNumber', label: 'Permit number', value: result.permitNumber, mono: true },
    { key: 'nationalPermitNumber', label: 'National permit number', value: result.nationalPermitNumber, mono: true },
    { key: 'nationalPermitUpto', label: 'National permit valid up to', value: dateValue('nationalPermitUpto') },
    { key: 'nationalPermitIssuedBy', label: 'National permit issued by', value: result.nationalPermitIssuedBy },
    { key: 'nocDetails', label: 'NOC details', value: result.nocDetails, wide: true },
    { key: 'maskedName', label: 'Masked name', value: typeof result.maskedName === 'boolean' ? (result.maskedName ? 'Yes' : 'No') : result.maskedName },
    { key: 'lessInfo', label: 'Limited provider data', value: typeof result.lessInfo === 'boolean' ? (result.lessInfo ? 'Yes' : 'No') : result.lessInfo },
    { key: 'challanDetails', label: 'Challan details', value: result.challanDetails, wide: true, mono: true },
    { key: 'ownerHistory', label: 'Owner history', value: result.ownerHistory, wide: true, mono: true },
  ];

  const auditFields = [
    { key: 'provider', label: 'Provider', value: record.provider },
    { key: 'status', label: 'Verification status', value: record.status },
    { key: 'maskedChassisNumber', label: 'Masked chassis number', value: record.maskedChassisNumber, mono: true },
    { key: 'messageCode', label: 'Message code', value: record.messageCode, mono: true },
    { key: 'createdAt', label: 'Requested at', value: record.createdAt },
    { key: 'completedAt', label: 'Completed at', value: record.completedAt },
    { key: 'requestedBy', label: 'Verified by', value: record.requestedBy?.name || record.requestedBy?.email || 'Authorized Operator' },
    { key: 'id', label: 'System Record Reference ID', value: record.id, wide: true, mono: true },
  ];

  return (
    <Document title={`Chassis-to-RC-${String(rcNumber)}`} author="JCB Exchange">
      <Page size="A4" style={styles.page} wrap>
        <View style={styles.header}>
          <Text style={styles.eyebrow}>JCB Exchange • Vehicle &amp; Transport Verification</Text>
          <Text style={styles.title}>Chassis to RC Details Report</Text>
          <Text style={styles.subtitle}>Complete registration, owner, vehicle, compliance and provider details returned by the authorized Surepass vehicle registry gateway.</Text>
          <Text style={styles.badge}>{record.status === 'SUCCESS' ? 'VERIFICATION COMPLETED' : `STATUS: ${record.status}`}</Text>
        </View>

        <View style={styles.summaryCard}>
          <View style={styles.summaryGrid}>
            <View style={styles.summaryBox}><Text style={styles.summaryLabel}>RC number</Text><Text style={styles.summaryValue}>{String(rcNumber)}</Text></View>
            <View style={styles.summaryBox}><Text style={styles.summaryLabel}>Chassis number</Text><Text style={styles.summaryValue}>{String(chassisNumber)}</Text></View>
            <View style={styles.summaryBox}><Text style={styles.summaryLabel}>Owner</Text><Text style={styles.summaryValue}>{formatValue(result.ownerName)}</Text></View>
          </View>
        </View>

        <PdfSection title="Registration" fields={registrationFields} />
        <PdfSection title="Owner details" fields={ownerFields} />
        <PdfSection title="Vehicle details" fields={vehicleFields} />
        <PdfSection title="Validity and compliance" fields={complianceFields} />
        <PdfSection title="Provider details" fields={providerFields} />
        {additionalFields.length > 0 ? <PdfSection title="Additional provider data" fields={additionalFields} /> : null}
        <PdfSection title="Verification audit trail" fields={auditFields} />

        <View style={styles.disclaimerBox}>
          <Text style={styles.disclaimerText}>Notice &amp; Disclaimer: This report contains vehicle information returned from an authorized transport registry lookup. It is intended for permitted verification, fleet validation and vehicle-transfer due diligence only. The report reflects the data available at the time of verification.</Text>
        </View>

        <View style={styles.footer} fixed>
          <Text>JCB Exchange Transport Hub • Secure Verification Document</Text>
          <Text>Generated on {new Intl.DateTimeFormat('en-IN').format(new Date())}</Text>
        </View>
      </Page>
    </Document>
  );
}

export default ChassisToRcPdfDocument;
