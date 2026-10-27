/* eslint-disable jsx-a11y/alt-text */
import { Document, Image, Page, StyleSheet } from '@react-pdf/renderer';

const CANVAS_WIDTH = 1024;
const CANVAS_HEIGHT = 636;

const styles = StyleSheet.create({
  page: {
    padding: 0,
    margin: 0,
    backgroundColor: '#ffffff',
  },
  image: {
    width: CANVAS_WIDTH,
    height: CANVAS_HEIGHT,
  },
});

type Props = {
  image: string;
};

export function PanTemplatePdfDocument({ image }: Props) {
  return (
    <Document title="PAN Template" author="JCB Exchange">
      <Page size={{ width: CANVAS_WIDTH, height: CANVAS_HEIGHT }} style={styles.page} wrap={false}>
        <Image src={image} style={styles.image} />
      </Page>
    </Document>
  );
}