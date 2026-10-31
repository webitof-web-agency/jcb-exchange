import VerificationReviewPage from '@/components/verifications/VerificationReviewPage';

export default async function EmployeeVerificationReview({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  return <VerificationReviewPage partnerId={id} />;
}
