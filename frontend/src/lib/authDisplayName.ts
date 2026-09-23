type AuthIdentity = {
  name?: string | null;
  email?: string | null;
  mobile?: string | null;
};

const firstNonEmptyValue = (...values: Array<string | null | undefined>) =>
  values.find((value) => typeof value === 'string' && value.trim().length > 0)?.trim() || null;

export const getAuthDisplayName = (identity?: AuthIdentity | null) =>
  firstNonEmptyValue(identity?.name, identity?.email, identity?.mobile) || 'My Account';
