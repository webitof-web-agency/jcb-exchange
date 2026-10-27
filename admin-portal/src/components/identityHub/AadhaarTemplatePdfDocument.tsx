/* eslint-disable jsx-a11y/alt-text */
import { Document, Image, Page, StyleSheet } from '@react-pdf/renderer';

// The exported Aadhaar template image is 1785 × 2526 px (extracted from official blank template).
// We render it at 595 × 842 (A4 pt) so it prints at the correct physical size.
const PAGE_WIDTH = 595;
const PAGE_HEIGHT = 842;

const styles = StyleSheet.create({
  page: {
    padding: 0,
    margin: 0,
    backgroundColor: '#ffffff',
  },
  image: {
    width: PAGE_WIDTH,
    height: PAGE_HEIGHT,
  },
});

type Props = {
  image: string;
};

export function AadhaarTemplatePdfDocument({ image }: Props) {
  return (
    <Document title="Aadhaar Template" author="JCB Exchange">
      <Page size={{ width: PAGE_WIDTH, height: PAGE_HEIGHT }} style={styles.page} wrap={false}>
        <Image src={image} style={styles.image} />
      </Page>
    </Document>
  );
}
