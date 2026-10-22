import { Router } from 'express';
import { requireAdminOrEmployeePermissions, requireAuth } from '../../middlewares/auth.middleware';
import { getFinanceHubHealth, getFinanceHubSettings, updateFinanceHubSettings } from './controllers/foundation.controller';
import * as banking from './controllers/banking.controller';
import * as ca from './controllers/ca.controller';
import * as documents from './controllers/documents.controller';
import * as expenses from './controllers/expenses.controller';
import * as ledger from './controllers/ledger.controller';
import * as masters from './controllers/masters.controller';
import * as payroll from './controllers/payroll.controller';
import * as posting from './controllers/posting.controller';
import * as receivables from './controllers/receivables.controller';
import * as statements from './controllers/statements.controller';
import * as tax from './controllers/tax.controller';
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
// Registered before /parties/:id so "balances" is not read as an id.
const dueReaders = allow([P.arapRead, P.arapManage, P.partiesRead, P.partiesManage, P.salesRead, P.purchasesRead, P.booksRead, P.reportsRead, P.caRead]);
router.get('/parties/balances', dueReaders, receivables.partyBalances);
router.get('/parties/:id/statement', dueReaders, receivables.partyStatement);
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

// Bills, invoices, notes, deal terms and settlements (P4b)
const documentReaders = allow([P.purchasesRead, P.purchasesManage, P.salesRead, P.salesManage, P.booksRead, P.booksPost, P.arapRead, P.reportsRead, P.caRead]);
const documentMakers = allow([P.purchasesManage, P.salesManage]);
router.get('/documents', documentReaders, documents.documents);
router.get('/documents/:id', documentReaders, documents.documentById);
router.post('/documents', documentMakers, documents.newDocument);
router.put('/documents/:id', documentMakers, documents.editDocument);
router.delete('/documents/:id', documentMakers, documents.removeDocument);
router.post('/documents/:id/post', allow([P.booksPost]), documents.postDocumentToBooks);
router.post('/documents/:id/cancel', allow([P.booksPost]), documents.cancelPostedDocument);

router.get('/deal-terms', vehicleReaders, documents.dealTermsList);
router.get('/deal-terms/:id', vehicleReaders, documents.dealTerms);
router.put('/deal-terms/:id', allow([P.vehicleManage]), documents.putDealTerms);

const settlementReaders = allow([P.vehicleRead, P.vehicleManage, P.arapRead, P.arapManage, P.booksRead, P.booksPost, P.caRead]);
router.get('/settlements/payables', settlementReaders, documents.payables);
router.get('/settlements', settlementReaders, documents.settlements);
router.post('/settlements', allow([P.vehicleManage, P.arapManage]), documents.newSettlement);
router.post('/settlements/:id/pay', allow([P.booksPost]), documents.paySettlementNow);
router.post('/settlements/:id/cancel', allow([P.booksPost]), documents.cancelSettlementNow);

// Receivables & payables (P5)
const dueManagers = allow([P.arapManage]);
router.get('/receivables/dues', dueReaders, receivables.dues);
router.get('/receivables/advances', dueReaders, receivables.advances);
router.get('/receivables/schedules', dueReaders, receivables.schedules);
router.post('/receivables/schedules', dueManagers, receivables.newSchedule);
router.put('/receivables/schedules/:id', dueManagers, receivables.changeSchedule);
router.get('/receivables/follow-ups', dueReaders, receivables.followUps);
router.post('/receivables/follow-ups', allow([P.arapManage, P.partiesManage]), receivables.newFollowUp);
router.post('/receivables/follow-ups/:id/done', allow([P.arapManage, P.partiesManage]), receivables.finishFollowUp);
router.get('/receivables/write-offs', dueReaders, receivables.writeOffs);
router.post('/receivables/write-offs', dueManagers, receivables.newWriteOff);

