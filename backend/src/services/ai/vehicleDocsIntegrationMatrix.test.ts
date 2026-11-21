import assert from 'node:assert/strict';
import test from 'node:test';
import { AiReadOnlyToolsService, type AiToolContext, type AiReadOnlyToolDependencies } from './aiReadOnlyTools.service';
import { routeAiMessage, resolveAiMessage } from './aiIntentRouter.service';
import { buildVehicleDocsOperatorAnswer } from './vehicleDocsOperatorAnswer.service';
import { buildSoldVehicleOperatorAnswer } from './soldVehicleOperatorAnswer.service';
import { buildLocalAiAnswer } from './aiLocalAnswer.service';

const operatorContext: AiToolContext = {
  userId: 'emp-001',
  role: 'EMPLOYEE',
  permissions: ['accounts.sell.read', 'accounts.sell.crud'],
};

const superAdminContext: AiToolContext = {
  userId: 'super-001',
  role: 'SUPER_ADMIN',
  permissions: ['ALL_ACCESS'],
};

const adminContext: AiToolContext = {
  userId: 'admin-001',
  role: 'ADMIN',
  permissions: ['ALL_ACCESS'],
};

const unauthorizedContext: AiToolContext = {
  userId: 'emp-unauth',
  role: 'EMPLOYEE',
  permissions: ['dashboard.view'],
};

