/* eslint-disable jsx-a11y/alt-text */
import { Document, Image, Page, StyleSheet } from '@react-pdf/renderer';

const PAGE_WIDTH = 595.28;
const PAGE_HEIGHT = 841.89;

const styles = StyleSheet.create({
  page: {
    padding: 0,
    backgroundColor: '#ffffff',
  },
  a4Image: {
    width: PAGE_WIDTH,
    height: PAGE_HEIGHT,
  },
});

type Props = {
  image: string;
  rcNumber?: string;
};

export function RcCardPdfDocument({ image, rcNumber = 'RC' }: Props) {
  return (
    <Document title={`INDIAN UNION VEHICLE REGISTRATION CERTIFICATE | Form 23A - Smart Card Certificate | ${rcNumber}`} author="JCB Exchange">
      <Page size="A4" style={styles.page} wrap={false}>
        <Image src={image} style={styles.a4Image} />
      </Page>
    </Document>
  );
}
