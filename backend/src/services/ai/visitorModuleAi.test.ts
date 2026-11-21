import test from 'node:test';
import assert from 'node:assert/strict';
import {
  AiReadOnlyToolsService,
  type AiToolContext,
  type AiReadOnlyToolDependencies,
} from './aiReadOnlyTools.service';
import { routeAiMessage } from './aiIntentRouter.service';
import { buildVisitorOperatorAnswer } from './visitorOperatorAnswer.service';

const internalAdminContext: AiToolContext = {
  userId: 'usr-admin-01',
  role: 'SUPER_ADMIN',
  permissions: ['ALL_ACCESS', 'visitors.read', 'crm.read'],
};

const internalEmployeeContext: AiToolContext = {
  userId: 'usr-emp-01',
  role: 'EMPLOYEE',
  permissions: ['visitors.read'],
};

const mockVisitorData = {
  id: 'c743fc8f-d66a-4932-b8bb-69ec18da597e',
  customerId: 'c743fc8f-d66a-4932-b8bb-69ec18da597e',
  name: 'test0',
  customerName: 'test0',
  mobile: '1234567898',
  email: 'test0@gmail.com',
  whatsappNumber: '1234567898',
  authProvider: 'LOCAL',
  status: 'ACTIVE',
  city: 'Raipur',
  state: 'Chhattisgarh',
  isPrimeCustomer: false,
  callLink: 'tel:1234567898',
  whatsappLink: 'https://wa.me/911234567898',
  profileUrl: '/employee/visitors/c743fc8f-d66a-4932-b8bb-69ec18da597e',
  leadCount: 1,
  createdAt: '2026-11-16T10:00:00.000Z',
  updatedAt: '2026-11-16T10:00:00.000Z',
};

const mockDependencies: Partial<AiReadOnlyToolDependencies> = {
  customerSummary: async (_ctx, _args) => ({
    total: 1,
    active: 1,
    primeCount: 0,
    citiesCovered: 1,
    returned: 1,
    hasMore: false,
    items: [mockVisitorData],
    maskedFields: [],
  }),
  customerDetail: async (_ctx, _args) => ({
    found: true,
    customer: mockVisitorData,
    crmProfile: {
      companyName: null,
      lifecycle: 'CUSTOMER',
      source: 'Self registered',
      owner: { id: 'usr-emp-01', name: 'Arjun Gupta' },
    },
    digitalIntent: {
      totalViews: 3,
      totalContactClicks: 2,
      recentSearches: [
        { query: 'JCB 3DX Raipur', at: '2026-11-16T11:00:00.000Z' },
        { query: 'Backhoe loader under 20L', at: '2026-11-17T14:30:00.000Z' },
      ],
      viewedMachines: [
        {
          id: 'lst-101',
          title: '2021 JCB 3DX Backhoe Loader',
          price: 2150000,
          status: 'SOLD',
          city: 'Raipur',
          state: 'Chhattisgarh',
          imageUrl: '/uploads/listings/jcb3dx.jpg',
        },
      ],
    },
    leads: [
      {
        id: 'lead-01',
        leadType: 'BUY_MACHINE',
        status: 'WON',
        stage: 'Deal Closed',
        temperature: 'HOT',
        score: 95,
        machine: '2021 JCB 3DX Backhoe Loader',
        expectedValue: 2150000,
        wonAmount: 2150000,
        assignedTo: 'Arjun Gupta',
        createdAt: '2026-11-16T10:30:00.000Z',
      },
    ],
    deals: [
      {
        id: 'deal-01',
        recordNumber: 'SA-2026-0042',
        vehicleNumber: 'CG-11-BN-7867',
        listingTitle: '2021 JCB 3DX Backhoe Loader',
        side: 'BUYER',
        sellAmount: 2150000,
        purchaseAmount: 1950000,
        dealStatus: 'DEAL_DONE',
        invoiceUrl: '/api/recruitment/admin/sell-accounts/deal-01/invoice',
        challanUrl: '/api/recruitment/admin/sell-accounts/deal-01/delivery-challan',
        createdAt: '2026-11-17T18:44:00.000Z',
      },
    ],
    rtoRecords: [
      {
        id: 'rto-01',
        vehicleNumber: 'CG-11-BN-7867',
        rtoStatus: 'DEAL_FINALIZED_AND_LOCKED',
        rtoOffice: 'JANJGIR CHAMPA DTO, CHHATTISGARH',
        agentName: 'Agent Not Assigned',
        agentPhone: null,
        isLocked: true,
        lockedAt: '2026-11-17T18:44:00.000Z',
      },
    ],
    invoices: [
      {
        dealId: 'deal-01',
        recordNumber: 'SA-2026-0042',
        vehicleNumber: 'CG-11-BN-7867',
        invoiceUrl: '/api/recruitment/admin/sell-accounts/deal-01/invoice',
        challanUrl: '/api/recruitment/admin/sell-accounts/deal-01/delivery-challan',
      },
    ],
    receipts: [
      {
        type: 'LISTING_PAYMENT',
        amount: 50000,
        receiptUrl: '/uploads/receipts/token-slip-01.png',
        transactionRef: 'UPI-9876543210',
        listingTitle: '2021 JCB 3DX Backhoe Loader',
      },
    ],
    actions: {
      callUrl: 'tel:1234567898',
      whatsappUrl: 'https://wa.me/911234567898',
      profileUrl: '/employee/visitors/c743fc8f-d66a-4932-b8bb-69ec18da597e',
    },
    maskedFields: [],
  }),
};

