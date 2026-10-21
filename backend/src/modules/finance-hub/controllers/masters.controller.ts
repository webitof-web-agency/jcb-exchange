import type { Request } from 'express';
import { badRequest, getRequestPermissions, handle, hasAnyOf } from '../http';
import { FH_PERMISSIONS } from '../permissions';
import {
  createAccount,
  createAccountGroup,
  getChartOfAccounts,
  getPaymentMethodMap,
  installDefaultChart,
  listCategoryMap,
  updateAccount,
  updateAccountGroup,
  updateCategoryMap,
  updatePaymentMethodMap,
} from '../services/accounts.service';
import { createBankAccount, listAliasSuggestions, listBankAccounts, updateBankAccount } from '../services/bankAccounts.service';
import {
  createGstRegistration,
  getCompanyProfile,
  saveCompanyProfile,
  syncCompanyFromInvoiceSettings,
  updateGstRegistration,
} from '../services/company.service';
import { actorFromRequest, requestBody } from '../services/context';
import { createCostCentre, listCostCentres, updateCostCentre } from '../services/costCentres.service';
import { getOpeningBalances, saveOpeningBalances } from '../services/openingBalances.service';
import { createParty, getParty, listParties, syncPartiesFromRecords, updateParty } from '../services/parties.service';
import {
  createFinancialYear,
  listFinancialYears,
  listNumberSeries,
  setCurrentFinancialYear,
  updateNumberSeries,
  updatePeriodStatus,
} from '../services/periods.service';

const idParam = (req: Request, name = 'id') => {
  const value = req.params[name];
  if (typeof value !== 'string' || !value.trim() || value.length > 60) throw badRequest('Record id is required.');
  return value.trim();
};

const canSeePartyBankDetails = async (req: Request) =>
  hasAnyOf(await getRequestPermissions(req), [FH_PERMISSIONS.partiesManage, FH_PERMISSIONS.bankingManage]);
const canSeeBankNumbers = async (req: Request) =>
  hasAnyOf(await getRequestPermissions(req), [FH_PERMISSIONS.bankingManage]);

// Company & GST
export const getCompany = handle(() => getCompanyProfile());
export const putCompany = handle((req) => saveCompanyProfile(requestBody(req), actorFromRequest(req)));
export const syncCompany = handle((req) => syncCompanyFromInvoiceSettings(actorFromRequest(req)));
export const postGstRegistration = handle((req) => createGstRegistration(requestBody(req), actorFromRequest(req)), 201);
export const putGstRegistration = handle((req) => updateGstRegistration(idParam(req), requestBody(req), actorFromRequest(req)));

// Financial years, periods, numbering
export const getFinancialYears = handle(async () => ({ years: await listFinancialYears() }));
export const postFinancialYear = handle((req) => createFinancialYear(requestBody(req), actorFromRequest(req)), 201);
export const postCurrentFinancialYear = handle((req) => setCurrentFinancialYear(idParam(req), actorFromRequest(req)));
export const patchPeriodStatus = handle((req) => updatePeriodStatus(idParam(req), requestBody(req), actorFromRequest(req)));
export const getNumberSeries = handle((req) => {
  const yearId = typeof req.query.yearId === 'string' ? req.query.yearId : '';
  if (!yearId) throw badRequest('yearId is required.');
  return listNumberSeries(yearId);
});
export const putNumberSeries = handle((req) => updateNumberSeries(idParam(req), requestBody(req), actorFromRequest(req)));

// Chart of accounts & mappings
export const getChart = handle(() => getChartOfAccounts());
export const postInstallDefaultChart = handle((req) => installDefaultChart(requestBody(req), actorFromRequest(req)));
export const postAccountGroup = handle((req) => createAccountGroup(requestBody(req), actorFromRequest(req)), 201);
export const putAccountGroup = handle((req) => updateAccountGroup(idParam(req), requestBody(req), actorFromRequest(req)));
export const postAccount = handle((req) => createAccount(requestBody(req), actorFromRequest(req)), 201);
export const putAccount = handle((req) => updateAccount(idParam(req), requestBody(req), actorFromRequest(req)));
export const getCategoryMap = handle(async () => ({ items: await listCategoryMap() }));
export const putCategoryMap = handle((req) => updateCategoryMap(requestBody(req), actorFromRequest(req)));
export const getPaymentMethods = handle(() => getPaymentMethodMap());
export const putPaymentMethods = handle((req) => updatePaymentMethodMap(requestBody(req), actorFromRequest(req)));

// Parties
export const getParties = handle(async (req) => listParties(req.query as Record<string, unknown>, await canSeePartyBankDetails(req)));
export const getPartyById = handle(async (req) => getParty(idParam(req), await canSeePartyBankDetails(req)));
export const postParty = handle(async (req) => createParty(requestBody(req), actorFromRequest(req), await canSeePartyBankDetails(req)), 201);
export const putParty = handle(async (req) => updateParty(idParam(req), requestBody(req), actorFromRequest(req), await canSeePartyBankDetails(req)));
export const postPartySync = handle((req) => syncPartiesFromRecords(requestBody(req), actorFromRequest(req)));

// Bank accounts
export const getBankAccounts = handle(async (req) => ({ accounts: await listBankAccounts(await canSeeBankNumbers(req)) }));
export const getBankAliasSuggestions = handle(async () => ({ suggestions: await listAliasSuggestions() }));
export const postBankAccount = handle(async (req) => createBankAccount(requestBody(req), actorFromRequest(req), await canSeeBankNumbers(req)), 201);
export const putBankAccount = handle(async (req) => updateBankAccount(idParam(req), requestBody(req), actorFromRequest(req), await canSeeBankNumbers(req)));

// Cost centres
export const getCostCentres = handle(async () => ({ costCentres: await listCostCentres() }));
export const postCostCentre = handle((req) => createCostCentre(requestBody(req), actorFromRequest(req)), 201);
export const putCostCentre = handle((req) => updateCostCentre(idParam(req), requestBody(req), actorFromRequest(req)));

// Opening balances
export const getOpening = handle((req) => getOpeningBalances(idParam(req, 'yearId')));
export const putOpening = handle((req) => saveOpeningBalances(idParam(req, 'yearId'), requestBody(req), actorFromRequest(req)));
