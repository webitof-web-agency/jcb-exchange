import React from 'react';
import { Document, Image, Page, StyleSheet, Text, View } from '@react-pdf/renderer';
import { buildOfferLetterTerms, formatOfferDate, type OfferLetterFormData } from '@/lib/offerLetter';

const styles = StyleSheet.create({
  page: { paddingTop: 40, paddingBottom: 42, paddingHorizontal: 48, fontFamily: 'Helvetica', fontSize: 10, lineHeight: 1.45, color: '#111827' },

  // Header / Logo area
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18, paddingBottom: 14, borderBottomWidth: 1.5, borderBottomColor: '#e5e7eb' },
  logoImage: { height: 36, objectFit: 'contain', objectPositionX: 0 },
  headerRight: { textAlign: 'right', fontSize: 8, color: '#6b7280' },
  headerCompanyName: { fontSize: 9, fontFamily: 'Helvetica-Bold', color: '#111827', marginBottom: 2 },

  title: { textAlign: 'center', fontSize: 16, fontFamily: 'Helvetica-Bold', letterSpacing: 1.2, marginBottom: 16 },
  metaRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 16, fontSize: 9 },
  paragraph: { marginBottom: 9 },
  subject: { fontFamily: 'Helvetica-Bold', marginTop: 7, marginBottom: 9 },
  salutation: { marginBottom: 9 },
  table: { borderWidth: 1, borderColor: '#374151', marginTop: 4, marginBottom: 16 },
  tableRow: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: '#374151' },
  tableRowLast: { flexDirection: 'row' },
  tableCellLabel: { width: '38%', padding: 6, borderRightWidth: 1, borderRightColor: '#374151', fontFamily: 'Helvetica-Bold' },
  tableCellValue: { width: '62%', padding: 6 },
  sectionHeading: { fontFamily: 'Helvetica-Bold', fontSize: 12, marginTop: 6, marginBottom: 8 },
  term: { marginBottom: 7, textAlign: 'justify' },
  signatureGrid: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 22, marginBottom: 24 },
  signatureBox: { width: '46%' },
  signatureLine: { borderBottomWidth: 1, borderBottomColor: '#4b5563', height: 22, marginBottom: 5 },
  acceptanceHeading: { fontFamily: 'Helvetica-Bold', fontSize: 12, marginTop: 8, marginBottom: 9 },
});

const TableRow = ({ label, value, last = false }: { label: string; value: string; last?: boolean }) => (
  <View style={last ? styles.tableRowLast : styles.tableRow}>
    <Text style={styles.tableCellLabel}>{label}</Text>
    <Text style={styles.tableCellValue}>{value || '-'}</Text>
  </View>
);

export default function OfferLetterPdfDocument({
  data,
  logoUrl,
}: {
  data: OfferLetterFormData;
  logoUrl?: string | null;
}) {
  const terms = buildOfferLetterTerms(data);
  const salary = data.salaryAmount ? `INR ${data.salaryAmount} per ${data.salaryPeriod || 'annum'}` : '-';

  return (
    <Document title={`Offer Letter - ${data.employeeName || 'Candidate'}`} author={data.companyName || 'JCB Exchange'}>
      <Page size="A4" style={styles.page}>

        {/* ── Header with Logo ── */}
        <View style={styles.header}>
          {/* Left: Company Logo or fallback name */}
          {logoUrl ? (
            // eslint-disable-next-line jsx-a11y/alt-text
            <Image src={logoUrl} style={styles.logoImage} />
          ) : (
            <View>
              <Text style={{ fontSize: 14, fontFamily: 'Helvetica-Bold', color: '#111827' }}>
                {data.companyName || 'JCB Exchange'}
              </Text>
            </View>
          )}

          {/* Right: Company name & address (if logo present show company name here) */}
          <View style={styles.headerRight}>
            {logoUrl && (
              <Text style={styles.headerCompanyName}>{data.companyName || 'JCB Exchange'}</Text>
            )}
            {data.companyAddress ? (
              <Text>{data.companyAddress}</Text>
            ) : null}
          </View>
        </View>

        {/* ── Document Title ── */}
        <Text style={styles.title}>OFFER OF EMPLOYMENT</Text>
        <View style={styles.metaRow}>
          <Text>Date: {formatOfferDate(data.letterDate) || 'DD/MM/YYYY'}</Text>
          <Text>Offer Letter No.: {data.offerLetterNo || '[ ]'}</Text>
        </View>

        <Text style={styles.paragraph}>To,</Text>
        <Text style={styles.paragraph}>Mr./Ms. {data.employeeName || '[EMPLOYEE NAME]'}</Text>
        {data.employeeAddress && <Text style={styles.paragraph}>{data.employeeAddress}</Text>}
        <Text style={styles.subject}>Subject: Offer of Employment</Text>
        <Text style={styles.salutation}>Dear {data.employeeName || '[Employee Name]'},</Text>
        {data.companyAddress && <Text style={styles.paragraph}>Company address: {data.companyAddress}</Text>}
        <Text style={styles.paragraph}>
          We are pleased to offer you employment with {data.companyName || '[Company Name]'} for the position of {data.designation || '[Designation/Post]'}, on the terms and conditions set out below.
        </Text>

        <View style={styles.table}>
          <TableRow label="Employee Name" value={data.employeeName} />
          <TableRow label="Designation" value={data.designation} />
          <TableRow label="Department" value={data.department} />
          <TableRow label="Place of Posting" value={data.placeOfPosting} />
          <TableRow label="Salary / CTC" value={salary} />
          <TableRow label="Date of Joining" value={formatOfferDate(data.joiningDate)} />
          <TableRow label="Probation Period" value={`${data.probationPeriod || '[ ]'} Months`} last />
        </View>

        <Text style={styles.sectionHeading}>Terms &amp; Conditions</Text>
        {terms.map((term, index) => <Text key={`${term}-${index}`} style={styles.term}>{term}</Text>)}

        <View style={styles.signatureGrid}>
          <View style={styles.signatureBox}>
            <Text style={{ fontFamily: 'Helvetica-Bold', marginBottom: 8 }}>For {data.companyName || '[COMPANY NAME]'}</Text>
            <View style={styles.signatureLine} />
            <Text>Authorized Signatory</Text>
            <Text>Name: {data.signatoryName || '__________________________'}</Text>
            <Text>Designation: {data.signatoryDesignation || '___________________'}</Text>
            <Text>Date: {formatOfferDate(data.signatoryDate) || '__________________________'}</Text>
            <Text>Place: {data.signatoryPlace || '__________________________'}</Text>
          </View>
        </View>

        <Text style={styles.acceptanceHeading}>ACCEPTANCE OF OFFER</Text>
        <Text style={styles.paragraph}>
          I, {data.employeeName || '[Employee Name]'}, hereby accept the offer of employment made by {data.companyName || '[Company Name]'} and agree to abide by the terms and conditions contained in this Offer Letter and the applicable policies of the Company.
        </Text>
        <Text>Employee Name: {data.employeeName || '__________________________'}</Text>
        <Text>Signature: _______________________________</Text>
        <Text>Date: {formatOfferDate(data.acceptanceDate) || '____________________________________'}</Text>
        <Text>Place: {data.acceptancePlace || '____________________________________'}</Text>
      </Page>
    </Document>
  );
}


