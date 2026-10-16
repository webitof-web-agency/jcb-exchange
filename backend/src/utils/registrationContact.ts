import { normalizeProfileMobile } from './profileMobile';

export type RegistrationContactInput = {
  mobile?: unknown;
  whatsappNumber?: unknown;
  whatsappSameAsMobile?: unknown;
};

export type RegistrationContactResult =
  | {
      ok: true;
      mobile: string;
      whatsappNumber: string;
    }
  | {
      ok: false;
      error: string;
    };

/**
 * Normalize registration contact numbers once at the API boundary.
 *
 * `whatsappSameAsMobile` defaults to true so older clients that only submit a
 * mobile number keep working without creating an incomplete contact record.
 */
export const normalizeRegistrationContacts = (
  input: RegistrationContactInput,
): RegistrationContactResult => {
  if (input.mobile !== undefined && typeof input.mobile !== 'string') {
    return { ok: false, error: 'Mobile number must be a string.' };
  }

  if (input.whatsappNumber !== undefined && typeof input.whatsappNumber !== 'string') {
    return { ok: false, error: 'WhatsApp number must be a string.' };
  }

  if (input.whatsappSameAsMobile !== undefined && typeof input.whatsappSameAsMobile !== 'boolean') {
    return { ok: false, error: 'WhatsApp preference must be a boolean.' };
  }

  const mobile = normalizeProfileMobile(typeof input.mobile === 'string' ? input.mobile : '');
  if (!mobile) {
    return { ok: false, error: 'Enter a valid 10-digit mobile number.' };
  }

  const whatsappSameAsMobile = input.whatsappSameAsMobile !== false;
  if (whatsappSameAsMobile) {
    return { ok: true, mobile, whatsappNumber: mobile };
  }

  const whatsappNumber = normalizeProfileMobile(
    typeof input.whatsappNumber === 'string' ? input.whatsappNumber : '',
  );
  if (!whatsappNumber) {
    return { ok: false, error: 'Enter a valid 10-digit WhatsApp number.' };
  }

  return { ok: true, mobile, whatsappNumber };
};
