/**
 * The welcome message after Confirm joining (pure: no database). Sent only when HR ticks "send welcome", to the
 * person's own contact details on the HR record; the login email is included so they know how to sign in (never a
 * password). Delivery follows the RECRUITMENT_JOINING_WELCOME rules HR switched on (WhatsApp / SMS / email).
 */

export type WelcomeEmployee = {
  legalName: string;
  preferredName: string | null;
  employeeCode: string;
  personalEmail: string | null;
  workEmail: string | null;
  mobile: string | null;
};

/** The personal email first (the work mailbox may not be set up on day one), then the work / login email. */
export const welcomeContact = (employee: Pick<WelcomeEmployee, 'personalEmail' | 'workEmail' | 'mobile'>) => ({
  email: employee.personalEmail?.trim() || employee.workEmail?.trim() || null,
  phone: employee.mobile?.trim() || null,
});

/** The RECRUITMENT_JOINING_WELCOME payload (the template variables). */
export const buildJoiningWelcomePayload = (input: {
  employee: Pick<WelcomeEmployee, 'legalName' | 'preferredName' | 'employeeCode'>;
  joiningDate: string;
  designation: string | null | undefined;
  officeName: string | null | undefined;
  loginEmail: string | null | undefined;
}) => ({
  employeeName: input.employee.preferredName?.trim() || input.employee.legalName,
  employeeCode: input.employee.employeeCode,
  designation: input.designation?.trim() || '',
  joiningDate: input.joiningDate,
  officeName: input.officeName?.trim() || '',
  loginEmail: input.loginEmail?.trim() || '',
});
