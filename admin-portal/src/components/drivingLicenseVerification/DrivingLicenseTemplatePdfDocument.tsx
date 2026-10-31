/* eslint-disable jsx-a11y/alt-text */
import { Document, Image, Page, StyleSheet, Text, View } from '@react-pdf/renderer';

const PAGE_WIDTH = 842;
const PAGE_HEIGHT = 595;

const styles = StyleSheet.create({
  page: {
    padding: 30,
    backgroundColor: '#f8fafc',
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
  cardContainer: {
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 8,
    overflow: 'hidden',
    backgroundColor: '#ffffff',
  },
  cardImage: {
    width: 530,
    height: 329,
  },
  footer: {
    marginTop: 20,
    textAlign: 'center',
    fontSize: 9,
    color: '#64748b',
  },
});

type Props = {
  image: string;
  licenseNumber?: string;
};

export function DrivingLicenseTemplatePdfDocument({ image, licenseNumber = 'DL' }: Props) {
  return (
    <Document title={`Driving-License-${licenseNumber}`} author="JCB Exchange">
      <Page size={{ width: PAGE_WIDTH, height: PAGE_HEIGHT }} style={styles.page} wrap={false}>
        <View style={styles.header}>
          <Text style={styles.title}>INDIAN UNION DRIVING LICENCE</Text>
          <Text style={styles.subtitle}>Form 7 Rule 16 | Verified reference template</Text>
        </View>
        <View style={styles.cardContainer}>
          <Image src={image} style={styles.cardImage} />
        </View>
        <Text style={styles.footer}>This duplicate card is generated from verified provider data for reference/personal use only.</Text>
      </Page>
    </Document>
  );
}
