/* eslint-disable jsx-a11y/alt-text */
import { Document, Image, Page, StyleSheet, Text, View } from '@react-pdf/renderer';

const PAGE_WIDTH = 842; // A4 Landscape width in pt
const PAGE_HEIGHT = 595; // A4 Landscape height in pt

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
    width: 768,
    height: 256.5,
  },
  footer: {
    marginTop: 20,
    textAlign: 'center',
    fontSize: 9,
    color: '#94a3b8',
  },
});

type Props = {
  image: string;
  rcNumber?: string;
};

export function RcCardPdfDocument({ image, rcNumber = 'RC' }: Props) {
  return (
    <Document title={`RC-Card-${rcNumber}`} author="JCB Exchange">
      <Page size={{ width: PAGE_WIDTH, height: PAGE_HEIGHT }} style={styles.page} wrap={false}>
        <View style={styles.header}>
          <Text style={styles.title}>INDIAN UNION VEHICLE REGISTRATION CERTIFICATE</Text>
          <Text style={styles.subtitle}>Form 23A - Smart Card Certificate | Verified Document</Text>
        </View>

        <View style={styles.cardContainer}>
          <Image src={image} style={styles.cardImage} />
        </View>

        <Text style={styles.footer}>
          This certificate is generated from verified transport records. Please preserve safely.
        </Text>
      </Page>
    </Document>
  );
}

