import assert from 'node:assert/strict';
import test from 'node:test';
import { routeAiMessage, resolveAiMessage } from './aiIntentRouter.service';
import { buildVehicleDocsOperatorAnswer } from './vehicleDocsOperatorAnswer.service';
import { buildSoldVehicleOperatorAnswer } from './soldVehicleOperatorAnswer.service';
import { buildLocalAiAnswer } from './aiLocalAnswer.service';

const mockVehicleDocsData = {
  found: true,
  vehicleNumber: 'CG11BN7867',
  item: {
    vehicleNumber: 'CG11BN7867',
    title: 'JCB INDIA LIMITED 3DX',
    category: 'Excavator (NT)',
    brand: 'JCB INDIA LIMITED',
    model: '3DX',
    year: 2024,
    hours: 1250,
    chassisNumber: 'RAJ3DXIN403449629',
    engineNumber: 'H80445338',
    location: 'Bilaspur, Chhattisgarh',
    owner: 'SATISH KUMAR BANJARE',
    statusBadges: {
      listingStatus: 'PUBLISHED',
      dealStatus: 'DEAL_DONE',
      rtoStatus: 'DEAL_DONE',
    },
    listing: {
      id: 'lst-101',
      title: 'JCB INDIA LIMITED 3DX',
      status: 'PUBLISHED',
      sellerPrice: 2200000,
      finalPrice: 2300000,
      soldAt: '2026-11-16',
    },
    parties: {
      ownerName: 'SATISH KUMAR BANJARE',
      sellerName: 'SATISH KUMAR BANJARE',
      sellerNumber: '8966000253',
      purchaserName: 'ROSHAN VERMA',
      purchaserNumber: '9827154321',
      purchaserCity: 'Bilaspur',
    },
    sales: [
      {
        recordNumber: 'SA-2026-0001',
        dealStatus: 'DEAL_DONE',
        purchaseAmount: 2200000,
        sellAmount: 2300000,
        received: 2300000,
        paidToSeller: 2200000,
        invoiceNumber: 'JCBX/SV/2026-27/0001',
        creditNoteNumber: null,
      },
    ],
    rto: {
      office: 'RTO Janjgir-Champa',
      status: 'DEAL_DONE',
      agent: 'Ramesh Sharma',
      validities: {
        tax: { status: 'VALID', validUntil: '2027-03-31' },
        fitness: { status: 'VALID', validUntil: '2026-06-15' },
        insurance: { status: 'VALID', validUntil: '2025-08-20' },
        puc: { status: 'VALID', validUntil: '2026-05-15' },
        hsrp: { status: 'AFFIXED', number: 'HSRP-99887' },
      },
      tasks: [
        { label: 'RC Transfer', status: 'TRANSFERRED', remark: 'Smart card issued' },
        { label: 'Insurance Transfer', status: 'TRANSFERRED', remark: 'Policy updated' },
        { label: 'NOC / Hypothecation Clearance', status: 'NOT_REQUIRED', remark: 'No active loan' },
      ],
    },
    sections: [
      'Seller & Purchase',
      'Buyer & Sale',
      'Invoices & Payments',
      'RTO Transfer',
      'Listing & Photos',
      'Other',
    ],
    checklist: {
      totalCount: 9,
      availableCount: 7,
      missingNaCount: 1,
      notRequiredCount: 1,
      items: [
        { key: 'purchaseDeed', label: 'Purchase deed', section: 'Seller & Purchase', state: 'AVAILABLE', note: null },
        { key: 'purchaseAadhaarCard', label: 'Seller Aadhaar card', section: 'Seller & Purchase', state: 'AVAILABLE', note: null },
        { key: 'sellDeed', label: 'Sale deed', section: 'Buyer & Sale', state: 'AVAILABLE', note: null },
        { key: 'sellAadhaarCard', label: 'Buyer Aadhaar card', section: 'Buyer & Sale', state: 'AVAILABLE', note: null },
        { key: 'sellGstCertificate', label: 'Buyer GST certificate', section: 'Buyer & Sale', state: 'NA', note: 'Not registered for GST' },
        { key: 'invoice', label: 'Bill of Supply (sale invoice)', section: 'Invoices & Payments', state: 'AVAILABLE', note: null },
        { key: 'delivery-challan', label: 'Delivery challan', section: 'Invoices & Payments', state: 'AVAILABLE', note: null },
        { key: 'receipts', label: 'Money receipts', section: 'Invoices & Payments', state: 'AVAILABLE', note: null },
        { key: 'rto-NOC', label: 'NOC / Hypothecation Clearance', section: 'RTO Transfer', state: 'NOT_REQUIRED', note: 'No active loan' },
      ],
    },
    documents: [
      { id: 'doc-1', section: 'Seller & Purchase', checklistKey: 'purchaseDeed', label: 'Purchase deed', fileName: 'Purchase deed - SA-2026-0001.pdf', previewUrl: '/api/vehicle-docs/CG11BN7867/files/doc-1?inline=1', downloadUrl: '/api/vehicle-docs/CG11BN7867/files/doc-1' },
      { id: 'doc-2', section: 'Seller & Purchase', checklistKey: 'purchaseAadhaarCard', label: 'Seller Aadhaar card', fileName: 'Seller Aadhaar - SA-2026-0001.pdf', previewUrl: '/api/vehicle-docs/CG11BN7867/files/doc-2?inline=1', downloadUrl: '/api/vehicle-docs/CG11BN7867/files/doc-2' },
      { id: 'doc-3', section: 'Buyer & Sale', checklistKey: 'sellDeed', label: 'Sale deed', fileName: 'Sale deed - SA-2026-0001.pdf', previewUrl: '/api/vehicle-docs/CG11BN7867/files/doc-3?inline=1', downloadUrl: '/api/vehicle-docs/CG11BN7867/files/doc-3' },
      { id: 'doc-4', section: 'Buyer & Sale', checklistKey: 'sellAadhaarCard', label: 'Buyer Aadhaar card', fileName: 'Buyer Aadhaar - SA-2026-0001.pdf', previewUrl: '/api/vehicle-docs/CG11BN7867/files/doc-4?inline=1', downloadUrl: '/api/vehicle-docs/CG11BN7867/files/doc-4' },
      { id: 'doc-5', section: 'Invoices & Payments', checklistKey: 'invoice', label: 'Bill of Supply JCBX/SV/2026-27/0001', fileName: 'Bill of Supply.pdf', previewUrl: '/api/vehicle-docs/CG11BN7867/files/doc-5?inline=1', downloadUrl: '/api/vehicle-docs/CG11BN7867/files/doc-5' },
      { id: 'doc-6', section: 'Invoices & Payments', checklistKey: 'delivery-challan', label: 'Delivery challan SA-2026-0001', fileName: 'Delivery Challan.pdf', previewUrl: '/api/vehicle-docs/CG11BN7867/files/doc-6?inline=1', downloadUrl: '/api/vehicle-docs/CG11BN7867/files/doc-6' },
      { id: 'doc-7', section: 'Invoices & Payments', checklistKey: 'receipts', label: 'Money receipt RCPT-001', fileName: 'Receipt.pdf', previewUrl: '/api/vehicle-docs/CG11BN7867/files/doc-7?inline=1', downloadUrl: '/api/vehicle-docs/CG11BN7867/files/doc-7' },
      { id: 'doc-8', section: 'Listing & Photos', checklistKey: 'listing-photos', label: 'Meter reading (cover)', fileName: '01 Meter reading.jpg', previewUrl: '/api/vehicle-docs/CG11BN7867/files/doc-8?inline=1', downloadUrl: '/api/vehicle-docs/CG11BN7867/files/doc-8' },
    ],
    dossierDownloads: {
      detailsPdfUrl: '/api/vehicle-docs/CG11BN7867/details.pdf?inline=1',
      allDocsZipUrl: '/api/vehicle-docs/CG11BN7867/zip',
      sectionZipUrls: {
        'Seller & Purchase': '/api/vehicle-docs/CG11BN7867/zip?section=Seller%20%26%20Purchase',
        'Buyer & Sale': '/api/vehicle-docs/CG11BN7867/zip?section=Buyer%20%26%20Sale',
        'Invoices & Payments': '/api/vehicle-docs/CG11BN7867/zip?section=Invoices%20%26%20Payments',
      },
    },
  },
};

