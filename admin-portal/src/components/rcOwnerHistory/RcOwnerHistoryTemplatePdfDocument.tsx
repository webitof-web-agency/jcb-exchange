import { Document, Image, Page, StyleSheet, View } from '@react-pdf/renderer';

const styles = StyleSheet.create({
  page: { padding: 24, backgroundColor: '#f8fafc' },
  card: { width: '100%', border: '1 solid #cbd5e1', backgroundColor: '#ffffff', padding: 12 },
  image: { width: '100%', objectFit: 'contain' },
});

export function RcOwnerHistoryTemplatePdfDocument({ image }: { image: string }) {
  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <View style={styles.card}>
          {/* eslint-disable-next-line jsx-a11y/alt-text */}
          <Image src={image} style={styles.image} />
        </View>
      </Page>
    </Document>
  );
}
