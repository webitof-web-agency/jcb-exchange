export type EmailAttachmentMode =
  | 'NONE'
  | 'DYNAMIC_OFFER_PDF'
  /** The acceptance certificate, plus the signed copy when the candidate uploaded a scan or HR recorded a paper copy. */
  | 'DYNAMIC_OFFER_ACCEPTANCE_PDF'
  | 'DYNAMIC_VEHICLE_INVOICE_PDF'
  | 'DYNAMIC_PAYMENT_RECEIPT_PDF'
  | 'DYNAMIC_PRIME_INVOICE_PDF';

export type CommunicationEventDefinition = {
  eventCode: string;
  name: string;
  variables: string[];
  whatsappSupported: boolean;
  emailAttachmentMode: EmailAttachmentMode;
  defaultSubject: string;
  defaultBodyHtml: string;
  legacyEmailCode?: string;
  /**
   * Earlier default bodies of this event. A system template still holding one of them exactly was never edited by HR,
   * so the seed may move it to the current default; an edited template is never touched.
   */
  previousDefaultBodies?: string[];
};

const title = (name: string, subject: string, body: string, variables: string[], attachmentMode: EmailAttachmentMode = 'NONE', legacyEmailCode?: string): CommunicationEventDefinition => ({
  eventCode: name,
  name: name.replaceAll('_', ' ').replace(/^RECRUITMENT |^MARKETPLACE /, '').replace(/\b\w/g, (character) => character.toUpperCase()),
  variables,
  whatsappSupported: true,
  emailAttachmentMode: attachmentMode,
  defaultSubject: subject,
  defaultBodyHtml: body,
  ...(legacyEmailCode ? { legacyEmailCode } : {}),
});

const candidateBody = (message: string) => `<p>Dear {{candidate_name}},</p><p>${message}</p><p>Best regards,<br/>JCB Exchange</p>`;
const marketplaceBody = (message: string) => `<p>Hello {{customer_name}},</p><p>${message}</p><p>Regards,<br/>JCB Exchange</p>`;
/** A letter whose middle part is already block markup (paragraphs, lists): lists cannot sit inside a <p>. */
const letter = (greeting: string, blocks: string, signOff: string) => `<p>${greeting}</p>${blocks}<p>${signOff}</p>`;

/**
 * The offer invitation links with {{offer_short_url}}: it is short enough to type from a phone and the delivery code
 * always fills it, with the long signed link standing in when no short link could be made, so it is never empty.
 * {{offer_response_url}} stays available for templates written before short links. The address is also printed as
 * text because the plain-text part of the email drops the button's href. {{offer_valid_until}} is not in the default:
 * it may be blank (the date is informational and HR expires an offer by hand), and the attached letter states it.
 */
const OFFER_SENT_BODY = letter(
  'Dear {{candidate_name}},',
  '<p>We are delighted to offer you the position of <strong>{{designation}}</strong> ({{job_title}}) at JCB Exchange. Your offer letter is attached to this email.</p>'
  + '<p>Please read the letter, then accept or decline the offer online with your personal secure link:</p>'
  + '<p><a href="{{offer_short_url}}" style="background-color:#FFC107;color:#111827;font-weight:bold;text-decoration:none">View &amp; sign your offer</a></p>'
  + '<p>If the link above does not open, copy this address into your browser: {{offer_short_url}}</p>'
  + '<p>This link is personal to you, so please do not forward it. Application reference: {{application_ref}}.</p>',
  'Best regards,<br/>Talent Acquisition Team<br/>JCB Exchange',
);
// Defaults shipped before this one, newest first (the oldest had no response link at all).
const OFFER_SENT_PREVIOUS_BODIES = [
  candidateBody('We are delighted to extend an offer for {{job_title}}. Please review and respond using the secure link: <a href="{{offer_response_url}}">Review offer</a>.'),
  '<p>Dear {{candidate_name}},</p><p>We are delighted to extend an offer of employment for the <strong>{{job_title}}</strong> position at JCB Exchange.</p><p>Expected Joining Date: <strong>{{joining_date}}</strong></p><p>Please review the attached offer letter and use the secure link below to accept or decline the offer:</p><p><a href="{{offer_response_url}}">Review offer and respond</a></p><p>Best regards,<br/>Human Resources<br/>JCB Exchange</p>',
  '<p>Dear {{candidate_name}},</p><p>We are delighted to extend an offer of employment for the <strong>{{job_title}}</strong> position at JCB Exchange.</p><p>Expected Joining Date: <strong>{{joining_date}}</strong></p><p>Please review the details in your recruitment portal workspace or attached offer letter.</p><p>Best regards,<br/>Human Resources<br/>JCB Exchange</p>',
];

