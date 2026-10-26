export type AssignmentNotificationEntity = 'LEAD' | 'FOLLOW_UP' | 'CONTACT';

type AssignmentNotificationInput = {
  entity: AssignmentNotificationEntity;
  entityId: string;
  subject: string;
  detail?: string | null;
  actorName?: string | null;
};

const copyByEntity: Record<AssignmentNotificationEntity, { label: string; type: string; path: (id: string) => string }> = {
  LEAD: { label: 'lead', type: 'CRM_LEAD_ASSIGNED', path: (id) => `/crm/leads/${id}` },
  FOLLOW_UP: { label: 'follow-up', type: 'CRM_FOLLOW_UP_ASSIGNED', path: () => '/crm/follow-ups' },
  CONTACT: { label: 'contact', type: 'CRM_CONTACT_ASSIGNED', path: (id) => `/crm/contacts/${id}` },
};

export const buildAssignmentNotification = ({ entity, entityId, subject, detail, actorName }: AssignmentNotificationInput) => {
  const copy = copyByEntity[entity];
  const actor = actorName?.trim() || 'CRM automation';
  const detailText = detail?.trim() ? ` - ${detail.trim()}` : '';
  const subjectText = entity === 'FOLLOW_UP' ? `follow-up for "${subject.trim()}"` : `${copy.label} "${subject.trim()}"`;

  return {
    title: `${copy.label.charAt(0).toUpperCase()}${copy.label.slice(1)} assigned to you`,
    message: `${actor} assigned you the ${subjectText}${detailText}.`,
    type: copy.type,
    path: copy.path(entityId),
  };
};
