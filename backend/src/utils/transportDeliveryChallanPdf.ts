import PDFDocument from 'pdfkit';

export type TransportDeliveryChallanPdfData = {
  challanNumber: string;
  challanDate: string;
  machineTitle?: string | null;
  registrationNumber?: string | null;
  declaredValue: number | string;
  carrierVehicleNumber?: string | null;
  // Consignor / Dispatch From
  dispatchName?: string | null;
  dispatchGstin?: string | null;
  dispatchAddress?: string | null;
  dispatchCity?: string | null;
  dispatchState?: string | null;
  dispatchPincode?: string | null;
  // Consignee / Ship To
  deliveryName?: string | null;
  deliveryGstin?: string | null;
  deliveryAddress?: string | null;
  deliveryCity?: string | null;
  deliveryState?: string | null;
  deliveryPincode?: string | null;
  // Signatory
  signatoryName?: string | null;
};

const formatAmountNumber = (amount: number | string): string => {
  const num = typeof amount === 'number' ? amount : parseFloat(String(amount || 0));
  if (Number.isNaN(num)) return '0';
  return Math.round(num).toString();
};

/** Upper-cases and collapses whitespace so every printed value is consistent. */
const tidy = (value?: string | null): string => (value ?? '').replace(/\s+/g, ' ').trim().toUpperCase();

/** "CITY, STATE-PINCODE" built only from the parts that exist. */
const cityStateLine = (city?: string | null, state?: string | null, pincode?: string | null): string => {
  const place = [tidy(city), tidy(state)].filter(Boolean).join(', ');
  const pin = tidy(pincode);
  if (!pin) return place;
  return place ? `${place}-${pin}` : pin;
};

/**
 * Renders the Delivery Challan PDF used for goods movement.
 * Every value comes from the transport record. A value that is not available is left out,
 * never replaced with a made up default.
 */