const mockListingDetailData = {
  item: {
    title: 'CATERPILLAR INDIA PRIVATE LIMITED 424B',
    brand: 'Caterpillar',
    model: '424B',
    manufacturingYear: 2022,
    operatingHours: 2450,
    condition: 'Good',
    status: 'PUBLISHED',
    price: 1850000,
    vehicleIdentity: {
      registrationNumber: 'CG13LA2263',
      chassisNumber: '1M0P0214089J',
      engineNumber: '4H32011420018',
      ownerName: 'MAMCHAND BHASKAR',
    },
    location: {
      city: 'Raigarh',
      state: 'Chhattisgarh',
    },
    pricingAndFinancials: {
      customerOnRoadAskingPrice: 1950000,
      adminMarginAmount: 100000,
      deal: {
        dealStatus: 'DEAL_DONE',
        sellPrice: 1950000,
        netProfit: 100000,
      },
    },
    rtoCompliance: {
      rtoOffice: 'RTO Raigarh',
      rtoStatus: 'RTO Work In Progress',
      tax: { status: 'VALID', validUntil: '2028-03-31' },
      fitness: { status: 'VALID', validUntil: '2027-05-20' },
      insurance: { status: 'VALID', validUntil: '2026-01-15' },
      puc: { status: 'VALID' },
      hsrp: { status: 'AFFIXED' },
      hypothecation: 'No loan hypothecation noted',
    },
    media: {
      totalMediaCount: 6,
      featuredImageUrl: '/api/listings/media/featured.jpg',
      videoUrl: '/api/listings/media/video.mp4',
      slots: {
        'Meter Reading': { url: '/api/listings/media/meter.jpg' },
        'Chassis Plate': { url: '/api/listings/media/chassis.jpg' },
        'Engine View': { url: '/api/listings/media/engine.jpg' },
      },
    },
    documents: {
      invoice: { adminDownloadUrl: '/api/recruitment/admin/sell-accounts/sa-01/invoice' },
      deliveryChallan: { adminDownloadUrl: '/api/recruitment/admin/sell-accounts/sa-01/delivery-challan' },
      moneyReceipts: [
        { receiptNumber: 'RCPT-101', amount: 500000, adminDownloadUrl: '/api/receipts/rcpt-101' },
      ],
      vehicleDocsPdf: '/api/vehicle-docs/CG13LA2263/details.pdf?inline=1',
      allDocsZip: '/api/vehicle-docs/CG13LA2263/zip',
    },
  },
};