const OFFER_ACCEPTED_BODY = letter(
  'Dear {{candidate_name}},',
  '<p>Thank you for accepting our offer for the position of <strong>{{designation}}</strong> ({{job_title}}). Your acceptance was recorded on {{accepted_on}}.</p>'
  + '<p>Your offer acceptance certificate is attached to this email for your records.</p>'
  + '<ul><li>Application reference: {{application_ref}}</li><li>Joining date: {{joining_date}}</li></ul>'
  + '<p>Our HR team will contact you about the joining formalities and the documents to bring on your first day.</p>',
  'Best regards,<br/>Talent Acquisition Team<br/>JCB Exchange',
);

const OFFER_ACCEPTED_HR_BODY = letter(
  'Hello,',
  '<p><strong>{{candidate_name}}</strong> has accepted the offer for <strong>{{designation}}</strong> ({{job_title}}).</p>'
  + '<ul><li>Application reference: {{application_ref}}</li><li>Accepted on: {{accepted_on}}</li><li>Joining date: {{joining_date}}</li></ul>'
  + '<p>The candidate now moves to HRM onboarding. Please review the pre-joining record and the joining checklist in the admin portal.</p>',
  'Regards,<br/>JCB Exchange Recruitment',
);

// The onboarding link is an admin-portal page (sign-in required), not a bearer link, so it may sit in the body.
const JOINING_REMINDER_BODY = letter(
  'Hello,',
  '<p><strong>{{employee_name}}</strong> ({{employee_code}}) is due to join as {{designation}} on <strong>{{joining_date}}</strong>, but the joining checklist is not complete yet.</p>'
  + '<ul><li>Office: {{office_name}}</li><li>State: {{state_name}}</li><li>Pending items: {{missing_items}}</li></ul>'
  + '<p>Please complete the pending items before the joining day: <a href="{{onboarding_url}}">Open the onboarding record</a></p>',
  'Regards,<br/>JCB Exchange HR',
);

// {{login_email}} is offered to templates but kept out of the default: it is blank when no login was created.
const JOINING_WELCOME_BODY = letter(
  'Dear {{employee_name}},',
  '<p>Welcome to JCB Exchange! We are pleased to confirm that you have joined us as <strong>{{designation}}</strong> on {{joining_date}}.</p>'
  + '<ul><li>Employee code: {{employee_code}}</li><li>Office: {{office_name}}</li></ul>'
  + '<p>Please keep your employee code handy: you will need it for attendance, payroll and HR requests. If you have any questions, your HR team is happy to help.</p>'
  + '<p>We wish you every success in your new role.</p>',
  'Best regards,<br/>Human Resources<br/>JCB Exchange',
);

