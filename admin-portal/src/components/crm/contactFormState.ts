export type ContactFormState = {
  mobile: string;
  name: string;
  email: string;
  whatsappNumber: string;
  alternatePhone: string;
  companyName: string;
  city: string;
  state: string;
  pinCode: string;
  address: string;
  gstNumber: string;
  lifecycle: string;
  contactTypes: string[];
  tags: string[];
  notes: string;
  ownerId: string;
  preferredLanguage: string;
  doNotContact: boolean;
};

export const updateContactLocation = (
  form: ContactFormState,
  field: 'city' | 'state',
  value: string,
): ContactFormState => (field === 'state'
  ? { ...form, state: value, city: '' }
  : { ...form, city: value });

const optionalText = (value: string) => value.trim() || null;

/** Keeps contact phone inputs in the same ten-digit shape used by the CRM API. */
export const sanitizePhoneInput = (value: string) => {
  let digits = value.replace(/\D/g, '');
  if (digits.length === 12 && digits.startsWith('91')) digits = digits.slice(2);
  if (digits.length === 11 && digits.startsWith('0')) digits = digits.slice(1);
  return digits.slice(0, 10);
};

export const validateContactPhones = (form: Pick<ContactFormState, 'mobile' | 'whatsappNumber' | 'alternatePhone'>) => {
  if (!/^[6-9]\d{9}$/.test(form.mobile)) return 'Enter a valid 10-digit mobile number.';
  if (form.whatsappNumber && !/^[6-9]\d{9}$/.test(form.whatsappNumber)) return 'Enter a valid 10-digit WhatsApp number.';
  if (form.alternatePhone && !/^[6-9]\d{9}$/.test(form.alternatePhone)) return 'Enter a valid 10-digit alternate phone number.';
  return null;
};

export const buildContactPayload = (form: ContactFormState, canAssign: boolean) => {
  const payload: Record<string, unknown> = {
    mobile: sanitizePhoneInput(form.mobile),
    name: optionalText(form.name),
    email: optionalText(form.email),
    whatsappNumber: optionalText(sanitizePhoneInput(form.whatsappNumber)),
    alternatePhone: optionalText(sanitizePhoneInput(form.alternatePhone)),
    companyName: optionalText(form.companyName),
    city: optionalText(form.city),
    state: optionalText(form.state),
    pinCode: optionalText(form.pinCode),
    address: optionalText(form.address),
    gstNumber: optionalText(form.gstNumber),
    lifecycle: form.lifecycle || 'LEAD',
    contactTypes: form.contactTypes,
    tags: form.tags,
    notes: optionalText(form.notes),
    preferredLanguage: optionalText(form.preferredLanguage),
    doNotContact: form.doNotContact,
  };

  if (canAssign) payload.ownerId = form.ownerId || null;
  return payload;
};
