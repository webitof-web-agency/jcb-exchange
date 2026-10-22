import { Document, Image, Page, StyleSheet, Text, View } from '@react-pdf/renderer';
import { getGstVerificationTemplateFields } from '@/lib/gstVerificationPreview';
import type { KycVerificationPreview } from './SellAccountDocumentWidgets';

const isObject = (value: unknown): value is Record<string, unknown> => Boolean(value && typeof value === 'object' && !Array.isArray(value));

const label = (value: string) => value
  .replace(/([a-z])([A-Z])/g, '$1 $2')
  .replace(/[_-]+/g, ' ')
  .replace(/\b\w/g, (character) => character.toUpperCase());

const valueText = (value: unknown): string => {
  if (value === null || value === undefined || value === '') return '-';
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  if (Array.isArray(value)) {
    if (value.every((item) => item === null || ['string', 'number', 'boolean'].includes(typeof item))) {
      return value.map(valueText).join(', ');
    }
    return JSON.stringify(value);
  }
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
};

const flatten = (value: Record<string, unknown>, prefix = ''): Array<[string, unknown]> => Object.entries(value).flatMap(([key, entryValue]) => {
  const nextLabel = prefix ? `${prefix} / ${label(key)}` : label(key);
  return isObject(entryValue) ? flatten(entryValue, nextLabel) : [[nextLabel, entryValue]];
});

const normalizeKey = (value: string) => value.replace(/[^a-z0-9]/gi, '').toLowerCase();

const findValue = (value: unknown, keys: string[]): unknown => {
  if (!isObject(value)) return undefined;
  const wanted = new Set(keys.map(normalizeKey));
  for (const [key, entryValue] of Object.entries(value)) {
    if (wanted.has(normalizeKey(key)) && entryValue !== null && entryValue !== undefined && entryValue !== '') return entryValue;
  }
  for (const entryValue of Object.values(value)) {
    const nested = findValue(entryValue, keys);
    if (nested !== undefined) return nested;
  }
  return undefined;
};

const panValue = (value: unknown) => valueText(value);

const styles = StyleSheet.create({
  page: { padding: 34, fontFamily: 'Helvetica', color: '#172033', fontSize: 9 },
  eyebrow: { color: '#6842d9', fontSize: 8, fontWeight: 700, letterSpacing: 1.6, textTransform: 'uppercase' },
  title: { marginTop: 7, color: '#101827', fontSize: 20, fontWeight: 700 },
  subtitle: { marginTop: 5, color: '#667085', fontSize: 9 },
  summary: { display: 'flex', flexDirection: 'row', gap: 7, marginTop: 20, marginBottom: 16 },
  summaryCard: { flex: 1, padding: 9, border: '1 solid #e1e6ef', borderRadius: 7, backgroundColor: '#f8fafc' },
  summaryLabel: { color: '#7b8798', fontSize: 7, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.8 },
  summaryValue: { marginTop: 5, color: '#172033', fontSize: 9, fontWeight: 700 },
  section: { marginTop: 12, border: '1 solid #e4e7ec', borderRadius: 8, overflow: 'hidden' },
  sectionTitle: { padding: 9, color: '#312e81', backgroundColor: '#f5f3ff', fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.9 },
  row: { display: 'flex', flexDirection: 'row', borderTop: '1 solid #edf0f5', minHeight: 25 },
  field: { width: '34%', padding: 7, color: '#596579', fontSize: 8, fontWeight: 700 },
  value: { width: '66%', padding: 7, color: '#172033', fontSize: 8.5 },
  footer: { marginTop: 24, paddingTop: 9, borderTop: '1 solid #e1e6ef', color: '#8a94a6', fontSize: 7.5 },
  panPage: { padding: 34, fontFamily: 'Helvetica', color: '#172033', backgroundColor: '#f8fafc' },
  panEyebrow: { color: '#3B61D9', fontSize: 9, fontWeight: 700, letterSpacing: 1.8, textTransform: 'uppercase' },
  panCard: { marginTop: 22, padding: 22, border: '2 solid #c7d2fe', borderRadius: 18, backgroundColor: '#eef2ff' },
  panTop: { display: 'flex', flexDirection: 'row', alignItems: 'center', borderBottom: '1 solid #c7d2fe', paddingBottom: 16 },
  panBadge: { width: 52, height: 52, paddingTop: 17, borderRadius: 10, backgroundColor: '#4F46E5', color: '#ffffff', fontSize: 16, fontWeight: 700, textAlign: 'center' },
  panBrand: { marginLeft: 12, color: '#172033', fontSize: 14, fontWeight: 700, letterSpacing: 1.2 },
  panSubBrand: { marginTop: 4, color: '#64748b', fontSize: 9, letterSpacing: 0.8 },
  panVerified: { marginLeft: 'auto', padding: 7, border: '1 solid #c7d2fe', borderRadius: 12, color: '#3B61D9', backgroundColor: '#eef2ff', fontSize: 8, fontWeight: 700, textTransform: 'uppercase' },
  panLabel: { color: '#3B61D9', fontSize: 8, fontWeight: 700, letterSpacing: 1.1, textTransform: 'uppercase' },
  panNumber: { marginTop: 7, color: '#172033', fontSize: 21, fontWeight: 700, letterSpacing: 2.6 },
  panGrid: { display: 'flex', flexDirection: 'row', flexWrap: 'wrap', marginTop: 22 },
  panField: { width: '50%', marginBottom: 18 },
  panFieldValue: { marginTop: 5, color: '#172033', fontSize: 12 },
  panNotice: { marginTop: 7, paddingTop: 12, borderTop: '1 solid #c7d2fe', color: '#64748b', fontSize: 8.5 },
  panImage: { alignSelf: 'center', width: 490, marginTop: 22 },
  aadhaarImage: { alignSelf: 'center', width: 490, marginTop: 22 },
});