const testAiToolsService = new AiReadOnlyToolsService(mockDependencies as AiReadOnlyToolDependencies, {
  recordExecution: async () => undefined,
});

test('customer.summary returns unmasked visitor directory with KPI counters for internal operators', async () => {
  const result = await testAiToolsService.execute(
    internalEmployeeContext,
    { name: 'customer.summary', arguments: {} },
  ) as {
    contract: { status: string };
    data: {
      total: number;
      active: number;
      primeCount: number;
      citiesCovered: number;
      items: Array<{
        customerId: string | null;
        customerName: string | null;
        mobile: string | null;
        email: string | null;
        status: string | null;
        isPrimeCustomer: boolean;
        callLink: string | null;
        whatsappLink: string | null;
        profileUrl: string | null;
      }>;
      maskedFields: string[];
    };
    operatorData?: {
      items: Array<{
        customerName: string | null;
        mobile: string | null;
        email: string | null;
      }>;
    };
  };

  assert.equal(result.contract.status, 'success');
  assert.equal(result.data.total, 1);
  assert.equal(result.data.active, 1);
  assert.equal(result.data.primeCount, 0);
  assert.equal(result.data.citiesCovered, 1);
  assert.equal(result.data.items.length, 1);

  // Verify zero-masking for employee operator in operatorData
  const operatorItem = result.operatorData?.items[0];
  assert.ok(operatorItem, 'operatorData should be populated for employee operator');
  assert.equal(operatorItem.customerName, 'test0');
  assert.equal(operatorItem.mobile, '1234567898', 'Mobile must not be masked in operatorData');
  assert.equal(operatorItem.email, 'test0@gmail.com', 'Email must not be masked in operatorData');
});

test('customer.detail retrieves complete 360° dossier with digital intent, won deals, and direct invoice links', async () => {
  const detailResult = await testAiToolsService.execute(
    internalAdminContext,
    { name: 'customer.detail', arguments: { query: 'test0' } },
  ) as {
    contract: { status: string };
    data: {
      found: boolean;
      customer: {
        customerId: string | null;
        customerName: string | null;
        mobile: string | null;
        email: string | null;
        callLink: string | null;
        whatsappLink: string | null;
        profileUrl: string | null;
      };
      digitalIntent?: {
        totalViews: number;
        totalContactClicks: number;
        recentSearches: Array<{ query: string }>;
        viewedMachines: Array<{ id: string; title: string }>;
      };
      leads?: Array<{ id: string; stage: string; machine: string | null }>;
      deals?: Array<{ id: string; vehicleNumber: string | null; invoiceUrl: string | null }>;
      rtoRecords?: Array<{ id: string; vehicleNumber: string | null; rtoStatus: string }>;
      invoices?: Array<{ dealId: string; invoiceUrl: string; challanUrl: string }>;
      actions?: { callUrl: string | null; whatsappUrl: string | null; profileUrl: string | null };
      maskedFields: string[];
    };
    operatorData?: {
      customer: {
        customerName: string | null;
        mobile: string | null;
        email: string | null;
      };
      invoices: Array<{ invoiceUrl: string }>;
    };
  };

  assert.equal(detailResult.contract.status, 'success');
  assert.equal(detailResult.data.found, true);
  assert.ok(detailResult.data.digitalIntent);
  assert.equal(detailResult.data.digitalIntent.totalViews, 3);
  assert.equal(detailResult.data.digitalIntent.recentSearches.length, 2);
  assert.equal(detailResult.data.deals?.length, 1);
  assert.equal(detailResult.data.invoices?.length, 1);

  // Check operatorData is fully unmasked
  assert.ok(detailResult.operatorData?.customer);
  assert.equal(detailResult.operatorData.customer.customerName, 'test0');
  assert.equal(detailResult.operatorData.customer.mobile, '1234567898');
  assert.equal(detailResult.operatorData.customer.email, 'test0@gmail.com');
  assert.ok(detailResult.operatorData.invoices[0]?.invoiceUrl);
});