const mockSoldVehicleSearchData = {
  items: [
    {
      recordNumber: 'SA-2026-0001',
      vehicleNumber: 'CG11BN7867',
      listingTitle: 'JCB INDIA LIMITED 3DX',
      sellerName: 'SATISH KUMAR BANJARE',
      sellerNumber: '8966000253',
      purchaserName: 'ROSHAN VERMA',
      purchaserNumber: '9827154321',
      purchaserCity: 'Bilaspur',
      sellDate: '2026-11-16',
      purchaseAmount: 2200000,
      sellAmount: 2300000,
      netProfit: 100000,
      netProfitAfterGst: 82000,
      gstRatePercent: 18,
      dealStatus: 'DEAL_DONE',
    },
  ],
};

test('Verification 1: "CG11BN7867 ka Bill of Supply invoice aur payment receipt ka PDF link do"', () => {
  const prompt = 'CG11BN7867 ka Bill of Supply invoice aur payment receipt ka PDF link do';
  const route = routeAiMessage(prompt);

  assert.equal(route?.name, 'listing.detail');
  assert.equal(route?.arguments?.query, 'CG11BN7867');

  const answer = buildLocalAiAnswer({
    message: prompt,
    label: 'Listing detail',
    data: mockListingDetailData,
  });

  assert.ok(answer);
  assert.match(answer, /Bill of Supply \(Invoice\)/);
  assert.match(answer, /Money Receipt/);
  assert.match(answer, /Download Invoice PDF/);
  assert.match(answer, /Download Receipt/);
  assert.equal(answer.includes('[REDACTED'), false, 'Zero data masking');
});

