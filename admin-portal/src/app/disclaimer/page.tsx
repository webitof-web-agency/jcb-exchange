import LegalPageRenderer from '@/components/legal/LegalPageRenderer';

export const metadata = {
  title: 'Disclaimer | JCB Exchange',
  description: 'Official Disclaimer of JCB Exchange.',
};

export default function DisclaimerPage() {
  return (
    <LegalPageRenderer
      pageKey="disclaimer"
      title="Platform Disclaimer"
      subtitle="Important legal disclaimers and operational liability terms."
    />
  );
}
