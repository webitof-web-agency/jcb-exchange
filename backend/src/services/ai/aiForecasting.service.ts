import { Prisma } from '@prisma/client';
import prisma from '../../lib/prisma';

const DAY_MS = 24 * 60 * 60 * 1000;

export type ForecastMetric = 'sales' | 'inventory' | 'finance' | 'leads' | 'kyc' | 'partners' | 'collections';

export type ForecastArguments = {
  metric?: ForecastMetric;
  days?: number;
  horizon?: number;
};

export type ForecastObservation = {
  date: string;
  value: number;
};

export type ForecastDailyPoint = ForecastObservation & {
  lower: number;
  upper: number;
};

export type ForecastResult = {
  metric: ForecastMetric;
  status: 'READY' | 'INSUFFICIENT_DATA';
  historicalDays: number;
  horizonDays: number;
  confidenceScore: number;
  confidenceLabel: 'HIGH' | 'MEDIUM' | 'LOW';
  historical: {
    observations: number;
    nonZeroObservations: number;
    total: number;
    averagePerDay: number;
    trendPerDay: number;
  };
  forecast: {
    total: number;
    averagePerDay: number;
    daily: ForecastDailyPoint[];
  };
  method: string;
  limitations: string[];
};

type BuildForecastInput = {
  metric: ForecastMetric;
  historicalDays: number;
  horizonDays: number;
  observations: ForecastObservation[];
};

type ForecastDataSource = {
  daily: (metric: ForecastMetric, from: Date) => Promise<ForecastObservation[]>;
};

const clamp = (value: number, minimum: number, maximum: number) => Math.min(maximum, Math.max(minimum, value));

const round = (value: number) => Math.round(value * 100) / 100;

const dateKey = (date: Date) => date.toISOString().slice(0, 10);

const dateFromKey = (value: string) => new Date(`${value}T00:00:00.000Z`);

const startOfUtcDay = (date: Date) => {
  const start = new Date(date);
  start.setUTCHours(0, 0, 0, 0);
  return start;
};

const metricIsCount = (metric: ForecastMetric) => ['sales', 'inventory', 'leads', 'kyc', 'partners'].includes(metric);

const linearRegression = (values: number[]) => {
  const count = values.length;
  const meanX = (count - 1) / 2;
  const meanY = values.reduce((sum, value) => sum + value, 0) / Math.max(1, count);
  let numerator = 0;
  let denominator = 0;
  for (let index = 0; index < count; index += 1) {
    const distance = index - meanX;
    numerator += distance * ((values[index] ?? 0) - meanY);
    denominator += distance * distance;
  }
  const slope = denominator ? numerator / denominator : 0;
  const intercept = meanY - slope * meanX;
  const fitted = values.map((_, index) => intercept + slope * index);
  const totalSquares = values.reduce((sum, value) => sum + (value - meanY) ** 2, 0);
  const residualSquares = values.reduce((sum, value, index) => sum + (value - (fitted[index] ?? 0)) ** 2, 0);
  const rSquared = totalSquares > 0 ? clamp(1 - residualSquares / totalSquares, 0, 1) : 0;
  const residualStandardDeviation = Math.sqrt(residualSquares / Math.max(1, count - 2));

  return { slope, meanY, rSquared, residualStandardDeviation };
};

const confidenceLabelFor = (score: number): ForecastResult['confidenceLabel'] => {
  if (score >= 75) return 'HIGH';
  if (score >= 50) return 'MEDIUM';
  return 'LOW';
};

/**
 * Deterministic, explainable forecast calculation. It intentionally avoids
 * pretending that sparse operational data is a high-confidence prediction.
 */