export const renderTransportDeliveryChallanPdf = async (
  data: TransportDeliveryChallanPdfData,
): Promise<Buffer> => {
  const doc = new PDFDocument({
    size: 'A4',
    margin: 50,
    info: {
      Title: `Delivery Challan ${data.challanNumber}`,
      Author: 'JCB Exchange',
      Subject: 'Delivery Challan',
    },
  });

  const chunks: Buffer[] = [];
  const done = new Promise<Buffer>((resolve, reject) => {
    doc.on('data', (chunk: Buffer) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
  });

  const left = 50;
  const width = 495;
  let y = 60;

  // 1. Top header: challan number and date
  doc.font('Times-Roman').fontSize(12).fillColor('#000000');
  doc.text(`CHALLAN NO. ${tidy(data.challanNumber)}`, left, y, { width: width * 0.5, align: 'left' });
  doc.text(`DATE - ${data.challanDate}`, left + width * 0.5, y, { width: width * 0.5, align: 'right' });

  y += 35;

  // 2. Title
  doc.font('Times-Bold').fontSize(14).fillColor('#000000');
  doc.text('DELIVERY CHALLAN', left, y, { width, align: 'center', underline: true });

  y = doc.y + 18;

  // 3. Certification clause. The registration clause is printed only when the machine has a number.
  const machineTitle = tidy(data.machineTitle) || 'MACHINE';
  const itemName = machineTitle.startsWith('OLD ') ? machineTitle : `OLD ${machineTitle}`;
  const registration = tidy(data.registrationNumber).replace(/\s+/g, '');
  const certText = `IT IS HEREBY CERTIFIED THAT 01 SET ${itemName}${registration ? ` AND REG NO. ${registration}` : ''} IS TRANSPORTING FOR JOB WORKS`;

  doc.font('Times-Bold').fontSize(9.5).lineGap(3).fillColor('#000000');
  doc.text(certText, left, y, { width, align: 'left' });

  y = doc.y + 30;

  // 4. Item table header
  const colItemW = width * 0.44;
  const colNosW = width * 0.12;
  const colValW = width * 0.16;
  const colIgstW = width * 0.12;
  const colTotW = width * 0.16;

  doc.font('Times-Roman').fontSize(9.5);
  doc.text('ITEM', left, y, { width: colItemW });
  doc.text('NOS', left + colItemW, y, { width: colNosW, align: 'right' });
  doc.text('VALUE', left + colItemW + colNosW, y, { width: colValW, align: 'right' });
  doc.text('IGST', left + colItemW + colNosW + colValW, y, { width: colIgstW, align: 'right' });
  doc.text('TOTAL', left + colItemW + colNosW + colValW + colIgstW, y, { width: colTotW, align: 'right' });

  y += 22;

  // 5. Item row
  const rawValue = formatAmountNumber(data.declaredValue);
  const rowTop = y;
  doc.text(`${itemName}.`, left, rowTop, { width: colItemW });
  const rowBottom = doc.y;
  doc.text('01.', left + colItemW, rowTop, { width: colNosW, align: 'right' });
  doc.text(rawValue, left + colItemW + colNosW, rowTop, { width: colValW, align: 'right' });
  doc.text('0.', left + colItemW + colNosW + colValW, rowTop, { width: colIgstW, align: 'right' });
  doc.text(rawValue, left + colItemW + colNosW + colValW + colIgstW, rowTop, { width: colTotW, align: 'right' });

  y = Math.max(rowBottom, rowTop + 14) + 36;

  // 6. Section divider
  doc.moveTo(left, y).lineTo(left + width * 0.28, y).strokeColor('#000000').lineWidth(0.8).stroke();
  doc.moveTo(left + width * 0.35, y).lineTo(left + width * 0.48, y).strokeColor('#000000').lineWidth(0.8).stroke();
  doc.moveTo(left + width * 0.55, y).lineTo(left + width, y).strokeColor('#000000').lineWidth(0.8).stroke();

  y += 20;

  // 7. Vehicle number: the carrier truck when one is recorded, otherwise the machine's own
  //    registration (the machine moves under its own number). Never an invented value.
  const truckNo = tidy(data.carrierVehicleNumber).replace(/\s+/g, '') || registration;
  if (truckNo) {
    doc.font('Times-Bold').fontSize(11).fillColor('#000000');
    doc.text(`VEHICLE NO. – ${truckNo}`, left, y, { width, align: 'left' });
    y = doc.y + 24;
  } else {
    y += 4;
  }

  // 8. NOT FOR SALE
  doc.font('Times-Bold').fontSize(14).fillColor('#000000');
  doc.text('NOT FOR SALE', left, y, { width, align: 'center' });

  y = doc.y + 22;

  // 9. FROM / TO columns
  const colW = width * 0.48;
  const colRightX = left + width * 0.52;

  const drawParty = (
    x: number,
    heading: string,
    marker: string,
    party: {
      gstin?: string | null | undefined;
      name?: string | null | undefined;
      address?: string | null | undefined;
      city?: string | null | undefined;
      state?: string | null | undefined;
      pincode?: string | null | undefined;
    },
  ): number => {
    let cy = y;
    doc.font('Times-Bold').fontSize(12).text(heading, x, cy, { width: colW });
    cy = doc.y + 4;

    const gstin = tidy(party.gstin);
    if (gstin) {
      doc.font('Times-Bold').fontSize(10).text(`GSTIN : ${gstin}`, x, cy, { width: colW });
      cy = doc.y + 3;
    }
    const name = tidy(party.name);
    if (name) {
      doc.font('Times-Bold').fontSize(10).text(name, x, cy, { width: colW });
      cy = doc.y + 3;
    }

    doc.font('Times-Roman').fontSize(9.5).text(marker, x, cy, { width: colW });
    cy = doc.y + 3;

    const address = tidy(party.address);
    if (address) {
      doc.font('Times-Roman').fontSize(9.5).text(address, x, cy, { width: colW });
      cy = doc.y + 3;
    }
    const place = cityStateLine(party.city, party.state, party.pincode);
    if (place) {
      doc.font('Times-Roman').fontSize(9.5).text(place, x, cy, { width: colW });
      cy = doc.y + 3;
    }
    return cy;
  };

  const fromBottom = drawParty(left, 'FROM', ':: Dispatch From ::', {
    gstin: data.dispatchGstin,
    name: data.dispatchName,
    address: data.dispatchAddress,
    city: data.dispatchCity,
    state: data.dispatchState,
    pincode: data.dispatchPincode,
  });
  const toBottom = drawParty(colRightX, 'TO', ':: Ship To ::', {
    gstin: data.deliveryGstin,
    name: data.deliveryName,
    address: data.deliveryAddress,
    city: data.deliveryCity,
    state: data.deliveryState,
    pincode: data.deliveryPincode,
  });

  // 10. Signatory
  const signatory = tidy(data.signatoryName) || tidy(data.dispatchName);
  const finalY = Math.max(fromBottom, toBottom) + 30;
  doc.font('Times-Bold').fontSize(11).fillColor('#000000');
  doc.text("YOUR'S FAITHFULLY", colRightX, finalY, { width: colW, align: 'left' });
  if (signatory) {
    doc.text(signatory, colRightX, doc.y + 4, { width: colW, align: 'left' });
  }

  doc.end();
  return done;
};
