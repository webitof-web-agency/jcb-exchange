import { isValidEmail, normalizeMobile } from './hrmOnboarding';

/**
 * The login owns an employee's identity (email, mobile, password). For somebody who can sign in, the HR profile's
 * work email and mobile ARE the login's, so editing them changes the login and signs the person out. These helpers
 * decide what the profile form may send, what it has to check first and what it tells the person afterwards.
 */

export type IdentityField = 'workEmail' | 'mobile';
export type IdentityValues = { workEmail: string; mobile: string };
export type IdentityBaseline = { workEmail?: string | null | undefined; mobile?: string | null | undefined };
export type IdentityErrors = Partial<Record<IdentityField, string>>;

/** bcrypt ignores everything after 72 bytes, so the server refuses longer passwords. */
export const LOGIN_PASSWORD_MAX_BYTES = 72;
export const LOGIN_PASSWORD_MIN_LENGTH = 8;

export const sameEmail = (a: string | null | undefined, b: string | null | undefined) =>
  (a ?? '').trim().toLowerCase() === (b ?? '').trim().toLowerCase();

/** Same number whatever the spelling (+91 98765 43210, 09876543210, 9876543210). */
export const sameMobile = (a: string | null | undefined, b: string | null | undefined) =>
  normalizeMobile(a ?? '') === normalizeMobile(b ?? '');

/** The server's rule for a stored mobile number: 8 to 15 characters, digits with an optional leading + (the column is 15 wide). */
const STORED_MOBILE_PATTERN = /^(?=.{8,15}$)\+?[0-9]+$/;
export const isValidStoredMobile = (value: string) => STORED_MOBILE_PATTERN.test(value);

/**
 * The mobile as it is stored for somebody without a login: spaces, dashes and the +91 / 0 prefix of an Indian number are
 * dropped (ten digits), any other international number keeps its + and digits. Empty stays empty.
 */
export const toStoredMobile = (value: string) => {
  const trimmed = value.trim();
  if (!trimmed) return '';
  const digits = normalizeMobile(trimmed);
  return trimmed.startsWith('+') && digits.length !== 10 ? `+${trimmed.replace(/\D/g, '')}` : digits;
};

/** Which of the two identity fields differ from what is stored. */
export const detectIdentityChanges = (form: IdentityValues, baseline: IdentityBaseline) => ({
  email: !sameEmail(form.workEmail, baseline.workEmail),
  mobile: !sameMobile(form.mobile, baseline.mobile),
});

/**
 * Checks the identity fields before a save. Somebody with a login is checked on the fields they changed (a stored value
 * that is already in the login is not re-judged); somebody without a login keeps the old, lenient behaviour (only a
 * typed email has to look like one, the server checks the rest).
 */
export const validateIdentity = (form: IdentityValues, baseline: IdentityBaseline, hasLogin: boolean): IdentityErrors => {
  const errors: IdentityErrors = {};
  const changes = detectIdentityChanges(form, baseline);
  const email = form.workEmail.trim();
  const mobile = form.mobile.trim();

  if (hasLogin) {
    if (changes.email) {
      if (!email) errors.workEmail = 'A login needs an email address.';
      else if (!isValidEmail(email)) errors.workEmail = 'Enter a valid email address.';
    }
    if (changes.mobile) {
      if (!mobile) {
        if ((baseline.mobile ?? '').trim()) errors.mobile = 'This login has a mobile number. Change it here, or remove it on the Users screen.';
      } else if (normalizeMobile(mobile).length !== 10) {
        errors.mobile = 'Enter a valid 10-digit mobile number.';
      }
    }
  } else {
    if (email && !isValidEmail(email)) errors.workEmail = 'Enter a valid email address.';
    // Only a number that was typed is judged here: the server would reject a bad one with a technical message.
    if (changes.mobile && mobile && !isValidStoredMobile(toStoredMobile(mobile))) errors.mobile = 'Enter a valid mobile number: 8 to 15 digits, with an optional leading +.';
  }
  return errors;
};

/**
 * The email / mobile part of the profile update. A login holder sends only what changed (and the mobile as ten
 * digits), so an unchanged value is never re-validated or re-written on the login. Without a login the same rule
 * holds (only what changed is sent, a cleared box goes as null) and the mobile is sent the way it is stored.
 */
