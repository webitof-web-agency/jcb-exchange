import PizZip from 'pizzip';

export type MoneyReceiptTemplateData = {
  companyName: string;
  cin: string;
  companyAddressLine: string;
  receiptNumber: string;
  receiptDate: string;
  vehicleTitle: string;
  vehicleColor: string;
  customerId: string;
  customerName: string;
  place: string;
  paymentMethod: string;
  amount: string;
  amountInWords: string;
  remarks: string;
  authorisedSignatoryName: string;
  authorisedSignatoryDesignation: string;
};

export type BillOfSupplyTemplateData = {
  companyName: string;
  cin: string;
  companyAddressLine: string;
  companyGstin?: string;
  invoiceNumber: string;
  invoiceDate: string;
  customerName: string;
  customerAddressLine: string;
  customerGstin: string;
  customerStateCode: string;
  placeOfSupply: string;
  vehicleTitle: string;
  hsn: string;
  quantity: string;
  rate: string;
  amount: string;
  total: string;
  amountInWords: string;
  terms: string;
  authorisedSignatoryName: string;
  authorisedSignatoryDesignation: string;
};

const DOCUMENT_XML_PATH = 'word/document.xml';
const RELATIONSHIPS_XML_PATH = 'word/_rels/document.xml.rels';
const CONTENT_TYPES_XML_PATH = '[Content_Types].xml';
const DEFAULT_LOGO_PATH = 'word/media/image1.jpg';

const xmlEscape = (value: unknown) => String(value ?? '')
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&apos;');

const paragraphPattern = /<w:p(?:\s[^>]*)?>[\s\S]*?<\/w:p>/g;
const textPattern = /<w:t(?:\s[^>]*)?>[\s\S]*?<\/w:t>/g;

const paragraphText = (paragraph: string) => [...paragraph.matchAll(textPattern)]
  .map((match) => match[0].replace(/^<w:t(?:\s[^>]*)?>|<\/w:t>$/g, ''))
  .join('')
  .replace(/&amp;/g, '&')
  .replace(/&lt;/g, '<')
  .replace(/&gt;/g, '>')
  .replace(/&quot;/g, '"')
  .replace(/&apos;/g, "'")
  .replace(/\s+/g, ' ')
  .trim();

const allParagraphs = (xml: string) => [...xml.matchAll(paragraphPattern)].map((match) => ({
  xml: match[0],
  text: paragraphText(match[0]),
  start: match.index || 0,
}));

const replaceParagraphText = (paragraph: string, value: string) => {
  let replaced = false;
  const next = paragraph.replace(textPattern, () => {
    if (replaced) return '<w:t></w:t>';
    replaced = true;
    return `<w:t xml:space="preserve">${xmlEscape(value)}</w:t>`;
  });
  if (replaced) return next;

  return paragraph.replace('</w:pPr>', `</w:pPr><w:r><w:t xml:space="preserve">${xmlEscape(value)}</w:t></w:r>`);
};

const replaceParagraphAtIndex = (xml: string, index: number, value: string) => {
  let currentIndex = 0;
  let found = false;
  const next = xml.replace(paragraphPattern, (paragraph) => {
    const shouldReplace = currentIndex++ === index;
    if (!shouldReplace) return paragraph;
    found = true;
    return replaceParagraphText(paragraph, value);
  });
  if (!found) throw new Error(`Vehicle-sale DOCX template is missing paragraph ${index}.`);
  return next;
};

const findParagraphIndex = (xml: string, predicate: (text: string, index: number) => boolean, fromIndex = 0) => {
  const paragraphs = allParagraphs(xml);
  const match = paragraphs.find((paragraph, index) => index >= fromIndex && predicate(paragraph.text, index));
  return match ? paragraphs.indexOf(match) : -1;
};

const replaceMatchingParagraph = (
  xml: string,
  predicate: (text: string, index: number) => boolean,
  value: string,
  fromIndex = 0,
) => {
  const index = findParagraphIndex(xml, predicate, fromIndex);
  if (index < 0) throw new Error('Vehicle-sale DOCX template layout is not compatible with the configured template.');
  return replaceParagraphAtIndex(xml, index, value);
};

const replaceRelativeParagraph = (xml: string, baseIndex: number, offset: number, value: string) =>
  replaceParagraphAtIndex(xml, baseIndex + offset, value);

