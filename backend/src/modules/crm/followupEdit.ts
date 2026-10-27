export const FOLLOW_UP_EDIT_TYPES = ['CALL', 'WHATSAPP', 'SMS', 'VISIT', 'INSPECTION', 'MEETING', 'EMAIL', 'PAYMENT', 'OTHER'] as const;

export type FollowUpEdit = {
  type: (typeof FOLLOW_UP_EDIT_TYPES)[number];
  title: string | null;
  notes: string | null;
  ownerId: string | null;
};

const optionalText = (value: unknown, maxLength: number) => {
  if (typeof value !== 'string') return null;
  const text = value.trim();
  return text ? text.slice(0, maxLength) : null;
};

export const normalizeFollowUpEdit = (body: Record<string, unknown>): FollowUpEdit => {
  const requestedType = typeof body.type === 'string' ? body.type.trim().toUpperCase() : '';
  const type = (FOLLOW_UP_EDIT_TYPES as readonly string[]).includes(requestedType)
    ? requestedType as FollowUpEdit['type']
    : 'CALL';

  return {
    type,
    title: optionalText(body.title, 200),
    notes: optionalText(body.notes, 2000),
    ownerId: optionalText(body.ownerId, 60),
  };
};