const mockFullVehicleDossier = {
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
  listing: {
    id: 'lst-101',
    title: 'JCB INDIA LIMITED 3DX',
    status: 'PUBLISHED',
    partner: 'Satya Earth Movers',
    sellerPrice: 2200000,
    finalPrice: 2300000,
    soldAt: '2026-11-16',
  },
  sales: [
    {
      id: 'sale-201',
      recordNumber: 'SA-2026-0001',
      dealStatus: 'DEAL_DONE',
      isDraft: false,
      isLocked: true,
      cancelledAt: null,
      sourceType: 'IN_HOUSE',
      sellerName: 'SATISH KUMAR BANJARE',
      sellerNumber: '8966000253',
      purchaserName: 'ROSHAN VERMA',
      purchaserNumber: '9827154321',
      purchaserCity: 'Bilaspur',
      sellDate: '2026-11-16',
      purchaseAmount: 2200000,
      sellAmount: 2300000,
      received: 2300000,
      paidToSeller: 2200000,
      invoiceNumber: 'JCBX/SV/2026-27/0001',
      creditNoteNumber: null,
    },
  ],
  rto: {
    id: 'rto-301',
    status: 'DEAL_DONE',
    office: 'RTO Janjgir-Champa',
    agent: 'Ramesh Sharma',
    hirePurchase: 'NO',
    financer: null,
    tax: ['VALID', '2027-03-31'],
    fitness: ['VALID', '2026-06-15'],
    insurance: ['VALID', '2025-08-20'],
    puc: ['VALID', '2026-05-15'],
    hsrp: ['AFFIXED', 'HSRP-99887'],
    tasks: [
      { label: 'RC Transfer', status: 'TRANSFERRED', remark: 'Smart card issued' },
      { label: 'Insurance Transfer', status: 'TRANSFERRED', remark: 'Policy updated' },
      { label: 'NOC / Hypothecation Clearance', status: 'NOT_REQUIRED', remark: 'No active hypothecation' },
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
  checklist: [
    { key: 'purchaseDeed', label: 'Purchase deed', section: 'Seller & Purchase', state: 'AVAILABLE', note: null, docIds: ['doc-1'] },
    { key: 'purchaseAadhaarCard', label: 'Seller Aadhaar card', section: 'Seller & Purchase', state: 'AVAILABLE', note: null, docIds: ['doc-2'] },
    { key: 'purchasePanCard', label: 'Seller PAN card', section: 'Seller & Purchase', state: 'AVAILABLE', note: null, docIds: ['doc-3'] },
    { key: 'sellDeed', label: 'Sale deed', section: 'Buyer & Sale', state: 'AVAILABLE', note: null, docIds: ['doc-4'] },
    { key: 'sellAadhaarCard', label: 'Buyer Aadhaar card', section: 'Buyer & Sale', state: 'AVAILABLE', note: null, docIds: ['doc-5'] },
    { key: 'sellPanCard', label: 'Buyer PAN card', section: 'Buyer & Sale', state: 'AVAILABLE', note: null, docIds: ['doc-6'] },
    { key: 'sellGstCertificate', label: 'Buyer GST certificate', section: 'Buyer & Sale', state: 'NA', note: 'Not registered for GST', docIds: [] },
    { key: 'invoice', label: 'Bill of Supply (sale invoice)', section: 'Invoices & Payments', state: 'AVAILABLE', note: null, docIds: ['doc-7'] },
    { key: 'delivery-challan', label: 'Delivery challan', section: 'Invoices & Payments', state: 'AVAILABLE', note: null, docIds: ['doc-8'] },
    { key: 'receipts', label: 'Money receipts', section: 'Invoices & Payments', state: 'AVAILABLE', note: null, docIds: ['doc-9'] },
    { key: 'rto-rcSmartCard', label: 'RC Smart Card', section: 'RTO Transfer', state: 'AVAILABLE', note: null, docIds: ['doc-10'] },
    { key: 'rto-NOC', label: 'NOC / Hypothecation Clearance', section: 'RTO Transfer', state: 'NOT_REQUIRED', note: 'No active loan', docIds: [] },
  ],
  documents: [
    { id: 'doc-1', section: 'Seller & Purchase', checklistKey: 'purchaseDeed', label: 'Purchase deed', fileName: 'Purchase deed - SA-2026-0001.pdf', mimeType: 'application/pdf', size: 102400, date: '2026-11-16', generated: false, isVideo: false },
    { id: 'doc-2', section: 'Seller & Purchase', checklistKey: 'purchaseAadhaarCard', label: 'Seller Aadhaar card', fileName: 'Seller Aadhaar - SA-2026-0001.pdf', mimeType: 'application/pdf', size: 204800, date: '2026-11-16', generated: false, isVideo: false },
    { id: 'doc-3', section: 'Seller & Purchase', checklistKey: 'purchasePanCard', label: 'Seller PAN card', fileName: 'Seller PAN - SA-2026-0001.pdf', mimeType: 'application/pdf', size: 153600, date: '2026-11-16', generated: false, isVideo: false },
    { id: 'doc-4', section: 'Buyer & Sale', checklistKey: 'sellDeed', label: 'Sale deed', fileName: 'Sale deed - SA-2026-0001.pdf', mimeType: 'application/pdf', size: 102400, date: '2026-11-16', generated: false, isVideo: false },
    { id: 'doc-5', section: 'Buyer & Sale', checklistKey: 'sellAadhaarCard', label: 'Buyer Aadhaar card', fileName: 'Buyer Aadhaar - SA-2026-0001.pdf', mimeType: 'application/pdf', size: 204800, date: '2026-11-16', generated: false, isVideo: false },
    { id: 'doc-6', section: 'Buyer & Sale', checklistKey: 'sellPanCard', label: 'Buyer PAN card', fileName: 'Buyer PAN - SA-2026-0001.pdf', mimeType: 'application/pdf', size: 153600, date: '2026-11-16', generated: false, isVideo: false },
    { id: 'doc-7', section: 'Invoices & Payments', checklistKey: 'invoice', label: 'Bill of Supply JCBX/SV/2026-27/0001', fileName: 'Bill of Supply.pdf', mimeType: 'application/pdf', size: 51200, date: '2026-11-16', generated: true, isVideo: false },
    { id: 'doc-8', section: 'Invoices & Payments', checklistKey: 'delivery-challan', label: 'Delivery challan SA-2026-0001', fileName: 'Delivery Challan.pdf', mimeType: 'application/pdf', size: 51200, date: '2026-11-16', generated: true, isVideo: false },
    { id: 'doc-9', section: 'Invoices & Payments', checklistKey: 'receipts', label: 'Money receipt RCPT-001', fileName: 'Receipt RCPT-001.pdf', mimeType: 'application/pdf', size: 51200, date: '2026-11-16', generated: true, isVideo: false },
    { id: 'doc-10', section: 'RTO Transfer', checklistKey: 'rto-rcSmartCard', label: 'RC Smart Card', fileName: 'RC Smart Card.pdf', mimeType: 'application/pdf', size: 256000, date: '2026-11-16', generated: false, isVideo: false },
    { id: 'doc-11', section: 'Listing & Photos', checklistKey: 'listing-photos', label: 'Meter reading (cover)', fileName: '01 Meter reading.jpg', mimeType: 'image/jpeg', size: 300000, date: '2026-11-16', generated: false, isVideo: false },
    { id: 'doc-12', section: 'Listing & Photos', checklistKey: 'listing-photos', label: 'Front view', fileName: '02 Front view.jpg', mimeType: 'image/jpeg', size: 350000, date: '2026-11-16', generated: false, isVideo: false },
    { id: 'doc-13', section: 'Listing & Photos', checklistKey: 'listing-video', label: 'Engine running video', fileName: '03 Engine video.mp4', mimeType: 'video/mp4', size: 12000000, date: '2026-11-16', generated: false, isVideo: true },
  ],
};

const createMockService = () => new AiReadOnlyToolsService({
  vehicleDocumentsDetail: async () => {
    const vNum = mockFullVehicleDossier.vehicleNumber;
    const encodedNum = encodeURIComponent(vNum);
    const detailsPdfUrl = `/api/vehicle-docs/${encodedNum}/details.pdf?inline=1`;
    const allDocsZipUrl = `/api/vehicle-docs/${encodedNum}/zip`;
    const sectionZipUrls: Record<string, string> = {};
    mockFullVehicleDossier.sections.forEach((sec) => {
      sectionZipUrls[sec] = `/api/vehicle-docs/${encodedNum}/zip?section=${encodeURIComponent(sec)}`;
    });

    const docsWithUrls = mockFullVehicleDossier.documents.map((d) => ({
      ...d,
      previewUrl: `/api/vehicle-docs/${encodedNum}/files/${encodeURIComponent(d.id)}?inline=1`,
      downloadUrl: `/api/vehicle-docs/${encodedNum}/files/${encodeURIComponent(d.id)}`,
    }));

    const checklistSummary = {
      totalCount: mockFullVehicleDossier.checklist.length,
      availableCount: mockFullVehicleDossier.checklist.filter((i) => i.state === 'AVAILABLE').length,
      missingNaCount: mockFullVehicleDossier.checklist.filter((i) => i.state === 'NA').length,
      notRequiredCount: mockFullVehicleDossier.checklist.filter((i) => i.state === 'NOT_REQUIRED').length,
      items: mockFullVehicleDossier.checklist.map((item) => ({
        key: item.key,
        label: item.label,
        section: item.section,
        state: item.state,
        note: item.note,
        files: docsWithUrls.filter((d) => (item.docIds as string[]).includes(d.id)),
      })),
    };

    const primarySale = mockFullVehicleDossier.sales[0]!;

    const vehicleItem = {
      vehicleNumber: vNum,
      title: mockFullVehicleDossier.title,
      category: mockFullVehicleDossier.category,
      brand: mockFullVehicleDossier.brand,
      model: mockFullVehicleDossier.model,
      year: mockFullVehicleDossier.year,
      hours: mockFullVehicleDossier.hours,
      chassisNumber: mockFullVehicleDossier.chassisNumber,
      engineNumber: mockFullVehicleDossier.engineNumber,
      location: mockFullVehicleDossier.location,
      owner: mockFullVehicleDossier.owner,
      statusBadges: {
        listingStatus: mockFullVehicleDossier.listing.status,
        dealStatus: primarySale.dealStatus,
        rtoStatus: mockFullVehicleDossier.rto.status,
      },
      listing: mockFullVehicleDossier.listing,
      parties: {
        ownerName: mockFullVehicleDossier.owner,
        sellerName: primarySale.sellerName,
        sellerNumber: primarySale.sellerNumber,
        purchaserName: primarySale.purchaserName,
        purchaserNumber: primarySale.purchaserNumber,
        purchaserCity: primarySale.purchaserCity,
      },
      sales: mockFullVehicleDossier.sales,
      rto: {
        id: mockFullVehicleDossier.rto.id,
        status: mockFullVehicleDossier.rto.status,
        office: mockFullVehicleDossier.rto.office,
        agent: mockFullVehicleDossier.rto.agent,
        hirePurchase: mockFullVehicleDossier.rto.hirePurchase,
        financer: mockFullVehicleDossier.rto.financer,
        validities: {
          tax: { status: mockFullVehicleDossier.rto.tax[0], validUntil: mockFullVehicleDossier.rto.tax[1] },
          fitness: { status: mockFullVehicleDossier.rto.fitness[0], validUntil: mockFullVehicleDossier.rto.fitness[1] },
          insurance: { status: mockFullVehicleDossier.rto.insurance[0], validUntil: mockFullVehicleDossier.rto.insurance[1] },
          puc: { status: mockFullVehicleDossier.rto.puc[0], validUntil: mockFullVehicleDossier.rto.puc[1] },
          hsrp: { status: mockFullVehicleDossier.rto.hsrp[0], number: mockFullVehicleDossier.rto.hsrp[1] },
        },
        tasks: mockFullVehicleDossier.rto.tasks,
      },
      sections: mockFullVehicleDossier.sections,
      checklist: checklistSummary,
      documents: docsWithUrls,
      dossierDownloads: {
        detailsPdfUrl,
        allDocsZipUrl,
        sectionZipUrls,
      },
    };

    return {
      found: true,
      requestedRegistration: vNum,
      vehicleNumber: vNum,
      item: vehicleItem,
      items: [{ vehicleNumber: vNum }],
      maskedFields: [],
    };
  },
} as unknown as AiReadOnlyToolDependencies);

test('Matrix 1: Role-Based Access Control and Zero Masking for Operators', async () => {
  const service = createMockService();

  // Test SUPER_ADMIN
  const superResult = await service.execute(superAdminContext, {
    name: 'vehicle.documents.detail',
    arguments: { query: 'CG11BN7867' },
  });
  assert.equal(superResult.contract.status, 'success');
  assert.equal(superResult.contract.permission, 'allowed');
  const superItem = (superResult.operatorData as any)?.item || (superResult.data as any)?.item;
  assert.equal(superItem.parties.sellerNumber, '8966000253', 'Seller number must not be masked for SUPER_ADMIN');
  assert.equal(superItem.parties.purchaserNumber, '9827154321', 'Buyer number must not be masked for SUPER_ADMIN');
  assert.equal(superItem.chassisNumber, 'RAJ3DXIN403449629', 'Chassis number must not be masked for SUPER_ADMIN');
  assert.equal(superItem.dossierDownloads.detailsPdfUrl, '[REDACTED_DOCUMENT_URL]');

  // Test ADMIN
  const adminResult = await service.execute(adminContext, {
    name: 'vehicle.documents.detail',
    arguments: { query: 'CG11BN7867' },
  });
  assert.equal(adminResult.contract.status, 'success');
  const adminItem = (adminResult.operatorData as any)?.item || (adminResult.data as any)?.item;
  assert.equal(adminItem.parties.sellerNumber, '8966000253');
  assert.equal(adminItem.parties.purchaserNumber, '9827154321');

  // Test EMPLOYEE with accounts.sell.read
  const empResult = await service.execute(operatorContext, {
    name: 'vehicle.documents.detail',
    arguments: { query: 'CG11BN7867' },
  });
  assert.equal(empResult.contract.status, 'success');
  const empItem = (empResult.operatorData as any)?.item || (empResult.data as any)?.item;
  assert.equal(empItem.parties.sellerNumber, '8966000253');
  assert.equal(empItem.parties.purchaserNumber, '9827154321');
  assert.equal(empItem.dossierDownloads.allDocsZipUrl, '[REDACTED_DOCUMENT_URL]');

  // Test UNAUTHORIZED role (CUSTOMER without sell permissions)
  await assert.rejects(
    () => service.execute(unauthorizedContext, {
      name: 'vehicle.documents.detail',
      arguments: { query: 'CG11BN7867' },
    }),
    (error: unknown) => error instanceof Error && (
      (error as any).status === 403 ||
      (error as any).code === 'AI_TOOL_PERMISSION_REQUIRED' ||
      (error as any).contract?.status === 'permission_denied'
    ),
  );
});

test('Matrix 2: Multi-Turn Conversation Dialog Flow with Follow-ups', async () => {
  const service = createMockService();
  const execResult = await service.execute(operatorContext, {
    name: 'vehicle.documents.detail',
    arguments: { query: 'CG11BN7867' },
  });
  const operatorData = execResult.operatorData || execResult.data;

  // Turn 1: Initial query
  const turn1Msg = 'CG11BN7867 ke saare documents aur dossier dikhao';
  const routed1 = routeAiMessage(turn1Msg);
  assert.deepEqual(routed1, {
    name: 'vehicle.documents.detail',
    arguments: { query: 'CG11BN7867' },
  });
  const answer1 = buildVehicleDocsOperatorAnswer({
    message: turn1Msg,
    toolName: 'vehicle.documents.detail',
    operatorData,
  });
  assert.ok(answer1);
  assert.match(answer1, /Vehicle Documents Dossier/);
  assert.match(answer1, /SATISH KUMAR BANJARE/);
  assert.match(answer1, /8966000253/);
  assert.match(answer1, /ROSHAN VERMA/);
  assert.match(answer1, /9827154321/);
  assert.match(answer1, /Bilaspur/);

  // Turn 2: Follow-up for ZIP link
  const conversation = [
    { role: 'USER' as const, content: turn1Msg },
    { role: 'ASSISTANT' as const, content: answer1, toolName: 'vehicle.documents.detail' },
  ];
  const turn2Msg = 'iska all docs zip link do';
  const resolved2 = resolveAiMessage(turn2Msg, conversation);
  assert.deepEqual(resolved2, {
    kind: 'tool',
    request: { name: 'vehicle.documents.detail', arguments: { query: 'CG11BN7867' } },
  });
  const answer2 = buildVehicleDocsOperatorAnswer({
    message: turn2Msg,
    toolName: 'vehicle.documents.detail',
    operatorData,
  });
  assert.ok(answer2);
  assert.match(answer2, /Master Dossier Downloads/);
  assert.doesNotMatch(answer2, /\/api\/vehicle-docs\/CG11BN7867\/(?:zip|details\.pdf)/);
  assert.match(answer2, /Download (?:PDF|ZIP)|secure/iu);

  // Turn 3: Follow-up for KYC (Buyer Aadhaar & PAN)
  const turn3Msg = 'buyer ka Aadhaar aur PAN uploaded hai ya NA hai?';
  const resolved3 = resolveAiMessage(turn3Msg, conversation);
  assert.deepEqual(resolved3, {
    kind: 'tool',
    request: { name: 'vehicle.documents.detail', arguments: { query: 'CG11BN7867' } },
  });
  const answer3 = buildVehicleDocsOperatorAnswer({
    message: turn3Msg,
    toolName: 'vehicle.documents.detail',
    operatorData,
  });
  assert.ok(answer3);
  assert.match(answer3, /KYC & Identity Documents Status/);
  assert.match(answer3, /Buyer Aadhaar card/);
  assert.match(answer3, /AVAILABLE/);
  assert.match(answer3, /9827154321/);

  // Turn 4: Follow-up for deeds
  const turn4Msg = 'sale deed aur purchase deed download link do';
  const resolved4 = resolveAiMessage(turn4Msg, conversation);
  assert.deepEqual(resolved4, {
    kind: 'tool',
    request: { name: 'vehicle.documents.detail', arguments: { query: 'CG11BN7867' } },
  });
  const answer4 = buildVehicleDocsOperatorAnswer({
    message: turn4Msg,
    toolName: 'vehicle.documents.detail',
    operatorData,
  });
  assert.ok(answer4);
  assert.match(answer4, /Vehicle Deeds/);
  assert.match(answer4, /Purchase deed - SA-2026-0001\.pdf/);
  assert.match(answer4, /Sale deed - SA-2026-0001\.pdf/);
  assert.match(answer4, /8966000253/);
  assert.match(answer4, /9827154321/);

  // Turn 5: Follow-up for missing/NA documents
  const turn5Msg = 'kaun se documents missing ya NA hain?';
  const resolved5 = resolveAiMessage(turn5Msg, conversation);
  assert.deepEqual(resolved5, {
    kind: 'tool',
    request: { name: 'vehicle.documents.detail', arguments: { query: 'CG11BN7867' } },
  });
  const answer5 = buildVehicleDocsOperatorAnswer({
    message: turn5Msg,
    toolName: 'vehicle.documents.detail',
    operatorData,
  });
  assert.ok(answer5);
  assert.match(answer5, /Pending & NA Documents Report/);
  assert.match(answer5, /Buyer GST certificate/);
  assert.match(answer5, /NA \(Pending\): \*\*1\*\*/);
});

test('Matrix 3: Cross-Module Field Consistency (Listing, Sale, RTO, Vault)', async () => {
  const service = createMockService();
  const execResult = await service.execute(operatorContext, {
    name: 'vehicle.documents.detail',
    arguments: { query: 'CG11BN7867' },
  });
  const item = (execResult.operatorData as any)?.item || (execResult.data as any)?.item;

  // 1. Cross-connection with Listing
  assert.equal(item.vehicleNumber, mockFullVehicleDossier.vehicleNumber);
  assert.equal(item.title, mockFullVehicleDossier.listing.title);
  assert.equal(item.listing.status, 'PUBLISHED');
  assert.equal(item.listing.finalPrice, 2300000);

  // 2. Cross-connection with Sold Vehicles / SellAccount
  const primarySale = item.sales[0];
  assert.equal(primarySale.recordNumber, 'SA-2026-0001');
  assert.equal(primarySale.dealStatus, 'DEAL_DONE');
  assert.equal(primarySale.sellerName, 'SATISH KUMAR BANJARE');
  assert.equal(primarySale.sellerNumber, '8966000253');
  assert.equal(primarySale.purchaserName, 'ROSHAN VERMA');
  assert.equal(primarySale.purchaserNumber, '9827154321');
  assert.equal(primarySale.purchaserCity, 'Bilaspur');
  assert.equal(primarySale.purchaseAmount, 2200000);
  assert.equal(primarySale.sellAmount, 2300000);
  assert.equal(primarySale.invoiceNumber, 'JCBX/SV/2026-27/0001');

  // 3. Cross-connection with RTO Work
  assert.equal(item.rto.office, 'RTO Janjgir-Champa');
  assert.equal(item.rto.status, 'DEAL_DONE');
  assert.equal(item.rto.agent, 'Ramesh Sharma');
  assert.equal(item.rto.validities.tax.status, 'VALID');
  assert.equal(item.rto.validities.fitness.status, 'VALID');
  assert.equal(item.rto.validities.insurance.status, 'VALID');
  assert.equal(item.rto.validities.puc.status, 'VALID');
  assert.equal(item.rto.validities.hsrp.status, 'AFFIXED');
  assert.equal(item.rto.validities.hsrp.number, 'HSRP-99887');

  // 4. Cross-connection with Document Files & Vault
  assert.equal(item.documents.length, 13);
  const invoiceDoc = item.documents.find((d: any) => d.checklistKey === 'invoice');
  assert.ok(invoiceDoc);
  assert.equal(invoiceDoc.previewUrl, '[REDACTED_DOCUMENT_URL]');
  assert.equal(invoiceDoc.downloadUrl, '[REDACTED_DOCUMENT_URL]');

  const meterPhoto = item.documents.find((d: any) => d.label === 'Meter reading (cover)');
  assert.ok(meterPhoto);
  assert.equal(meterPhoto.previewUrl, '[REDACTED_DOCUMENT_URL]');

  const engineVideo = item.documents.find((d: any) => d.isVideo);
  assert.ok(engineVideo);
  assert.equal(engineVideo.previewUrl, '[REDACTED_DOCUMENT_URL]');
});

test('Matrix 4: Operator Response Presentation Quality (No JSON, Valid Markdown Links)', () => {
  const operatorData = {
    found: true,
    vehicleNumber: 'CG11BN7867',
    item: {
      vehicleNumber: 'CG11BN7867',
      title: 'JCB INDIA LIMITED 3DX',
      brand: 'JCB INDIA LIMITED',
      model: '3DX',
      year: 2024,
      hours: 1250,
      chassisNumber: 'RAJ3DXIN403449629',
      engineNumber: 'H80445338',
      location: 'Bilaspur',
      owner: 'SATISH KUMAR BANJARE',
      statusBadges: { listingStatus: 'PUBLISHED', dealStatus: 'DEAL_DONE', rtoStatus: 'DEAL_DONE' },
      parties: {
        ownerName: 'SATISH KUMAR BANJARE',
        sellerName: 'SATISH KUMAR BANJARE',
        sellerNumber: '8966000253',
        purchaserName: 'ROSHAN VERMA',
        purchaserNumber: '9827154321',
        purchaserCity: 'Bilaspur',
      },
      sales: [{ recordNumber: 'SA-2026-0001', dealStatus: 'DEAL_DONE', purchaseAmount: 2200000, sellAmount: 2300000, received: 2300000, paidToSeller: 2200000, invoiceNumber: 'JCBX/SV/2026-27/0001' }],
      rto: { office: 'RTO Janjgir-Champa', status: 'DEAL_DONE', agent: 'Ramesh Sharma', validities: { tax: { status: 'VALID' } } },
      sections: ['Seller & Purchase', 'Buyer & Sale', 'Invoices & Payments', 'RTO Transfer', 'Listing & Photos', 'Other'],
      checklist: { totalCount: 2, availableCount: 1, missingNaCount: 1, notRequiredCount: 0, items: [
        { key: 'purchaseDeed', label: 'Purchase deed', section: 'Seller & Purchase', state: 'AVAILABLE' },
        { key: 'sellGstCertificate', label: 'Buyer GST certificate', section: 'Buyer & Sale', state: 'NA' },
      ] },
      documents: [
        { id: 'doc-1', section: 'Seller & Purchase', checklistKey: 'purchaseDeed', label: 'Purchase deed', fileName: 'Purchase deed.pdf', previewUrl: '/api/vehicle-docs/CG11BN7867/files/doc-1?inline=1', downloadUrl: '/api/vehicle-docs/CG11BN7867/files/doc-1' },
      ],
      dossierDownloads: {
        detailsPdfUrl: '/api/vehicle-docs/CG11BN7867/details.pdf?inline=1',
        allDocsZipUrl: '/api/vehicle-docs/CG11BN7867/zip',
        sectionZipUrls: { 'Seller & Purchase': '/api/vehicle-docs/CG11BN7867/zip?section=Seller%20%26%20Purchase' },
      },
    },
  };

  const answer = buildVehicleDocsOperatorAnswer({
    message: 'CG11BN7867 ke saare documents dikhao',
    toolName: 'vehicle.documents.detail',
    operatorData,
  });

  assert.ok(answer);

  // 1. Must NOT contain raw JSON dumps
  assert.equal(answer.includes('{"'), false, 'Response should not contain raw JSON object strings');
  assert.equal(answer.includes('": "'), false, 'Response should not contain JSON key-value formatting');

  // 2. Must contain valid markdown links
  const markdownLinks = answer.match(/\[([^\]]+)\]\(([^)]+)\)/g);
  assert.ok(markdownLinks && markdownLinks.length >= 3, 'Must contain multiple structured markdown links');
  markdownLinks.forEach((link) => {
    assert.match(link, /^\[.+\]\(\/api\/vehicle-docs\/.+\)$/);
  });

  // 3. Must cover all major sections
  assert.match(answer, /Vehicle Identity & Status/);
  assert.match(answer, /Parties Information/);
  assert.match(answer, /Master Dossier Downloads/);
  assert.match(answer, /Documents Checklist Summary/);
  assert.match(answer, /Seller & Purchase/);
  assert.match(answer, /Buyer & Sale/);
  assert.match(answer, /Invoices & Payments/);
});