const replaceTextAfterLabel = (xml: string, label: string, value: string, fromIndex = 0) =>
  replaceMatchingParagraph(xml, (text) => text.toLowerCase().startsWith(label.toLowerCase()), value, fromIndex);

const imageExtension = (buffer: Buffer) => {
  if (buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'png';
  if (buffer.subarray(0, 3).equals(Buffer.from([0xff, 0xd8, 0xff]))) return 'jpg';
  return null;
};

const replaceEmbeddedLogo = (zip: PizZip, logoBuffer?: Buffer | null) => {
  if (!logoBuffer?.length || !zip.file(DEFAULT_LOGO_PATH)) return;

  const existingPath = DEFAULT_LOGO_PATH;
  const extension = imageExtension(logoBuffer);
  if (!extension || extension === 'jpg') {
    zip.file(existingPath, logoBuffer);
    return;
  }

  const nextPath = `word/media/image1.${extension}`;
  zip.file(nextPath, logoBuffer);
  zip.remove(existingPath);

  const relationships = zip.file(RELATIONSHIPS_XML_PATH)?.asText();
  if (relationships) {
    zip.file(RELATIONSHIPS_XML_PATH, relationships.replace(/media\/image1\.jpg/g, `media/image1.${extension}`));
  }

  const contentTypes = zip.file(CONTENT_TYPES_XML_PATH)?.asText();
  if (contentTypes && extension === 'png' && !/Extension="png"/.test(contentTypes)) {
    zip.file(CONTENT_TYPES_XML_PATH, contentTypes.replace('</Types>', '<Default Extension="png" ContentType="image/png"/></Types>'));
  }
};

const loadTemplateZip = (templateBuffer: Buffer, logoBuffer?: Buffer | null) => {
  const zip = new PizZip(templateBuffer);
  if (!zip.file(DOCUMENT_XML_PATH)) throw new Error('Vehicle-sale DOCX template is missing word/document.xml.');
  replaceEmbeddedLogo(zip, logoBuffer);
  return zip;
};

const finish = (zip: PizZip, documentXml: string) => {
  zip.file(DOCUMENT_XML_PATH, documentXml);
  return zip.generate({ type: 'nodebuffer' }) as Buffer;
};

export const fillMoneyReceiptTemplate = (
  templateBuffer: Buffer,
  data: MoneyReceiptTemplateData,
  logoBuffer?: Buffer | null,
) => {
  const zip = loadTemplateZip(templateBuffer, logoBuffer);
  let xml = zip.file(DOCUMENT_XML_PATH)!.asText();
  const companyIndex = findParagraphIndex(xml, (text) => text.toUpperCase().includes('JCB EXCHANGE'));
  if (companyIndex < 0) throw new Error('Money receipt DOCX template is missing the company header.');
  xml = replaceParagraphAtIndex(xml, companyIndex, data.companyName);
  xml = replaceTextAfterLabel(xml, 'CIN:', `CIN: ${data.cin}`);
  xml = replaceParagraphAtIndex(xml, findParagraphIndex(xml, (text, index) => index > companyIndex && text.toUpperCase().startsWith('CIN:')) + 1, data.companyAddressLine);
  xml = replaceTextAfterLabel(xml, 'RECEIPT NO', `RECEIPT NO : ${data.receiptNumber}`);
  xml = replaceTextAfterLabel(xml, 'DATE', `DATE : ${data.receiptDate}`);
  xml = replaceTextAfterLabel(xml, 'MODEL', `MODEL : ${data.vehicleTitle}`);
  xml = replaceTextAfterLabel(xml, 'COLOR', `COLOR : ${data.vehicleColor}     CUSTOMER ID : ${data.customerId}`);
  xml = replaceTextAfterLabel(xml, 'RECEIVED WITH THANKS', `RECEIVED WITH THANKS FROM: ${data.customerName}`);
  xml = replaceTextAfterLabel(xml, 'PLACE', `PLACE : ${data.place}`);
  const amountHeaderIndex = findParagraphIndex(xml, (text) => text.toUpperCase() === 'AMOUNT');
  if (amountHeaderIndex < 0) throw new Error('Money receipt DOCX template is missing the amount table.');
  xml = replaceRelativeParagraph(xml, amountHeaderIndex, 1, data.paymentMethod);
  xml = replaceRelativeParagraph(xml, amountHeaderIndex, 2, data.amount);
  xml = replaceRelativeParagraph(xml, amountHeaderIndex, 3, data.amountInWords);
  xml = replaceMatchingParagraph(xml, (text) => text.toLowerCase().startsWith('remarks'), `Remarks: ${data.remarks}`);
  const forIndex = findParagraphIndex(xml, (text) => text.toUpperCase().startsWith('FOR,'));
  if (forIndex < 0) throw new Error('Money receipt DOCX template is missing the authorised-signatory block.');
  xml = replaceParagraphAtIndex(xml, forIndex, `FOR, ${data.companyName}`);
  const authorisedIndex = findParagraphIndex(xml, (text, index) => index > forIndex && text.toUpperCase().includes('AUTHORISED SIGNATORY'));
  if (authorisedIndex < 0) throw new Error('Money receipt DOCX template is missing the authorised-signatory label.');
  xml = replaceParagraphAtIndex(xml, authorisedIndex, `AUTHORISED SIGNATORY: ${data.authorisedSignatoryName} (${data.authorisedSignatoryDesignation})`);
  return finish(zip, xml);
};

export const fillBillOfSupplyTemplate = (
  templateBuffer: Buffer,
  data: BillOfSupplyTemplateData,
  logoBuffer?: Buffer | null,
) => {
  const zip = loadTemplateZip(templateBuffer, logoBuffer);
  let xml = zip.file(DOCUMENT_XML_PATH)!.asText();
  const companyIndex = findParagraphIndex(xml, (text) => text.toUpperCase().includes('JCB EXCHANGE'));
  if (companyIndex < 0) throw new Error('Bill of supply DOCX template is missing the company header.');
  xml = replaceParagraphAtIndex(xml, companyIndex, data.companyName);
  const cinIndex = findParagraphIndex(xml, (text) => text.toUpperCase().startsWith('CIN:'));
  if (cinIndex < 0) throw new Error('Bill of supply DOCX template is missing the CIN line.');
  xml = replaceParagraphAtIndex(xml, cinIndex, `CIN: ${data.cin}`);
  xml = replaceParagraphAtIndex(xml, cinIndex + 1, data.companyAddressLine);
  const sellerNameIndex = findParagraphIndex(xml, (text) => text.toLowerCase().startsWith('name:'));
  if (sellerNameIndex < 0) throw new Error('Bill of supply DOCX template is missing seller details.');
  xml = replaceParagraphAtIndex(xml, sellerNameIndex, `Name: ${data.companyName}`);
  xml = replaceTextAfterLabel(xml, 'Invoice No', `Invoice No: ${data.invoiceNumber}`);
  xml = replaceTextAfterLabel(xml, 'Address:', `Address: ${data.companyAddressLine}`);
  xml = replaceTextAfterLabel(xml, 'Invoice Date', `Invoice Date: ${data.invoiceDate}`);
  const gstinIndexes = allParagraphs(xml).map((paragraph, index) => paragraph.text.toUpperCase().startsWith('GSTIN:') ? index : -1).filter((index) => index >= 0);
  if (gstinIndexes.length < 2) throw new Error('Bill of supply DOCX template is missing GSTIN fields.');
  xml = replaceParagraphAtIndex(xml, gstinIndexes[0]!, `GSTIN: ${data.companyGstin || '-'}`);
  const placeIndex = findParagraphIndex(xml, (text) => text.toLowerCase().startsWith('place of supply'));
  if (placeIndex < 0) throw new Error('Bill of supply DOCX template is missing place of supply.');
  xml = replaceParagraphAtIndex(xml, placeIndex, `Place of Supply: ${data.placeOfSupply}`);
  const stateIndex = findParagraphIndex(xml, (text) => text.toLowerCase().startsWith('state / code'));
  if (stateIndex < 0) throw new Error('Bill of supply DOCX template is missing state/code.');
  xml = replaceParagraphAtIndex(xml, stateIndex, `State / Code: ${data.customerStateCode}`);
  const buyerHeadingIndex = findParagraphIndex(xml, (text) => text.toLowerCase().includes('buyer (bill to)'));
  if (buyerHeadingIndex < 0) throw new Error('Bill of supply DOCX template is missing buyer details.');
  const buyerNameIndex = findParagraphIndex(xml, (text, index) => index > buyerHeadingIndex && text.toLowerCase().startsWith('name:'));
  if (buyerNameIndex < 0) throw new Error('Bill of supply DOCX template is missing buyer name.');
  xml = replaceParagraphAtIndex(xml, buyerNameIndex, `Name: ${data.customerName}`);
  const buyerAddressIndex = findParagraphIndex(xml, (text, index) => index > buyerNameIndex && text.toLowerCase().startsWith('address:'));
  if (buyerAddressIndex < 0) throw new Error('Bill of supply DOCX template is missing buyer address.');
  xml = replaceParagraphAtIndex(xml, buyerAddressIndex, `Address: ${data.customerAddressLine}`);
  const buyerGstinIndex = findParagraphIndex(xml, (text, index) => index > buyerAddressIndex && text.toUpperCase().startsWith('GSTIN:'));
  if (buyerGstinIndex < 0) throw new Error('Bill of supply DOCX template is missing buyer GSTIN.');
  xml = replaceParagraphAtIndex(xml, buyerGstinIndex, `GSTIN: ${data.customerGstin}`);
  const buyerStateIndex = findParagraphIndex(xml, (text, index) => index > buyerGstinIndex && text.toLowerCase().startsWith('state / code'));
  if (buyerStateIndex >= 0) xml = replaceParagraphAtIndex(xml, buyerStateIndex, `State / Code: ${data.customerStateCode}`);
  const itemNumberIndex = findParagraphIndex(xml, (text) => text === '1');
  if (itemNumberIndex < 0) throw new Error('Bill of supply DOCX template is missing the item row.');
  xml = replaceRelativeParagraph(xml, itemNumberIndex, 1, data.vehicleTitle);
  xml = replaceRelativeParagraph(xml, itemNumberIndex, 2, data.hsn);
  xml = replaceRelativeParagraph(xml, itemNumberIndex, 3, data.quantity);
  xml = replaceRelativeParagraph(xml, itemNumberIndex, 4, data.rate);
  xml = replaceRelativeParagraph(xml, itemNumberIndex, 5, data.amount);
  const totalIndex = findParagraphIndex(xml, (text) => text.toLowerCase() === 'total');
  if (totalIndex < 0) throw new Error('Bill of supply DOCX template is missing total row.');
  xml = replaceRelativeParagraph(xml, totalIndex, 1, data.total);
  const amountWordsIndex = findParagraphIndex(xml, (text) => text.toLowerCase().startsWith('amount in words'));
  if (amountWordsIndex < 0) throw new Error('Bill of supply DOCX template is missing amount in words.');
  xml = replaceParagraphAtIndex(xml, amountWordsIndex, `Amount in Words: ${data.amountInWords}`);
  const termsHeadingIndex = findParagraphIndex(xml, (text) => text.toLowerCase().includes('terms & conditions'));
  if (termsHeadingIndex < 0) throw new Error('Bill of supply DOCX template is missing terms and conditions.');
  const termsIndex = findParagraphIndex(xml, (text, index) => index > termsHeadingIndex && text.length > 0);
  if (termsIndex < 0) throw new Error('Bill of supply DOCX template is missing terms text.');
  xml = replaceParagraphAtIndex(xml, termsIndex, data.terms);
  const forIndex = findParagraphIndex(xml, (text) => text.toLowerCase().startsWith('for '));
  if (forIndex < 0) throw new Error('Bill of supply DOCX template is missing the authorised-signatory block.');
  xml = replaceParagraphAtIndex(xml, forIndex, `For ${data.companyName}`);
  const signatoryNameIndex = findParagraphIndex(xml, (text, index) => index > forIndex && text.toLowerCase().startsWith('name:'));
  if (signatoryNameIndex >= 0) xml = replaceParagraphAtIndex(xml, signatoryNameIndex, `Name: ${data.authorisedSignatoryName}`);
  const designationIndex = findParagraphIndex(xml, (text, index) => index > forIndex && text.toLowerCase().startsWith('designation:'));
  if (designationIndex >= 0) xml = replaceParagraphAtIndex(xml, designationIndex, `Designation: ${data.authorisedSignatoryDesignation}`);
  return finish(zip, xml);
};
