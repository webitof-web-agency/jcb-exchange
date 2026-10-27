export type ContactLifecycleTone = 'blue' | 'amber' | 'green' | 'slate';

const lifecycleMeta: Record<string, { label: string; tone: ContactLifecycleTone }> = {
  LEAD: { label: 'Lead', tone: 'blue' },
  PROSPECT: { label: 'Prospect', tone: 'amber' },
  CUSTOMER: { label: 'Customer', tone: 'green' },
  INACTIVE: { label: 'Inactive', tone: 'slate' },
};

export const contactLifecyclePresentation = (lifecycle: string | null | undefined) =>
  lifecycleMeta[String(lifecycle || 'LEAD').trim().toUpperCase()] || lifecycleMeta.LEAD;
