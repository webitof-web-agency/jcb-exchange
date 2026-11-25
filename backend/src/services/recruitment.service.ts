import prisma from '../lib/prisma';
import { Prisma } from '@prisma/client';
import { communicationEventRegistry, getCommunicationEvent, getEmailTemplateCode } from './communicationEventRegistry';

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
  { name: 'Offer Declined', code: 'OFFER_DECLINED', order: 11, color: 'rose', isSystem: false, isTerminal: true },
  { name: 'Hired', code: 'HIRED', order: 12, color: 'emerald', isSystem: false, isTerminal: true },
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

export const DEFAULT_EMAIL_TEMPLATES = communicationEventRegistry.map((event) => ({
  name: event.name,
  code: getEmailTemplateCode(event.eventCode),
  eventCode: event.eventCode,
  subject: event.defaultSubject,
  bodyHtml: event.defaultBodyHtml,
  variables: event.variables,
  enabled: true,
  attachmentMode: event.emailAttachmentMode,
  isSystem: true,
}));

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

      await Promise.all(DEFAULT_HIRING_STAGES.map((stage) =>
        prisma.applicationStage.upsert({
          where: { code: stage.code },
          update: { name: stage.name, order: stage.order, color: stage.color, isSystem: stage.isSystem, isTerminal: stage.isTerminal },
          create: stage,
        })
      ));

      await Promise.all(DEFAULT_EMAIL_TEMPLATES.map((tpl) =>
        prisma.recruitmentEmailTemplate.upsert({
          where: { code: tpl.code },
          update: { eventCode: tpl.eventCode, attachmentMode: tpl.attachmentMode },
          create: tpl,
        })
      ));

      // A system template that still holds an earlier default body word for word was never edited by HR: move it to
      // the current default (for example the offer email's "View & sign your offer" link). Edited ones are kept.
      await Promise.all(DEFAULT_EMAIL_TEMPLATES.map((tpl) => {
        const previousBodies = getCommunicationEvent(tpl.eventCode)?.previousDefaultBodies ?? [];
        return previousBodies.length
          ? prisma.recruitmentEmailTemplate.updateMany({
            where: { code: tpl.code, isSystem: true, bodyHtml: { in: previousBodies } },
            data: { bodyHtml: tpl.bodyHtml, variables: tpl.variables },
          })
          : null;
      }));

      await Promise.all(DEFAULT_EMAIL_TEMPLATES.map(async (tpl) => {
        const template = await prisma.recruitmentEmailTemplate.findUnique({ where: { code: tpl.code }, select: { id: true, archived: true } });
        if (!template || template.archived) return;
        const rule = await prisma.emailAutomationRule.findUnique({
          where: { eventCode: tpl.eventCode },
          select: { templateId: true, template: { select: { archived: true } } },
        });
        if (!rule) {
          // update: {} so a rule made meanwhile (another instance starting, or HR saving) is left alone.
          await prisma.emailAutomationRule.upsert({
            where: { eventCode: tpl.eventCode },
            update: {},
            create: { eventCode: tpl.eventCode, enabled: true, templateId: template.id },
          });
          return;
        }
        // Keep the template HR chose: only a rule with no template, or whose template was archived, gets the default.
        if (!rule.templateId || !rule.template || rule.template.archived) {
          await prisma.emailAutomationRule.update({ where: { eventCode: tpl.eventCode }, data: { templateId: template.id } });
        }
      }));
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
