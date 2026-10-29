// Staff tokens open the admin portal (money, KYC, customer data), so they last one working day;
// customers and partners keep a week so the website and app do not log them out every day.
const STAFF_ROLES = new Set(['SUPER_ADMIN', 'ADMIN', 'EMPLOYEE']);

export const STAFF_TOKEN_LIFETIME = '12h' as const;
export const MEMBER_TOKEN_LIFETIME = '7d' as const;

export const authTokenLifetime = (role: unknown) => (STAFF_ROLES.has(String(role || '').toUpperCase()) ? STAFF_TOKEN_LIFETIME : MEMBER_TOKEN_LIFETIME);
