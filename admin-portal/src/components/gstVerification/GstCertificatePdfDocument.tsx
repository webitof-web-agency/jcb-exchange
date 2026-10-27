import React from 'react';
import { Document, Image, Page, StyleSheet, Text, View } from '@react-pdf/renderer';
import { GST_EMBLEM_BASE64 } from '@/assets/gst/emblemBase64';

export interface GstCertificateData {
  gstin: string;
  legalName: string;
  tradeName: string;
  additionalTradeNames?: string;
  constitutionOfBusiness: string;
  address: {
    floorNo: string;
    buildingNo: string;
    premises: string;
    road: string;
    locality: string;
    city: string;
    district: string;
    state: string;
    pinCode: string;
    fullText?: string;
  };
  dateOfLiability: string;
  validityFrom: string;
  validityTo: string;
  typeOfRegistration: string;
  approvalDate: string;
  issueDate: string;
  jurisdiction: string;
  signatureStatus?: string;
  signatureIssuer?: string;
  signatureDate?: string;
  approverName?: string;
  approverDesignation?: string;
  additionalPlacesCount: number;
  additionalPlaces?: Array<{ address: string }>;
  promoters: Array<{
    name: string;
    designation: string;
    state: string;
    photoUrl?: string;
  }>;
}

const NAVY = '#000066';
const BORDER_COLOR = '#000066';

