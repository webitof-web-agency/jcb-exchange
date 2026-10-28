// Full demo data: 10 vehicles through every flow of the site.
//   partners (approved / under review) → listings (draft, pending approval, changes requested, live,
//   reserved, sold) → CRM leads in every pipeline stage with follow-ups → Close Deal → Sold Vehicle
//   (complete with RTO and Bill of Supply, RTO in progress, cancelled with refund) → website payment
//   that opens a draft Sold Vehicle record → Customer Prime → Expenses page → recruitment.
//
//   npx tsx scripts/seed-full-demo.ts --allow-production
//
// Demo users use @demo.jcbexchange.invalid emails and 90000xxxxx mobiles. Nothing is sent on
// WhatsApp/SMS/email and no paid verification API is called: CRM and partner records are written
// directly, and the Sold Vehicle Bill of Supply is issued before completion so completion sends nothing.
// The Finance Hub posting worker turns the money flows into (draft) vouchers by itself.
import prismaModule from '../src/lib/prisma';
import {
  addSellAccountPayment,
  cancelSellAccountSale,
  createSellAccount,
  getSellAccount,
  issueSellAccountReceipt,
  startRtoWork,
} from '../src/services/sellAccount.service';
import { approveSellAccountRefund, paySellAccountRefund, requestSellAccountRefund } from '../src/services/sellAccountRefund.service';
import { completeVehicleSale } from '../src/services/vehicleSaleCompletion.service';
import { issueInvoiceToken, nextVehicleSaleInvoiceNumberFor } from '../src/services/vehicleSaleInvoice.service';
import { finalizeListingPaymentSale } from '../src/utils/listingPaymentFinalization';

const prisma = ((prismaModule as any).default ?? prismaModule) as any;
const args = new Set(process.argv.slice(2));
const DOMAIN = 'demo.jcbexchange.invalid';
const DEMO = '[DEMO]';

const at = (day: string, time = '11:00') => new Date(`${day}T${time}:00+05:30`);
const daysFromNow = (days: number) => new Date(Date.now() + days * 86400000);