test('Verification 2: "JCB 3DX ki meter reading aur chassis number ki photo dikhao"', () => {
  const prompt = 'JCB 3DX ki meter reading aur chassis number ki photo dikhao';
  const route = routeAiMessage(prompt);

  assert.equal(route?.name, 'listing.detail');
  assert.equal(route?.arguments?.query, 'JCB 3DX');

  const answer = buildLocalAiAnswer({
    message: prompt,
    label: 'Listing detail',
    data: mockListingDetailData,
  });

  assert.ok(answer);
  assert.match(answer, /Meter Reading/);
  assert.match(answer, /Chassis Plate/);
  assert.match(answer, /\[View Photo\]/);
  assert.match(answer, /1M0P0214089J/); // Chassis number present
  assert.equal(answer.includes('[REDACTED'), false, 'Zero data masking');
});

test('Verification 3: "Caterpillar 424B Raigarh wali gaadi ka pura status, owner aur RTO validity batao bina kisi masking ke"', () => {
  const prompt = 'Caterpillar 424B Raigarh wali gaadi ka pura status, owner aur RTO validity batao bina kisi masking ke';
  const route = routeAiMessage(prompt);

  assert.equal(route?.name, 'listing.detail');
  assert.equal(route?.arguments?.query, 'Caterpillar 424B Raigarh');

  const answer = buildLocalAiAnswer({
    message: prompt,
    label: 'Listing detail',
    data: mockListingDetailData,
  });

  assert.ok(answer);
  assert.match(answer, /Caterpillar/);
  assert.match(answer, /424B/);
  assert.match(answer, /MAMCHAND BHASKAR/); // Unmasked owner
  assert.match(answer, /RTO Raigarh/);
  assert.match(answer, /Road Tax:\*\*\s*VALID/);
  assert.match(answer, /Fitness:\*\*\s*VALID/);
  assert.match(answer, /Insurance:\*\*\s*VALID/);
  assert.match(answer, /2028-03-31/);
  assert.equal(answer.includes('[REDACTED'), false, 'Zero data masking');
});

test('Verification 4: "Roshan Verma ko bechi gayi machine me hume kitna net profit hua aur kitna GST kata?"', () => {
  const prompt = 'Roshan Verma ko bechi gayi machine me hume kitna net profit hua aur kitna GST kata?';
  const route = routeAiMessage(prompt);

  assert.equal(route?.name, 'sold.vehicle.search');
  assert.equal(route?.arguments?.query, 'Roshan Verma');

  const answer = buildSoldVehicleOperatorAnswer({
    message: prompt,
    toolName: 'sold.vehicle.search',
    operatorData: mockSoldVehicleSearchData,
  });

  assert.ok(answer);
  assert.match(answer, /Roshan Verma/i);
  assert.match(answer, /Net Profit \(Gross\):\s*₹1,00,000/);
  assert.match(answer, /GST Rate:\s*18%/);
  assert.equal(answer.includes('[REDACTED'), false, 'Zero data masking');
});

test('Verification 5: "CG11BN7867 ke saare kagaz aur all documents ZIP link do"', () => {
  const prompt = 'CG11BN7867 ke saare kagaz aur all documents ZIP link do';
  const route = routeAiMessage(prompt);

  assert.equal(route?.name, 'vehicle.documents.detail');
  assert.equal(route?.arguments?.query, 'CG11BN7867');

  const answer = buildVehicleDocsOperatorAnswer({
    message: prompt,
    toolName: 'vehicle.documents.detail',
    operatorData: mockVehicleDocsData,
  });

  assert.ok(answer);
  assert.match(answer, /Vehicle Documents Dossier — CG11BN7867/);
  assert.match(answer, /\[View \/ Download PDF\]\(\/api\/vehicle-docs\/CG11BN7867\/details\.pdf\?inline=1\)/);
  assert.match(answer, /\[Download All Documents ZIP\]\(\/api\/vehicle-docs\/CG11BN7867\/zip\)/);
  assert.match(answer, /Seller & Purchase/);
  assert.match(answer, /Buyer & Sale/);
  assert.match(answer, /Invoices & Payments/);
  assert.match(answer, /RTO Transfer/);
  assert.match(answer, /SATISH KUMAR BANJARE/);
  assert.match(answer, /8966000253/);
  assert.match(answer, /ROSHAN VERMA/);
  assert.match(answer, /9827154321/);
  assert.equal(answer.includes('[REDACTED'), false, 'Zero data masking');
});