const styles = StyleSheet.create({
  page: {
    position: 'relative',
    padding: 24,
    fontFamily: 'Helvetica',
    fontSize: 9,
    color: NAVY,
    backgroundColor: '#ffffff',
  },
  outerBorder: {
    borderWidth: 1.5,
    borderColor: BORDER_COLOR,
    padding: 10,
    minHeight: '100%',
    position: 'relative',
  },
  watermarkContainer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: -1,
  },
  watermarkText: {
    fontSize: 48,
    fontFamily: 'Helvetica-Bold',
    color: '#d4d4d8',
    opacity: 0.28,
    transform: 'rotate(-45deg)',
    letterSpacing: 2,
    textTransform: 'none',
  },

  // Header
  header: {
    alignItems: 'center',
    marginBottom: 6,
  },
  emblem: {
    width: 44,
    height: 44,
    objectFit: 'contain',
    marginBottom: 3,
  },
  govTitle: {
    fontSize: 11,
    fontFamily: 'Helvetica-Bold',
    color: NAVY,
    textAlign: 'center',
    marginBottom: 2,
  },
  formTitle: {
    fontSize: 10,
    fontFamily: 'Helvetica-Bold',
    color: NAVY,
    textAlign: 'center',
    marginBottom: 1,
  },
  formRule: {
    fontSize: 8.5,
    fontFamily: 'Helvetica',
    color: NAVY,
    textAlign: 'center',
    marginBottom: 2,
  },
  certTitle: {
    fontSize: 11,
    fontFamily: 'Helvetica-Bold',
    color: NAVY,
    textAlign: 'center',
    marginBottom: 4,
  },
  regNumberContainer: {
    width: '100%',
    alignItems: 'flex-start',
    marginBottom: 4,
    marginTop: 2,
    paddingLeft: 1,
  },
  regNumberRow: {
    fontSize: 9.5,
    fontFamily: 'Helvetica-Bold',
    color: NAVY,
    textAlign: 'left',
  },
  regNumberHighlight: {
    fontFamily: 'Helvetica-Bold',
    color: NAVY,
  },

  // Main 9-Row Table
  table: {
    borderWidth: 0.75,
    borderColor: BORDER_COLOR,
    marginBottom: 6,
  },
  tableRow: {
    flexDirection: 'row',
    borderBottomWidth: 0.75,
    borderBottomColor: BORDER_COLOR,
    minHeight: 18,
  },
  tableRowLast: {
    flexDirection: 'row',
    minHeight: 18,
  },
  colNum: {
    width: '6%',
    borderRightWidth: 0.75,
    borderRightColor: BORDER_COLOR,
    padding: 3,
    justifyContent: 'center',
    alignItems: 'center',
  },
  colNumText: {
    fontSize: 8.5,
    fontFamily: 'Helvetica-Bold',
    color: NAVY,
  },
  colLabel: {
    width: '32%',
    borderRightWidth: 0.75,
    borderRightColor: BORDER_COLOR,
    padding: 3.5,
    justifyContent: 'center',
  },
  colLabelText: {
    fontSize: 8.5,
    fontFamily: 'Helvetica-Bold',
    color: NAVY,
  },
  colValue: {
    width: '62%',
    padding: 3.5,
    justifyContent: 'center',
  },
  colValueText: {
    fontSize: 8.5,
    fontFamily: 'Helvetica',
    color: NAVY,
  },
  colValueTextBold: {
    fontSize: 8.5,
    fontFamily: 'Helvetica-Bold',
    color: NAVY,
  },

  // Address subfields
  addressGrid: {
    paddingVertical: 1,
  },
  addressLine: {
    flexDirection: 'row',
    marginBottom: 1.5,
  },
  addressFieldLabel: {
    width: '45%',
    fontSize: 8,
    fontFamily: 'Helvetica-Bold',
    color: NAVY,
  },
  addressFieldValue: {
    width: '55%',
    fontSize: 8,
    fontFamily: 'Helvetica',
    color: NAVY,
  },

  // Validity split columns
  validityCol: {
    width: '31%',
    flexDirection: 'row',
    alignItems: 'center',
  },
  validitySubLabel: {
    fontSize: 8.5,
    fontFamily: 'Helvetica',
    color: NAVY,
    marginRight: 4,
  },
  validitySubValue: {
    fontSize: 8.5,
    fontFamily: 'Helvetica-Bold',
    color: NAVY,
  },

  // Sub-row label for Signature, Name, Designation, Jurisdictional Office, Date of issue
  subRowLabel: {
    width: '38%',
    borderRightWidth: 0.75,
    borderRightColor: BORDER_COLOR,
    padding: 3.5,
    justifyContent: 'center',
  },
  subRowLabelText: {
    fontSize: 8.5,
    fontFamily: 'Helvetica-Bold',
    color: NAVY,
  },

  // Digital Signature Cell (Matching original Gov certificate)
  signatureCell: {
    width: '62%',
    minHeight: 52,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 3,
    position: 'relative',
  },
  sigTextBlock: {
    zIndex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sigLineBlack: {
    fontSize: 7.5,
    fontFamily: 'Helvetica',
    color: '#000000',
    textAlign: 'center',
    lineHeight: 1.25,
  },

  // Note row inside table
  tableNoteRow: {
    padding: 4.5,
    minHeight: 26,
    justifyContent: 'center',
  },
  tableNoteText: {
    fontSize: 8,
    fontFamily: 'Helvetica',
    color: NAVY,
    textAlign: 'left',
  },

  // Bottom system generated line outside the table
  bottomApprovalBox: {
    marginTop: 6,
    paddingLeft: 1,
  },
  bottomApprovalText: {
    fontSize: 8,
    fontFamily: 'Helvetica-Bold',
    color: NAVY,
    lineHeight: 1.3,
  },

  // Annexure pages (Borderless)
  annexurePage: {
    position: 'relative',
    paddingTop: 36,
    paddingHorizontal: 36,
    paddingBottom: 28,
    fontFamily: 'Helvetica',
    fontSize: 9,
    color: NAVY,
    backgroundColor: '#ffffff',
  },
  annexureTopHeader: {
    position: 'relative',
    width: '100%',
    alignItems: 'center',
    marginBottom: 20,
  },
  annexureTagAbsolute: {
    position: 'absolute',
    right: 0,
    top: 0,
    fontSize: 10.5,
    fontFamily: 'Helvetica-Bold',
    color: NAVY,
  },
  annexureEmblem: {
    width: 48,
    height: 48,
    objectFit: 'contain',
  },
  annexureGstinRow: {
    fontSize: 9.5,
    fontFamily: 'Helvetica-Bold',
    color: NAVY,
    marginBottom: 16,
  },
  annexureSectionHeading: {
    fontSize: 9.5,
    fontFamily: 'Helvetica-Bold',
    color: NAVY,
    marginBottom: 16,
  },
  annexureSectionHeadingB: {
    fontSize: 9.5,
    fontFamily: 'Helvetica-Bold',
    color: NAVY,
    marginTop: 14,
    marginBottom: 18,
  },
  annexureFieldRow: {
    flexDirection: 'row',
    marginBottom: 9,
  },
  annexureFieldLabel: {
    width: 170,
    fontSize: 9.5,
    fontFamily: 'Helvetica-Bold',
    color: NAVY,
  },
  annexureFieldValue: {
    flex: 1,
    fontSize: 9.5,
    fontFamily: 'Helvetica-Bold',
    color: NAVY,
  },
  annexureTotalPlaces: {
    fontSize: 9.5,
    fontFamily: 'Helvetica-Bold',
    color: NAVY,
    marginTop: 20,
  },

  // Annexure B Promoters (Borderless)
  promoterRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 22,
  },
  promoterIndex: {
    width: 32,
    fontSize: 9.5,
    fontFamily: 'Helvetica-Bold',
    color: NAVY,
    paddingTop: 2,
  },
  promoterPhotoBox: {
    width: 54,
    height: 68,
    borderWidth: 0.5,
    borderColor: '#333333',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 28,
    backgroundColor: '#ffffff',
    overflow: 'hidden',
  },
  promoterPhotoImage: {
    width: '100%',
    height: '100%',
    objectFit: 'cover',
  },
  promoterDetailsCol: {
    flex: 1,
    paddingTop: 1,
  },
  promoterInfoRow: {
    flexDirection: 'row',
    marginBottom: 8,
  },
  promoterInfoLabel: {
    width: 145,
    fontSize: 9.5,
    fontFamily: 'Helvetica-Bold',
    color: NAVY,
  },
  promoterInfoValue: {
    flex: 1,
    fontSize: 9.5,
    fontFamily: 'Helvetica-Bold',
    color: NAVY,
  },
});

