type PartnerAuthAadhaarProfileRepository = {
  update: (args: {
    where: { id: string };
    data: { aadhaarVerifiedAt: Date };
    select: { aadhaarVerifiedAt: true };
  }) => Promise<{ aadhaarVerifiedAt: Date | null }>;
};

export const markPartnerAuthAadhaarVerified = async (
  repository: PartnerAuthAadhaarProfileRepository,
  partnerProfileId: string,
  verifiedAt = new Date(),
) => repository.update({
  where: { id: partnerProfileId },
  data: { aadhaarVerifiedAt: verifiedAt },
  select: { aadhaarVerifiedAt: true },
});