// Banking & cash (P6)
router.get('/banking/overview', bankReaders, banking.overview);
router.get('/banking/unmatched', bankReaders, banking.unmatched);
router.get('/banking/imports', bankReaders, banking.imports);
router.get('/banking/cash-counts', bankReaders, banking.cashCounts);
router.post('/banking/cash-counts', allow([P.bankingManage, P.bankingReconcile]), banking.newCashCount);
router.get('/banking/gateways', bankReaders, banking.gateways);
router.post('/banking/gateway-settlements', allow([P.booksPost]), banking.gatewaySettlements);
router.post('/banking/recon/match', allow([P.bankingReconcile]), banking.match);
router.post('/banking/recon/ignore', allow([P.bankingReconcile]), banking.ignore);
router.post('/banking/recon/create-voucher', allow([P.booksManage]), banking.voucherFromStatement);
router.delete('/banking/recon/:id', allow([P.bankingReconcile]), banking.removeMatch);
router.get('/banking/:id/reconciliation', bankReaders, banking.reconciliation);
router.get('/banking/:id/brs', bankReaders, banking.brs);
router.post('/banking/:id/auto-match', allow([P.bankingReconcile]), banking.runAutoMatch);

// Expenses & assets (P7)
const expenseReaders = allow([P.expensesRead, P.expensesManage, P.booksRead, P.booksPost, P.reportsRead, P.caRead]);
const expenseManagers = allow([P.expensesManage]);
router.get('/expenses/register', expenseReaders, expenses.register);
router.get('/expenses/recurring', expenseReaders, expenses.recurring);
router.post('/expenses/recurring', expenseManagers, expenses.newRecurring);
router.put('/expenses/recurring/:id', expenseManagers, expenses.editRecurring);
router.post('/expenses/recurring/generate', allow([P.expensesManage, P.booksManage]), expenses.generateRecurring);
router.get('/expenses/reimbursements', expenseReaders, expenses.reimbursements);
router.post('/expenses/reimbursements', expenseManagers, expenses.newReimbursement);
router.post('/expenses/reimbursements/:id/approve', allow([P.approve]), expenses.approveClaim);
router.post('/expenses/reimbursements/:id/reject', allow([P.approve]), expenses.rejectClaim);
router.post('/expenses/reimbursements/:id/pay', allow([P.booksPost]), expenses.payClaim);
router.get('/assets', expenseReaders, expenses.assets);
router.post('/assets', expenseManagers, expenses.newAsset);
router.get('/assets/prepaid', expenseReaders, expenses.prepaid);
router.post('/assets/prepaid', expenseManagers, expenses.newPrepaid);
router.get('/assets/runs/:kind', expenseReaders, expenses.runs);
router.post('/assets/runs/:kind', allow([P.booksPost]), expenses.newRun);
router.post('/assets/runs/:kind/:id/reverse', allow([P.booksPost]), expenses.reverseRunNow);
router.get('/assets/:id/schedule', expenseReaders, expenses.assetSchedule);
router.put('/assets/:id', expenseManagers, expenses.editAsset);
router.post('/assets/:id/dispose', allow([P.booksPost]), expenses.disposeFixedAsset);

// Taxation & compliance (P8)
const taxReaders = allow([P.taxRead, P.taxManage, P.booksRead, P.reportsRead, P.caRead]);
router.get('/tax/gst/register', taxReaders, tax.gstRegister);
router.get('/tax/gst/summary', taxReaders, tax.gstSummary);
router.post('/tax/gst/set-off', allow([P.booksPost]), tax.gstSetOff);
router.post('/tax/gst/2b', allow([P.taxManage]), tax.gstr2bUpload);
router.get('/tax/gst/2b', taxReaders, tax.gstr2bRecon);
router.get('/tax/gst/e-invoices', taxReaders, tax.eInvoices);
router.put('/tax/gst/e-invoices', allow([P.taxManage]), tax.saveEInvoice);
router.get('/tax/withholding', taxReaders, tax.withholding);
router.get('/tax/challans', taxReaders, tax.challans);
router.post('/tax/challans', allow([P.booksPost]), tax.newChallan);
router.get('/tax/income-tax', taxReaders, tax.incomeTax);
router.post('/tax/income-tax/provision', allow([P.booksPost]), tax.newProvision);

