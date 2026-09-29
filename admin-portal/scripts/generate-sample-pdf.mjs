import fs from 'fs';
import path from 'path';
import React from 'react';
import ReactPDF, { Document, Page, Text, View, Image, StyleSheet } from '@react-pdf/renderer';

const styles = StyleSheet.create({
  page: { paddingTop: 40, paddingBottom: 40, paddingHorizontal: 45, fontFamily: 'Helvetica', fontSize: 10, lineHeight: 1.5, color: '#111827' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20, paddingBottom: 12, borderBottomWidth: 1.5, borderBottomColor: '#fbbf24' },
  logoImage: { height: 42, width: 140, objectFit: 'contain' },
  headerRight: { textAlign: 'right', fontSize: 8, color: '#4b5563' },
  companyTitle: { fontSize: 12, fontFamily: 'Helvetica-Bold', color: '#111827', marginBottom: 2 },
  docTitle: { textAlign: 'center', fontSize: 16, fontFamily: 'Helvetica-Bold', letterSpacing: 1.5, color: '#1f2937', marginBottom: 18, textTransform: 'uppercase' },
  metaRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 15, fontSize: 9, color: '#374151' },
  salutation: { fontSize: 11, fontFamily: 'Helvetica-Bold', marginBottom: 10 },
  paragraph: { marginBottom: 10, textAlign: 'justify', color: '#374151' },
  table: { borderWidth: 1, borderColor: '#d1d5db', borderRadius: 4, marginTop: 10, marginBottom: 15 },
  tableRow: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: '#e5e7eb' },
  tableRowLast: { flexDirection: 'row' },
  tableCellLabel: { width: '38%', padding: 7, backgroundColor: '#f9fafb', fontFamily: 'Helvetica-Bold', color: '#1f2937', borderRightWidth: 1, borderRightColor: '#e5e7eb' },
  tableCellValue: { width: '62%', padding: 7, color: '#111827' },
  termsHeading: { fontSize: 11, fontFamily: 'Helvetica-Bold', color: '#111827', marginTop: 12, marginBottom: 8 },
  termItem: { marginBottom: 6, fontSize: 9, color: '#4b5563', textAlign: 'justify' },
  signatureGrid: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 35 },
  signatureBox: { width: '45%' },
  signatureLine: { borderBottomWidth: 1, borderBottomColor: '#9ca3af', height: 24, marginBottom: 6 },
  signatureLabel: { fontSize: 9, fontFamily: 'Helvetica-Bold', color: '#374151' },
  footerNote: { marginTop: 30, textAlign: 'center', fontSize: 8, color: '#9ca3af' }
});

