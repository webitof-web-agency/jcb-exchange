import test from 'node:test';
import assert from 'node:assert/strict';
import { routeAiMessage } from './aiIntentRouter.service';
import { buildVerificationOperatorAnswer } from './verificationOperatorAnswer.service';
import { buildSoldVehicleOperatorAnswer } from './soldVehicleOperatorAnswer.service';

test('routes partner-specific queries to partner.verification.dossier across Hindi, Hinglish, and English', () => {
  const cases: Array<{ query: string; expectedTarget: string }> = [
    { query: 'Satya Earth Movers ka number batao', expectedTarget: 'Satya Earth Movers' },
    { query: 'Satya Earth Movers ka phone number kya hai', expectedTarget: 'Satya Earth Movers' },
    { query: 'Satya Earth Movers ka contact do', expectedTarget: 'Satya Earth Movers' },
    { query: 'Satya Earth Movers ka malik kaun hai', expectedTarget: 'Satya Earth Movers' },
    { query: 'Satya Earth Movers ka profile batao', expectedTarget: 'Satya Earth Movers' },
    { query: 'Satya Earth Movers ka stock kitna hai', expectedTarget: 'Satya Earth Movers' },
    { query: 'Satya Earth Movers ka KYC status', expectedTarget: 'Satya Earth Movers' },
    { query: 'Satya Earth Movers ka RTO status batao', expectedTarget: 'Satya Earth Movers' },
    { query: 'Satya Earth Movers ke documents dikhao', expectedTarget: 'Satya Earth Movers' },
    { query: 'ct-raipur-satya ka detail batao', expectedTarget: 'ct-raipur-satya' },
    { query: 'ap-akasahebpet-harsh ka kyc status', expectedTarget: 'ap-akasahebpet-harsh' },
    { query: 'Webitof ka owner kaun hai', expectedTarget: 'Webitof' },
    { query: 'Webitof ka contact number do', expectedTarget: 'Webitof' },
  ];

  for (const { query, expectedTarget } of cases) {
    const routed = routeAiMessage(query);
    assert.ok(routed, `Expected route for query: "${query}"`);
    assert.equal(routed.name, 'partner.verification.dossier', `Query "${query}" should route to partner.verification.dossier`);
    assert.equal(routed.arguments.query, expectedTarget, `Target for "${query}" should be "${expectedTarget}"`);
  }
});

test('routes partner directory and all partner requests to partner.statistics', () => {
  const dirCases = [
    'partner directory dikhao',
    'dealership directory batao',
    'all partners dikhao',
    'sabhi partners ki list',
    'partners list batao',
    'which partners are there',
  ];

  for (const query of dirCases) {
    const routed = routeAiMessage(query);
    assert.ok(routed, `Expected route for query: "${query}"`);
    assert.equal(routed.name, 'partner.statistics', `Query "${query}" should route to partner.statistics`);
  }
});

test('routes pageContext for /employee/partners and /employee/partner-agreements correctly', () => {
  // 1. All Partners Page
  const partnersPage = { groupKey: 'partners', moduleKey: 'partners', moduleLabel: 'All Partners' };
  const allPartnersRoute = routeAiMessage('summary batao', partnersPage);
  assert.ok(allPartnersRoute);
  assert.equal(allPartnersRoute.name, 'partner.statistics');

  const partnerSearchRoute = routeAiMessage('Satya Earth Movers ka status', partnersPage);
  assert.ok(partnerSearchRoute);
  assert.equal(partnerSearchRoute.name, 'partner.verification.dossier');
  assert.equal(partnerSearchRoute.arguments.query, 'Satya Earth Movers');

  // 2. Partner Agreements Page
  const agreementsPage = { groupKey: 'partners', moduleKey: 'partner-agreements', moduleLabel: 'Partner Agreements' };
  const agreementRoute = routeAiMessage('agreements dikhao', agreementsPage);
  assert.ok(agreementRoute);
  assert.equal(agreementRoute.name, 'partner.agreements.summary');
});

