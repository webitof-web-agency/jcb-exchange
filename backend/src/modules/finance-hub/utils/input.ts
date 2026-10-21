import { Prisma } from '@prisma/client';
import { parseFinanceDate } from '../../../utils/finance';
import { badRequest } from '../http';
import { parseMoneyValue, roundMoney } from './money';

// Small, strict readers for request bodies. Each throws a 400 with a field-specific message.

type Body = Record<string, unknown>;

const clean = (value: string) => value.replace(/[\u0000-\u001F\u007F]/g, ' ').replace(/\s+/g, ' ').trim();

export const readString = (body: Body, key: string, label: string, options: { max: number; required?: boolean }) => {
  const value = body[key];
  if (value === undefined || value === null || value === '') {
    if (options.required) throw badRequest(`${label} is required.`);
    return null;
  }
  if (typeof value !== 'string' && typeof value !== 'number') throw badRequest(`${label} is invalid.`);
  const text = clean(String(value));
  if (!text && options.required) throw badRequest(`${label} is required.`);
  if (text.length > options.max) throw badRequest(`${label} must not exceed ${options.max} characters.`);
  return text || null;
};

export const readMultiline = (body: Body, key: string, label: string, max: number) => {
  const value = body[key];
  if (value === undefined || value === null || value === '') return null;
  if (typeof value !== 'string') throw badRequest(`${label} is invalid.`);
  const text = value.replace(/\r/g, '').replace(/[\u0000-\u0009\u000B-\u001F\u007F]/g, ' ').trim();
  if (text.length > max) throw badRequest(`${label} must not exceed ${max} characters.`);
  return text || null;
};

export const readBoolean = (body: Body, key: string, fallback: boolean) => {
  const value = body[key];
  if (value === undefined || value === null) return fallback;
  if (typeof value === 'boolean') return value;
  if (value === 'true') return true;
  if (value === 'false') return false;
  throw badRequest(`${key} must be true or false.`);
};

export const readInt = (body: Body, key: string, label: string, options: { min: number; max: number }) => {
  const value = body[key];
  if (value === undefined || value === null || value === '') return null;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < options.min || parsed > options.max) {
    throw badRequest(`${label} must be a whole number between ${options.min} and ${options.max}.`);
  }
  return parsed;
};

export const readMoney = (body: Body, key: string, label: string, options: { allowNegative?: boolean } = {}) => {
  const value = body[key];
  if (value === undefined || value === null || value === '') return null;
  const parsed = parseMoneyValue(value as string | number);
  if (!parsed) throw badRequest(`${label} must be a valid amount.`);
  if (!options.allowNegative && parsed.isNegative()) throw badRequest(`${label} cannot be negative.`);
  if (parsed.abs().greaterThan('999999999999.99')) throw badRequest(`${label} is too large.`);
  return roundMoney(parsed);
};

export const readRate = (body: Body, key: string, label: string) => {
  const value = readMoney(body, key, label);
  if (value && value.greaterThan(100)) throw badRequest(`${label} cannot exceed 100%.`);
  return value;
};

export const readDate = (body: Body, key: string, label: string, required = false) => {
  const value = body[key];
  if (value === undefined || value === null || value === '') {
    if (required) throw badRequest(`${label} is required.`);
    return null;
  }
  const date = parseFinanceDate(value);
  if (!date) throw badRequest(`${label} is not a valid date.`);
  return date;
};

export const readEnum = <T extends string>(body: Body, key: string, label: string, allowed: readonly T[], fallback?: T): T => {
  const value = body[key];
  if ((value === undefined || value === null || value === '') && fallback !== undefined) return fallback;
  if (typeof value === 'string' && (allowed as readonly string[]).includes(value)) return value as T;
  throw badRequest(`${label} is invalid.`);
};

/** Keeps only the keys the caller actually sent, so PUT can be partial. */
export const onlyProvided = <T extends Record<string, unknown>>(body: Body, values: T): Partial<T> =>
  Object.fromEntries(Object.entries(values).filter(([key]) => body[key] !== undefined)) as Partial<T>;

export const decimalToNumber = (value: Prisma.Decimal | null | undefined) => (value === null || value === undefined ? null : value.toNumber());

export const dateOnly = (value: Date | null | undefined) => (value ? value.toISOString().slice(0, 10) : null);
