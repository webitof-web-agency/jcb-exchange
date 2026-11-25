import type { Metadata } from 'next';
import OfferShortLinkClient from './OfferShortLinkClient';

// A personal short offer link (sent by SMS / WhatsApp): never indexed, never sent on as a referrer.
export const metadata: Metadata = {
  title: 'Your offer letter',
  robots: { index: false, follow: false, nocache: true, googleBot: { index: false, follow: false } },
  referrer: 'no-referrer',
};

type Props = { params: Promise<{ code: string }> };

// The code is looked up from the candidate's browser (see OfferShortLinkClient): a server-side lookup would put every
// candidate behind this server's address for the per-network rate limit.
export default async function OfferShortLinkPage({ params }: Props) {
  const { code } = await params;
  return <OfferShortLinkClient code={code} />;
}
