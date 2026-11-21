import assert from 'node:assert/strict';
import test from 'node:test';
import { AiReadOnlyToolsService, type AiToolContext } from './aiReadOnlyTools.service';
import { routeAiMessage, resolveAiMessage } from './aiIntentRouter.service';
import { buildVehicleDocsOperatorAnswer } from './vehicleDocsOperatorAnswer.service';
import { buildSoldVehicleOperatorAnswer } from './soldVehicleOperatorAnswer.service';
import { buildLocalAiAnswer } from './aiLocalAnswer.service';

const operatorContext: AiToolContext = {
  userId: 'emp-101',
  role: 'EMPLOYEE',
  permissions: ['ALL_ACCESS'],
};

test('Phase 1: vehicle.documents.detail enriches 6 sections, unmasked KYC, checklist, and master ZIP/PDF URLs', async () => {
  const mockVehicleData = {
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
    sections: ['Seller & Purchase', 'Buyer & Sale', 'Invoices & Payments', 'RTO Transfer', 'Listing & Photos', 'Other'] as any,
    checklist: [
      { key: 'purchaseDeed', label: 'Purchase deed', section: 'Seller & Purchase', state: 'AVAILABLE', note: null, docIds: ['doc-1'] },
      { key: 'purchaseAadhaarCard', label: 'Seller Aadhaar card', section: 'Seller & Purchase', state: 'AVAILABLE', note: null, docIds: ['doc-2'] },
      { key: 'sellDeed', label: 'Sale deed', section: 'Buyer & Sale', state: 'AVAILABLE', note: null, docIds: ['doc-3'] },
      { key: 'sellAadhaarCard', label: 'Buyer Aadhaar card', section: 'Buyer & Sale', state: 'AVAILABLE', note: null, docIds: ['doc-4'] },
      { key: 'sellGstCertificate', label: 'Buyer GST certificate', section: 'Buyer & Sale', state: 'NA', note: null, docIds: [] },
      { key: 'invoice', label: 'Bill of Supply (sale invoice)', section: 'Invoices & Payments', state: 'AVAILABLE', note: null, docIds: ['doc-5'] },
      { key: 'delivery-challan', label: 'Delivery challan', section: 'Invoices & Payments', state: 'AVAILABLE', note: null, docIds: ['doc-6'] },
      { key: 'receipts', label: 'Money receipts', section: 'Invoices & Payments', state: 'AVAILABLE', note: null, docIds: ['doc-7'] },
      { key: 'rto-NOC', label: 'NOC / Hypothecation Clearance', section: 'RTO Transfer', state: 'NOT_REQUIRED', note: 'Not required', docIds: [] },
    ] as any,
    documents: [
      { id: 'doc-1', section: 'Seller & Purchase', checklistKey: 'purchaseDeed', label: 'Purchase deed', fileName: 'Purchase deed - SA-2026-0001.pdf', mimeType: 'application/pdf', size: 102400, date: '2026-11-16', generated: false, isVideo: false },
      { id: 'doc-2', section: 'Seller & Purchase', checklistKey: 'purchaseAadhaarCard', label: 'Seller Aadhaar card', fileName: 'Seller Aadhaar - SA-2026-0001.pdf', mimeType: 'application/pdf', size: 204800, date: '2026-11-16', generated: false, isVideo: false },
      { id: 'doc-3', section: 'Buyer & Sale', checklistKey: 'sellDeed', label: 'Sale deed', fileName: 'Sale deed - SA-2026-0001.pdf', mimeType: 'application/pdf', size: 102400, date: '2026-11-16', generated: false, isVideo: false },
      { id: 'doc-4', section: 'Buyer & Sale', checklistKey: 'sellAadhaarCard', label: 'Buyer Aadhaar card', fileName: 'Buyer Aadhaar - SA-2026-0001.pdf', mimeType: 'application/pdf', size: 204800, date: '2026-11-16', generated: false, isVideo: false },
      { id: 'doc-5', section: 'Invoices & Payments', checklistKey: 'invoice', label: 'Bill of Supply JCBX/SV/2026-27/0001', fileName: 'Bill of Supply JCBX-SV-2026-27-0001.pdf', mimeType: 'application/pdf', size: 51200, date: '2026-11-16', generated: true, isVideo: false },
      { id: 'doc-6', section: 'Invoices & Payments', checklistKey: 'delivery-challan', label: 'Delivery challan SA-2026-0001', fileName: 'Delivery Challan SA-2026-0001.pdf', mimeType: 'application/pdf', size: 51200, date: '2026-11-16', generated: true, isVideo: false },
      { id: 'doc-7', section: 'Invoices & Payments', checklistKey: 'receipts', label: 'Money receipt RCPT-001', fileName: 'Receipt RCPT-001.pdf', mimeType: 'application/pdf', size: 51200, date: '2026-11-16', generated: true, isVideo: false },
      { id: 'doc-8', section: 'Listing & Photos', checklistKey: 'listing-photos', label: 'Meter reading (cover)', fileName: '01 Meter reading.jpg', mimeType: 'image/jpeg', size: 300000, date: '2026-11-16', generated: false, isVideo: false },
      { id: 'doc-9', section: 'Listing & Photos', checklistKey: 'listing-video', label: 'Video', fileName: '02 Video.mp4', mimeType: 'video/mp4', size: 15000000, date: '2026-11-16', generated: false, isVideo: true },
    ] as any,
  };

  const service = new AiReadOnlyToolsService({
    vehicleDocumentsDetail: async () => {
      const vNum = mockVehicleData.vehicleNumber;
      const encodedNum = encodeURIComponent(vNum);
      const detailsPdfUrl = `/api/vehicle-docs/${encodedNum}/details.pdf?inline=1`;
      const allDocsZipUrl = `/api/vehicle-docs/${encodedNum}/zip`;
      const sectionZipUrls: Record<string, string> = {
        'Seller & Purchase': `/api/vehicle-docs/${encodedNum}/zip?section=${encodeURIComponent('Seller & Purchase')}`,
        'Buyer & Sale': `/api/vehicle-docs/${encodedNum}/zip?section=${encodeURIComponent('Buyer & Sale')}`,
        'Invoices & Payments': `/api/vehicle-docs/${encodedNum}/zip?section=${encodeURIComponent('Invoices & Payments')}`,
        'RTO Transfer': `/api/vehicle-docs/${encodedNum}/zip?section=${encodeURIComponent('RTO Transfer')}`,
        'Listing & Photos': `/api/vehicle-docs/${encodedNum}/zip?section=${encodeURIComponent('Listing & Photos')}`,
        Other: `/api/vehicle-docs/${encodedNum}/zip?section=Other`,
      };

      const docsWithUrls = mockVehicleData.documents.map((doc: any) => ({
        id: doc.id,
        section: doc.section,
        checklistKey: doc.checklistKey,
        label: doc.label,
        fileName: doc.fileName,
        mimeType: doc.mimeType,
        size: doc.size,
        date: doc.date,
        generated: doc.generated,
        isVideo: doc.isVideo,
        previewUrl: `/api/vehicle-docs/${encodedNum}/files/${encodeURIComponent(doc.id)}?inline=1`,
        downloadUrl: `/api/vehicle-docs/${encodedNum}/files/${encodeURIComponent(doc.id)}`,
      }));

      const checklistSummary = {
        totalCount: mockVehicleData.checklist.length,
        availableCount: mockVehicleData.checklist.filter((i: any) => i.state === 'AVAILABLE').length,
        missingNaCount: mockVehicleData.checklist.filter((i: any) => i.state === 'NA').length,
        notRequiredCount: mockVehicleData.checklist.filter((i: any) => i.state === 'NOT_REQUIRED').length,
        items: mockVehicleData.checklist.map((item: any) => ({
          key: item.key,
          label: item.label,
          section: item.section,
          state: item.state,
          note: item.note,
          files: docsWithUrls.filter((d: any) => item.docIds.includes(d.id)),
        })),
      };

      const primarySale = mockVehicleData.sales[0]!;

      const item = {
        vehicleNumber: vNum,
        title: mockVehicleData.title,
        category: mockVehicleData.category,
        brand: mockVehicleData.brand,
        model: mockVehicleData.model,
        year: mockVehicleData.year,
        hours: mockVehicleData.hours,
        chassisNumber: mockVehicleData.chassisNumber,
        engineNumber: mockVehicleData.engineNumber,
        location: mockVehicleData.location,
        owner: mockVehicleData.owner,
        statusBadges: {
          listingStatus: mockVehicleData.listing.status,
          dealStatus: primarySale.dealStatus,
          rtoStatus: mockVehicleData.rto.status,
        },
        listing: mockVehicleData.listing,
        parties: {
          ownerName: mockVehicleData.owner,
          sellerName: primarySale.sellerName,
          sellerNumber: primarySale.sellerNumber,
          purchaserName: primarySale.purchaserName,
          purchaserNumber: primarySale.purchaserNumber,
          purchaserCity: primarySale.purchaserCity,
        },
        sales: mockVehicleData.sales,
        rto: {
          id: mockVehicleData.rto.id,
          status: mockVehicleData.rto.status,
          office: mockVehicleData.rto.office,
          agent: mockVehicleData.rto.agent,
          hirePurchase: mockVehicleData.rto.hirePurchase,
          financer: mockVehicleData.rto.financer,
          validities: {
            tax: { status: mockVehicleData.rto.tax[0], validUntil: mockVehicleData.rto.tax[1] },
            fitness: { status: mockVehicleData.rto.fitness[0], validUntil: mockVehicleData.rto.fitness[1] },
            insurance: { status: mockVehicleData.rto.insurance[0], validUntil: mockVehicleData.rto.insurance[1] },
            puc: { status: mockVehicleData.rto.puc[0], validUntil: mockVehicleData.rto.puc[1] },
            hsrp: { status: mockVehicleData.rto.hsrp[0], number: mockVehicleData.rto.hsrp[1] },
          },
          tasks: mockVehicleData.rto.tasks,
        },
        sections: mockVehicleData.sections,
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
        requestedRegistration: 'CG11BN7867',
        vehicleNumber: vNum,
        item,
        items: [
          {
            vehicleNumber: vNum,
            vehicle: { brand: mockVehicleData.brand, type: mockVehicleData.category, model: mockVehicleData.model },
            rtoOffice: mockVehicleData.rto.office,
            rtoStatus: mockVehicleData.rto.status,
            documents: {
              tax: { status: mockVehicleData.rto.tax[0], validUntil: mockVehicleData.rto.tax[1] },
              fitness: { status: mockVehicleData.rto.fitness[0], validUntil: mockVehicleData.rto.fitness[1] },
              insurance: { status: mockVehicleData.rto.insurance[0], validUntil: mockVehicleData.rto.insurance[1] },
              puc: { status: mockVehicleData.rto.puc[0], validUntil: mockVehicleData.rto.puc[1] },
              hsrp: { status: mockVehicleData.rto.hsrp[0], validUntil: null },
            },
            pendingDocuments: checklistSummary.items.filter((i: any) => i.state === 'NA').map((i: any) => ({
              task: i.label,
              taskKey: i.key,
              status: 'PENDING',
              optional: false,
              proofUploaded: false,
              updatedAt: new Date().toISOString(),
              dueDate: null,
            })),
          },
        ],
        dueDateStatus: 'NOT_CONFIGURED',
        dueDateMessage: 'RTO transfer task schema में due date field configured नहीं है',
        maskedFields: [],
      };
    },
  } as any);

  const result = await service.execute(operatorContext, {
    name: 'vehicle.documents.detail',
    arguments: { query: 'CG11BN7867' },
  });

  assert.equal(result.toolName, 'vehicle.documents.detail');
  assert.equal(result.dataAvailability, 'AVAILABLE');

  const item = (result.operatorData as any)?.item || (result.data as any)?.item;
  assert.ok(item, 'Item should be present in enriched payload');
  assert.equal(item.vehicleNumber, 'CG11BN7867');
  assert.equal(item.title, 'JCB INDIA LIMITED 3DX');
  assert.equal(item.chassisNumber, 'RAJ3DXIN403449629');
  assert.equal(item.engineNumber, 'H80445338');

  // Verify Zero Masking for operator:
  assert.equal(item.parties.sellerName, 'SATISH KUMAR BANJARE');
  assert.equal(item.parties.sellerNumber, '8966000253');
  assert.equal(item.parties.purchaserName, 'ROSHAN VERMA');
  assert.equal(item.parties.purchaserNumber, '9827154321');
  assert.equal(item.parties.purchaserCity, 'Bilaspur');

  // Verify Checklist:
  assert.equal(item.checklist.totalCount, 9);
  assert.equal(item.checklist.availableCount, 7);
  assert.equal(item.checklist.missingNaCount, 1);
  assert.equal(item.checklist.notRequiredCount, 1);

  // Verify Master Dossier Downloads (PDF and ZIP):
  assert.equal(item.dossierDownloads.detailsPdfUrl, '[REDACTED_DOCUMENT_URL]');
  assert.equal(item.dossierDownloads.allDocsZipUrl, '[REDACTED_DOCUMENT_URL]');
  assert.equal(item.dossierDownloads.sectionZipUrls['Buyer & Sale'], '[REDACTED_DOCUMENT_URL]');

  // Verify Documents with direct Preview & Download links:
  assert.equal(item.documents.length, 9);
  const purchaseDeed = item.documents.find((d: any) => d.checklistKey === 'purchaseDeed');
  assert.ok(purchaseDeed);
  assert.equal(purchaseDeed.previewUrl, '[REDACTED_DOCUMENT_URL]');
  assert.equal(purchaseDeed.downloadUrl, '[REDACTED_DOCUMENT_URL]');

  const video = item.documents.find((d: any) => d.isVideo);
  assert.ok(video);
  assert.equal(video.label, 'Video');
  assert.equal(video.previewUrl, '[REDACTED_DOCUMENT_URL]');
});

