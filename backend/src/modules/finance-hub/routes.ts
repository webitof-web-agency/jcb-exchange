import { Router } from 'express';
import { requireAdminOrEmployeePermissions, requireAuth } from '../../middlewares/auth.middleware';
import { getFinanceHubHealth, getFinanceHubSettings, updateFinanceHubSettings } from './controllers/foundation.controller';
import * as ledger from './controllers/ledger.controller';
import * as masters from './controllers/masters.controller';
import * as posting from './controllers/posting.controller';
import * as vehicleFinance from './controllers/vehicleFinance.controller';
import { FH_ANY_PERMISSIONS, FH_PERMISSIONS as P } from './permissions';

const router = Router();
const allow = (permissions: string[]) => requireAdminOrEmployeePermissions(permissions);

// Lookups many pages need (pickers, FY selector) are open to any finance-workspace user.
const anyWorkspaceUser = allow(FH_ANY_PERMISSIONS);
const settingsManager = allow([P.settingsManage]);

router.use(requireAuth);
router.get('/health', anyWorkspaceUser, getFinanceHubHealth);
router.get('/settings', settingsManager, getFinanceHubSettings);
router.put('/settings', settingsManager, updateFinanceHubSettings);

router.get('/company', anyWorkspaceUser, masters.getCompany);
router.put('/company', settingsManager, masters.putCompany);
router.post('/company/sync-invoice-settings', settingsManager, masters.syncCompany);
router.post('/gst-registrations', settingsManager, masters.postGstRegistration);
router.put('/gst-registrations/:id', settingsManager, masters.putGstRegistration);

router.get('/financial-years', anyWorkspaceUser, masters.getFinancialYears);
router.post('/financial-years', settingsManager, masters.postFinancialYear);
router.post('/financial-years/:id/current', settingsManager, masters.postCurrentFinancialYear);
router.patch('/periods/:id/status', allow([P.periodLock]), masters.patchPeriodStatus);
router.get('/number-series', allow([P.settingsManage, P.booksRead, P.booksManage]), masters.getNumberSeries);
router.put('/number-series/:id', settingsManager, masters.putNumberSeries);

router.get('/chart-of-accounts', anyWorkspaceUser, masters.getChart);
router.post('/chart-of-accounts/install-defaults', settingsManager, masters.postInstallDefaultChart);
router.post('/account-groups', settingsManager, masters.postAccountGroup);
router.put('/account-groups/:id', settingsManager, masters.putAccountGroup);
router.post('/accounts', settingsManager, masters.postAccount);
router.put('/accounts/:id', settingsManager, masters.putAccount);
router.get('/category-map', settingsManager, masters.getCategoryMap);
router.put('/category-map', settingsManager, masters.putCategoryMap);
router.get('/payment-method-map', settingsManager, masters.getPaymentMethods);
router.put('/payment-method-map', settingsManager, masters.putPaymentMethods);

router.get('/parties', anyWorkspaceUser, masters.getParties);
router.post('/parties/sync', allow([P.partiesManage]), masters.postPartySync);
router.get('/parties/:id', anyWorkspaceUser, masters.getPartyById);
router.post('/parties', allow([P.partiesManage]), masters.postParty);
router.put('/parties/:id', allow([P.partiesManage]), masters.putParty);

const bankReaders = allow([P.bankingRead, P.bankingManage, P.bankingReconcile, P.booksRead, P.booksManage, P.settingsManage]);
router.get('/bank-accounts', bankReaders, masters.getBankAccounts);
router.get('/bank-accounts/alias-suggestions', allow([P.bankingManage]), masters.getBankAliasSuggestions);
router.post('/bank-accounts', allow([P.bankingManage]), masters.postBankAccount);
router.put('/bank-accounts/:id', allow([P.bankingManage]), masters.putBankAccount);

router.get('/cost-centres', anyWorkspaceUser, masters.getCostCentres);
router.post('/cost-centres', settingsManager, masters.postCostCentre);
router.put('/cost-centres/:id', settingsManager, masters.putCostCentre);

router.get('/opening-balances/:yearId', allow([P.booksRead, P.booksManage, P.booksPost, P.caRead]), masters.getOpening);
router.put('/opening-balances/:yearId', allow([P.booksManage]), masters.putOpening);
router.post('/opening-balances/:yearId/finalize', allow([P.booksPost]), ledger.finalizeOpening);
router.post('/opening-balances/:yearId/reopen', allow([P.periodLock]), ledger.reopenOpening);

// Ledger engine (P2)
const bookReaders = allow([P.booksRead, P.booksManage, P.booksPost, P.approve, P.reportsRead, P.caRead]);
router.get('/vouchers', bookReaders, ledger.getVouchers);
router.get('/vouchers/:id', bookReaders, ledger.getVoucherById);
router.post('/vouchers', allow([P.booksManage]), ledger.postNewVoucher);
router.put('/vouchers/:id', allow([P.booksManage]), ledger.putVoucher);
router.delete('/vouchers/:id', allow([P.booksManage]), ledger.removeVoucher);
router.post('/vouchers/:id/post', allow([P.booksPost]), ledger.postVoucherToBooks);
router.post('/vouchers/:id/approve', allow([P.approve]), ledger.approve);
router.post('/vouchers/:id/reject', allow([P.approve]), ledger.reject);
router.post('/vouchers/:id/reverse', allow([P.booksPost]), ledger.reverse);

router.get('/reports/trial-balance', bookReaders, ledger.trialBalance);
router.get('/reports/general-ledger', bookReaders, ledger.generalLedger);
router.get('/audit-logs', allow([P.caRead, P.caManage, P.settingsManage]), ledger.auditTrail);
router.get('/vehicles', anyWorkspaceUser, ledger.vehicles);

// Automatic posting (P3)
router.get('/posting/status', allow([P.settingsManage, P.booksRead, P.booksPost, P.caRead]), posting.getPostingStatus);
router.put('/posting/settings', settingsManager, posting.putPostingSettings);
router.post('/posting/run', settingsManager, posting.postRunNow);
router.post('/posting/preview', settingsManager, posting.postPreview);
router.post('/posting/queue/retry-failed', settingsManager, posting.postRetryAll);
router.post('/posting/queue/:id/retry', settingsManager, posting.postRetry);
router.post('/posting/resync', allow([P.settingsManage, P.booksPost]), posting.postResync);


// Purchases, Sales & Vehicle Finance registers (P4)
const vehicleReaders = allow([P.vehicleRead, P.vehicleManage, P.purchasesRead, P.purchasesManage, P.salesRead, P.salesManage, P.reportsRead, P.caRead]);
router.get('/vehicle-finance/register', vehicleReaders, vehicleFinance.vehicleRegister);
router.get('/vehicle-finance/:id', vehicleReaders, vehicleFinance.vehicleDetail);
router.get('/ledger-balances', allow([P.purchasesRead, P.purchasesManage, P.salesRead, P.salesManage, P.arapRead, P.arapManage, P.partiesRead, P.booksRead, P.caRead]), vehicleFinance.ledgerBalances);
router.get('/receipts-register', allow([P.salesRead, P.salesManage, P.arapRead, P.arapManage, P.bankingRead, P.booksRead, P.caRead]), vehicleFinance.receiptsRegister);

export default router;
