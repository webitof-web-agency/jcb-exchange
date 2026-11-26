import assert from 'node:assert/strict';
import test from 'node:test';
import PDFDocument from 'pdfkit';
import { findSignatureFields, type TextPage } from './offerLetterFields';
import { buildSignedOfferLetter, readLetterText } from './signedOfferLetter';

// A small opaque PNG (4 x 2), enough to stand in for a signature image.
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAQAAAACCAYAAAB/qH1jAAAAEUlEQVR4nGNgYGD4z4AGMAQAHAkBAfaWXOoAAAAASUVORK5CYII=', 'base64');

const letter = (build: (document: InstanceType<typeof PDFDocument>) => void) => new Promise<Buffer>((resolve, reject) => {
  const document = new PDFDocument({ size: 'A4', margin: 48 });
  const chunks: Buffer[] = [];
  document.on('data', (chunk: Buffer) => chunks.push(chunk));
  document.once('error', reject);
  document.once('end', () => resolve(Buffer.concat(chunks)));
  build(document);
  document.end();
});

/** The shape of the portal's letter: a company signatory block, then the acceptance block on the last page. */
const offerLetter = (acceptance: { date?: string; place?: string } = {}) => letter((document) => {
  document.font('Helvetica').fontSize(10).text('OFFER OF EMPLOYMENT', 48, 60);
  document.addPage();
  document.text('For JCB Exchange', 48, 80).text('Authorized Signatory', 48, 120).text('Date: 21/11/2026', 48, 135);
  document.font('Helvetica-Bold').text('ACCEPTANCE OF OFFER', 48, 200);
  document.font('Helvetica').text('I, Moraj SAHU, hereby accept the offer of employment.', 48, 225);
  document.text('Employee Name: Moraj SAHU', 48, 250);
  document.text('Signature: _______________________________', 48, 265);
  document.text(`Date: ${acceptance.date ?? '____________________'}`, 48, 280);
  document.text(`Place: ${acceptance.place ?? '____________________'}`, 48, 295);
});

const input = { signature: PNG, signerName: 'Moraj SAHU', signedOn: '26/11/2026', place: 'Raipur', statement: 'Signed electronically by Moraj SAHU on 26 Nov 2026 at Raipur.', letterNo: 'JCB-1', companyName: 'JCB Exchange' };
const allText = (pages: TextPage[]) => pages.map((page) => page.runs.map((run) => run.text).join(' '));

test('finds the signature line and the blank date and place of the acceptance block', async () => {
  const fields = findSignatureFields(await readLetterText(await offerLetter()));
  assert.ok(fields);
  assert.equal(fields.page, 1);
  // The signature starts after "Signature: " (about 48 pt wide at 10 pt) and stays on the line.
  assert.ok(fields.signature.x >= 96, `x=${fields.signature.x}`);
  assert.ok(fields.signature.x + fields.signature.width <= 275, `end=${fields.signature.x + fields.signature.width}`);
  assert.ok(fields.date && fields.date.x > 70 && fields.date.y < fields.signature.y + 4);
  assert.ok(fields.place && fields.place.y < fields.date.y);
});

test('a date or place the letter already states is left as printed', async () => {
  const fields = findSignatureFields(await readLetterText(await offerLetter({ date: '21/11/2026', place: 'RAIPUR' })));
  assert.ok(fields);
  assert.equal(fields.date, null);
  assert.equal(fields.place, null);
});

test('keeps the signature clear of text printed just above the line', () => {
  const block = (nameWidth: number): TextPage => ({ width: 595, height: 842, runs: [
    { text: 'ACCEPTANCE OF OFFER', x: 48, y: 500, width: 140, size: 12 },
    { text: 'Employee Name: Somebody', x: 48, y: 426, width: nameWidth, size: 10 },
    { text: 'Signature: _______________________________', x: 48, y: 412, width: 220, size: 10 },
  ] });
  // Room beside the name: the signature starts after it.
  const beside = findSignatureFields([block(135)])!;
  assert.ok(beside.signature.x >= 189, `x=${beside.signature.x}`);
  assert.equal(beside.signature.height, 30);
  assert.ok(beside.signature.x + beside.signature.width <= 268.1);
  // A very long name: a smaller signature that stays under it.
  const under = findSignatureFields([block(210)])!;
  assert.ok(under.signature.x < 105);
  assert.ok(under.signature.y + under.signature.height <= 424, `top=${under.signature.y + under.signature.height}`);
});

test('prefers the signature line after the acceptance heading and ignores a signatory block', () => {
  const run = (text: string, y: number) => ({ text, x: 48, y, width: text.length * 5, size: 10 });
  const fields = findSignatureFields([{ width: 595, height: 842, runs: [
    run('Signature: ______________', 700), run('Authorized Signatory', 680), run('ACCEPTANCE', 400), run("Candidate's Signature ______________", 300),
  ] }]);
  assert.ok(fields);
  assert.ok(Math.abs(fields.signature.y - 296) < 0.1);
  assert.equal(findSignatureFields([{ width: 595, height: 842, runs: [run('Authorized Signatory', 600), run('The signature of the manager is required.', 500)] }]), null);
});

test('stamps the signature, date, place and record on the signature page', async () => {
  const signed = await buildSignedOfferLetter(await offerLetter(), input);
  const pages = allText(await readLetterText(signed));
  assert.equal(pages.length, 2);
  assert.match(pages[1]!, /26\/11\/2026/);
  assert.match(pages[1]!, /Raipur/);
  assert.match(pages[1]!, /Signed electronically by Moraj SAHU/);
});

test('without an image the name is written on the line', async () => {
  const before = allText(await readLetterText(await offerLetter()))[1]!;
  const after = allText(await readLetterText(await buildSignedOfferLetter(await offerLetter(), { ...input, signature: null, statement: 'Record.' })))[1]!;
  assert.equal(before.split('Moraj SAHU').length, 3);
  assert.equal(after.split('Moraj SAHU').length, 4);
});

test('a letter without a signature line gets an acceptance page', async () => {
  const plain = await letter((document) => { document.fontSize(10).text('A scanned or unusual letter.', 48, 60); });
  const pages = allText(await readLetterText(await buildSignedOfferLetter(plain, input)));
  assert.equal(pages.length, 2);
  assert.match(pages[1]!, /Acceptance of offer/);
  assert.match(pages[1]!, /Employee name: Moraj SAHU/);
  assert.match(pages[1]!, /Date: 26\/11\/2026/);
});