export const buildForecast = (input: BuildForecastInput): ForecastResult => {
  const sorted = input.observations
    .filter((observation) => Number.isFinite(observation.value) && /^\d{4}-\d{2}-\d{2}$/u.test(observation.date))
    .sort((left, right) => left.date.localeCompare(right.date));
  const values = sorted.map((observation) => observation.value);
  const observationCount = values.length;
  const nonZeroObservations = values.filter((value) => Math.abs(value) > 0.0001).length;
  const total = values.reduce((sum, value) => sum + value, 0);
  const averagePerDay = total / Math.max(1, observationCount);
  const regression = linearRegression(values.length ? values : [0]);
  const variance = values.length
    ? values.reduce((sum, value) => sum + (value - averagePerDay) ** 2, 0) / values.length
    : 0;
  const standardDeviation = Math.sqrt(variance);
  const coefficientOfVariation = standardDeviation / Math.max(Math.abs(averagePerDay), 1);
  const recentValues = values.slice(-7);
  const recentAverage = recentValues.length
    ? recentValues.reduce((sum, value) => sum + value, 0) / recentValues.length
    : 0;
  const activityScore = observationCount ? nonZeroObservations / observationCount : 0;
  const sampleScore = Math.min(1, observationCount / 30);
  const stabilityScore = 1 / (1 + Math.min(4, coefficientOfVariation));
  const horizonScore = 1 - Math.min(0.5, input.horizonDays / 60);
  let confidenceScore = Math.round(100 * (
    (sampleScore * 0.35)
    + (activityScore * 0.2)
    + (stabilityScore * 0.2)
    + (regression.rSquared * 0.15)
    + (horizonScore * 0.1)
  ));
  const insufficientData = observationCount < 7 || nonZeroObservations === 0;
  if (insufficientData) confidenceScore = Math.min(confidenceScore, 39);
  confidenceScore = clamp(confidenceScore, 0, 100);

  const latestDate = sorted.length ? dateFromKey(sorted[sorted.length - 1]?.date ?? dateKey(new Date())) : startOfUtcDay(new Date());
  const daily: ForecastDailyPoint[] = [];
  for (let index = 0; index < input.horizonDays; index += 1) {
    const date = new Date(latestDate.getTime() + ((index + 1) * DAY_MS));
    const predicted = recentAverage + regression.slope * (index + 1);
    const value = metricIsCount(input.metric) ? Math.max(0, predicted) : predicted;
    const uncertaintyFloor = Math.abs(value) * Math.max(0.05, 1 - confidenceScore / 100);
    const margin = Math.max(regression.residualStandardDeviation * 1.96, uncertaintyFloor);
    const lower = metricIsCount(input.metric) ? Math.max(0, value - margin) : value - margin;
    daily.push({ date: dateKey(date), value: round(value), lower: round(lower), upper: round(value + margin) });
  }

  const limitations = ['Forecast is directional and should not be treated as a guaranteed outcome.'];
  if (observationCount < 7) limitations.push('At least 7 daily observations are required for a reliable baseline.');
  if (nonZeroObservations === 0) limitations.push('No non-zero activity was found in the selected history window.');
  if (coefficientOfVariation > 1) limitations.push('Historical activity is volatile, so the confidence interval is wider.');
  if (input.horizonDays > 14) limitations.push('Longer forecast horizons carry additional uncertainty.');

  const forecastTotal = daily.reduce((sum, point) => sum + point.value, 0);
  return {
    metric: input.metric,
    status: insufficientData ? 'INSUFFICIENT_DATA' : 'READY',
    historicalDays: input.historicalDays,
    horizonDays: input.horizonDays,
    confidenceScore,
    confidenceLabel: confidenceLabelFor(confidenceScore),
    historical: {
      observations: observationCount,
      nonZeroObservations,
      total: round(total),
      averagePerDay: round(averagePerDay),
      trendPerDay: round(regression.slope),
    },
    forecast: {
      total: round(forecastTotal),
      averagePerDay: round(forecastTotal / Math.max(1, daily.length)),
      daily,
    },
    method: 'Recent 7-day baseline plus least-squares linear trend; uncertainty uses residual variability and forecast horizon.',
    limitations,
  };
};