export const buildIdentityPatch = (form: IdentityValues, baseline: IdentityBaseline, hasLogin: boolean) => {
  const changes = detectIdentityChanges(form, baseline);
  if (!hasLogin) {
    return {
      ...(changes.email ? { workEmail: form.workEmail.trim() || null } : {}),
      ...(changes.mobile ? { mobile: toStoredMobile(form.mobile) || null } : {}),
    } as { workEmail?: string | null; mobile?: string | null };
  }
  return {
    ...(changes.email ? { workEmail: form.workEmail.trim() } : {}),
    ...(changes.mobile ? { mobile: form.mobile.trim() ? normalizeMobile(form.mobile) : null } : {}),
  } as { workEmail?: string | null; mobile?: string | null };
};

/** The editable part of the profile form, as the server last told us. */
export type ProfileForm = { preferredName: string; workEmail: string; mobile: string; status: string; version: number };

export const toProfileForm = (employee: { preferredName?: string | null; workEmail?: string | null; mobile?: string | null; status: string; version: number }): ProfileForm => ({
  preferredName: employee.preferredName || '',
  workEmail: employee.workEmail || '',
  mobile: employee.mobile || '',
  status: employee.status,
  version: employee.version,
});

/**
 * The form after the server data was read again. A field the person has not touched (it still equals what the previous
 * read said) takes the new server value; a field they typed in stays exactly as typed. The version always follows the
 * server, so the next save is not refused as stale.
 */
export const mergeProfileForm = (current: ProfileForm, previousServer: ProfileForm | null, nextServer: ProfileForm): ProfileForm => {
  if (!previousServer) return nextServer;
  const pick = <K extends 'preferredName' | 'workEmail' | 'mobile' | 'status'>(key: K): ProfileForm[K] => (current[key] === previousServer[key] ? nextServer[key] : current[key]);
  return { preferredName: pick('preferredName'), workEmail: pick('workEmail'), mobile: pick('mobile'), status: pick('status'), version: nextServer.version };
};

/** True when something was typed that the server does not have yet. */
export const isProfileFormDirty = (current: ProfileForm, server: ProfileForm | null) =>
  Boolean(server) && (current.preferredName !== server!.preferredName || current.workEmail !== server!.workEmail || current.mobile !== server!.mobile || current.status !== server!.status);

/** What the person who saved is told. A login change signs the person out, so say so. */
export const describeSaveNotice = (changes: { email: boolean; mobile: boolean }, options: { hasLogin: boolean; ownLogin?: boolean }) => {
  if (!options.hasLogin || (!changes.email && !changes.mobile)) return 'Employee details saved.';
  const what = changes.email && changes.mobile ? 'email and mobile' : changes.email ? 'email' : 'mobile number';
  return options.ownLogin
    ? `Saved. Your own sign-in ${what} changed, so you will be asked to sign in again with the new ${what}.`
    : `Saved. They have been signed out and must sign in with the new ${what}.`;
};

/** Length and byte checks for a new login password; null when it is fine. */
export const validateLoginPassword = (password: string): string | null => {
  if (password.length < LOGIN_PASSWORD_MIN_LENGTH) return `Password must be at least ${LOGIN_PASSWORD_MIN_LENGTH} characters long.`;
  if (new TextEncoder().encode(password).length > LOGIN_PASSWORD_MAX_BYTES) {
    return `Password is too long (${LOGIN_PASSWORD_MAX_BYTES} bytes at most; accented characters count as more than one).`;
  }
  return null;
};

/** One line under the Login account card when the login cannot sign in right now; null for an active login. */
export const describeLoginStatusHint = (status: string | null | undefined): string | null => {
  switch (status) {
    case 'INACTIVE':
      return 'This login is switched off, so the person cannot sign in. Deactivate / Reactivate handles it for exits and holds; otherwise change it on the Users screen.';
    case 'SUSPENDED':
      return 'This login is suspended. Reactivate the employee if HR put them on hold; otherwise change it on the Users screen.';
    case 'BLOCKED':
    case 'CLOSED':
      return 'This login is blocked or closed. Only the Users screen can change that.';
    default:
      return null;
  }
};

/** Chip colours for a login status (ACTIVE can sign in; the others cannot). */
export const getLoginStatusClass = (status: string | null | undefined) => {
  if (status === 'ACTIVE') return 'bg-emerald-50 text-emerald-700 ring-emerald-600/20';
  if (status === 'INACTIVE' || status === 'SUSPENDED') return 'bg-rose-50 text-rose-700 ring-rose-600/20';
  return 'bg-slate-100 text-slate-600 ring-slate-500/20';
};