test('buildVerificationOperatorAnswer renders Partner Agreements table correctly', () => {
  const mockAgreements = {
    total: 2,
    items: [
      {
        agreementId: 'agr-01',
        agreementType: 'MARKETPLACE_TERMS',
        title: 'Partner Marketplace Agreement',
        version: '2.0',
        applicablePartnerTypes: ['SHOWROOM', 'BROKER'],
        isRequired: true,
        status: 'ACTIVE',
        totalAcceptances: 15,
      },
      {
        agreementId: 'agr-02',
        agreementType: 'DATA_GOVERNANCE',
        title: 'Data Protection & Governance Policy',
        version: '1.2',
        applicablePartnerTypes: [],
        isRequired: false,
        status: 'ACTIVE',
        totalAcceptances: 12,
      },
    ],
  };

  const answer = buildVerificationOperatorAnswer({
    message: 'partner agreements dikhao',
    toolName: 'partner.agreements.summary',
    operatorData: mockAgreements,
  });

  assert.ok(answer);
  assert.match(answer, /Partner Agreements & Governance Policies/);
  assert.match(answer, /Partner Marketplace Agreement/);
  assert.match(answer, /MARKETPLACE_TERMS/);
  assert.match(answer, /v2\.0/);
  assert.match(answer, /Mandatory/);
  assert.match(answer, /15 Signed/);
  assert.match(answer, /Data Protection & Governance Policy/);
});

test('buildVerificationOperatorAnswer outputs unmasked phone and owner details for narrow questions', () => {
  const mockDossier = {
    found: true,
    partnerId: 'user-satya-01',
    partnerCode: 'ct-raipur-satya',
    businessName: 'SATYA EARTH MOVERS',
    ownerName: 'SATYA EARTH MOVERS',
    partnerType: 'Authorized Place',
    contact: {
      mobile: '8966000253',
      alternateMobile: '9988776655',
      whatsappNumber: '8966000253',
      email: 'jcb.bilaspur@teamsatya.in',
    },
    location: {
      businessAddress: 'Main Highway Road',
      district: 'Raipur',
      city: 'Raipur',
      state: 'Chhattisgarh',
      pinCode: '492001',
    },
    businessDetails: {
      gstNumber: '22AAAAA0000A1Z5',
      businessRegistrationNumber: 'REG-1234',
      yearsInBusiness: 12,
      teamSize: 25,
    },
    status: {
      kycStatus: 'APPROVED',
      accountStatus: 'ACTIVE',
      onboardingStatus: 'COMPLETED',
      appliedOn: '2026-11-16T00:00:00.000Z',
    },
    documents: [],
    reviewHistory: [],
    agreements: [],
    inventory: [],
    deals: [],
    rtoRecords: [],
  };

  // Test phone question
  const phoneAns = buildVerificationOperatorAnswer({
    message: 'Satya Earth Movers ka mobile number batao',
    toolName: 'partner.verification.dossier',
    operatorData: mockDossier,
  });
  assert.ok(phoneAns);
  assert.match(phoneAns, /8966000253/);
  assert.match(phoneAns, /jcb\.bilaspur@teamsatya\.in/);
  assert.match(phoneAns, /https:\/\/wa\.me\/918966000253/);
  assert.equal(phoneAns.includes('***'), false);

  // Test owner question
  const ownerAns = buildVerificationOperatorAnswer({
    message: 'Satya Earth Movers ka malik kaun hai',
    toolName: 'partner.verification.dossier',
    operatorData: mockDossier,
  });
  assert.ok(ownerAns);
  assert.match(ownerAns, /SATYA EARTH MOVERS/);
  assert.match(ownerAns, /8966000253/);

  // Test GST question
  const gstAns = buildVerificationOperatorAnswer({
    message: 'Satya Earth Movers ka GSTIN batao',
    toolName: 'partner.verification.dossier',
    operatorData: mockDossier,
  });
  assert.ok(gstAns);
  assert.match(gstAns, /22AAAAA0000A1Z5/);
});

