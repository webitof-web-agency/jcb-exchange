type AuthCredentialChangeInput = {
  currentEmail?: string | null;
  nextEmail?: string | null;
  currentMobile?: string | null;
  nextMobile?: string | null;
};

export const hasAuthCredentialChange = ({
  currentEmail,
  nextEmail,
  currentMobile,
  nextMobile,
}: AuthCredentialChangeInput) =>
  (nextEmail ?? null) !== (currentEmail ?? null) ||
  (nextMobile ?? null) !== (currentMobile ?? null);
