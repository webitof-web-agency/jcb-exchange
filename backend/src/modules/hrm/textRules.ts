import { z } from 'zod';

/**
 * Text typed into HR records: extra spaces and hidden characters are removed, and names, places and bank names must
 * read as such. The portal checks the same before saving (admin-portal/src/lib/hrmProfile.ts).
 */

/** Control and direction-override characters removed, runs of spaces collapsed, ends trimmed. */
export const cleanText = (value: string) => value.replace(/[\u0000-\u001F\u007F\u202A-\u202E\u2066-\u2069]/g, ' ').replace(/\s+/g, ' ').trim();

const HAS_LETTER = /\p{L}/u;
// Letters of any language with their vowel signs and joiners, plus the punctuation names and places use.
const PERSON_NAME = /^[\p{L}\p{M}\u200C\u200D .'’-]+$/u;
const RELATION = /^[\p{L}\p{M}\u200C\u200D .'’()/-]+$/u;
// Digits and commas occur in real names ("North 24 Parganas"); a letter is still needed.
const PLACE_NAME = /^[\p{L}\p{M}\p{N}\u200C\u200D .,'’()&-]+$/u;
const ACCOUNT_HOLDER = /^[\p{L}\p{M}\u200C\u200D .'’&/-]+$/u;
const BANK_NAME = /^[\p{L}\p{M}\p{N}\u200C\u200D .'’()&-]+$/u;

/** A cleaned text of the given length; when not empty it must match `allowed` and contain a letter. */
const worded = (min: number, max: number, allowed: RegExp, message: string) => z.string().transform(cleanText).pipe(
  z.string().min(min, min > 1 ? `Enter at least ${min} characters.` : 'This field is required.').max(max)
    .refine((value) => value === '' || (allowed.test(value) && HAS_LETTER.test(value)), message),
);

const LETTERS_ONLY = 'Use letters only (spaces, dots, hyphens and apostrophes are fine).';
export const personName = (min = 0, max = 160) => worded(min, max, PERSON_NAME, LETTERS_ONLY);
export const relationText = () => worded(1, 60, RELATION, 'Use letters only, for example Father or Brother-in-law.');
export const placeName = () => worded(1, 80, PLACE_NAME, 'Enter the name of the place.');
export const accountHolderName = () => worded(2, 160, ACCOUNT_HOLDER, 'Use the name as the bank prints it (letters only).');
export const bankNameText = () => worded(2, 120, BANK_NAME, 'Use letters and numbers only.');

export const addressLine = (min: 0 | 1) => z.string().transform(cleanText).pipe(
  z.string().min(min, 'Enter the address line.').max(200)
    .refine((value) => !/[<>]/.test(value), 'Remove the < and > characters.')
    .refine((value) => value === '' || /[\p{L}\p{N}]/u.test(value), 'Write the address in words or numbers.'),
);

export const titleText = () => z.string().transform(cleanText).pipe(
  z.string().min(1, 'Give the document a title.').max(160).refine((value) => !/[<>]/.test(value), 'Remove the < and > characters.'),
);

/** Indian PIN codes are six digits and never start with 0. */
export const pinCode = () => z.string().trim().regex(/^[1-9]\d{5}$/, 'Enter a valid 6-digit PIN code.');

export const MIN_EMPLOYEE_AGE = 14;
const realDay = (value: string) => {
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
};
/** A real date of birth of somebody old enough to be employed. */
export const birthDate = () => z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD dates.')
  .refine((value) => realDay(value) && value >= '1900-01-01', 'Enter a valid date of birth.')
  .refine((value) => new Date(`${value}T00:00:00.000Z`).getTime() <= Date.now() - MIN_EMPLOYEE_AGE * 365.25 * 24 * 60 * 60 * 1000, `The employee must be at least ${MIN_EMPLOYEE_AGE} years old.`);