test('Verification 6: "CG11BN7867 me buyer ka Aadhaar aur PAN uploaded hai ya NA hai?"', () => {
  const prompt = 'CG11BN7867 me buyer ka Aadhaar aur PAN uploaded hai ya NA hai?';
  const route = routeAiMessage(prompt);

  assert.equal(route?.name, 'vehicle.documents.detail');
  assert.equal(route?.arguments?.query, 'CG11BN7867');

  const answer = buildVehicleDocsOperatorAnswer({
    message: prompt,
    toolName: 'vehicle.documents.detail',
    operatorData: mockVehicleDocsData,
  });

  assert.ok(answer);
  assert.match(answer, /KYC & Identity Documents Status/);
  assert.match(answer, /Buyer Aadhaar card/);
  assert.match(answer, /AVAILABLE/);
  assert.match(answer, /\[👁️ View\]/);
  assert.match(answer, /\[⬇️ Download\]/);
  assert.match(answer, /9827154321/);
  assert.equal(answer.includes('[REDACTED'), false, 'Zero data masking');
});

test('Verification 7: "JCB 3DX ki Vehicle Details PDF dossier summary do"', () => {
  const prompt = 'JCB 3DX ki Vehicle Details PDF dossier summary do';
  const route = routeAiMessage(prompt);

  assert.equal(route?.name, 'vehicle.documents.detail');
  assert.equal(route?.arguments?.query, 'JCB 3DX');

  const answer = buildVehicleDocsOperatorAnswer({
    message: prompt,
    toolName: 'vehicle.documents.detail',
    operatorData: mockVehicleDocsData,
  });

  assert.ok(answer);
  assert.match(answer, /Vehicle Details (?:Summary )?PDF/);
  assert.match(answer, /\/api\/vehicle-docs\/CG11BN7867\/details\.pdf/);
  assert.match(answer, /\/api\/vehicle-docs\/CG11BN7867\/zip/);
  assert.equal(answer.includes('[REDACTED'), false, 'Zero data masking');
});

test('Verification 8: "Caterpillar 424B Raigarh wali gaadi ke kaun kaun se documents pending hain?"', () => {
  const prompt = 'Caterpillar 424B Raigarh wali gaadi ke kaun kaun se documents pending hain?';
  const route = routeAiMessage(prompt);

  assert.equal(route?.name, 'vehicle.documents.detail');
  assert.equal(route?.arguments?.query, 'Caterpillar 424B Raigarh');

  const answer = buildVehicleDocsOperatorAnswer({
    message: prompt,
    toolName: 'vehicle.documents.detail',
    operatorData: mockVehicleDocsData,
  });

  assert.ok(answer);
  assert.match(answer, /Pending & NA Documents Report/);
  assert.match(answer, /Buyer GST certificate/);
  assert.match(answer, /NOC \/ Hypothecation Clearance/);
  assert.match(answer, /NA \(Pending\): \*\*1\*\*/);
  assert.equal(answer.includes('[REDACTED'), false, 'Zero data masking');
});

test('Verification 9: "CG11BN7867 ka sale deed aur purchase deed dikhao"', () => {
  const prompt = 'CG11BN7867 ka sale deed aur purchase deed dikhao';
  const route = routeAiMessage(prompt);

  assert.equal(route?.name, 'vehicle.documents.detail');
  assert.equal(route?.arguments?.query, 'CG11BN7867');

  const answer = buildVehicleDocsOperatorAnswer({
    message: prompt,
    toolName: 'vehicle.documents.detail',
    operatorData: mockVehicleDocsData,
  });

  assert.ok(answer);
  assert.match(answer, /Vehicle Deeds/);
  assert.match(answer, /Purchase Deed/);
  assert.match(answer, /Sale Deed/);
  assert.match(answer, /SATISH KUMAR BANJARE/);
  assert.match(answer, /8966000253/);
  assert.match(answer, /ROSHAN VERMA/);
  assert.match(answer, /9827154321/);
  assert.match(answer, /Purchase deed - SA-2026-0001\.pdf/);
  assert.match(answer, /Sale deed - SA-2026-0001\.pdf/);
  assert.equal(answer.includes('[REDACTED'), false, 'Zero data masking');
});