// Payroll (P9)
const payrollReaders = allow([P.payrollRead, P.payrollManage]);
const payrollManagers = allow([P.payrollManage]);
router.get('/payroll/structures', payrollReaders, payroll.structures);
router.post('/payroll/structures', payrollManagers, payroll.newStructure);
router.put('/payroll/structures/:id', payrollManagers, payroll.editStructure);
router.get('/payroll/employees', payrollReaders, payroll.employees);
router.post('/payroll/employees/import', payrollManagers, payroll.importEmployees);
router.put('/payroll/employees/:id/salary', payrollManagers, payroll.putSalary);
router.get('/payroll/runs', payrollReaders, payroll.runs);
router.post('/payroll/runs', payrollManagers, payroll.newRun);
router.get('/payroll/runs/:id', payrollReaders, payroll.run);
router.put('/payroll/runs/:id/payslips/:slipId', payrollManagers, payroll.editPayslip);
router.post('/payroll/runs/:id/recompute', payrollManagers, payroll.recompute);
router.post('/payroll/runs/:id/cancel', payrollManagers, payroll.cancel);
router.post('/payroll/runs/:id/approve', allow([P.approve]), payroll.approve);
router.post('/payroll/runs/:id/pay', allow([P.booksPost]), payroll.pay);
router.get('/payroll/advances', payrollReaders, payroll.advances);
router.post('/payroll/advances', allow([P.booksPost]), payroll.newAdvance);
router.post('/payroll/advances/:id/close', payrollManagers, payroll.endAdvance);
router.get('/payroll/statutory', payrollReaders, payroll.statutory);
router.get('/payroll/full-final', payrollReaders, payroll.fullFinal);
router.post('/payroll/full-final', payrollManagers, payroll.newFullFinal);
router.post('/payroll/full-final/:id/post', allow([P.approve]), payroll.postFnf);
router.post('/payroll/full-final/:id/pay', allow([P.booksPost]), payroll.payFnf);

// Financial reports & dashboards (P10)
const reportReaders = allow([P.reportsRead, P.reportsExport, P.booksRead, P.caRead, P.dashboardRead]);
router.get('/statements/profit-loss', reportReaders, statements.profitAndLoss);
router.get('/statements/balance-sheet', reportReaders, statements.balanceSheet);
router.get('/statements/cash-flow', reportReaders, statements.cashFlow);
router.get('/statements/trend', reportReaders, statements.trend);
router.get('/statements/pivot', reportReaders, statements.pivot);
router.get('/statements/bank-cash', allow([P.reportsRead, P.bankingRead, P.booksRead, P.caRead]), statements.bankCash);
router.get('/statements/tax', allow([P.reportsRead, P.taxRead, P.caRead]), statements.taxReport);
router.get('/dashboard/overview', allow([P.dashboardRead, P.reportsRead, P.caRead]), statements.overview);
router.get('/dashboard/alerts', allow([P.dashboardRead, P.approve, P.booksRead, P.caRead]), statements.alerts);

// CA & audit workspace, imports / exports (P11)
const caReaders = allow([P.caRead, P.caManage, P.caQuery, P.booksRead, P.reportsRead, P.periodLock]);
const caWriters = allow([P.caManage, P.caQuery, P.booksManage, P.periodLock]);
router.get('/ca/dashboard', caReaders, ca.dashboard);
router.get('/ca/vault', caReaders, ca.vault);
router.post('/ca/vault', allow([P.caManage, P.booksManage, P.settingsManage, P.taxManage, P.payrollManage]), ca.newVaultDocument);
router.post('/ca/vault/:id/archive', allow([P.caManage, P.settingsManage]), ca.toggleArchive);
router.get('/ca/monthly-close/:id', caReaders, ca.monthlyClose);
router.put('/ca/monthly-close/:id', allow([P.periodLock, P.caManage]), ca.saveMonthlyClose);
router.get('/ca/year-close/:id', caReaders, ca.yearClose);
router.post('/ca/year-close/:id', allow([P.periodLock]), ca.runYearClose);
router.post('/ca/year-close/:id/reopen', allow([P.periodLock]), ca.runYearReopen);
router.get('/ca/queries', caReaders, ca.queries);
router.post('/ca/queries', caWriters, ca.newQuery);
router.post('/ca/queries/:id/reply', caWriters, ca.replyQuery);
router.post('/ca/queries/:id/close', allow([P.caManage, P.caQuery]), ca.finishQuery);
router.get('/ca/review', caReaders, ca.reviewQueue);
router.post('/ca/review/:id', allow([P.caManage, P.caQuery]), ca.review);
router.post('/data/import/vouchers', allow([P.importManage]), ca.importVoucherRows);
router.post('/data/import/opening-balances', allow([P.importManage]), ca.importOpening);
router.get('/data/export/tally', allow([P.export, P.reportsExport, P.caManage]), ca.tallyExport);
router.get('/data/export/:kind', allow([P.export, P.reportsExport, P.caManage]), ca.csvExport);
router.get('/data/history', allow([P.importManage, P.export, P.caRead, P.caManage]), ca.history);

export default router;