function SampleOfferDocument() {
  const logoPath = path.resolve('public/mainlogo.png');
  return (
    React.createElement(Document, { title: 'Offer Letter - Rahul Sharma', author: 'JCB Exchange' },
      React.createElement(Page, { size: 'A4', style: styles.page },
        
        // Header
        React.createElement(View, { style: styles.header },
          fs.existsSync(logoPath) 
            ? React.createElement(Image, { src: logoPath, style: styles.logoImage })
            : React.createElement(Text, { style: { fontSize: 16, fontFamily: 'Helvetica-Bold', color: '#d97706' } }, 'JCB EXCHANGE'),
          React.createElement(View, { style: styles.headerRight },
            React.createElement(Text, { style: styles.companyTitle }, 'JCB EXCHANGE PRIVATE LIMITED'),
            React.createElement(Text, null, 'Official Employment Offer Document'),
            React.createElement(Text, null, 'Web: www.jcbexchange.com | Support: hr@jcbexchange.com')
          )
        ),

        // Document Title
        React.createElement(Text, { style: styles.docTitle }, 'LETTER OF OFFER'),

        // Meta Row
        React.createElement(View, { style: styles.metaRow },
          React.createElement(Text, null, 'Ref No: JCB-OFFER-2026-089'),
          React.createElement(Text, null, 'Date: September 29, 2026')
        ),

        // Salutation
        React.createElement(Text, { style: styles.salutation }, 'Dear Rahul Sharma,'),

        // Intro
        React.createElement(Text, { style: styles.paragraph },
          'We are delighted to offer you employment with JCB Exchange Private Limited for the position of Senior Equipment Operator. Based on your experience and interview assessment, we believe your skills will be a valuable addition to our team.'
        ),

        // Offer Terms Table
        React.createElement(View, { style: styles.table },
          React.createElement(View, { style: styles.tableRow },
            React.createElement(Text, { style: styles.tableCellLabel }, 'Candidate Name'),
            React.createElement(Text, { style: styles.tableCellValue }, 'Rahul Sharma')
          ),
          React.createElement(View, { style: styles.tableRow },
            React.createElement(Text, { style: styles.tableCellLabel }, 'Designation'),
            React.createElement(Text, { style: styles.tableCellValue }, 'Senior Equipment Operator')
          ),
          React.createElement(View, { style: styles.tableRow },
            React.createElement(Text, { style: styles.tableCellLabel }, 'Date of Joining'),
            React.createElement(Text, { style: styles.tableCellValue }, 'October 15, 2026')
          ),
          React.createElement(View, { style: styles.tableRow },
            React.createElement(Text, { style: styles.tableCellLabel }, 'Work Location'),
            React.createElement(Text, { style: styles.tableCellValue }, 'Patna Regional Operations Office')
          ),
          React.createElement(View, { style: styles.tableRowLast },
            React.createElement(Text, { style: styles.tableCellLabel }, 'Remuneration (CTC)'),
            React.createElement(Text, { style: styles.tableCellValue }, 'INR 4,50,000 per annum')
          )
        ),

        // Terms Section
        React.createElement(Text, { style: styles.termsHeading }, 'Terms & Conditions of Employment'),
        React.createElement(Text, { style: styles.termItem }, '1. Your employment will be governed by the rules, regulations, and policies of JCB Exchange Private Limited.'),
        React.createElement(Text, { style: styles.termItem }, '2. You will be on probation for a period of 6 months from the date of joining.'),
        React.createElement(Text, { style: styles.termItem }, '3. Please sign and return a copy of this letter within 7 days as a token of your acceptance.'),

        // Signature Grid
        React.createElement(View, { style: styles.signatureGrid },
          React.createElement(View, { style: styles.signatureBox },
            React.createElement(View, { style: styles.signatureLine }),
            React.createElement(Text, { style: styles.signatureLabel }, 'Authorized Signatory'),
            React.createElement(Text, { style: { fontSize: 8, color: '#6b7280' } }, 'JCB Exchange HR Department')
          ),
          React.createElement(View, { style: styles.signatureBox },
            React.createElement(View, { style: styles.signatureLine }),
            React.createElement(Text, { style: styles.signatureLabel }, 'Candidate Acceptance Signature'),
            React.createElement(Text, { style: { fontSize: 8, color: '#6b7280' } }, 'Rahul Sharma')
          )
        ),

        // Footer Note
        React.createElement(Text, { style: styles.footerNote }, 'Confidential - For Addressee Only | JCB Exchange Private Limited')
      )
    )
  );
}

async function generate() {
  const outputPath = path.resolve('../Sample_Offer_Letter_JCB_Exchange.pdf');
  const artifactPath = path.resolve('C:/Users/meghr/.gemini/antigravity-ide/brain/e1ac8f9c-43f5-416f-8e82-ae05c6d7a14f/Sample_Offer_Letter_JCB_Exchange.pdf');

  console.log('Rendering PDF...');
  await ReactPDF.renderToFile(React.createElement(SampleOfferDocument), outputPath);
  fs.copyFileSync(outputPath, artifactPath);
  console.log(`PDF generated successfully at: ${outputPath}`);
}

generate().catch(err => {
  console.error('Failed to generate PDF:', err);
  process.exit(1);
});