test('buildVerificationOperatorAnswer renders complete 360° dossier with connected fleet, sold deals, and RTO transfers', () => {
  const mockCompleteDossier = {
    found: true,
    partnerId: 'user-satya-01',
    partnerCode: 'ct-raipur-satya',
    businessName: 'SATYA EARTH MOVERS',
    ownerName: 'SATYA EARTH MOVERS',
    partnerType: 'Authorized Place',
    contact: {
      mobile: '8966000253',
      whatsappNumber: '8966000253',
      email: 'jcb.bilaspur@teamsatya.in',
    },
    location: {
      businessAddress: 'Raipur Bypass',
      district: 'Raipur',
      city: 'Raipur',
      state: 'Chhattisgarh',
      pinCode: '492001',
    },
    businessDetails: {
      gstNumber: '22AAAAA0000A1Z5',
      yearsInBusiness: 10,
      teamSize: 15,
    },
    status: {
      kycStatus: 'APPROVED',
      accountStatus: 'ACTIVE',
      onboardingStatus: 'COMPLETED',
      appliedOn: '2026-11-16T00:00:00.000Z',
    },
    documents: [
      {
        documentType: 'GST_CERTIFICATE',
        label: 'GST Certificate',
        isMandatory: true,
        status: 'VERIFIED',
        fileUrl: '/uploads/kyc/satya-gst.pdf',
      },
    ],
    reviewHistory: [],
    agreements: [
      {
        agreementType: 'PLATFORM_PARTNER_AGREEMENT',
        version: '1.0',
        acceptedAt: '2026-11-16T12:00:00.000Z',
      },
    ],
    inventory: [
      {
        id: 'list-01',
        title: 'JCB 3DX Super Backhoe Loader',
        registrationNumber: 'CG 04 HA 1234',
        price: 2450000,
        status: 'PUBLISHED',
        hours: 1200,
        listingUrl: '/employee/listings/list-01',
      },
    ],
    deals: [
      {
        id: 'deal-01',
        recordNumber: 'SALE-2026-001',
        invoiceNumber: 'INV-2026-88',
        vehicleNumber: 'CG 13 LA 2263',
        dealStatus: 'DEAL_DONE',
        purchaserName: 'VIKASH KUMAR',
        purchaserPhone: '9334240136',
        sellAmount: 2800000,
        netProfit: 150000,
        invoicePdfUrl: '/api/recruitment/admin/sell-accounts/deal-01/invoice',
        deliveryChallanUrl: '/api/recruitment/admin/sell-accounts/deal-01/delivery-challan',
      },
    ],
    rtoRecords: [
      {
        id: 'rto-01',
        vehicleNumber: 'CG 13 LA 2263',
        status: 'DEAL_DONE',
        rtoOffice: 'RAIGARH DTO',
        rtoAgentName: 'SUNIL AGARWAL',
        rtoAgentPhone: '9876543210',
        totalExpenses: 0,
        advancePaid: 0,
        balanceDue: 0,
        isLocked: true,
        rtoWorkUrl: '/employee/accounts/rto-work-status/CG%2013%20LA%202263',
      },
    ],
  };

  const dossierAnswer = buildVerificationOperatorAnswer({
    message: 'Satya Earth Movers ka pura dossier batao',
    toolName: 'partner.verification.dossier',
    operatorData: mockCompleteDossier,
  });

  assert.ok(dossierAnswer);
  // Verify unmasked details
  assert.match(dossierAnswer, /8966000253/);
  assert.match(dossierAnswer, /jcb\.bilaspur@teamsatya\.in/);
  assert.match(dossierAnswer, /ct-raipur-satya/);
  assert.match(dossierAnswer, /22AAAAA0000A1Z5/);

  // Verify inventory section
  assert.match(dossierAnswer, /JCB 3DX Super Backhoe Loader/);
  assert.match(dossierAnswer, /CG 04 HA 1234/);
  assert.match(dossierAnswer, /24,50,000/);

  // Verify deals section with unmasked purchaser
  assert.match(dossierAnswer, /VIKASH KUMAR/);
  assert.match(dossierAnswer, /9334240136/);
  assert.match(dossierAnswer, /CG 13 LA 2263/);
  assert.match(dossierAnswer, /INV-2026-88/);
  assert.match(dossierAnswer, /\/api\/recruitment\/admin\/sell-accounts\/deal-01\/invoice/);

  // Verify RTO transfer section
  assert.match(dossierAnswer, /RAIGARH DTO/);
  assert.match(dossierAnswer, /SUNIL AGARWAL/);
  assert.match(dossierAnswer, /Locked/);

  // Verify direct downloads section
  assert.match(dossierAnswer, /Download Bill of Supply/);
  assert.match(dossierAnswer, /Download Delivery Challan/);
  assert.match(dossierAnswer, /satya-gst\.pdf/);
});