test('Phase 2: Intent Router correctly routes vehicle docs, deeds, missing/NA, ZIP and PDF requests', () => {
  // Direct registration number routing for various vehicle document intents
  assert.deepEqual(routeAiMessage('CG11BN7867 ke saare documents aur kagaz dikhao'), {
    name: 'vehicle.documents.detail',
    arguments: { query: 'CG11BN7867' },
  });

  assert.deepEqual(routeAiMessage('CG11BN7867 ka all documents ZIP link do'), {
    name: 'vehicle.documents.detail',
    arguments: { query: 'CG11BN7867' },
  });

  assert.deepEqual(routeAiMessage('CG11BN7867 ka vehicle details summary PDF dossier do'), {
    name: 'vehicle.documents.detail',
    arguments: { query: 'CG11BN7867' },
  });

  assert.deepEqual(routeAiMessage('CG11BN7867 me buyer ka Aadhaar aur PAN uploaded hai ya NA hai?'), {
    name: 'vehicle.documents.detail',
    arguments: { query: 'CG11BN7867' },
  });

  assert.deepEqual(routeAiMessage('CG11BN7867 ka sale deed aur purchase deed dikhao'), {
    name: 'vehicle.documents.detail',
    arguments: { query: 'CG11BN7867' },
  });

  assert.deepEqual(routeAiMessage('CG11BN7867 ke kaun kaun se documents pending ya NA hain?'), {
    name: 'vehicle.documents.detail',
    arguments: { query: 'CG11BN7867' },
  });

  // Descriptive vehicle subject matching
  assert.deepEqual(routeAiMessage('JCB 3DX Bilaspur ke saare kagaz aur ZIP link do'), {
    name: 'vehicle.documents.detail',
    arguments: { query: 'JCB 3DX Bilaspur' },
  });

  assert.deepEqual(routeAiMessage('Caterpillar 424B Raigarh wali gaadi ke kaun se documents pending hain?'), {
    name: 'vehicle.documents.detail',
    arguments: { query: 'Caterpillar 424B Raigarh' },
  });
});

