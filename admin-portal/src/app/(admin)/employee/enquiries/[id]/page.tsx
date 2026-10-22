import LegacyEnquiryRedirect from '@/components/crm/LegacyEnquiryRedirect';

// Old enquiry links open the lead in the CRM.
export default async function EnquiryDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <LegacyEnquiryRedirect param={id} />;
}
