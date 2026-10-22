import { Prisma } from '@prisma/client';

// Ledger maths stays in Decimal end to end; JS numbers are only used for display.

export type MoneyInput = Prisma.Decimal | number | string | null | undefined;

const ZERO = new Prisma.Decimal(0);

/** Parses a money value; blank becomes 0, anything non-numeric returns null. */
export const parseMoneyValue = (value: MoneyInput): Prisma.Decimal | null => {
  if (value === null || value === undefined) return ZERO;
  if (value instanceof Prisma.Decimal) return value;
  if (typeof value === 'number') return Number.isFinite(value) ? new Prisma.Decimal(value) : null;
  const normalized = value.replace(/[₹,\s]/g, '');
  if (!normalized) return ZERO;
  if (!/^-?\d+(\.\d+)?$/.test(normalized)) return null;
  return new Prisma.Decimal(normalized);
};

export const roundMoney = (value: Prisma.Decimal) => value.toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);

export const sumMoney = (values: MoneyInput[]) =>
  roundMoney(values.reduce<Prisma.Decimal>((total, value) => total.plus(parseMoneyValue(value) ?? ZERO), ZERO));

export const moneyEquals = (left: MoneyInput, right: MoneyInput) =>
  roundMoney(parseMoneyValue(left) ?? ZERO).equals(roundMoney(parseMoneyValue(right) ?? ZERO));

export const paiseToMoney = (paise: number) => new Prisma.Decimal(paise).dividedBy(100);

export const moneyToPaise = (value: Prisma.Decimal) => roundMoney(value).times(100).toNumber();