const defaultDataSource: ForecastDataSource = {
  async daily(metric, from) {
    if (metric === 'sales') {
      const rows = await prisma.$queryRaw<Array<{ date: string; value: number | bigint }>>(Prisma.sql`
        SELECT TO_CHAR(DATE_TRUNC('day', "soldAt"), 'YYYY-MM-DD') AS "date",
               COUNT(*)::int AS "value"
        FROM "SaleRecord"
        WHERE "soldAt" >= ${from}
        GROUP BY 1
        ORDER BY 1 ASC
      `);
      return rows.map((row) => ({ date: row.date, value: Number(row.value) }));
    }
    if (metric === 'inventory') {
      const rows = await prisma.$queryRaw<Array<{ date: string; value: number | bigint }>>(Prisma.sql`
        SELECT TO_CHAR(DATE_TRUNC('day', "createdAt"), 'YYYY-MM-DD') AS "date",
               COUNT(*)::int AS "value"
        FROM "Listing"
        WHERE "createdAt" >= ${from}
        GROUP BY 1
        ORDER BY 1 ASC
      `);
      return rows.map((row) => ({ date: row.date, value: Number(row.value) }));
    }
    if (metric === 'leads') {
      const rows = await prisma.$queryRaw<Array<{ date: string; value: number | bigint }>>(Prisma.sql`
        SELECT TO_CHAR(DATE_TRUNC('day', "createdAt"), 'YYYY-MM-DD') AS "date",
               COUNT(*)::int AS "value"
        FROM "Lead"
        WHERE "createdAt" >= ${from}
        GROUP BY 1
        ORDER BY 1 ASC
      `);
      return rows.map((row) => ({ date: row.date, value: Number(row.value) }));
    }
    if (metric === 'kyc') {
      const rows = await prisma.$queryRaw<Array<{ date: string; value: number | bigint }>>(Prisma.sql`
        SELECT TO_CHAR(DATE_TRUNC('day', "uploadedAt"), 'YYYY-MM-DD') AS "date",
               COUNT(*)::int AS "value"
        FROM "KycDocument"
        WHERE "uploadedAt" >= ${from}
        GROUP BY 1
        ORDER BY 1 ASC
      `);
      return rows.map((row) => ({ date: row.date, value: Number(row.value) }));
    }
    if (metric === 'partners') {
      const rows = await prisma.$queryRaw<Array<{ date: string; value: number | bigint }>>(Prisma.sql`
        SELECT TO_CHAR(DATE_TRUNC('day', "createdAt"), 'YYYY-MM-DD') AS "date",
               COUNT(*)::int AS "value"
        FROM "PartnerProfile"
        WHERE "createdAt" >= ${from}
        GROUP BY 1
        ORDER BY 1 ASC
      `);
      return rows.map((row) => ({ date: row.date, value: Number(row.value) }));
    }
    if (metric === 'collections') {
      const rows = await prisma.$queryRaw<Array<{ date: string; value: unknown }>>(Prisma.sql`
        SELECT TO_CHAR(DATE_TRUNC('day', "submittedAt"), 'YYYY-MM-DD') AS "date",
               COALESCE(SUM("amount"), 0) AS "value"
        FROM "ListingPaymentSubmission"
        WHERE "submittedAt" >= ${from}
          AND "status" IN ('APPROVED', 'PAID')
        GROUP BY 1
        ORDER BY 1 ASC
      `);
      return rows.map((row) => ({ date: row.date, value: Number(row.value) }));
    }
    const rows = await prisma.$queryRaw<Array<{ date: string; value: unknown }>>(Prisma.sql`
      SELECT TO_CHAR(DATE_TRUNC('day', "transactionDate"), 'YYYY-MM-DD') AS "date",
             COALESCE(SUM(CASE WHEN "type" = 'CREDIT' THEN "amount" WHEN "type" = 'DEBIT' THEN -"amount" ELSE 0 END), 0) AS "value"
      FROM "FinanceTransaction"
      WHERE "status" <> 'VOIDED' AND "transactionDate" >= ${from}
      GROUP BY 1
      ORDER BY 1 ASC
    `);
    return rows.map((row) => ({ date: row.date, value: Number(row.value) }));
  },
};

const fillDailyGaps = (from: Date, historicalDays: number, rows: ForecastObservation[]) => {
  const valuesByDate = new Map(rows.map((row) => [row.date, row.value]));
  return Array.from({ length: historicalDays }, (_, index) => {
    const date = new Date(from.getTime() + (index * DAY_MS));
    return { date: dateKey(date), value: valuesByDate.get(dateKey(date)) ?? 0 };
  });
};

export class AiForecastingService {
  constructor(
    private readonly dataSource: ForecastDataSource = defaultDataSource,
    private readonly clock: () => Date = () => new Date(),
  ) {}

  async forecast(args: ForecastArguments = {}): Promise<ForecastResult> {
    const metric = args.metric ?? 'sales';
    const historicalDays = clamp(Math.floor(args.days ?? 30), 7, 90);
    const horizonDays = clamp(Math.floor(args.horizon ?? 7), 1, 30);
    const now = this.clock();
    const from = startOfUtcDay(new Date(now.getTime() - ((historicalDays - 1) * DAY_MS)));
    const rows = await this.dataSource.daily(metric, from);
    return buildForecast({
      metric,
      historicalDays,
      horizonDays,
      observations: fillDailyGaps(from, historicalDays, rows),
    });
  }
}

export const aiForecastingService = new AiForecastingService();