function PanPdfCard({ preview, result }: { preview: KycVerificationPreview; result: Record<string, unknown> }) {
  const fullName = panValue(findValue(result, ['fullName', 'name']));
  const fatherName = panValue(findValue(result, ['fatherName', 'father', 'fathersName']));
  const dateOfBirth = panValue(findValue(result, ['dateOfBirth', 'dob', 'birthDate']));
  const maskedAadhaar = panValue(findValue(result, ['maskedAadhaar', 'maskedAadhar', 'aadhaar', 'aadhar']));

  return (
    <View style={styles.panCard}>
      <View style={styles.panTop}>
        <Text style={styles.panBadge}>IN</Text>
        <View>
          <Text style={styles.panBrand}>PAN VERIFICATION COPY</Text>
          <Text style={styles.panSubBrand}>DIGITAL IDENTITY PREVIEW</Text>
        </View>
        <Text style={styles.panVerified}>Verified</Text>
      </View>
      <View style={{ marginTop: 22 }}>
        <Text style={styles.panLabel}>Permanent account number</Text>
        <Text style={styles.panNumber}>{preview.number}</Text>
      </View>
      <View style={styles.panGrid}>
        <View style={styles.panField}><Text style={styles.panLabel}>Full name</Text><Text style={styles.panFieldValue}>{fullName}</Text></View>
        <View style={styles.panField}><Text style={styles.panLabel}>Father&apos;s name</Text><Text style={styles.panFieldValue}>{fatherName}</Text></View>
        <View style={styles.panField}><Text style={styles.panLabel}>Date of birth</Text><Text style={styles.panFieldValue}>{dateOfBirth}</Text></View>
        <View style={styles.panField}><Text style={styles.panLabel}>Masked Aadhaar</Text><Text style={styles.panFieldValue}>{maskedAadhaar}</Text></View>
      </View>
      <Text style={styles.panNotice}>Generated from verified API data · Not an official government-issued card</Text>
    </View>
  );
}

function TableSection({ title, entries }: { title: string; entries: Array<[string, unknown]> }) {
  if (!entries.length) return null;
  return (
    <View style={styles.section} wrap>
      <Text style={styles.sectionTitle}>{title}</Text>
      {entries.map(([field, value]) => (
        <View key={field} style={styles.row} wrap={false}>
          <Text style={styles.field}>{field}</Text>
          <Text style={styles.value}>{valueText(value)}</Text>
        </View>
      ))}
    </View>
  );
}

