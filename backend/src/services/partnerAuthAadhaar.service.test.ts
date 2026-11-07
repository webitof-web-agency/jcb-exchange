import assert from 'node:assert/strict';
import test from 'node:test';
import { markPartnerAuthAadhaarVerified } from './partnerAuthAadhaar.service';

test('retains only the partner Auth Aadhaar verification timestamp', async () => {
  let updateArgs: any = null;
  const verifiedAt = new Date('2026-11-07T12:00:00.000Z');
  const repository = {
    update: async (args: any) => {
      updateArgs = args;
      return { aadhaarVerifiedAt: verifiedAt };
    },
  };

  const result = await markPartnerAuthAadhaarVerified(repository, 'partner-profile-1', verifiedAt);

  assert.deepEqual(updateArgs, {
    where: { id: 'partner-profile-1' },
    data: { aadhaarVerifiedAt: verifiedAt },
    select: { aadhaarVerifiedAt: true },
  });
  assert.equal(result.aadhaarVerifiedAt, verifiedAt);
});