test('routeAiMessage routes visitor, won customers, and test0 queries correctly', () => {

  // Specific query intents for test0
  const qPhone = routeAiMessage('test0 ka mobile number kya hai?');
  assert.equal(qPhone?.name, 'customer.detail');
  assert.equal((qPhone?.arguments as any)?.query, 'test0');

  const qActivity = routeAiMessage('test0 ne website par kya kya dekha hai?');
  assert.equal(qActivity?.name, 'customer.detail');
  assert.equal((qActivity?.arguments as any)?.query, 'test0');

  const qInvoice = routeAiMessage('test0 ka invoice ya bill nikaal ke do');
  assert.equal(qInvoice?.name, 'customer.detail');
  assert.equal((qInvoice?.arguments as any)?.query, 'test0');

  const qReceipt = routeAiMessage('test0 ki payment receipt dikhao');
  assert.equal(qReceipt?.name, 'customer.detail');
  assert.equal((qReceipt?.arguments as any)?.query, 'test0');

  // Won customers query
  const qWon = routeAiMessage('Won customers list dikhao');
  assert.equal(qWon?.name, 'crm.won.customers.summary');

  // Visitors directory query
  const qVisitors = routeAiMessage('visitors list dikhao');
  assert.equal(qVisitors?.name, 'customer.summary');

  // Page context routing
  const qPageVisitors = routeAiMessage('summary batao', {
    moduleKey: 'visitors',
  });
  assert.equal(qPageVisitors?.name, 'customer.summary');

  const qPageWon = routeAiMessage('summary batao', {
    moduleKey: 'won-customers',
  });
  assert.equal(qPageWon?.name, 'crm.won.customers.summary');

  const qPageVisitorDetail = routeAiMessage('iniki detail batao', {
    moduleKey: 'visitor-detail',
    recordId: 'c743fc8f-d66a-4932-b8bb-69ec18da597e',
  });
  assert.equal(qPageVisitorDetail?.name, 'customer.detail');
  assert.equal((qPageVisitorDetail?.arguments as any)?.customerId, 'c743fc8f-d66a-4932-b8bb-69ec18da597e');
});

