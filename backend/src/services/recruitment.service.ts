import prisma from '../lib/prisma';
import { Prisma } from '@prisma/client';

export const DEFAULT_HIRING_STAGES = [
  { name: 'New', code: 'NEW', order: 1, color: 'blue', isSystem: false, isTerminal: false },
  { name: 'Under Review', code: 'UNDER_REVIEW', order: 2, color: 'amber', isSystem: false, isTerminal: false },
  { name: 'Shortlisted', code: 'SHORTLISTED', order: 3, color: 'indigo', isSystem: false, isTerminal: false },
  { name: 'Contacted', code: 'CONTACTED', order: 4, color: 'purple', isSystem: false, isTerminal: false },
  { name: 'Interview Scheduled', code: 'INTERVIEW_SCHEDULED', order: 5, color: 'cyan', isSystem: false, isTerminal: false },
  { name: 'Interview Completed', code: 'INTERVIEW_COMPLETED', order: 6, color: 'teal', isSystem: false, isTerminal: false },
  { name: 'Selected', code: 'SELECTED', order: 7, color: 'emerald', isSystem: false, isTerminal: false },
  { name: 'Offer Prepared', code: 'OFFER_PREPARED', order: 8, color: 'blue', isSystem: false, isTerminal: false },
  { name: 'Offer Sent', code: 'OFFER_SENT', order: 9, color: 'violet', isSystem: false, isTerminal: false },
  { name: 'Offer Accepted', code: 'OFFER_ACCEPTED', order: 10, color: 'green', isSystem: false, isTerminal: false },
  { name: 'Hired', code: 'HIRED', order: 11, color: 'emerald', isSystem: false, isTerminal: true },
];

export const TERMINAL_STATUSES = [
  'On Hold',
  'Rejected',
  'Withdrawn',
  'No Response',
  'Offer Declined',
];

export const DEFAULT_DEPARTMENTS = [
  { name: 'Sales & Business Development', code: 'SALES', description: 'Sales, Key Accounts, and Customer Outreach' },
  { name: 'Operations & Logistics', code: 'OPS', description: 'Machine Operations, Equipment Transport, and Fleet Management' },
  { name: 'Technology & Engineering', code: 'TECH', description: 'Software Development, Infrastructure, and Systems' },
  { name: 'Finance & Accounts', code: 'FINANCE', description: 'Financial Operations, Accounting, and Auditing' },
  { name: 'Human Resources & Admin', code: 'HR', description: 'Talent Acquisition, People Operations, and Office Admin' },
  { name: 'Customer Support', code: 'SUPPORT', description: 'Customer Service, Escalations, and Helpdesk' },
];

export const DEFAULT_EMAIL_TEMPLATES = [
  {
    name: 'Application Received',
    code: 'APPLICATION_RECEIVED',
    subject: 'Application Received for {{job_title}} - JCB Exchange',
    bodyHtml: `<p>Dear {{candidate_name}},</p><p>Thank you for applying for the <strong>{{job_title}}</strong> position at JCB Exchange.</p><p>Your application reference number is <strong>{{application_id}}</strong>. Our recruitment team is reviewing your profile and will get back to you shortly if your qualifications match our requirements.</p><p>Best regards,<br/>Recruitment Team<br/>JCB Exchange</p>`,
    variables: ['candidate_name', 'job_title', 'application_id', 'company_name'],
    isSystem: true,
  },
  {
    name: 'Interview Scheduled',
    code: 'INTERVIEW_SCHEDULED',
    subject: 'Interview Scheduled for {{job_title}} - JCB Exchange',
    bodyHtml: `<p>Dear {{candidate_name}},</p><p>We are pleased to invite you for an interview for the <strong>{{job_title}}</strong> position.</p><p><strong>Date:</strong> {{interview_date}}<br/><strong>Time:</strong> {{interview_time}}<br/><strong>Application ID:</strong> {{application_id}}</p><p>Please let us know if you need to reschedule.</p><p>Best regards,<br/>Recruitment Team<br/>JCB Exchange</p>`,
    variables: ['candidate_name', 'job_title', 'interview_date', 'interview_time', 'application_id', 'company_name'],
    isSystem: true,
  },
  {
    name: 'Offer Sent',
    code: 'OFFER_SENT',
    subject: 'Job Offer: {{job_title}} - JCB Exchange',
    bodyHtml: `<p>Dear {{candidate_name}},</p><p>We are delighted to extend an offer of employment for the <strong>{{job_title}}</strong> position at JCB Exchange.</p><p>Expected Joining Date: <strong>{{joining_date}}</strong></p><p>Please review the details in your recruitment portal workspace or attached offer letter.</p><p>Best regards,<br/>Human Resources<br/>JCB Exchange</p>`,
    variables: ['candidate_name', 'job_title', 'joining_date', 'company_name'],
    isSystem: true,
  },
];

let defaultRecruitmentDataPromise: Promise<void> | null = null;

export const ensureDefaultRecruitmentData = async () => {
  if (defaultRecruitmentDataPromise) {
    return defaultRecruitmentDataPromise;
  }

  defaultRecruitmentDataPromise = (async () => {
    try {
      await Promise.all(DEFAULT_DEPARTMENTS.map((dept) =>
        prisma.jobDepartment.upsert({
          where: { code: dept.code },
          update: {},
          create: dept,
        })
      ));

      await Promise.all(DEFAULT_EMAIL_TEMPLATES.map((tpl) =>
        prisma.recruitmentEmailTemplate.upsert({
          where: { code: tpl.code },
          update: {},
          create: tpl,
        })
      ));
    } catch (err) {
      defaultRecruitmentDataPromise = null;
      console.error('Error seeding default recruitment data:', err);
    }
  })();

  return defaultRecruitmentDataPromise;
};

export const generateJobSlug = (title: string, city?: string | null): string => {
  const base = `${title} ${city || ''}`
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-');
  return base || `job-${Date.now()}`;
};

export const generateApplicationRef = async (): Promise<string> => {
  const currentYear = new Date().getFullYear();
  const count = await prisma.jobApplication.count();
  const nextSeq = (count + 1).toString().padStart(6, '0');
  return `JCB-JOB-${currentYear}-${nextSeq}`;
};

export const logRecruitmentActivity = async (data: {
  candidateId?: string | null;
  applicationId?: string | null;
  actorId?: string | null;
  action: string;
  title: string;
  details?: string | null;
  metadata?: any;
}) => {
  return prisma.recruitmentActivityLog.create({
    data: {
      candidateId: data.candidateId ?? null,
      applicationId: data.applicationId ?? null,
      actorId: data.actorId ?? null,
      action: data.action,
      title: data.title,
      details: data.details ?? null,
      metadata: data.metadata ? (data.metadata as any) : Prisma.JsonNull,
    },
  });
};
