'use client';

import LeadInboxPage from '@/components/portal/LeadInboxPage';
import { PartnerFollowUpStrip } from '@/components/crm/PartnerFollowUps';

export default function PartnerLeadsPage() {
  return (
    <>
      <PartnerFollowUpStrip />
      <LeadInboxPage />
    </>
  );
}
