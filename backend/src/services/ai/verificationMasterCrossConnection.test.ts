import test from 'node:test';
import assert from 'node:assert/strict';
import { routeAiMessage } from './aiIntentRouter.service';
import { buildVerificationOperatorAnswer } from './verificationOperatorAnswer.service';

test('routes partner verification queue queries across English, Hindi, Hinglish, and typos', () => {
  const queueCases = [
    'show partner verification queue',
    'सत्यापन कतार दिखाओ',
    'partner verification queue batao',
    'show partnr verfication queue',
    'kitne partner verification cases pending hain',
    'aaj kitne submission aaye verification queue me',
    'showroom verification pending kitne hain',
    'partner kyc queue dikhao',
  ];

  for (const query of queueCases) {
    const routed = routeAiMessage(query);
    assert.ok(routed, `Expected route for: ${query}`);
    assert.equal(routed.name, 'partner.verification.queue', `Query "${query}" should route to partner.verification.queue`);
  }
});

test('routes partner verification dossier queries by partner code, business name, and review context', () => {
  const codeRouted = routeAiMessage('JCB-PAR-001 ke documents dikhao');
  assert.ok(codeRouted);
  assert.equal(codeRouted.name, 'partner.verification.dossier');
  assert.equal(codeRouted.arguments.query, 'JCB-PAR-001');

  const nameRouted = routeAiMessage('ABC Motors ka KYC status batao');
  assert.ok(nameRouted);
  assert.equal(nameRouted.name, 'partner.verification.dossier');
  assert.equal(nameRouted.arguments.query, 'ABC Motors');

  const hindiRouted = routeAiMessage('ABC Motors का सत्यापन विवरण दिखाओ');
  assert.ok(hindiRouted);
  assert.equal(hindiRouted.name, 'partner.verification.dossier');
  assert.equal(hindiRouted.arguments.query, 'ABC Motors');

  const typoRouted = routeAiMessage('ABC Motors ka verfication dossir');
  assert.ok(typoRouted);
  assert.equal(typoRouted.name, 'partner.verification.dossier');
  assert.equal(typoRouted.arguments.query, 'ABC Motors');
});

test('routes pageContext for /admin/verifications and /admin/verifications/:id correctly', () => {
  // 1. Queue Page
  const queueContext = { groupKey: 'operations', moduleKey: 'verifications', moduleLabel: 'Partner KYC Verifications Queue' };
  const queueRouted = routeAiMessage('pending cases batao', queueContext);
  assert.ok(queueRouted);
  assert.equal(queueRouted.name, 'partner.verification.queue');

  // 2. Specific Partner on Queue Page
  const searchOnQueue = routeAiMessage('ABC Motors ka review karo', queueContext);
  assert.ok(searchOnQueue);
  assert.equal(searchOnQueue.name, 'partner.verification.dossier');
  assert.equal(searchOnQueue.arguments.query, 'ABC Motors');

  // 3. Detail Review Page
  const detailContext = { groupKey: 'operations', moduleKey: 'verification-detail', moduleLabel: 'Partner KYC Review Dossier', recordId: 'user-uuid-1234' };
  const detailRouted = routeAiMessage('documents check karo', detailContext);
  assert.ok(detailRouted);
  assert.equal(detailRouted.name, 'partner.verification.dossier');
  assert.equal(detailRouted.arguments.partnerId, 'user-uuid-1234');
});

test('does not route vehicle registration numbers to partner verification', () => {
  const vehicleQuery = routeAiMessage('CG 04 CX 2978 ka verification batao');
  assert.ok(vehicleQuery);
  assert.notEqual(vehicleQuery.name, 'partner.verification.queue');
  assert.notEqual(vehicleQuery.name, 'partner.verification.dossier');
});

