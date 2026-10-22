import type { Request } from 'express';
import { handle } from '../http';
import { getAlerts, getBalanceSheet, getBankCashReport, getCashFlow, getOverview, getPivot, getProfitAndLoss, getTaxReport, getTrend } from '../services/statements.service';

const query = (req: Request) => req.query as Record<string, unknown>;

export const profitAndLoss = handle((req) => getProfitAndLoss(query(req)));
export const balanceSheet = handle((req) => getBalanceSheet(query(req)));
export const cashFlow = handle((req) => getCashFlow(query(req)));
export const trend = handle((req) => getTrend(query(req)));
export const pivot = handle((req) => getPivot(query(req)));
export const bankCash = handle((req) => getBankCashReport(query(req)));
export const taxReport = handle((req) => getTaxReport(query(req)));
export const overview = handle(() => getOverview());
export const alerts = handle(() => getAlerts());