export function KycVerificationPreviewPdf({ preview, panCardImage, aadhaarCardImage }: { preview: KycVerificationPreview; panCardImage?: string; aadhaarCardImage?: string }) {
  const record = isObject(preview.response.record) ? preview.response.record : {};
  const result = isObject(preview.response.result) ? preview.response.result : {};
  const summary = Object.entries(result).filter(([, value]) => !isObject(value));
  const groups = Object.entries(result).filter(([, value]) => isObject(value));
  const source = preview.response.cacheHit === true ? 'Temporary cache' : isObject(preview.response.record) ? 'Saved verification' : 'Live API';

  if (preview.kind === 'pan') {
    return (
      <Document title={`PAN Verification Copy - ${preview.number}`}>
        <Page size="A4" style={styles.panPage}>
          <Text style={styles.panEyebrow}>API verification preview</Text>
          {panCardImage ? (
            // PDF images do not expose HTML alt text; this is the visual PAN card export.
            // eslint-disable-next-line jsx-a11y/alt-text
            <Image src={panCardImage} style={styles.panImage} />
          ) : <PanPdfCard preview={preview} result={result} />}
          <Text style={styles.footer}>This digital copy contains the stored PAN verification response for audit and record-keeping.</Text>
        </Page>
      </Document>
    );
  }

  if (preview.kind === 'aadhaar' && aadhaarCardImage) {
    return (
      <Document title={`Aadhaar Verification Copy - ${preview.number}`}>
        <Page size="A4" style={styles.panPage}>
          <Text style={styles.panEyebrow}>API verification preview</Text>
          {/* PDF images do not expose HTML alt text; this is the visual Aadhaar card export. */}
          {/* eslint-disable-next-line jsx-a11y/alt-text */}
          <Image src={aadhaarCardImage} style={styles.aadhaarImage} />
          <Text style={styles.footer}>This digital copy contains the fetched Aadhaar front and back card previews for audit and record-keeping.</Text>
        </Page>
      </Document>
    );
  }

  if (preview.kind === 'gst') {
    const gstEntries = getGstVerificationTemplateFields(result);

    return (
      <Document title={`GST Verification - ${preview.number}`}>
        <Page size="A4" style={styles.page} wrap>
          <Text style={styles.eyebrow}>API verification report</Text>
          <Text style={styles.title}>GST / {preview.number}</Text>
          <Text style={styles.subtitle}>Generated from verified GST API data. Not an official government-issued GST certificate.</Text>

          <View style={styles.summary}>
            {[
              ['Side', preview.side === 'purchase' ? 'Purchase / Seller' : 'Sale / Customer'],
              ['Status', valueText(record.status)],
              ['Provider', valueText(record.provider)],
              ['Source', source],
            ].map(([key, value]) => (
              <View key={key} style={styles.summaryCard}>
                <Text style={styles.summaryLabel}>{key}</Text>
                <Text style={styles.summaryValue}>{value}</Text>
              </View>
            ))}
          </View>

          <TableSection title="Provider Data" entries={gstEntries} />
          {!gstEntries.length ? <TableSection title="Fetched data" entries={[["Response", result]]} /> : null}
          <Text style={styles.footer}>This report contains verified GST API data for internal audit and record-keeping. It is not an official government-issued GST certificate.</Text>
        </Page>
      </Document>
    );
  }

  return (
    <Document title={`${preview.kind.toUpperCase()} Verification - ${preview.number}`}>
      <Page size="A4" style={styles.page} wrap>
        <Text style={styles.eyebrow}>API verification report</Text>
        <Text style={styles.title}>{preview.kind.toUpperCase()} / {preview.number}</Text>
        <Text style={styles.subtitle}>Verified identity details received from the connected provider.</Text>

        <View style={styles.summary}>
          {[
            ['Side', preview.side === 'purchase' ? 'Purchase / Seller' : 'Sale / Customer'],
            ['Status', valueText(record.status)],
            ['Provider', valueText(record.provider)],
            ['Source', source],
          ].map(([key, value]) => (
            <View key={key} style={styles.summaryCard}>
              <Text style={styles.summaryLabel}>{key}</Text>
              <Text style={styles.summaryValue}>{value}</Text>
            </View>
          ))}
        </View>

        <TableSection title="Summary" entries={summary} />
        {groups.map(([key, value]) => <TableSection key={key} title={label(key)} entries={flatten(value as Record<string, unknown>)} />)}
        {!Object.keys(result).length ? <TableSection title="Fetched data" entries={[["Response", preview.response]]} /> : null}

        <Text style={styles.footer}>This report contains the stored verification response for audit and record-keeping.</Text>
      </Page>
    </Document>
  );
}