const assertSafe = () => {
  const database = decodeURIComponent(new URL((process.env.DATABASE_URL || '').replace(/^['"]|['"]$/g, '')).pathname.replace(/^\//, ''));
  if (/prod/i.test(database) && !args.has('--allow-production')) throw new Error(`"${database}" looks like production. Pass --allow-production to seed it on purpose.`);
  return database;
};

// ---------------------------------------------------------------------------------------------
// Staff, people and catalog
// ---------------------------------------------------------------------------------------------

const staff = async () => {
  const admin = await prisma.user.findFirst({ where: { role: 'SUPER_ADMIN', status: 'ACTIVE' }, orderBy: { createdAt: 'asc' } });
  const employees = await prisma.user.findMany({ where: { role: 'EMPLOYEE', status: 'ACTIVE' }, orderBy: { createdAt: 'asc' } });
  if (!admin) throw new Error('No active super admin found.');
  return { admin, sales: employees[0] ?? admin, accounts: employees[1] ?? employees[0] ?? admin };
};

const person = (key: string, name: string, mobile: string, city: string, role: 'CUSTOMER' | 'PARTNER') =>
  prisma.user.create({ data: { email: `${key}@${DOMAIN}`, name, mobile, city, state: 'Chhattisgarh', role, status: 'ACTIVE' } });

const partner = async (
  key: string,
  input: { owner: string; business: string; mobile: string; city: string; type: 'SHOWROOM' | 'BROKER'; approved: boolean; deposit: number; depositType: string },
  adminId: string,
) => {
  const user = await person(key, input.owner, input.mobile, input.city, 'PARTNER');
  const profile = await prisma.partnerProfile.create({
    data: {
      userId: user.id,
      ownerName: input.owner,
      businessName: input.business,
      partnerType: input.type,
      businessAddress: `${DEMO} Main Road, ${input.city}, Chhattisgarh`,
      pinCode: '492001',
      yearsInBusiness: 8,
      serviceAreas: 'Raipur, Bilaspur, Durg',
      gstNumber: null,
      onboardingStatus: input.approved ? 'APPROVED' : 'REVIEW_PENDING',
      accountStatus: input.approved ? 'ACTIVE' : 'PENDING',
      kycStatus: input.approved ? 'APPROVED' : 'UNDER_REVIEW',
      depositStatus: input.approved ? 'VERIFIED' : 'VERIFICATION_PENDING',
      ...(input.approved ? { approvedById: adminId, approvedAt: at('2026-10-03') } : {}),
    },
  });
  for (const [documentType, number] of [['PAN_CARD', `ABCDE${input.mobile.slice(-4)}F`], ['AADHAAR_CARD', `XXXX XXXX ${input.mobile.slice(-4)}`], ['CANCELLED_CHEQUE', null]] as const) {
    await prisma.kycDocument.create({
      data: {
        partnerProfileId: profile.id,
        documentType,
        documentNumber: number,
        nameOnDocument: input.owner,
        fileName: `${DEMO} ${documentType.toLowerCase()}.pdf`,
        status: input.approved ? 'APPROVED' : 'UNDER_REVIEW',
        ...(input.approved ? { reviewedById: adminId, reviewedAt: at('2026-10-02'), reviewComment: 'Demo: documents verified.' } : {}),
      },
    });
  }
  for (const definition of await prisma.partnerAgreementDefinition.findMany()) {
    await prisma.partnerAgreement.create({
      data: { partnerProfileId: profile.id, agreementType: definition.agreementType, version: definition.version, definitionId: definition.id, titleSnapshot: definition.title, acceptedAt: at('2026-10-01'), acceptedByUserId: user.id },
    });
  }
  await prisma.partnerDeposit.create({
    data: {
      partnerProfileId: profile.id,
      depositType: input.depositType,
      amount: input.deposit,
      referenceNo: `DEP${input.mobile.slice(-4)}`,
      paymentDate: at('2026-10-02'),
      paymentMode: input.depositType.replace(/_/g, ' '),
      notes: `${DEMO} Security deposit`,
      status: input.approved ? 'VERIFIED' : 'SUBMITTED',
      ...(input.approved ? { verifiedById: adminId, verifiedAt: at('2026-10-03') } : {}),
    },
  });
  return { user, profile };
};

const catalog = async () => {
  const brand = async (name: string) => {
    const row = await prisma.brand.findFirst({ where: { name } });
    if (!row) throw new Error(`Brand ${name} not found.`);
    return row;
  };
  const category = async (name: string) => {
    const row = await prisma.category.findFirst({ where: { name } });
    if (!row) throw new Error(`Category ${name} not found.`);
    return row;
  };
  const model = async (brandId: string, name: string) => (await prisma.model.findFirst({ where: { brandId, name } })) ?? prisma.model.create({ data: { brandId, name } });
  return { brand, category, model };
};

// ---------------------------------------------------------------------------------------------
// Listings, leads and follow-ups
// ---------------------------------------------------------------------------------------------

type Vehicle = {
  key: string; title: string; category: string; brand: string; model: string; year: number; hours: number; price: number; margin: number;
  city: string; status: string; partnerId: string; owner: string; regNo: string; chassis: string;
};

const listing = async (vehicle: Vehicle, cat: Awaited<ReturnType<typeof catalog>>) => {
  const brand = await cat.brand(vehicle.brand);
  const category = await cat.category(vehicle.category);
  const model = await cat.model(brand.id, vehicle.model);
  return prisma.listing.create({
    data: {
      partnerId: vehicle.partnerId,
      categoryId: category.id,
      brandId: brand.id,
      modelId: model.id,
      title: vehicle.title,
      ownerName: vehicle.owner,
      price: vehicle.price,
      isNegotiable: true,
      manufacturingYear: vehicle.year,
      operatingHours: vehicle.hours,
      locationState: 'Chhattisgarh',
      locationCity: vehicle.city,
      condition: 'Good',
      engineNumber: `ENG${vehicle.chassis.slice(-6)}`,
      description: `${DEMO} ${vehicle.title}, ${vehicle.hours.toLocaleString('en-IN')} hours, single owner, all papers clear. Registration ${vehicle.regNo}.`,
      adminMarginAmount: vehicle.margin,
      adminExpenseAmount: 0,
      status: vehicle.status,
    },
  });
};

const STAGE_TITLES: Record<string, string> = {
  NEW: 'New', CONTACTED: 'Contacted', QUALIFIED: 'Qualified', INTERESTED: 'Interested', INSPECTION_SCHEDULED: 'Inspection Scheduled', ON_HOLD: 'On Hold', WON: 'Won', LOST: 'Lost',
};

const lead = async (input: {
  customer: any; listing: any; dealerId: string; ownerId: string; status: string; temperature: 'HOT' | 'WARM' | 'COLD'; priority?: 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';
  source?: string; enquiryType?: string; createdOn: string; lostReason?: string; wonAmount?: number; leadType?: string; notes?: string;
}) => {
  const closed = input.status === 'WON' || input.status === 'LOST';
  const created = await prisma.lead.create({
    data: {
      customerId: input.customer.id,
      dealerId: input.dealerId,
      ownerId: input.ownerId,
      assignedAt: at(input.createdOn, '10:30'),
      listingId: input.listing?.id ?? null,
      listingTitleSnapshot: input.listing?.title ?? null,
      listingStatusSnapshot: input.listing?.status ?? null,
      listingPriceSnapshot: input.listing ? Number(input.listing.price) + Number(input.listing.adminMarginAmount) : null,
      listingLocationCitySnapshot: input.listing?.locationCity ?? null,
      listingLocationStateSnapshot: input.listing ? 'Chhattisgarh' : null,
      enquiryType: input.enquiryType ?? 'DEALER_CALL',
      source: input.source ?? 'WEBSITE',
      leadType: input.leadType ?? 'BUY',
      status: input.status,
      priority: input.priority ?? 'MEDIUM',
      temperature: input.temperature,
      categoryId: input.listing?.categoryId ?? null,
      brandId: input.listing?.brandId ?? null,
      modelId: input.listing?.modelId ?? null,
      requirementCity: input.customer.city,
      requirementState: 'Chhattisgarh',
      requirementNotes: input.notes ?? `${DEMO} Customer needs the machine for road construction work.`,
      expectedValue: input.listing ? Number(input.listing.price) + Number(input.listing.adminMarginAmount) : null,
      firstResponseAt: input.status === 'NEW' ? null : at(input.createdOn, '11:15'),
      lastContactedAt: input.status === 'NEW' ? null : at(input.createdOn, '11:15'),
      lastActivityAt: at(input.createdOn, '11:15'),
      ...(closed ? { closedAt: at(input.createdOn, '17:00') } : {}),
      ...(input.status === 'LOST' ? { lostReason: input.lostReason ?? 'Budget too low' } : {}),
      ...(input.status === 'WON' ? { wonAmount: input.wonAmount } : {}),
      createdAt: at(input.createdOn, '10:00'),
    },
  });
  await prisma.leadActivity.create({ data: { leadId: created.id, actorId: null, type: 'CREATED', title: `Enquiry received${input.listing ? ` for ${input.listing.title}` : ''}`, createdAt: at(input.createdOn, '10:00') } });
  if (input.status !== 'NEW') {
    await prisma.leadActivity.create({
      data: {
        leadId: created.id,
        actorId: input.ownerId,
        type: 'STATUS_CHANGE',
        title: `Status changed to ${STAGE_TITLES[input.status]?.toLowerCase() ?? input.status}`,
        content: input.status === 'LOST' ? `Reason: ${input.lostReason ?? 'Budget too low'}` : null,
        metadata: input.status === 'WON'
          ? { from: 'INSPECTION_SCHEDULED', to: 'WON', soldVehicleMode: 'ENQUIRED', wonAmount: input.wonAmount }
          : { from: 'NEW', to: input.status },
        createdAt: at(input.createdOn, '16:00'),
      },
    });
  }
  await prisma.crmContactProfile.upsert({
    where: { userId: input.customer.id },
    create: { userId: input.customer.id, lifecycle: input.status === 'WON' ? 'CUSTOMER' : 'LEAD' },
    update: input.status === 'WON' ? { lifecycle: 'CUSTOMER' } : {},
  });
  return created;
};

const followUp = (input: { lead: any; customer: any; ownerId: string; type: string; due: Date; status?: string; outcome?: string; outcomeNotes?: string }) =>
  prisma.crmFollowUp.create({
    data: {
      leadId: input.lead.id,
      contactUserId: input.customer.id,
      ownerId: input.ownerId,
      type: input.type,
      dueAt: input.due,
      status: input.status ?? 'PENDING',
      ...(input.status === 'DONE' ? { outcome: input.outcome ?? 'CONNECTED', outcomeNotes: input.outcomeNotes ?? null, completedAt: input.due, completedById: input.ownerId } : {}),
      createdById: input.ownerId,
    },
  });

/** What Close Deal does for the enquired machine: listing SOLD and a sale record (no messages). */
const markListingSold = async (listingRow: any, customer: any, amount: number, day: string) => {
  await prisma.listing.update({ where: { id: listingRow.id }, data: { status: 'SOLD', soldAt: at(day, '17:00') } });
  await prisma.saleRecord.create({
    data: { listingId: listingRow.id, buyerName: customer.name, buyerPhone: customer.mobile, buyerCity: customer.city, buyerState: 'Chhattisgarh', soldPrice: amount, soldAt: at(day, '17:00'), notes: `${DEMO} Closed as WON from CRM` },
  });
};

// ---------------------------------------------------------------------------------------------
// Sold Vehicle helpers (real services)
// ---------------------------------------------------------------------------------------------

const pay = async (dealId: string, actorId: string, payment: Record<string, unknown>, issue = true) => {
  const added = await addSellAccountPayment(dealId, payment, actorId);
  if (!added) throw new Error('Payment could not be added.');
  if (issue && payment.side !== 'SELLER_PAYMENT') await issueSellAccountReceipt(dealId, added.paymentId, actorId);
  return added.paymentId;
};

/** Issues the Bill of Supply first, so the completion step has no new link to send. */
const issueBillOfSupply = (id: string, when: Date) => prisma.$transaction(async (tx: any) => {
  const issued = issueInvoiceToken(when);
  await tx.sellAccount.update({
    where: { id },
    data: { invoiceNumber: await nextVehicleSaleInvoiceNumberFor(tx, when), invoiceGeneratedAt: when, invoiceTokenHash: issued.tokenHash, invoiceTokenExpiresAt: issued.expiresAt },
  });
});

const saleBody = (vehicle: Vehicle, listingRow: any, seller: { name: string; mobile: string; city: string }, buyer: any, extra: Record<string, unknown>) => ({
  listingId: listingRow.id,
  listingTitle: vehicle.title,
  ownerName: vehicle.owner,
  ownerNumber: seller.mobile,
  vehicleNumber: vehicle.regNo,
  chassisNumber: vehicle.chassis,
  vehicleType: vehicle.category,
  brandName: vehicle.brand,
  vehicleModel: vehicle.model,
  sellerName: seller.name,
  sellerNumber: seller.mobile,
  sellerCity: seller.city,
  sellerState: 'Chhattisgarh',
  purchaserName: buyer.name,
  purchaserNumber: buyer.mobile,
  purchaserCity: buyer.city,
  purchaserState: 'Chhattisgarh',
  transferDetails: 'RC transfer to the purchaser after full payment; NOC and Form 29/30 from the seller.',
  remarks: `${DEMO} Sold Vehicle demo`,
  ...extra,
});

// ---------------------------------------------------------------------------------------------

const run = async () => {
  const database = assertSafe();
  if (await prisma.user.count({ where: { email: { endsWith: `@${DOMAIN}` } } })) {
    await resumeDemo();
    return;
  }
  const { admin, sales, accounts } = await staff();
  const cat = await catalog();

  // Partners: two approved (showroom + broker), one waiting for review.
  const p1 = await partner('partner.ganesh', { owner: 'Ramesh Sahu', business: 'Shree Ganesh Earthmovers', mobile: '9000002001', city: 'Raipur', type: 'SHOWROOM', approved: true, deposit: 50000, depositType: 'BANK_TRANSFER' }, admin.id);
  const p2 = await partner('partner.bilaspur', { owner: 'Sunil Verma', business: 'Bilaspur Machinery Brokers', mobile: '9000002002', city: 'Bilaspur', type: 'BROKER', approved: true, deposit: 25000, depositType: 'UPI_PAYMENT' }, admin.id);
  const p3 = await partner('partner.durg', { owner: 'Vijay Yadav', business: 'Durg Equipment Hub', mobile: '9000002003', city: 'Durg', type: 'SHOWROOM', approved: false, deposit: 25000, depositType: 'CHEQUE' }, admin.id);

  // Customers.
  const c = {
    arjun: await person('arjun.verma', 'Arjun Verma', '9000001001', 'Raipur', 'CUSTOMER'),
    mahesh: await person('mahesh.patel', 'Mahesh Patel', '9000001002', 'Bilaspur', 'CUSTOMER'),
    kiran: await person('kiran.construction', 'Kiran Construction (Rohit Sahu)', '9000001003', 'Durg', 'CUSTOMER'),
    sunita: await person('sunita.yadav', 'Sunita Yadav', '9000001004', 'Korba', 'CUSTOMER'),
    vikram: await person('vikram.singh', 'Vikram Singh', '9000001005', 'Raigarh', 'CUSTOMER'),
    deepak: await person('deepak.agrawal', 'Deepak Agrawal', '9000001006', 'Raipur', 'CUSTOMER'),
    anjali: await person('anjali.mishra', 'Anjali Mishra', '9000001007', 'Bhilai', 'CUSTOMER'),
    ravi: await person('ravi.dewangan', 'Ravi Dewangan', '9000001008', 'Rajnandgaon', 'CUSTOMER'),
  };

  // 10 vehicles.
  const V = {
    v1: { key: 'v1', title: 'JCB 3DX Super 2021 Backhoe Loader', category: 'Backhoe Loader', brand: 'JCB', model: '3DX Super', year: 2021, hours: 4200, price: 2450000, margin: 50000, city: 'Raipur', status: 'PUBLISHED', partnerId: p1.user.id, owner: 'Ramesh Sahu', regNo: 'CG04DM1001', chassis: 'JCB3DXS21001' },
    v2: { key: 'v2', title: 'Hyundai R140W 2019 Wheeled Excavator', category: 'Excavator', brand: 'Hyundai', model: 'R140W', year: 2019, hours: 6100, price: 3800000, margin: 70000, city: 'Raipur', status: 'PUBLISHED', partnerId: p1.user.id, owner: 'Ramesh Sahu', regNo: 'CG04DM1002', chassis: 'HYR140W19002' },
    v3: { key: 'v3', title: 'CAT 424B 2018 Backhoe Loader', category: 'Backhoe Loader', brand: 'Caterpillar', model: '424B', year: 2018, hours: 7300, price: 1650000, margin: 40000, city: 'Bilaspur', status: 'PENDING_APPROVAL', partnerId: p2.user.id, owner: 'Sunil Verma', regNo: 'CG10DM1003', chassis: 'CAT424B18003' },
    v4: { key: 'v4', title: 'Tata Hitachi EX200 2017 Excavator', category: 'Excavator', brand: 'Tata Hitachi', model: 'EX200', year: 2017, hours: 9800, price: 2100000, margin: 50000, city: 'Bilaspur', status: 'CHANGES_REQUESTED', partnerId: p2.user.id, owner: 'Sunil Verma', regNo: 'CG10DM1004', chassis: 'TATAEX20017004' },
    v5: { key: 'v5', title: 'JCB 3DX 2020 Backhoe Loader', category: 'Backhoe Loader', brand: 'JCB', model: '3DX', year: 2020, hours: 5200, price: 2050000, margin: 0, city: 'Raipur', status: 'PUBLISHED', partnerId: admin.id, owner: 'JCB Exchange (own stock)', regNo: 'CG04DM1005', chassis: 'JCB3DX20005' },
    v6: { key: 'v6', title: 'Komatsu PC210 2018 Excavator', category: 'Excavator', brand: 'Komatsu', model: 'PC210', year: 2018, hours: 8400, price: 3100000, margin: 60000, city: 'Bilaspur', status: 'PUBLISHED', partnerId: p2.user.id, owner: 'Sunil Verma', regNo: 'CG10DM1006', chassis: 'KOMPC21018006' },
    v7: { key: 'v7', title: 'Case 770 EX 2020 Backhoe Loader', category: 'Backhoe Loader', brand: 'Case Construction', model: '770 EX', year: 2020, hours: 4800, price: 1900000, margin: 45000, city: 'Raipur', status: 'PUBLISHED', partnerId: p1.user.id, owner: 'Ramesh Sahu', regNo: 'CG04DM1007', chassis: 'CASE770EX20007' },
    v8: { key: 'v8', title: 'JCB 3DX Plus 2022 Backhoe Loader', category: 'Backhoe Loader', brand: 'JCB', model: '3DX Plus', year: 2022, hours: 2600, price: 2900000, margin: 60000, city: 'Raipur', status: 'PUBLISHED', partnerId: p1.user.id, owner: 'Ramesh Sahu', regNo: 'CG04DM1008', chassis: 'JCB3DXP22008' },
    v9: { key: 'v9', title: 'Mahindra EarthMaster SX 2019 Backhoe Loader', category: 'Backhoe Loader', brand: 'Mahindra', model: 'EarthMaster SX', year: 2019, hours: 6900, price: 1450000, margin: 35000, city: 'Bilaspur', status: 'RESERVED', partnerId: p2.user.id, owner: 'Sunil Verma', regNo: 'CG10DM1009', chassis: 'MAHEMSX19009' },
    v10: { key: 'v10', title: 'ACE AF30 2016 Pick & Carry Crane', category: 'Crane', brand: 'ACE', model: 'AF30', year: 2016, hours: 11200, price: 950000, margin: 25000, city: 'Durg', status: 'DRAFT', partnerId: p3.user.id, owner: 'Vijay Yadav', regNo: 'CG07DM1010', chassis: 'ACEAF3016010' },
  } satisfies Record<string, Vehicle>;
  const L: Record<string, any> = {};
  for (const vehicle of Object.values(V)) L[vehicle.key] = await listing(vehicle, cat);
  const partnerSeller = (who: typeof p1) => ({ name: who.profile.businessName, mobile: who.user.mobile, city: who.user.city });

  // CRM: every pipeline stage.
  const l1a = await lead({ customer: c.arjun, listing: L.v1, dealerId: p1.user.id, ownerId: sales.id, status: 'NEW', temperature: 'WARM', createdOn: '2026-10-27' });
  const l1b = await lead({ customer: c.mahesh, listing: L.v1, dealerId: p1.user.id, ownerId: sales.id, status: 'CONTACTED', temperature: 'WARM', enquiryType: 'WHATSAPP', createdOn: '2026-10-24' });
  await followUp({ lead: l1b, customer: c.mahesh, ownerId: sales.id, type: 'CALL', due: daysFromNow(1) });
  await followUp({ lead: l1a, customer: c.arjun, ownerId: sales.id, type: 'CALL', due: daysFromNow(0) });
  const l1c = await lead({ customer: c.ravi, listing: L.v1, dealerId: p1.user.id, ownerId: sales.id, status: 'LOST', temperature: 'COLD', lostReason: 'Budget too low', createdOn: '2026-10-15' });
  void l1c;
  const l2 = await lead({ customer: c.kiran, listing: L.v2, dealerId: p1.user.id, ownerId: sales.id, status: 'INSPECTION_SCHEDULED', temperature: 'HOT', priority: 'HIGH', enquiryType: 'CALLBACK', createdOn: '2026-10-22' });
  await followUp({ lead: l2, customer: c.kiran, ownerId: sales.id, type: 'CALL', due: at('2026-10-23', '12:00'), status: 'DONE', outcome: 'INTERESTED', outcomeNotes: 'Wants to see the machine at the yard.' });
  await followUp({ lead: l2, customer: c.kiran, ownerId: sales.id, type: 'INSPECTION', due: daysFromNow(2) });
  const l2b = await lead({ customer: c.arjun, listing: L.v2, dealerId: p1.user.id, ownerId: accounts.id, status: 'INTERESTED', temperature: 'WARM', createdOn: '2026-10-25' });
  await followUp({ lead: l2b, customer: c.arjun, ownerId: accounts.id, type: 'WHATSAPP', due: daysFromNow(1) });
  const l9 = await lead({ customer: c.ravi, listing: L.v9, dealerId: p2.user.id, ownerId: sales.id, status: 'QUALIFIED', temperature: 'HOT', priority: 'URGENT', createdOn: '2026-10-21' });
  await followUp({ lead: l9, customer: c.ravi, ownerId: sales.id, type: 'PAYMENT', due: daysFromNow(-1) }); // overdue
  const l9b = await lead({ customer: c.mahesh, listing: L.v9, dealerId: p2.user.id, ownerId: sales.id, status: 'ON_HOLD', temperature: 'COLD', createdOn: '2026-10-18', notes: `${DEMO} Will decide after the monsoon work order.` });
  await followUp({ lead: l9b, customer: c.mahesh, ownerId: sales.id, type: 'CALL', due: daysFromNow(10) });
  const sellLead = await lead({ customer: c.kiran, listing: null, dealerId: admin.id, ownerId: sales.id, status: 'NEW', temperature: 'WARM', leadType: 'SELL', source: 'SUPERADMIN_PORTAL', createdOn: '2026-10-26', notes: `${DEMO} Wants to sell his 2015 JCB 3DX; asked for a valuation.` });
  await followUp({ lead: sellLead, customer: c.kiran, ownerId: sales.id, type: 'VISIT', due: daysFromNow(3) });

  const created: string[] = [];

  // V5 own stock → WON → complete sale: seller paid, real receipts, Bill of Supply, RTO done, deal done.
  {
    const amount = 2050000;
    const won = await lead({ customer: c.sunita, listing: L.v5, dealerId: admin.id, ownerId: sales.id, status: 'WON', temperature: 'HOT', createdOn: '2026-10-05', wonAmount: amount });
    await markListingSold(L.v5, c.sunita, amount, '2026-10-06');
    const deal = await createSellAccount({
      ...saleBody(V.v5, L.v5, { name: 'Prakash Tiwari', mobile: '9000003005', city: 'Raipur' }, c.sunita, {
        sourceType: 'JCB_EXCHANGE', sellDate: '2026-10-06', sellerDate: '2026-10-04', purchaserDate: '2026-10-08', purchaseAmount: 1800000, sellAmount: amount,
        expenseBreakdown: { transport: 15000, paperwork: 3000, rtoWork: 6000, other: 0, otherLabel: '' },
      }),
      crmLeadId: won.id,
    }, accounts.id);
    created.push(deal.id);
    await pay(deal.id, accounts.id, { side: 'SELLER_PAYMENT', amount: 1800000, method: 'BANK_TRANSFER', reference: 'NEFT55001', paymentDate: '2026-10-04' });
    await pay(deal.id, accounts.id, { side: 'PURCHASER_RECEIPT', amount: 500000, method: 'UPI', reference: 'UPI99005A', paymentDate: '2026-10-06', note: 'Booking amount' });
    await pay(deal.id, accounts.id, { side: 'PURCHASER_RECEIPT', amount: 1550000, method: 'BANK_TRANSFER', reference: 'RTGS99005B', drawnOn: 'SBI Korba', paymentDate: '2026-10-08', note: 'Balance by RTGS' });
    await issueBillOfSupply(deal.id, at('2026-10-08', '15:00'));
    const rto = await startRtoWork(deal.id, accounts.id);
    if (rto?.rtoRecord) await prisma.rtoTransferTask.updateMany({ where: { rtoRecordId: rto.rtoRecord.id }, data: { status: 'TRANSFERRED' } });
    await completeVehicleSale(deal.id, { remark: 'Demo: RC transferred, customer paid in full.' }, accounts.id, 'http://localhost:5000');
  }

  // V6 partner listing → WON → full payment, RTO in progress (some transfer steps done).
  {
    const amount = 3160000;
    const won = await lead({ customer: c.vikram, listing: L.v6, dealerId: p2.user.id, ownerId: sales.id, status: 'WON', temperature: 'HOT', createdOn: '2026-10-12', wonAmount: amount });
    await markListingSold(L.v6, c.vikram, amount, '2026-10-14');
    const deal = await createSellAccount({
      ...saleBody(V.v6, L.v6, partnerSeller(p2), c.vikram, {
        sourceType: 'PARTNER', sellDate: '2026-10-14', sellerDate: '2026-10-14', purchaserDate: '2026-10-16', purchaseAmount: 3100000, sellAmount: amount,
        brokerName: 'Sunil Verma', brokerNumber: '9000002002',
      }),
      crmLeadId: won.id,
    }, accounts.id);
    created.push(deal.id);
    await pay(deal.id, accounts.id, { side: 'PURCHASER_RECEIPT', amount: 1000000, method: 'BANK_TRANSFER', reference: 'RTGS77006A', drawnOn: 'HDFC Raigarh', paymentDate: '2026-10-14' });
    await pay(deal.id, accounts.id, { side: 'PURCHASER_RECEIPT', amount: 2160000, method: 'BANK_TRANSFER', reference: 'RTGS77006B', drawnOn: 'HDFC Raigarh', paymentDate: '2026-10-16' });
    await pay(deal.id, accounts.id, { side: 'SELLER_PAYMENT', amount: 3100000, method: 'BANK_TRANSFER', reference: 'NEFT77006C', paymentDate: '2026-10-17' });
    const rto = await startRtoWork(deal.id, accounts.id);
    if (rto?.rtoRecord) {
      const tasks = await prisma.rtoTransferTask.findMany({ where: { rtoRecordId: rto.rtoRecord.id }, orderBy: { createdAt: 'asc' } });
      for (const [index, task] of tasks.entries()) {
        const status = index < Math.ceil(tasks.length / 2) ? 'TRANSFERRED' : index === Math.ceil(tasks.length / 2) ? 'TRANSFER_INITIATED' : 'PENDING';
        await prisma.rtoTransferTask.update({ where: { id: task.id }, data: { status, remark: status === 'TRANSFER_INITIATED' ? `${DEMO} File submitted at RTO Bilaspur` : null } });
      }
    }
  }

  // V7 partner listing → WON → advance received → customer backs out: sale cancelled (listing back to
  // PAUSED, lead LOST) and the advance refunded less a cancellation charge (maker-checker).
  {
    const amount = 1945000;
    const won = await lead({ customer: c.deepak, listing: L.v7, dealerId: p1.user.id, ownerId: sales.id, status: 'WON', temperature: 'HOT', createdOn: '2026-10-09', wonAmount: amount });
    await markListingSold(L.v7, c.deepak, amount, '2026-10-10');
    const deal = await createSellAccount({
      ...saleBody(V.v7, L.v7, partnerSeller(p1), c.deepak, { sourceType: 'PARTNER', sellDate: '2026-10-10', sellerDate: '2026-10-10', purchaserDate: '2026-10-11', purchaseAmount: 1900000, sellAmount: amount }),
      crmLeadId: won.id,
    }, accounts.id);
    created.push(deal.id);
    await pay(deal.id, accounts.id, { side: 'PURCHASER_RECEIPT', amount: 300000, method: 'UPI', reference: 'UPI66007A', paymentDate: '2026-10-11', note: 'Advance' });
    await cancelSellAccountSale(deal.id, { reason: 'Demo: customer cancelled, project order fell through.' }, accounts.id);
    const requested = await requestSellAccountRefund(deal.id, { reason: 'DEAL_CANCELLED', amount: 275000, forfeitAmount: 25000, method: 'UPI', note: 'Demo: advance refunded less cancellation charge' }, accounts.id);
    const refundId = requested?.refunds?.[0]?.id;
    if (refundId) {
      await approveSellAccountRefund(deal.id, refundId, { id: admin.id, role: 'SUPER_ADMIN' });
      await paySellAccountRefund(deal.id, refundId, { refundDate: '2026-10-15', method: 'UPI', reference: 'UPIRF66007', drawnOn: 'Demo bank' }, admin.id);
    }
  }

  await finishDemo({ admin, anjali: c.anjali, arjun: c.arjun, vikram: c.vikram, partnerUserId: p1.user.id, v8: L.v8 });

  console.log(`Demo data created in ${database}:`);
  console.log('- partners: 3 (2 approved, 1 under review); customers: 8; listings: 10');
  for (const id of created) {
    const deal: any = await getSellAccount(id);
    console.log(`- ${deal.recordNumber} ${deal.vehicleNumber} [${deal.dealStatus}${deal.isLocked ? ', locked' : ''}] invoice ${deal.invoiceNumber || '-'} received ${deal.finance.payments.purchaserReceived}`);
  }
};

/** Website payment, Customer Prime, Expenses page and recruitment (and the summary of them). */
const finishDemo = async ({ admin, anjali, arjun, vikram, partnerUserId, v8 }: { admin: any; anjali: any; arjun: any; vikram: any; partnerUserId: string; v8: any }) => {
  const c = { anjali, arjun, vikram };
  const L = { v8 };
  const p1 = { user: { id: partnerUserId } };
  // V8 online purchase on the website: RTGS payment verified → listing SOLD and a draft Sold Vehicle
  // record with the payment as a draft receipt (staff complete it in Accounts).
  {
    const payment = await prisma.listingPaymentSubmission.create({
      data: {
        listingId: L.v8.id, buyerId: c.anjali.id, partnerId: p1.user.id, method: 'RTGS', status: 'APPROVED', amount: 2960000,
        customerCity: 'Bhilai', customerState: 'Chhattisgarh', transactionRef: 'RTGS88008', paymentNote: `${DEMO} Full payment by RTGS`,
        settingsSnapshot: { demo: true }, reviewedByUserId: admin.id, reviewedAt: at('2026-10-20', '14:00'),
      },
    });
    await finalizeListingPaymentSale(payment.id);
  }

  // Customer Prime: one active member, one payment waiting for review.
  await prisma.customerPrimeSubscription.create({
    data: {
      userId: c.arjun.id, status: 'ACTIVE', paidAmount: 999, paidUpiId: 'arjun@demo', transactionRef: 'UPIPRIME001', customerCity: 'Raipur', customerState: 'Chhattisgarh',
      settingsSnapshot: { demo: true, validityValue: 12, validityUnit: 'MONTHS' }, submittedAt: at('2026-10-10'), approvedByUserId: admin.id, approvedAt: at('2026-10-10', '13:00'),
      startedAt: at('2026-10-10', '13:00'), expiresAt: at('2027-10-10', '13:00'),
    },
  });
  await prisma.customerPrimeSubscription.create({
    data: {
      userId: c.vikram.id, status: 'PENDING', paidAmount: 999, paidUpiId: 'vikram@demo', transactionRef: 'UPIPRIME002', customerCity: 'Raigarh', customerState: 'Chhattisgarh',
      settingsSnapshot: { demo: true, validityValue: 12, validityUnit: 'MONTHS' }, submittedAt: daysFromNow(-1),
    },
  });

  // Expenses page (paid expenses → books). One bank entry is left without a bank alias to show "Needs mapping".
  for (const [day, name, category, amount, accountName, method, narration] of [
    ['2026-10-05', 'Shree Properties', 'Rent', 25000, 'HDFC BANK', 'NEFT', 'Yard rent for October'],
    ['2026-10-07', 'Indian Oil Pump', 'Fuel', 3200, 'Cash', 'CASH', 'Diesel for yard machine movement'],
    ['2026-10-09', 'CSPDCL', 'Utilities', 4850, 'Cash', 'CASH', 'Office electricity bill'],
    ['2026-10-12', 'Sales team', 'Travel', 2400, 'Cash', 'CASH', 'Customer visit Bilaspur'],
    ['2026-10-18', 'Office Mart', 'Office Expense', 1750, 'Cash', 'CASH', 'Stationery and printer ink'],
  ] as const) {
    await prisma.financeTransaction.create({
      data: { transactionDate: at(day), type: 'DEBIT', amount, name, category, accountName, paymentMethod: method, narration: `${DEMO} ${narration}`, source: 'MANUAL', status: 'POSTED' },
    });
  }

  // Recruitment: a live job with one application in review.
  const department = await prisma.jobDepartment.findFirst({ where: { name: 'Sales & Business Development' } }) ?? await prisma.jobDepartment.findFirst();
  if (department) {
    const job = await prisma.job.create({
      data: {
        title: 'Sales Executive - Heavy Equipment', slug: 'demo-sales-executive-heavy-equipment', jobCode: 'DEMO-SE-001', departmentId: department.id,
        employmentType: 'FULL_TIME', workMode: 'ON_SITE', locationCity: 'Raipur', locationState: 'Chhattisgarh', minExperience: 1, maxExperience: 4,
        description: `${DEMO} Sell used construction equipment to contractors across Chhattisgarh. Two-wheeler and smartphone required.`,
        status: 'PUBLISHED', postedAt: at('2026-10-15'), createdById: admin.id,
      },
    });
    const candidate = await prisma.candidate.create({ data: { fullName: 'Neha Sharma', email: `neha.sharma@${DOMAIN}`, mobile: '9000004001', currentCity: 'Raipur', totalExperience: 2 } });
    await prisma.jobApplication.create({ data: { applicationRef: 'DEMO-APP-0001', jobId: job.id, candidateId: candidate.id, currentStage: 'REVIEW', appliedAt: at('2026-10-20') } });
  }

  const fromWebsite = await prisma.sellAccount.findFirst({ where: { listingId: L.v8.id }, include: { payments: true } });
  console.log(`- website payment → ${fromWebsite ? `${fromWebsite.recordNumber} draft=${fromWebsite.isDraft}, receipts ${fromWebsite.payments.length}` : 'NO Sold Vehicle record'}`);
  const listings = await prisma.listing.findMany({ where: { description: { startsWith: DEMO } }, select: { title: true, status: true }, orderBy: { createdAt: 'asc' } });
  console.log('- listing statuses:', listings.map((row: any) => `${row.title.split(' ').slice(0, 3).join(' ')}=${row.status}`).join(', '));
};

/** A run that stopped at the website payment: finish the remaining steps only. */
const resumeDemo = async () => {
  const user = (key: string) => prisma.user.findUnique({ where: { email: `${key}@${DOMAIN}` } });
  const v8 = await prisma.listing.findFirst({ where: { title: 'JCB 3DX Plus 2022 Backhoe Loader', description: { startsWith: DEMO } } });
  if (!v8) throw new Error('Demo listings not found; cannot resume.');
  if (await prisma.listingPaymentSubmission.count({ where: { listingId: v8.id } })) {
    console.log('Demo data is already complete. Nothing done.');
    return;
  }
  const { admin } = await staff();
  await finishDemo({ admin, anjali: await user('anjali.mishra'), arjun: await user('arjun.verma'), vikram: await user('vikram.singh'), partnerUserId: (await user('partner.ganesh')).id, v8 });
  console.log('Resumed and finished the demo data.');
};

run()
  .catch((error) => {
    console.error('FAILED:', error instanceof Error ? error.stack || error.message : error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