test('buildVerificationOperatorAnswer generates ChatGPT-style rich markdown for queue mode with zero masking', () => {
  const answer = buildVerificationOperatorAnswer({
    message: 'partner verification queue dikhao',
    toolName: 'partner.verification.queue',
    operatorData: {
      scope: 'CURRENT_REALTIME_OPERATIONS',
      isRealtimeCurrentState: true,
      periodDays: null,
      totalQueue: 3,
      submittedCount: 1,
      underReviewCount: 1,
      changesRequestedCount: 1,
      showroomCount: 2,
      brokerCount: 1,
      todayCount: 1,
      oldestPending: {
        businessName: 'Raipur Earthmovers',
        daysWaiting: 4,
        appliedOn: '2026-11-16T10:00:00.000Z',
      },
      items: [
        {
          id: 'user-1',
          partnerCode: 'JCB-PAR-001',
          businessName: 'ABC Heavy Machinery',
          ownerName: 'Ramesh Patel',
          partnerType: 'SHOWROOM',
          mobile: '9876543210',
          email: 'ramesh@abcmachinery.com',
          city: 'Raipur',
          state: 'Chhattisgarh',
          appliedOn: '2026-11-20T08:30:00.000Z',
          kycStatus: 'SUBMITTED',
          onboardingStatus: 'SUBMITTED',
          documentsCount: 6,
          reviewUrl: '/admin/verifications/abc-heavy-machinery-user-1',
        },
      ],
    },
  });

  // Verify KPI Grid
  assert.match(answer, /3 Cases Pending Action/);
  assert.match(answer, /Submitted \(New\):\*\* \*\*1\*\*/);
  assert.match(answer, /Under Review:\*\* \*\*1\*\*/);
  assert.match(answer, /Changes Requested:\*\* \*\*1\*\*/);
  assert.match(answer, /Showrooms:\*\* \*\*2\*\*/);
  assert.match(answer, /Oldest Pending Case:\*\* \*\*Raipur Earthmovers\*\* \(4 days ago\)/);

  // Verify Unmasked Queue Table
  assert.match(answer, /ABC Heavy Machinery/);
  assert.match(answer, /JCB-PAR-001/);
  assert.match(answer, /Ramesh Patel/);
  assert.match(answer, /📞 9876543210/);
  assert.match(answer, /Raipur, Chhattisgarh/);
  assert.match(answer, /\[Review KYC Dossier\]\(\/admin\/verifications\/abc-heavy-machinery-user-1\)/);
  assert.doesNotMatch(answer, /\[REDACTED/);
});

test('buildVerificationOperatorAnswer generates 360° dossier with dynamic 6 documents, reviewer comments, and audit trail', () => {
  const answer = buildVerificationOperatorAnswer({
    message: 'ABC Heavy Machinery ka KYC dossier dikhao',
    toolName: 'partner.verification.dossier',
    operatorData: {
      found: true,
      partnerId: 'user-uuid-1',
      partnerCode: 'JCB-PAR-001',
      businessName: 'ABC Heavy Machinery',
      ownerName: 'Ramesh Patel',
      partnerType: 'SHOWROOM',
      contact: {
        mobile: '9876543210',
        whatsappNumber: '9876543210',
        email: 'ramesh@abcmachinery.com',
      },
      location: {
        businessAddress: 'Plot 45, Ring Road Industrial Area',
        district: 'Raipur',
        pinCode: '492001',
        city: 'Raipur',
        state: 'Chhattisgarh',
      },
      businessDetails: {
        gstNumber: '22AAAAA0000A1Z5',
        businessRegistrationNumber: 'REG-CG-2021-9876',
        yearsInBusiness: 8,
        teamSize: 15,
      },
      status: {
        kycStatus: 'CHANGES_REQUESTED',
        onboardingStatus: 'CHANGES_REQUESTED',
        accountStatus: 'PENDING',
        appliedOn: '2026-11-18T10:00:00.000Z',
      },
      documents: [
        {
          documentType: 'GST_CERTIFICATE',
          label: 'GST Certificate',
          isMandatory: true,
          status: 'CHANGES_REQUESTED',
          reviewComment: 'GST certificate blurred hai, clear scanned copy upload karein.',
          verificationStatus: 'FAILED',
          fileUrl: '/api/files/kyc-gst.pdf',
          templateUrl: '/api/admin/verifications/user-uuid-1/documents/doc-1/template',
        },
        {
          documentType: 'PAN_CARD',
          label: 'PAN Card',
          isMandatory: false,
          status: 'VERIFIED',
          reviewComment: null,
          verificationStatus: 'SUCCESS',
          fileUrl: '/api/files/kyc-pan.jpg',
          templateUrl: null,
        },
        {
          documentType: 'AADHAAR_CARD',
          label: 'Aadhaar Card',
          isMandatory: false,
          status: 'VERIFIED',
          reviewComment: null,
          verificationStatus: 'SUCCESS',
          fileUrl: '/api/files/kyc-aadhaar.pdf',
          templateUrl: null,
        },
        {
          documentType: 'PASSPORT_PHOTO',
          label: 'Passport Photo',
          isMandatory: false,
          status: 'UPLOADED',
          reviewComment: null,
          verificationStatus: 'NOT_STARTED',
          fileUrl: '/api/files/kyc-photo.jpg',
          templateUrl: null,
        },
        {
          documentType: 'CANCELLED_CHEQUE',
          label: 'Cancelled Cheque',
          isMandatory: false,
          status: 'MISSING',
          reviewComment: null,
          verificationStatus: 'NOT_STARTED',
          fileUrl: null,
          templateUrl: null,
        },
        {
          documentType: 'AUTHORIZED_PERSON_ID',
          label: 'Authorized Person ID',
          isMandatory: false,
          status: 'MISSING',
          reviewComment: null,
          verificationStatus: 'NOT_STARTED',
          fileUrl: null,
          templateUrl: null,
        },
      ],
      reviewHistory: [
        {
          id: 'review-1',
          action: 'CHANGES_REQUESTED',
          comment: 'GST copy not readable. Please upload clear scan.',
          createdAt: '2026-11-19T14:30:00.000Z',
        },
      ],
      agreements: [
        { agreementType: 'PARTNER_TERMS', version: '2.0', acceptedAt: '2026-11-18T10:05:00.000Z' },
        { agreementType: 'MARKETPLACE_TERMS', version: '1.5', acceptedAt: '2026-11-18T10:05:00.000Z' },
      ],
      reviewUrl: '/admin/verifications/abc-heavy-machinery-user-uuid-1',
      maskedFields: [],
    },
  });

  // Header & Unmasked Profile
  assert.match(answer, /360° Partner KYC Review Dossier — ABC Heavy Machinery \(JCB-PAR-001\)/);
  assert.match(answer, /Ramesh Patel/);
  assert.match(answer, /9876543210/);
  assert.match(answer, /ramesh@abcmachinery\.com/);
  assert.match(answer, /Plot 45, Ring Road Industrial Area/);
  assert.match(answer, /492001/);
  assert.match(answer, /22AAAAA0000A1Z5/);
  assert.match(answer, /REG-CG-2021-9876/);

  // 6 Documents Checklist
  assert.match(answer, /GST Certificate/);
  assert.match(answer, /Mandatory/);
  assert.match(answer, /GST certificate blurred hai, clear scanned copy upload karein\./);
  assert.match(answer, /\[Preview File\]\(\/api\/files\/kyc-gst\.pdf\)/);
  assert.match(answer, /\[Template PDF\]\(\/api\/admin\/verifications\/user-uuid-1\/documents\/doc-1\/template\)/);
  assert.match(answer, /PAN Card/);
  assert.match(answer, /Aadhaar Card/);
  assert.match(answer, /Passport Photo/);
  assert.match(answer, /Cancelled Cheque/);
  assert.match(answer, /Authorized Person ID/);
  assert.match(answer, /Missing \/ Pending Upload/);

  // Audit Trail & Agreements
  assert.match(answer, /CHANGES_REQUESTED/);
  assert.match(answer, /GST copy not readable\. Please upload clear scan\./);
  assert.match(answer, /PARTNER TERMS/);
  assert.match(answer, /MARKETPLACE TERMS/);

  // Quick Action
  assert.match(answer, /\[Review & Approve Partner KYC\]\(\/admin\/verifications\/abc-heavy-machinery-user-uuid-1\)/);
  assert.doesNotMatch(answer, /\[REDACTED/);
});
