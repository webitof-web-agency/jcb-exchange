import type { Metadata } from 'next';
import OfferResponseClient from './OfferResponseClient';

// A personal offer link: never indexed, never sent on as a referrer.
export const metadata: Metadata = {
  title: 'Your offer letter',
  robots: { index: false, follow: false, nocache: true, googleBot: { index: false, follow: false } },
  referrer: 'no-referrer',
};

type Props = { params: Promise<{ token: string }> };

export default async function OfferResponsePage({ params }: Props) {
  const { token } = await params;
  return <OfferResponseClient token={token} />;
}