test('Phase 2: Continuation context preserves vehicle docs follow-up requests', () => {
  const context = [
    { role: 'USER' as const, content: 'CG11BN7867 ke saare documents dikhao' },
    { role: 'ASSISTANT' as const, content: 'Here are the vehicle documents.', toolName: 'vehicle.documents.detail' },
  ];

  // Follow-up 1: Pronoun + ZIP
  const res1 = resolveAiMessage('iska all docs zip link do', context);
  assert.deepEqual(res1, {
    kind: 'tool',
    request: { name: 'vehicle.documents.detail', arguments: { query: 'CG11BN7867' } },
  });

  // Follow-up 2: Specific document (Buyer Aadhaar)
  const res2 = resolveAiMessage('buyer ka Aadhaar card dikhao', context);
  assert.deepEqual(res2, {
    kind: 'tool',
    request: { name: 'vehicle.documents.detail', arguments: { query: 'CG11BN7867' } },
  });

  // Follow-up 3: Missing / NA documents
  const res3 = resolveAiMessage('kaun se documents missing ya NA hain?', context);
  assert.deepEqual(res3, {
    kind: 'tool',
    request: { name: 'vehicle.documents.detail', arguments: { query: 'CG11BN7867' } },
  });
});

test('Phase 3: buildVehicleDocsOperatorAnswer produces rich ChatGPT-style response with direct links and zero masking', () => {
  const mockItem = {
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
    },
    sections: ['Seller & Purchase', 'Buyer & Sale', 'Invoices & Payments', 'RTO Transfer', 'Listing & Photos', 'Other'],
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
  };

  const operatorData = {
    found: true,
    vehicleNumber: 'CG11BN7867',
    item: mockItem,
  };

  // Test 1: Full comprehensive dossier response
  const fullAns = buildVehicleDocsOperatorAnswer({
    message: 'CG11BN7867 ke saare documents dikhao',
    toolName: 'vehicle.documents.detail',
    operatorData,
  });

  assert.ok(fullAns);
  assert.match(fullAns, /CG11BN7867/);
  assert.match(fullAns, /RAJ3DXIN403449629/); // Unmasked Chassis
  assert.match(fullAns, /H80445338/); // Unmasked Engine
  assert.match(fullAns, /SATISH KUMAR BANJARE/); // Unmasked Owner/Seller
  assert.match(fullAns, /8966000253/); // Unmasked Seller phone
  assert.match(fullAns, /ROSHAN VERMA/); // Unmasked Buyer
  assert.match(fullAns, /9827154321/); // Unmasked Buyer phone
  assert.match(fullAns, /Bilaspur/); // Buyer city
  assert.match(fullAns, /\/api\/vehicle-docs\/CG11BN7867\/details\.pdf\?inline=1/); // Vehicle details PDF
  assert.match(fullAns, /\/api\/vehicle-docs\/CG11BN7867\/zip/); // All Docs ZIP
  assert.match(fullAns, /Seller & Purchase/);
  assert.match(fullAns, /Buyer & Sale/);
  assert.match(fullAns, /Invoices & Payments/);
  assert.match(fullAns, /JCBX\/SV\/2026-27\/0001/); // Invoice number
  assert.match(fullAns, /RTO Janjgir-Champa/); // RTO Office

  // Test 2: Missing / Pending / NA documents response
  const pendingAns = buildVehicleDocsOperatorAnswer({
    message: 'CG11BN7867 ke kaun kaun se documents pending ya NA hain?',
    toolName: 'vehicle.documents.detail',
    operatorData,
  });

  assert.ok(pendingAns);
  assert.match(pendingAns, /Pending & NA Documents Report/);
  assert.match(pendingAns, /Buyer GST certificate/);
  assert.match(pendingAns, /NOC \/ Hypothecation Clearance/);
  assert.match(pendingAns, /Available: \*\*7\*\*/);
  assert.match(pendingAns, /NA \(Pending\): \*\*1\*\*/);

  // Test 3: KYC response
  const kycAns = buildVehicleDocsOperatorAnswer({
    message: 'CG11BN7867 me buyer ka Aadhaar aur PAN uploaded hai ya NA hai?',
    toolName: 'vehicle.documents.detail',
    operatorData,
  });

  assert.ok(kycAns);
  assert.match(kycAns, /KYC & Identity Documents Status/);
  assert.match(kycAns, /Buyer Aadhaar card/);
  assert.match(kycAns, /9827154321/);
  assert.match(kycAns, /AVAILABLE/);

  // Test 4: Deeds response
  const deedsAns = buildVehicleDocsOperatorAnswer({
    message: 'CG11BN7867 ka sale deed aur purchase deed dikhao',
    toolName: 'vehicle.documents.detail',
    operatorData,
  });

  assert.ok(deedsAns);
  assert.match(deedsAns, /Vehicle Deeds/);
  assert.match(deedsAns, /Purchase deed - SA-2026-0001\.pdf/);
  assert.match(deedsAns, /Sale deed - SA-2026-0001\.pdf/);
  assert.match(deedsAns, /8966000253/);
  assert.match(deedsAns, /9827154321/);

  // Test 5: ZIP / PDF only response
  const zipAns = buildVehicleDocsOperatorAnswer({
    message: 'CG11BN7867 ka all documents ZIP link do',
    toolName: 'vehicle.documents.detail',
    operatorData,
  });

  assert.ok(zipAns);
  assert.match(zipAns, /Master Dossier Downloads/);
  assert.match(zipAns, /\/api\/vehicle-docs\/CG11BN7867\/zip/);
  assert.match(zipAns, /\/api\/vehicle-docs\/CG11BN7867\/details\.pdf/);

  // Test 6: Integration with buildSoldVehicleOperatorAnswer
  const integratedAns = buildSoldVehicleOperatorAnswer({
    message: 'CG11BN7867 ke saare documents dikhao',
    toolName: 'vehicle.documents.detail',
    operatorData,
  });
  assert.equal(integratedAns, fullAns);

  // Test 7: Integration with buildLocalAiAnswer
  const localAns = buildLocalAiAnswer({
    message: 'CG11BN7867 ke saare documents dikhao',
    label: 'Vehicle documents detail',
    data: operatorData,
  });
  assert.equal(localAns, fullAns);
});