test('buildVerificationOperatorAnswer renders Partner Directory table matching live UI', () => {
  const mockDirectory = {
    total: 2,
    items: [
      {
        partnerCode: 'ct-raipur-satya',
        businessName: 'SATYA EARTH MOVERS',
        ownerName: 'SATYA EARTH MOVERS',
        partnerType: 'Authorized Place',
        accountStatus: 'ACTIVE',
        kycStatus: 'APPROVED',
        mobile: '8966000253',
        email: 'jcb.bilaspur@teamsatya.in',
        territory: 'Raipur, bilaspur, Chhattisgarh',
        inventoryCount: 0,
        joinedDate: '2026-11-16',
      },
      {
        partnerCode: 'ap-akasahebpet-harsh',
        businessName: 'WEBITOF',
        ownerName: 'harsh',
        partnerType: 'Authorized Place',
        accountStatus: 'ACTIVE',
        kycStatus: 'APPROVED',
        mobile: '8443322334',
        email: 'harsh@webitof.com',
        territory: 'Akasahebpet, Andhra Pradesh',
        inventoryCount: 0,
        joinedDate: '2026-11-18',
      },
    ],
  };

  const dirAnswer = buildVerificationOperatorAnswer({
    message: 'all partners dikhao',
    toolName: 'partner.statistics',
    operatorData: mockDirectory,
  });

  assert.ok(dirAnswer);
  assert.match(dirAnswer, /SATYA EARTH MOVERS/);
  assert.match(dirAnswer, /ct-raipur-satya/);
  assert.match(dirAnswer, /8966000253/);
  assert.match(dirAnswer, /jcb\.bilaspur@teamsatya\.in/);
  assert.match(dirAnswer, /WEBITOF/);
  assert.match(dirAnswer, /ap-akasahebpet-harsh/);
  assert.match(dirAnswer, /8443322334/);
  assert.match(dirAnswer, /harsh@webitof\.com/);
  assert.equal(dirAnswer.includes('***'), false);
});

test('buildSoldVehicleOperatorAnswer provides instant Bill of Supply download for RTO invoice query', () => {
  const mockRtoData = {
    found: true,
    vehicle: {
      registrationNumber: 'CG 13 LA 2263',
      brand: 'CAT',
      model: '424B',
      type: 'BACK HOE LOADER',
    },
    rto: {
      office: 'RAIGARH DTO',
      status: 'DEAL_DONE',
      isLocked: true,
      expenses: { total: 0, advance: 0, balance: 0 },
    },
    parties: {
      customer: { name: 'SATYA EARTH MOVERS', number: '8966000253' },
      seller: { name: 'SATYA EARTH MOVERS', number: '8966000253' },
      purchaser: { name: 'VIKASH KUMAR', number: '9334240136' },
    },
    soldVehicle: {
      id: 'sell-acc-cg13',
      recordNumber: 'SALE-2026-099',
      invoiceNumber: 'CG13LA2263-INV',
      status: 'DEAL_DONE',
      sellAmount: 2500000,
    },
    tasks: { items: [], completed: 4, total: 4, pending: 0 },
    documents: { items: [], availableCount: 4, total: 4 },
  };

  const invoiceAnswer = buildSoldVehicleOperatorAnswer({
    message: 'CG 13 LA 2263 ka invoice PDF nikalo',
    toolName: 'rto.work.detail',
    operatorData: mockRtoData,
  });

  assert.ok(invoiceAnswer);
  assert.match(invoiceAnswer, /Official Sale Invoice \(Bill of Supply\)/);
  assert.match(invoiceAnswer, /CG13LA2263-INV/);
  assert.match(invoiceAnswer, /VIKASH KUMAR/);
  assert.match(invoiceAnswer, /9334240136/);
  assert.match(invoiceAnswer, /\/api\/recruitment\/admin\/sell-accounts\/sell-acc-cg13\/invoice/);
});