export const communicationEventRegistry: CommunicationEventDefinition[] = [
  title('PARTNER_KYC_STATUS_UPDATED', 'Partner KYC status updated - JCB Exchange', marketplaceBody('Your KYC status has been updated to {{kyc_status}}.'), ['customer_name', 'partner_id', 'partner_display_name', 'kyc_status', 'remark']),
  title('PARTNER_LISTING_STATUS_UPDATED', 'Listing status updated - JCB Exchange', marketplaceBody('Your listing {{listing_title}} status is now {{listing_status}}.'), ['customer_name', 'listing_id', 'listing_title', 'listing_status']),
  title('LISTING_PAYMENT_SUBMITTED', 'Payment submitted - JCB Exchange', marketplaceBody('Payment {{payment_id}} for listing {{listing_title}} is {{payment_status}}.'), ['customer_name', 'payment_id', 'listing_id', 'listing_title', 'payment_status', 'method']),
  title('LISTING_PAYMENT_APPROVED', 'Payment approved - JCB Exchange', marketplaceBody('Your payment for {{listing_title}} has been approved.'), ['customer_name', 'payment_id', 'listing_id', 'listing_title', 'payment_status', 'recipient_role']),
  title('LISTING_PAYMENT_REJECTED', 'Payment update - JCB Exchange', marketplaceBody('Your payment for {{listing_title}} was not approved. Status: {{payment_status}}.'), ['customer_name', 'payment_id', 'listing_id', 'listing_title', 'payment_status', 'recipient_role']),
  title('CUSTOMER_PRIME_APPROVED', 'JCB Exchange Prime invoice', marketplaceBody('Your Prime membership is approved. Subscription: {{subscription_id}}.'), ['subscription_id', 'status', 'customer_name'], 'DYNAMIC_PRIME_INVOICE_PDF'),
  title('CUSTOMER_PRIME_REJECTED', 'JCB Exchange Prime update', marketplaceBody('Your Prime membership status is {{status}}.'), ['status', 'customer_name']),
  title('MARKETPLACE_NEW_LISTING_PUBLISHED', 'New listing published - JCB Exchange', marketplaceBody('A new listing {{vehicle_short_title}} is now available.'), ['customer_name', 'listing_id', 'listing_title', 'vehicle_short_title', 'listing_status']),
  title('MARKETPLACE_NEW_PAYMENT_SUPERADMIN', 'New marketplace payment requires review', '<p>A marketplace payment requires review.</p><p>Listing: <strong>{{listing_title}}</strong><br/>Method: {{method}}</p>', ['listing_title', 'method']),
  title('MARKETPLACE_KYC_SUBMITTED_SUPERADMIN', 'Partner KYC submitted for review', '<p>A partner KYC submission is ready for review.</p><p>Partner: {{partner_id}}</p>', ['partner_id']),
  title('VEHICLE_SALE_INVOICE', 'Vehicle sale invoice - JCB Exchange', marketplaceBody('Your vehicle sale invoice is attached. Invoice: {{invoice_number}}.'), ['customer_name', 'vehicle_title', 'registration_number', 'invoice_number', 'invoice_amount', 'invoice_url'], 'DYNAMIC_VEHICLE_INVOICE_PDF'),
  title('VEHICLE_SALE_PAYMENT_RECEIPT', 'Vehicle payment receipt - JCB Exchange', marketplaceBody('Your payment receipt is attached. Receipt: {{receipt_number}}.'), ['customer_name', 'vehicle_title', 'amount', 'receipt_number', 'balance', 'payment_method', 'receipt_url'], 'DYNAMIC_PAYMENT_RECEIPT_PDF'),
  title('CRM_LEAD_ACKNOWLEDGEMENT', 'We received your enquiry - JCB Exchange', marketplaceBody('We have received your enquiry and our team will contact you shortly.'), ['customer_name', 'enquiry']),
  title('CRM_LEAD_ASSIGNED', 'Your enquiry is assigned - JCB Exchange', marketplaceBody('Your enquiry is now assigned to {{staff_name}}.'), ['staff_name', 'customer_name', 'customer_mobile', 'enquiry']),
  title('CRM_FOLLOW_UP_REMINDER', 'Follow-up reminder - JCB Exchange', '<p>Hello {{staff_name}},</p><p>Follow up with {{customer_name}} regarding {{follow_up_type}} at {{due_at}}.</p>', ['staff_name', 'customer_name', 'follow_up_type', 'due_at', 'customer_mobile']),
  title('CRM_APPOINTMENT_REMINDER', 'Appointment reminder - JCB Exchange', marketplaceBody('Your {{follow_up_type}} appointment is due at {{due_at}}.'), ['customer_name', 'follow_up_type', 'due_at']),
  title('CRM_MATCHING_LISTING', 'A matching listing is available - JCB Exchange', marketplaceBody('We found a listing matching your enquiry: {{listing_title}}.'), ['customer_name', 'listing_title', 'listing_price', 'listing_url']),
  title('CRM_REENGAGEMENT', 'An update from JCB Exchange', marketplaceBody('We wanted to follow up on your enquiry: {{enquiry}}.'), ['customer_name', 'enquiry']),
  title('RECRUITMENT_APPLICATION_RECEIVED', 'Application received for {{job_title}} - JCB Exchange', candidateBody('Thank you for applying for the {{job_title}} position. Application reference: {{application_ref}}.'), ['candidate_name', 'application_ref', 'job_id', 'job_title'], 'NONE', 'APPLICATION_RECEIVED'),
  title('RECRUITMENT_NEW_APPLICATION_SUPERADMIN', 'New job application received - JCB Exchange', '<p>A new application was received from {{candidate_name}}.</p><p>Reference: {{application_ref}}<br/>Job: {{job_title}}</p>', ['application_ref', 'candidate_name', 'job_id', 'job_title']),
  title('RECRUITMENT_NEW_APPLICATION_RECRUITER', 'New candidate application - JCB Exchange', '<p>A new application was received from {{candidate_name}}.</p><p>Reference: {{application_ref}}<br/>Job: {{job_title}}</p>', ['application_ref', 'candidate_name', 'job_id', 'job_title']),
  title('RECRUITMENT_APPLICATION_STAGE_UPDATED', 'Application update for {{job_title}} - JCB Exchange', candidateBody('Your application stage is now {{stage}}.'), ['candidate_name', 'application_id', 'application_ref', 'job_title', 'stage']),
  title('RECRUITMENT_INTERVIEW_SCHEDULED', 'Interview scheduled for {{job_title}} - JCB Exchange', candidateBody('Your interview is scheduled for {{scheduled_at}}. Type: {{interview_type}}.'), ['candidate_name', 'application_id', 'application_ref', 'job_title', 'scheduled_at', 'interview_type', 'status'], 'NONE', 'INTERVIEW_SCHEDULED'),
  title('RECRUITMENT_INTERVIEW_RESCHEDULED', 'Interview rescheduled for {{job_title}} - JCB Exchange', candidateBody('Your interview has been rescheduled to {{scheduled_at}}.'), ['candidate_name', 'application_id', 'application_ref', 'job_title', 'scheduled_at', 'interview_type', 'status']),
  title('RECRUITMENT_INTERVIEW_CANCELLED', 'Interview cancelled for {{job_title}} - JCB Exchange', candidateBody('Your interview scheduled for {{scheduled_at}} has been cancelled.'), ['candidate_name', 'application_id', 'application_ref', 'job_title', 'scheduled_at', 'interview_type', 'status']),
  {
    ...title('RECRUITMENT_OFFER_SENT', 'Job offer for {{job_title}} - JCB Exchange', OFFER_SENT_BODY, ['candidate_name', 'application_id', 'application_ref', 'job_title', 'designation', 'joining_date', 'offer_valid_until', 'offer_short_url', 'offer_response_url'], 'DYNAMIC_OFFER_PDF', 'OFFER_SENT'),
    previousDefaultBodies: OFFER_SENT_PREVIOUS_BODIES,
  },
  title('RECRUITMENT_OFFER_ACCEPTED', 'Offer acceptance confirmed: {{job_title}} - JCB Exchange', OFFER_ACCEPTED_BODY, ['candidate_name', 'application_ref', 'job_title', 'designation', 'joining_date', 'accepted_on'], 'DYNAMIC_OFFER_ACCEPTANCE_PDF', 'OFFER_ACCEPTED'),
  title('RECRUITMENT_OFFER_ACCEPTED_HR', 'Offer accepted: {{candidate_name}} - {{designation}}', OFFER_ACCEPTED_HR_BODY, ['candidate_name', 'application_id', 'application_ref', 'job_title', 'designation', 'joining_date', 'accepted_on']),
  title('RECRUITMENT_JOINING_REMINDER', 'Joining on {{joining_date}}: {{employee_name}} - checklist incomplete', JOINING_REMINDER_BODY, ['employee_name', 'employee_code', 'designation', 'joining_date', 'office_name', 'state_name', 'missing_items', 'onboarding_url']),
  title('RECRUITMENT_JOINING_WELCOME', 'Welcome to JCB Exchange, {{employee_name}}', JOINING_WELCOME_BODY, ['employee_name', 'employee_code', 'designation', 'joining_date', 'office_name', 'login_email']),
  title('RECRUITMENT_OFFER_STATUS_UPDATED', 'Offer status update - JCB Exchange', candidateBody('Your offer status is now {{offer_status}}.'), ['candidate_name', 'application_id', 'application_ref', 'job_title', 'offer_status']),
  title('RECRUITMENT_NEW_JOB_PUBLISHED', 'New job opportunity - JCB Exchange', candidateBody('A new {{job_title}} role is available in {{location_city}}, {{location_state}}.'), ['candidate_name', 'job_id', 'job_code', 'job_title', 'job_slug', 'location_city', 'location_state']),
];

const definitions = new Map(communicationEventRegistry.map((event) => [event.eventCode, event]));

export const getCommunicationEvent = (eventCode: string) => definitions.get(eventCode);

export const getEmailTemplateCode = (eventCode: string) => getCommunicationEvent(eventCode)?.legacyEmailCode || eventCode;

export const getEmailEventCodeForTemplateCode = (templateCode: string) => communicationEventRegistry.find((event) => (
  event.eventCode === templateCode || getEmailTemplateCode(event.eventCode) === templateCode
))?.eventCode;

export const getEmailAttachmentModeForEvent = (eventCode: string): EmailAttachmentMode => getCommunicationEvent(eventCode)?.emailAttachmentMode || 'NONE';

export const isSupportedEmailEvent = (eventCode: string) => Boolean(getCommunicationEvent(eventCode));
