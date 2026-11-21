import assert from 'node:assert/strict';
import test from 'node:test';
import { AiReadOnlyToolsService, type AiToolContext } from './aiReadOnlyTools.service';
import { routeAiMessage, resolveAiMessage, type AiIntentContextMessage } from './aiIntentRouter.service';
import { buildLocalAiAnswer } from './aiLocalAnswer.service';

const operatorContext: AiToolContext = {
  userId: 'emp-101',
  role: 'EMPLOYEE',
  permissions: ['ALL_ACCESS'],
};

test('listingDetail builds 14 media slots, document links, RTO compliance, and financials', async () => {
  const mockListing = {
    id: 'b1234567-89ab-4cde-8f01-23456789abcd',
    title: 'JCB INDIA LIMITED 3DX',
    category: { name: 'Excavator (NT)' },
    brand: { name: 'JCB INDIA LIMITED' },
    model: { name: '3DX' },
    price: 2300000,
    isNegotiable: false,
    manufacturingYear: 2024,
    operatingHours: 1200,
    locationCity: 'Bilaspur',
    locationState: 'Chhattisgarh',
    address: 'Bilaspur Yard, NH-49',
    condition: 'Excellent',
    grossPower: '74 HP',
    status: 'AVAILABLE',
    views: 45,
    createdAt: new Date('2026-11-16T10:00:00Z'),
    updatedAt: new Date('2026-11-16T12:00:00Z'),
    registrationNumberKey: 'CG11BN7867',
    chassisNumberKey: 'RAJ3DXINA03449629',
    engineNumber: 'H00445338',
    ownerName: 'ROSHAN VERMA',
    adminMarginAmount: 100000,
    adminExpenseAmount: 20000,
    adminExpenseBreakdown: { transport: 15000, servicing: 5000 },
    partner: {
      name: 'Satya Earth Movers',
      phone: '8966000253',
      email: 'satya@example.com',
      partnerProfile: {
        businessName: 'SATYA EARTH MOVERS',
        partnerCode: 'CG-BIL-001',
        contactPhone: '8966000253',
        whatsappNumber: '8966000253',
        city: 'Bilaspur',
        state: 'Chhattisgarh',
      },
    },
    media: [
      { id: 'm1', slot: 'front_right', type: 'IMAGE', url: '/api/documents/upload/public/drive/img-front-right', isFeatured: true, createdAt: new Date() },
      { id: 'm2', slot: 'rear_left', type: 'IMAGE', url: '/api/documents/upload/public/drive/img-rear-left', isFeatured: false, createdAt: new Date() },
      { id: 'm3', slot: 'chassis_number', type: 'IMAGE', url: '/api/documents/upload/public/drive/img-chassis', isFeatured: false, createdAt: new Date() },
      { id: 'm4', slot: 'meter_reading', type: 'IMAGE', url: '/api/documents/upload/public/drive/img-meter', isFeatured: false, createdAt: new Date() },
      { id: 'm5', slot: 'dashboard_front', type: 'IMAGE', url: '/api/documents/upload/public/drive/img-dashboard', isFeatured: false, createdAt: new Date() },
      { id: 'm6', slot: 'video', type: 'VIDEO', url: '/api/documents/upload/public/drive/vid-walkaround.mp4', isFeatured: false, createdAt: new Date() },
    ],
    vehicleVerification: {
      status: 'API_VERIFIED',
      verificationSource: 'RC_FULL',
      verifiedRegistrationNumber: 'CG11BN7867',
      verifiedChassisNumber: 'RAJ3DXINA03449629',
      verifiedEngineNumber: 'H00445338',
      lastVerifiedAt: new Date('2026-11-16T11:00:00Z'),
      updatedAt: new Date('2026-11-16T11:00:00Z'),
    },
    rtoRecords: [
      {
        id: 'rto-1',
        vehicleNumber: 'CG11BN7867',
        brandName: 'JCB INDIA LIMITED',
        vehicleModel: '3DX',
        vehicleType: 'COMMERCIAL',
        rtoOffice: 'RTO Janjgir-Champa',
        rtoStatus: 'IN_PROGRESS',
        taxStatus: 'VALID',
        taxValidUntil: new Date('2027-03-31T00:00:00Z'),
        fitnessStatus: 'VALID',
        fitnessValidUntil: new Date('2027-10-31T00:00:00Z'),
        insuranceStatus: 'VALID',
        insuranceValidUntil: new Date('2027-08-15T00:00:00Z'),
        pucStatus: 'VALID',
        pucValidUntil: new Date('2027-05-15T00:00:00Z'),
        hsrpStatus: 'COMPLETED',
        documentSendDate: new Date('2026-11-17T00:00:00Z'),
        transferTasks: [
          { id: 'task-1', taskKey: 'NOC', label: 'RTO NOC Issuance', status: 'COMPLETED', isOptional: false, documents: [{ id: 'd1' }], updatedAt: new Date() },
          { id: 'task-2', taskKey: 'SMART_CARD', label: 'Smart Card Transfer', status: 'IN_PROGRESS', isOptional: false, documents: null, updatedAt: new Date() },
        ],
      },
    ],
    saleRecord: null,
    sellAccount: {
      id: 'deal-32e28d69-5b6e-41b8-a1dd-850528f6ad09',
      recordNumber: 'SA-2026-0001',
      isDraft: false,
      dealStatus: 'CLOSED',
      ownerName: 'ROSHAN VERMA',
      ownerNumber: '9183433895',
      vehicleNumber: 'CG11BN7867',
      chassisNumber: 'RAJ3DXINA03449629',
      sellerName: 'SATYA EARTH MOVERS',
      sellerNumber: '8966000253',
      purchaserName: 'ROSHAN VERMA',
      purchaserNumber: '9183433895',
      purchaseAmount: 2100000,
      sellAmount: 2400000,
      expenses: 20000,
      balanceAmount: 0,
      netProfit: 280000,
      netProfitAfterGst: 237288.14,
      gstRatePercent: 18,
      taxMode: 'INCLUSIVE',
      expenseBreakdown: { transport: 15000, servicing: 5000 },
      invoiceNumber: 'JCBX/SV/2026-27/0001',
      invoiceGeneratedAt: new Date('2026-11-17T09:30:00Z'),
      invoiceTokenExpiresAt: new Date('2027-05-17T09:30:00Z'),
      creditNoteNumber: null,
      remarks: 'Clean sale verified',
      transferDetails: 'No active bank hypothecation / loan',
      payments: [
        {
          id: 'pay-42e28d69-5b6e-41b8-a1dd-850528f6ad09',
          side: 'PURCHASER_RECEIPT',
          amount: 2400000,
          paymentDate: new Date('2026-11-17T09:00:00Z'),
          method: 'BANK_TRANSFER',
          reference: 'UTR123456789',
          drawnOn: 'SBI Khamhardih',
          receiptStatus: 'ISSUED',
          receiptNumber: 'RCPT-0001',
          receiptTokenExpiresAt: new Date('2027-05-17T09:00:00Z'),
          issuedAt: new Date('2026-11-17T09:00:00Z'),
        },
      ],
    },
  };

  const service = new AiReadOnlyToolsService({
    listingDetail: async () => {
      const featuredMedia = mockListing.media.find((m) => m.isFeatured) || mockListing.media[0];
      const videoMedia = mockListing.media.find((m) => m.type === 'VIDEO');
      const data = {
        found: true,
        item: {
          listingId: mockListing.id,
          title: mockListing.title,
          category: mockListing.category.name,
          brand: mockListing.brand.name,
          model: mockListing.model.name,
          price: mockListing.price,
          negotiable: mockListing.isNegotiable,
          manufacturingYear: mockListing.manufacturingYear,
          operatingHours: mockListing.operatingHours,
          location: { city: mockListing.locationCity, state: mockListing.locationState, address: mockListing.address },
          condition: mockListing.condition,
          grossPower: mockListing.grossPower,
          status: mockListing.status,
          views: mockListing.views,
          createdAt: mockListing.createdAt.toISOString(),
          updatedAt: mockListing.updatedAt.toISOString(),
          vehicleIdentity: {
            registrationNumber: mockListing.registrationNumberKey,
            chassisNumber: mockListing.chassisNumberKey,
            engineNumber: mockListing.engineNumber,
            ownerName: mockListing.ownerName,
            verificationStatus: mockListing.vehicleVerification.status,
            verificationSource: mockListing.vehicleVerification.verificationSource,
            lastVerifiedAt: mockListing.vehicleVerification.lastVerifiedAt.toISOString(),
          },
          pricingAndFinancials: {
            sellerListingPrice: mockListing.price,
            adminMarginAmount: mockListing.adminMarginAmount,
            adminExpenseAmount: mockListing.adminExpenseAmount,
            adminExpenseBreakdown: mockListing.adminExpenseBreakdown,
            customerOnRoadAskingPrice: mockListing.price + mockListing.adminMarginAmount + mockListing.adminExpenseAmount,
            deal: {
              dealStatus: mockListing.sellAccount.dealStatus,
              isDraft: mockListing.sellAccount.isDraft,
              purchasePrice: mockListing.sellAccount.purchaseAmount,
              sellPrice: mockListing.sellAccount.sellAmount,
              expenses: mockListing.sellAccount.expenses,
              netProfit: mockListing.sellAccount.netProfit,
              netProfitAfterGst: mockListing.sellAccount.netProfitAfterGst,
              gstRatePercent: mockListing.sellAccount.gstRatePercent,
              taxMode: mockListing.sellAccount.taxMode,
              balanceAmount: mockListing.sellAccount.balanceAmount,
              purchaserName: mockListing.sellAccount.purchaserName,
              purchaserNumber: mockListing.sellAccount.purchaserNumber,
              sellerName: mockListing.sellAccount.sellerName,
              sellerNumber: mockListing.sellAccount.sellerNumber,
            },
          },
          rtoCompliance: {
            vehicleNumber: mockListing.rtoRecords[0]!.vehicleNumber,
            rtoOffice: mockListing.rtoRecords[0]!.rtoOffice,
            rtoStatus: mockListing.rtoRecords[0]!.rtoStatus,
            documentSendDate: mockListing.rtoRecords[0]!.documentSendDate.toISOString(),
            tax: { status: mockListing.rtoRecords[0]!.taxStatus, validUntil: mockListing.rtoRecords[0]!.taxValidUntil.toISOString() },
            fitness: { status: mockListing.rtoRecords[0]!.fitnessStatus, validUntil: mockListing.rtoRecords[0]!.fitnessValidUntil.toISOString() },
            insurance: { status: mockListing.rtoRecords[0]!.insuranceStatus, validUntil: mockListing.rtoRecords[0]!.insuranceValidUntil.toISOString() },
            puc: { status: mockListing.rtoRecords[0]!.pucStatus, validUntil: mockListing.rtoRecords[0]!.pucValidUntil.toISOString() },
            hsrp: { status: mockListing.rtoRecords[0]!.hsrpStatus },
            hypothecation: mockListing.sellAccount.transferDetails,
            transferTasks: mockListing.rtoRecords[0]!.transferTasks,
          },
          media: {
            totalMediaCount: mockListing.media.length,
            featuredImageUrl: featuredMedia?.url || null,
            videoUrl: videoMedia?.url || null,
            slots: {
              frontRight: mockListing.media[0],
              rearLeft: mockListing.media[1],
              chassisNumber: mockListing.media[2],
              meterReading: mockListing.media[3],
              dashboardFront: mockListing.media[4],
            },
            items: mockListing.media,
          },
          documents: {
            invoice: {
              invoiceNumber: mockListing.sellAccount.invoiceNumber,
              generatedAt: mockListing.sellAccount.invoiceGeneratedAt.toISOString(),
              adminDownloadUrl: `/api/recruitment/admin/sell-accounts/${mockListing.sellAccount.id}/invoice`,
            },
            deliveryChallan: {
              adminDownloadUrl: `/api/recruitment/admin/sell-accounts/${mockListing.sellAccount.id}/delivery-challan`,
            },
            moneyReceipts: [
              {
                paymentId: mockListing.sellAccount.payments[0]!.id,
                receiptNumber: mockListing.sellAccount.payments[0]!.receiptNumber,
                amount: mockListing.sellAccount.payments[0]!.amount,
                paymentDate: mockListing.sellAccount.payments[0]!.paymentDate.toISOString(),
                method: mockListing.sellAccount.payments[0]!.method,
                receiptStatus: mockListing.sellAccount.payments[0]!.receiptStatus,
                adminDownloadUrl: `/api/recruitment/admin/sell-accounts/${mockListing.sellAccount.id}/payments/${mockListing.sellAccount.payments[0]!.id}/receipt`,
              },
            ],
            vehicleDocsPdf: `/api/vehicle-docs/CG11BN7867/details.pdf?inline=1`,
            allDocsZip: `/api/vehicle-docs/CG11BN7867/zip`,
          },
          partner: mockListing.partner.partnerProfile,
          soldAt: mockListing.sellAccount.invoiceGeneratedAt.toISOString(),
          soldPrice: mockListing.sellAccount.sellAmount,
          invoiceNo: mockListing.sellAccount.invoiceNumber,
        },
      };
      return { data, uiActions: [] };
    },
  } as any);

  const result = await service.execute(operatorContext, {
    name: 'listing.detail',
    arguments: { query: 'CG11BN7867' },
  });

  assert.equal(result.toolName, 'listing.detail');
  assert.equal(result.dataAvailability, 'AVAILABLE');
  const item = (result.operatorData as any)?.item || (result.data as any)?.item;
  assert.ok(item, 'Item should be present');
  assert.equal(item.title, 'JCB INDIA LIMITED 3DX');
  assert.equal(item.vehicleIdentity.registrationNumber, 'CG11BN7867');
  assert.equal(item.vehicleIdentity.chassisNumber, 'RAJ3DXINA03449629');
  assert.equal(item.vehicleIdentity.ownerName, 'ROSHAN VERMA');
  assert.equal(item.pricingAndFinancials.deal.netProfit, 280000);
  assert.equal(item.rtoCompliance.tax.status, 'VALID');
  assert.equal(item.documents.invoice.invoiceNumber, 'JCBX/SV/2026-27/0001');
  assert.equal(item.media.totalMediaCount, 6);
});

