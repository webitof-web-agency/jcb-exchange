import assert from 'node:assert/strict';
import test from 'node:test';
import { buildForecast, type ForecastObservation } from './aiForecasting.service';

const observations: ForecastObservation[] = Array.from({ length: 14 }, (_, index) => ({
  date: `2026-01-${String(index + 1).padStart(2, '0')}`,
  value: 2 + index,
}));

test('builds a bounded forecast with confidence score and uncertainty bands', () => {
  const result = buildForecast({
    metric: 'sales',
    historicalDays: 14,
    horizonDays: 3,
    observations,
  });

  assert.equal(result.metric, 'sales');
  assert.equal(result.status, 'READY');
  assert.equal(result.forecast.daily.length, 3);
  assert.ok(result.confidenceScore >= 0 && result.confidenceScore <= 100);
  assert.equal(result.confidenceLabel, 'MEDIUM');
  assert.ok(result.forecast.daily.every((point) => point.lower <= point.value && point.value <= point.upper));
  assert.ok(result.forecast.daily.every((point) => point.value >= 0));
});

test('marks sparse history as insufficient data instead of presenting high confidence', () => {
  const result = buildForecast({
    metric: 'finance',
    historicalDays: 30,
    horizonDays: 7,
    observations: observations.slice(0, 4),
  });

  assert.equal(result.status, 'INSUFFICIENT_DATA');
  assert.equal(result.confidenceLabel, 'LOW');
  assert.ok(result.confidenceScore < 50);
  assert.ok(result.limitations.some((limitation) => limitation.toLowerCase().includes('7')));
});

test('keeps finance forecasts signed while count metrics remain non-negative', () => {
  const result = buildForecast({
    metric: 'finance',
    historicalDays: 7,
    horizonDays: 2,
    observations: [
      { date: '2026-02-01', value: -100 },
      { date: '2026-02-02', value: -80 },
      { date: '2026-02-03', value: -60 },
      { date: '2026-02-04', value: -40 },
      { date: '2026-02-05', value: -20 },
      { date: '2026-02-06', value: 0 },
      { date: '2026-02-07', value: 20 },
    ],
  });

  assert.equal(result.forecast.daily.length, 2);
  assert.ok(result.forecast.daily.some((point) => point.value < 0));
});

test('supports lead and KYC operational forecasts as non-negative count metrics', () => {
  const result = buildForecast({
    metric: 'leads',
    historicalDays: 7,
    horizonDays: 2,
    observations: observations.slice(0, 7),
  });

  assert.equal(result.metric, 'leads');
  assert.ok(result.forecast.daily.every((point) => point.value >= 0));
});