function Watermark() {
  return (
    <View style={styles.watermarkContainer}>
      <Text style={styles.watermarkText}>Goods and Services Tax</Text>
    </View>
  );
}

export function GstCertificatePdfDocument({ data }: { data: GstCertificateData }) {
  const gstin = data.gstin || '';
  const approvalDate = data.approvalDate || data.validityFrom || data.issueDate || '';
  const issueDate = data.issueDate || approvalDate;
  return (
    <Document title={`GST Registration Certificate - ${gstin}`} author="Goods and Services Tax Network">
      {/* ═══════════════════════════════════════════════════
          PAGE 1: FORM GST REG-06
      ═══════════════════════════════════════════════════ */}
      <Page size="A4" style={styles.page}>
        <Watermark />
        <View style={styles.outerBorder}>
          {/* Header */}
          <View style={styles.header}>
            {/* eslint-disable-next-line jsx-a11y/alt-text */}
            <Image src={GST_EMBLEM_BASE64} style={styles.emblem} />
            <Text style={styles.govTitle}>Government of India</Text>
            <Text style={styles.formTitle}>Form GST REG-06</Text>
            <Text style={styles.formRule}>[See Rule 10(1)]</Text>
            <Text style={styles.certTitle}>Registration Certificate</Text>
          </View>

          {/* Registration Number - Left-aligned above the table */}
          <View style={styles.regNumberContainer}>
            <Text style={styles.regNumberRow}>
              Registration Number : <Text style={styles.regNumberHighlight}>{gstin}</Text>
            </Text>
          </View>

          {/* 9-Row Table */}
          <View style={styles.table}>
            {/* Row 1: Legal Name */}
            <View style={styles.tableRow}>
              <View style={styles.colNum}><Text style={styles.colNumText}>1.</Text></View>
              <View style={styles.colLabel}><Text style={styles.colLabelText}>Legal Name</Text></View>
              <View style={styles.colValue}><Text style={styles.colValueTextBold}>{data.legalName || '-'}</Text></View>
            </View>

            {/* Row 2: Trade Name */}
            <View style={styles.tableRow}>
              <View style={styles.colNum}><Text style={styles.colNumText}>2.</Text></View>
              <View style={styles.colLabel}><Text style={styles.colLabelText}>Trade Name, if any</Text></View>
              <View style={styles.colValue}><Text style={styles.colValueTextBold}>{data.tradeName || '-'}</Text></View>
            </View>

            {/* Row 3: Additional trade names */}
            <View style={styles.tableRow}>
              <View style={styles.colNum}><Text style={styles.colNumText}>3.</Text></View>
              <View style={styles.colLabel}><Text style={styles.colLabelText}>Additional trade names, if any</Text></View>
              <View style={styles.colValue}><Text style={styles.colValueText}>{data.additionalTradeNames || '-'}</Text></View>
            </View>

            {/* Row 4: Constitution of Business */}
            <View style={styles.tableRow}>
              <View style={styles.colNum}><Text style={styles.colNumText}>4.</Text></View>
              <View style={styles.colLabel}><Text style={styles.colLabelText}>Constitution of Business</Text></View>
              <View style={styles.colValue}><Text style={styles.colValueText}>{data.constitutionOfBusiness || '-'}</Text></View>
            </View>

            {/* Row 5: Address of Principal Place of Business */}
            <View style={styles.tableRow}>
              <View style={styles.colNum}><Text style={styles.colNumText}>5.</Text></View>
              <View style={styles.colLabel}>
                <Text style={styles.colLabelText}>Address of Principal Place of Business</Text>
              </View>
              <View style={styles.colValue}>
                <View style={styles.addressGrid}>
                  <View style={styles.addressLine}>
                    <Text style={styles.addressFieldLabel}>Floor No.:</Text>
                    <Text style={styles.addressFieldValue}>{data.address.floorNo || '-'}</Text>
                  </View>
                  <View style={styles.addressLine}>
                    <Text style={styles.addressFieldLabel}>Building No./Flat No.:</Text>
                    <Text style={styles.addressFieldValue}>{data.address.buildingNo || '-'}</Text>
                  </View>
                  <View style={styles.addressLine}>
                    <Text style={styles.addressFieldLabel}>Name Of Premises/Building:</Text>
                    <Text style={styles.addressFieldValue}>{data.address.premises || '-'}</Text>
                  </View>
                  <View style={styles.addressLine}>
                    <Text style={styles.addressFieldLabel}>Road/Street:</Text>
                    <Text style={styles.addressFieldValue}>{data.address.road || '-'}</Text>
                  </View>
                  <View style={styles.addressLine}>
                    <Text style={styles.addressFieldLabel}>Locality/Sub Locality:</Text>
                    <Text style={styles.addressFieldValue}>{data.address.locality || '-'}</Text>
                  </View>
                  <View style={styles.addressLine}>
                    <Text style={styles.addressFieldLabel}>City/Town/Village:</Text>
                    <Text style={styles.addressFieldValue}>{data.address.city || '-'}</Text>
                  </View>
                  <View style={styles.addressLine}>
                    <Text style={styles.addressFieldLabel}>District:</Text>
                    <Text style={styles.addressFieldValue}>{data.address.district || '-'}</Text>
                  </View>
                  <View style={styles.addressLine}>
                    <Text style={styles.addressFieldLabel}>State:</Text>
                    <Text style={styles.addressFieldValue}>{data.address.state || '-'}</Text>
                  </View>
                  <View style={styles.addressLine}>
                    <Text style={styles.addressFieldLabel}>PIN Code:</Text>
                    <Text style={styles.addressFieldValue}>{data.address.pinCode || '-'}</Text>
                  </View>
                </View>
              </View>
            </View>

            {/* Row 6: Date of Liability */}
            <View style={styles.tableRow}>
              <View style={styles.colNum}><Text style={styles.colNumText}>6.</Text></View>
              <View style={styles.colLabel}><Text style={styles.colLabelText}>Date of Liability</Text></View>
              <View style={styles.colValue}><Text style={styles.colValueText}>{data.dateOfLiability || '-'}</Text></View>
            </View>

            {/* Row 7: Period of Validity */}
            <View style={styles.tableRow}>
              <View style={styles.colNum}><Text style={styles.colNumText}>7.</Text></View>
              <View style={styles.colLabel}><Text style={styles.colLabelText}>Period of Validity</Text></View>
              <View style={[styles.colValue, { flexDirection: 'row', alignItems: 'center' }]}>
                <View style={styles.validityCol}>
                  <Text style={styles.validitySubLabel}>From</Text>
                  <Text style={styles.validitySubValue}>{data.validityFrom || approvalDate}</Text>
                </View>
                <View style={styles.validityCol}>
                  <Text style={styles.validitySubLabel}>To</Text>
                  <Text style={styles.validitySubValue}>{data.validityTo || '-'}</Text>
                </View>
              </View>
            </View>

            {/* Row 8: Type of Registration */}
            <View style={styles.tableRow}>
              <View style={styles.colNum}><Text style={styles.colNumText}>8.</Text></View>
              <View style={styles.colLabel}><Text style={styles.colLabelText}>Type of Registration</Text></View>
              <View style={styles.colValue}><Text style={styles.colValueText}>{data.typeOfRegistration || '-'}</Text></View>
            </View>

            {/* Row 9: Particulars of Approving */}
            <View style={styles.tableRow}>
              <View style={styles.colNum}><Text style={styles.colNumText}>9.</Text></View>
              <View style={styles.colLabel}><Text style={styles.colLabelText}>Particulars of Approving</Text></View>
              <View style={styles.colValue}><Text style={styles.colValueText}></Text></View>
            </View>

            {/* Signature Row */}
            <View style={styles.tableRow}>
              <View style={styles.subRowLabel}><Text style={styles.subRowLabelText}>Signature</Text></View>
              <View style={styles.signatureCell}>
                <View style={styles.sigTextBlock}>
                  <Text style={styles.sigLineBlack}>{data.signatureStatus || '-'}</Text>
                  <Text style={styles.sigLineBlack}>{data.signatureIssuer || '-'}</Text>
                  <Text style={styles.sigLineBlack}>{data.signatureDate || '-'}</Text>
                </View>
              </View>
            </View>

            {/* Name Row */}
            <View style={styles.tableRow}>
              <View style={styles.subRowLabel}><Text style={styles.subRowLabelText}>Name</Text></View>
              <View style={styles.colValue}><Text style={styles.colValueText}>{data.approverName || '-'}</Text></View>
            </View>

            {/* Designation Row */}
            <View style={styles.tableRow}>
              <View style={styles.subRowLabel}><Text style={styles.subRowLabelText}>Designation</Text></View>
              <View style={styles.colValue}><Text style={styles.colValueText}>{data.approverDesignation || '-'}</Text></View>
            </View>

            {/* Jurisdictional Office Row */}
            <View style={styles.tableRow}>
              <View style={styles.subRowLabel}><Text style={styles.subRowLabelText}>Jurisdictional Office</Text></View>
              <View style={styles.colValue}><Text style={styles.colValueText}>{data.jurisdiction || ''}</Text></View>
            </View>

            {/* Date of issue of Certificate Row */}
            <View style={styles.tableRow}>
              <View style={styles.subRowLabel}><Text style={styles.subRowLabelText}>Date of issue of Certificate</Text></View>
              <View style={styles.colValue}><Text style={styles.colValueTextBold}>{issueDate}</Text></View>
            </View>

            {/* Note row inside table */}
            <View style={styles.tableNoteRow}>
              <Text style={styles.tableNoteText}>
                Note: The registration certificate is required to be prominently displayed at all places of business in the State.
              </Text>
            </View>
          </View>

          {/* Bottom system generated approval note outside the table */}
          <View style={styles.bottomApprovalBox}>
            <Text style={styles.bottomApprovalText}>
              This is a system generated digitally signed Registration Certificate, issued based on electronic approval of application on
            </Text>
            <Text style={styles.bottomApprovalText}>
              {approvalDate}.
            </Text>
          </View>
        </View>
      </Page>

      {/* ═══════════════════════════════════════════════════
          PAGE 2: ANNEXURE A (Borderless)
      ═══════════════════════════════════════════════════ */}
      <Page size="A4" style={styles.annexurePage}>
        <Watermark />
        {/* Top Row with Centered Emblem and Right-Aligned Annexure A */}
        <View style={styles.annexureTopHeader}>
          <Text style={styles.annexureTagAbsolute}>Annexure A</Text>
          {/* eslint-disable-next-line jsx-a11y/alt-text */}
          <Image src={GST_EMBLEM_BASE64} style={styles.annexureEmblem} />
        </View>

        {/* GSTIN */}
        <Text style={styles.annexureGstinRow}>
          Goods and Services Tax Identification Number: {gstin}
        </Text>

        {/* Section Heading */}
        <Text style={styles.annexureSectionHeading}>
          Details of Additional Place of Business(s)
        </Text>

        {/* Legal Name & Trade Name without borders */}
        <View style={styles.annexureFieldRow}>
          <Text style={styles.annexureFieldLabel}>Legal Name</Text>
          <Text style={styles.annexureFieldValue}>{data.legalName || '-'}</Text>
        </View>
        <View style={styles.annexureFieldRow}>
          <Text style={styles.annexureFieldLabel}>Trade Name, if any</Text>
          <Text style={styles.annexureFieldValue}>{data.tradeName || '-'}</Text>
        </View>

        {/* Total Additional Places */}
        <Text style={styles.annexureTotalPlaces}>
          Total Number of Additional Places of Business in the State              {data.additionalPlacesCount || 0}
        </Text>

        {data.additionalPlaces && data.additionalPlaces.length > 0 ? (
          <View style={{ marginTop: 14 }}>
            {data.additionalPlaces.map((place, index) => (
              <View key={index} style={{ flexDirection: 'row', marginBottom: 8, paddingLeft: 2 }}>
                <Text style={{ width: '6%', fontSize: 9.5, fontFamily: 'Helvetica-Bold', color: NAVY }}>{index + 1}.</Text>
                <Text style={{ width: '94%', fontSize: 9.5, fontFamily: 'Helvetica-Bold', color: NAVY }}>{place.address}</Text>
              </View>
            ))}
          </View>
        ) : null}
      </Page>

      {/* ═══════════════════════════════════════════════════
          PAGE 3: ANNEXURE B (Borderless)
      ═══════════════════════════════════════════════════ */}
      <Page size="A4" style={styles.annexurePage}>
        <Watermark />
        {/* Top Row with Centered Emblem and Right-Aligned Annexure B */}
        <View style={styles.annexureTopHeader}>
          <Text style={styles.annexureTagAbsolute}>Annexure B</Text>
          {/* eslint-disable-next-line jsx-a11y/alt-text */}
          <Image src={GST_EMBLEM_BASE64} style={styles.annexureEmblem} />
        </View>

        {/* GSTIN */}
        <Text style={styles.annexureGstinRow}>
          Goods and Services Tax Identification Number: {gstin}
        </Text>

        {/* Legal Name & Trade Name without borders (placed BEFORE Details of Person in Charge as in screenshot) */}
        <View style={styles.annexureFieldRow}>
          <Text style={styles.annexureFieldLabel}>Legal Name</Text>
          <Text style={styles.annexureFieldValue}>{data.legalName || '-'}</Text>
        </View>
        <View style={styles.annexureFieldRow}>
          <Text style={styles.annexureFieldLabel}>Trade Name, if any</Text>
          <Text style={styles.annexureFieldValue}>{data.tradeName || '-'}</Text>
        </View>

        {/* Section Heading */}
        <Text style={styles.annexureSectionHeadingB}>
          Details of  Person in Charge
        </Text>

        {/* Person in charge list without box borders - 100% Dynamic from API data */}
        {data.promoters && data.promoters.length > 0 ? (
          data.promoters.map((promoter, index) => (
            <View key={index} style={styles.promoterRow} wrap={false}>
              <Text style={styles.promoterIndex}>{index + 1}</Text>
              <View style={styles.promoterPhotoBox}>
                {promoter.photoUrl ? (
                  // eslint-disable-next-line jsx-a11y/alt-text
                  <Image src={promoter.photoUrl} style={styles.promoterPhotoImage} />
                ) : null}
              </View>
              <View style={styles.promoterDetailsCol}>
                <View style={styles.promoterInfoRow}>
                  <Text style={styles.promoterInfoLabel}>Name</Text>
                  <Text style={styles.promoterInfoValue}>{promoter.name}</Text>
                </View>
                <View style={styles.promoterInfoRow}>
                  <Text style={styles.promoterInfoLabel}>Designation/Status</Text>
                  <Text style={styles.promoterInfoValue}>{promoter.designation || '-'}</Text>
                </View>
                <View style={styles.promoterInfoRow}>
                  <Text style={styles.promoterInfoLabel}>Resident of State</Text>
                  <Text style={styles.promoterInfoValue}>{promoter.state || '-'}</Text>
                </View>
              </View>
            </View>
          ))
        ) : null}
      </Page>
    </Document>
  );
}