test('buildLocalAiAnswer produces structured ChatGPT-style markdown without raw JSON', () => {
  const item = {
    title: 'JCB INDIA LIMITED 3DX',
    brand: 'JCB INDIA LIMITED',
    model: '3DX',
    price: 2300000,
    manufacturingYear: 2024,
    operatingHours: 1200,
    condition: 'Excellent',
    status: 'AVAILABLE',
    location: { city: 'Bilaspur', state: 'Chhattisgarh' },
    vehicleIdentity: {
      registrationNumber: 'CG11BN7867',
      chassisNumber: 'RAJ3DXINA03449629',
      engineNumber: 'H00445338',
      ownerName: 'ROSHAN VERMA',
      verificationStatus: 'API_VERIFIED',
    },
    pricingAndFinancials: {
      sellerListingPrice: 2300000,
      customerOnRoadAskingPrice: 2420000,
      adminMarginAmount: 100000,
      deal: {
        dealStatus: 'CLOSED',
        sellPrice: 2400000,
        netProfit: 280000,
      },
    },
    rtoCompliance: {
      rtoOffice: 'RTO Janjgir-Champa',
      rtoStatus: 'IN_PROGRESS',
      tax: { status: 'VALID', validUntil: '2027-03-31T00:00:00Z' },
      fitness: { status: 'VALID', validUntil: '2027-10-31T00:00:00Z' },
      insurance: { status: 'VALID', validUntil: '2027-08-15T00:00:00Z' },
      puc: { status: 'VALID' },
      hsrp: { status: 'COMPLETED' },
      hypothecation: 'No active bank loan',
    },
    media: {
      totalMediaCount: 6,
      featuredImageUrl: '/api/documents/upload/public/drive/img-front-right',
      videoUrl: '/api/documents/upload/public/drive/vid-walkaround.mp4',
      slots: {
        frontRight: { url: '/api/documents/upload/public/drive/img-front-right' },
        meterReading: { url: '/api/documents/upload/public/drive/img-meter' },
        dashboardFront: { url: '/api/documents/upload/public/drive/img-dashboard' },
      },
    },
    documents: {
      invoice: {
        invoiceNumber: 'JCBX/SV/2026-27/0001',
        adminDownloadUrl: '/api/recruitment/admin/sell-accounts/deal-1/invoice',
      },
      deliveryChallan: {
        adminDownloadUrl: '/api/recruitment/admin/sell-accounts/deal-1/delivery-challan',
      },
      moneyReceipts: [
        {
          receiptNumber: 'RCPT-0001',
          amount: 2400000,
          adminDownloadUrl: '/api/recruitment/admin/sell-accounts/deal-1/payments/pay-1/receipt',
        },
      ],
      vehicleDocsPdf: '/api/vehicle-docs/CG11BN7867/details.pdf?inline=1',
      allDocsZip: '/api/vehicle-docs/CG11BN7867/zip',
    },
  };

  const answer = buildLocalAiAnswer({
    message: 'CG11BN7867 ka poora details batao',
    label: 'Listing detail',
    dataAvailability: 'AVAILABLE',
    data: { found: true, item },
  });

  // Must have clear headings
  assert.match(answer, /### 🚜 JCB INDIA LIMITED 3DX/);
  assert.match(answer, /1\. Vehicle Identity & Specifications/);
  assert.match(answer, /2\. Pricing & Commercial Financials/);
  assert.match(answer, /3\. RTO & Transfer Compliance/);
  assert.match(answer, /4\. Media & Photos/);
  assert.match(answer, /5\. Documents & Download Links/);

  // Must have unmasked values
  assert.match(answer, /CG11BN7867/);
  assert.match(answer, /RAJ3DXINA03449629/);
  assert.match(answer, /H00445338/);
  assert.match(answer, /ROSHAN VERMA/);
  assert.match(answer, /₹24,00,000/);
  assert.match(answer, /₹2,80,000/);

  // Must have direct links
  assert.match(answer, /\[Download Invoice PDF\]/);
  assert.match(answer, /\[Download Delivery Challan\]/);
  assert.match(answer, /\[Download Receipt\]/);
  assert.match(answer, /\[View Photo\]/);
  assert.match(answer, /\[Watch Video\]/);

  // Strictly no raw JSON
  assert.doesNotMatch(answer, /\{"found":/);
  assert.doesNotMatch(answer, /```json/);
});

test('intent router maps various vehicle natural language questions directly to listing.detail', () => {
  const cases = [
    { query: 'CG11BN7867 ka photo dikhao', expectedArg: 'CG11BN7867' },
    { query: 'CG 11 BN 7867 ka image dikhao', expectedArg: 'CG11BN7867' },
    { query: 'CG11BN7867 ka meter reading ya dashboard dikhao', expectedArg: 'CG11BN7867' },
    { query: 'CG11BN7867 ka invoice ya bill do', expectedArg: 'CG11BN7867' },
    { query: 'CG11BN7867 ka margin ya profit kitna hua', expectedArg: 'CG11BN7867' },
    { query: 'chassis RAJ3DXINA03449629 ka full details batao', expectedArg: 'RAJ3DXINA03449629' },
    { query: 'chassis RAJ3DXINA03449629 ka photo dikhao', expectedArg: 'RAJ3DXINA03449629' },
  ];

  for (const tc of cases) {
    const routed = routeAiMessage(tc.query);
    assert.equal(routed?.name, 'listing.detail', `Failed routing for "${tc.query}"`);
    assert.equal(routed?.arguments?.query, tc.expectedArg, `Failed query argument for "${tc.query}"`);
  }
});

test('continuation follow-ups preserve vehicle listing context seamlessly', () => {
  const history: AiIntentContextMessage[] = [
    { role: 'USER', content: 'CG11BN7867 ka details batao' },
    { role: 'ASSISTANT', content: 'Listing details fetched.', toolName: 'listing.detail', toolArguments: { query: 'CG11BN7867' } },
  ];

  const followUp1 = resolveAiMessage('iska photo dikhao', history);
  assert.deepEqual(followUp1, {
    kind: 'tool',
    request: { name: 'listing.detail', arguments: { query: 'CG11BN7867' } },
  });

  const followUp2 = resolveAiMessage('iska invoice do', history);
  assert.deepEqual(followUp2, {
    kind: 'tool',
    request: { name: 'listing.detail', arguments: { query: 'CG11BN7867' } },
  });

  const followUp3 = resolveAiMessage('meter reading dikhao', history);
  assert.deepEqual(followUp3, {
    kind: 'tool',
    request: { name: 'listing.detail', arguments: { query: 'CG11BN7867' } },
  });

  const followUp4 = resolveAiMessage('margin kitna bacha', history);
  assert.deepEqual(followUp4, {
    kind: 'tool',
    request: { name: 'listing.detail', arguments: { query: 'CG11BN7867' } },
  });
});

test('Phase 5 Verification Checklist: routes all 4 user realistic operational prompts accurately', () => {
  // Prompt 1: Registration with Invoice & Receipt
  const p1 = routeAiMessage('CG11BN7867 ka Bill of Supply invoice aur payment receipt ka PDF link do');
  assert.equal(p1?.name, 'listing.detail');
  assert.equal(p1?.arguments?.query, 'CG11BN7867');

  // Prompt 2: Brand/Model with Meter reading & Chassis photo
  const p2 = routeAiMessage('JCB 3DX ki meter reading aur chassis number ki photo dikhao');
  assert.equal(p2?.name, 'listing.detail');
  assert.equal(p2?.arguments?.query, 'JCB 3DX');

  // Prompt 3: Brand/Model/City with Status, Owner and RTO validity without masking
  const p3 = routeAiMessage('Caterpillar 424B Raigarh wali gaadi ka pura status, owner aur RTO validity batao bina kisi masking ke');
  assert.equal(p3?.name, 'listing.detail');
  assert.equal(p3?.arguments?.query, 'Caterpillar 424B Raigarh');

  // Prompt 4: Sold Machine by Purchaser Name with Net Profit & GST
  const p4 = routeAiMessage('Roshan Verma ko bechi gayi machine me hume kitna net profit hua aur kitna GST kata?');
  assert.equal(p4?.name, 'sold.vehicle.search');
  assert.equal(p4?.arguments?.query, 'Roshan Verma');
});