test('buildVisitorOperatorAnswer formats ChatGPT-style markdown with zero-masking and live links', () => {

  // 1. Phone intent
  const phoneAns = buildVisitorOperatorAnswer({
    message: 'test0 ka mobile number kya hai?',
    toolName: 'customer.detail',
    operatorData: {
      found: true,
      customer: mockVisitorData,
    },
  });
  assert.ok(phoneAns.includes('1234567898'));
  assert.ok(phoneAns.includes('tel:1234567898'));
  assert.ok(phoneAns.includes('https://wa.me/911234567898'));

  // 2. Viewed machines / activity intent
  const activityAns = buildVisitorOperatorAnswer({
    message: 'test0 ne website par kya kya dekha hai?',
    toolName: 'customer.detail',
    operatorData: {
      found: true,
      customer: mockVisitorData,
      digitalIntent: {
        totalViews: 3,
        totalContactClicks: 2,
        searches: ['JCB 3DX Raipur'],
        viewedListings: [
          {
            id: 'lst-101',
            title: '2021 JCB 3DX Backhoe Loader',
            price: 2150000,
            city: 'Raipur',
            state: 'Chhattisgarh',
            listingUrl: '/employee/listings/lst-101',
          },
        ],
      },
    },
  });
  assert.ok(activityAns.includes('2021 JCB 3DX Backhoe Loader'));
  assert.ok(activityAns.includes('₹21,50,000'));
  assert.ok(activityAns.includes('/employee/listings/lst-101'));

  // 3. Invoice intent
  const invoiceAns = buildVisitorOperatorAnswer({
    message: 'test0 ka invoice ya bill nikaal ke do',
    toolName: 'customer.detail',
    operatorData: {
      found: true,
      customer: mockVisitorData,
      invoices: [
        {
          recordNumber: 'SA-2026-0042',
          vehicleNumber: 'CG-11-BN-7867',
          sellAmount: 2150000,
          invoiceUrl: '/api/recruitment/admin/sell-accounts/deal-01/invoice',
          challanUrl: '/api/recruitment/admin/sell-accounts/deal-01/delivery-challan',
        },
      ],
    },
  });
  assert.ok(invoiceAns.includes('SA-2026-0042'));
  assert.ok(invoiceAns.includes('₹21,50,000'));
  assert.ok(invoiceAns.includes('[📄 Download Bill of Supply PDF](/api/recruitment/admin/sell-accounts/deal-01/invoice)'));
  assert.ok(invoiceAns.includes('[📄 Download Delivery Challan](/api/recruitment/admin/sell-accounts/deal-01/delivery-challan)'));

  // 4. Payment receipt intent
  const receiptAns = buildVisitorOperatorAnswer({
    message: 'test0 ki payment receipt dikhao',
    toolName: 'customer.detail',
    operatorData: {
      found: true,
      customer: mockVisitorData,
      receipts: [
        {
          type: 'LISTING_PAYMENT',
          amount: 50000,
          receiptUrl: '/uploads/receipts/token-slip-01.png',
          transactionRef: 'UPI-9876543210',
        },
      ],
    },
  });
  assert.ok(receiptAns.includes('₹50,000'));
  assert.ok(receiptAns.includes('[🧾 View Payment Receipt Image](/uploads/receipts/token-slip-01.png)'));
  assert.ok(receiptAns.includes('UPI-9876543210'));

  // 5. Visitor directory summary with 4 live KPI cards
  const summaryAns = buildVisitorOperatorAnswer({
    message: 'visitors list dikhao',
    toolName: 'customer.summary',
    operatorData: {
      total: 1,
      active: 1,
      primeCount: 0,
      citiesCovered: 1,
      items: [mockVisitorData],
    },
  });
  assert.ok(summaryAns.includes('Registered Visitors:** **1**'));
  assert.ok(summaryAns.includes('Active Accounts:** **1**'));
  assert.ok(summaryAns.includes('test0'));
  assert.ok(summaryAns.includes('[📞 1234567898](tel:1234567898)'));
  assert.ok(summaryAns.includes('[💬 WhatsApp](https://wa.me/911234567898)'));

  // 6. Won customers summary with Deal Amounts & Direct Actions
  const wonAns = buildVisitorOperatorAnswer({
    message: 'Won customers list dikhao',
    toolName: 'crm.won.customers.summary',
    operatorData: {
      total: 1,
      activeAccounts: 1,
      primeCustomers: 0,
      wonLeadTotal: 1,
      items: [
        {
          customerName: 'test0',
          mobile: '1234567898',
          city: 'Raipur',
          state: 'Chhattisgarh',
          companyName: 'Test Enterprises',
          leadCount: 1,
          dealAmount: 2150000,
          status: 'WON',
          contactId: 'c743fc8f-d66a-4932-b8bb-69ec18da597e',
        },
      ],
    },
  });
  assert.ok(wonAns.includes('Won Customers Directory'));
  assert.ok(wonAns.includes('₹21,50,000'));
  assert.ok(wonAns.includes('[📞 1234567898](tel:1234567898)'));
  assert.ok(wonAns.includes('[💬 WhatsApp](https://wa.me/911234567898)'));

  // 7. Google Drive Folder detection from CRM notes
  const driveAns = buildVisitorOperatorAnswer({
    message: 'test0 ka profile dikhao',
    toolName: 'customer.detail',
    operatorData: {
      found: true,
      customer: {
        ...mockVisitorData,
        crmProfile: {
          notes: 'Customer KYC & RC files stored at https://drive.google.com/drive/folders/1ABCxyz9900',
        },
      },
    },
  });
  assert.ok(driveAns.includes('[📁 Google Drive Folder](https://drive.google.com/drive/folders/1ABCxyz9900)'));
});

