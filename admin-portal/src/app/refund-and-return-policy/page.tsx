import LegalPageRenderer from '@/components/legal/LegalPageRenderer';

export const metadata = {
  title: 'Refund & Return Policy | JCB Exchange',
  description: 'Official Refund & Return Policy of JCB Exchange.',
};

export default function RefundAndReturnPolicyPage() {
  return (
    <LegalPageRenderer
      pageKey="refundReturnPolicy"
      title="Refund & Return Policy"
      subtitle="Terms regarding listing fee payments, refunds, and service subscriptions."
    />
  );
}
