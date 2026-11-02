/* eslint-disable jsx-a11y/alt-text */
import { Document, Image, Page, StyleSheet, Text, View } from '@react-pdf/renderer';

const styles = StyleSheet.create({
  page: {
    padding: 30,
    backgroundColor: '#ffffff',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
  },
  header: {
    marginBottom: 20,
    textAlign: 'center',
  },
  title: {
    fontSize: 16,
    fontFamily: 'Helvetica-Bold',
    color: '#0f172a',
    letterSpacing: 0.5,
  },
  subtitle: {
    fontSize: 10,
    color: '#64748b',
    marginTop: 4,
  },
  cardsRow: {
    display: 'flex',
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'center',
    gap: 12,
  },
  cardContainer: {
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 4,
    overflow: 'hidden',
    backgroundColor: '#ffffff',
  },
  frontCardImage: {
    width: 380,
    height: 242,
  },
  backCardImage: {
    width: 380,
    height: 236,
  },
  footer: {
    marginTop: 20,
    textAlign: 'center',
    fontSize: 9,
    color: '#64748b',
  },
  savedA4Image: {
    width: 530,
    height: 750,
  },
});

type Props = {
  frontImage?: string;
  backImage?: string;
  a4Image?: string;
  licenseNumber?: string;
};

export function DrivingLicenseTemplatePdfDocument({ frontImage, backImage, a4Image, licenseNumber = 'DL' }: Props) {
  return (
    <Document title={`Driving-License-${licenseNumber}`} author="JCB Exchange">
      <Page size="A4" style={styles.page} wrap={false}>
        {a4Image ? <Image src={a4Image} style={styles.savedA4Image} /> : <>
          <View style={styles.header}>
            <Text style={styles.title}>INDIAN UNION DRIVING LICENCE</Text>
            <Text style={styles.subtitle}>Form 7 Rule 16 | Verified reference template</Text>
          </View>
          <View style={styles.cardsRow}>
            <View style={styles.cardContainer}>
              <Image src={frontImage || ''} style={styles.frontCardImage} />
            </View>
            <View style={styles.cardContainer}>
              <Image src={backImage || ''} style={styles.backCardImage} />
            </View>
          </View>
          <Text style={styles.footer}>This duplicate card is generated from verified provider data for reference/personal use only.</Text>
        </>}
      </Page>
    </Document>
  );
}
