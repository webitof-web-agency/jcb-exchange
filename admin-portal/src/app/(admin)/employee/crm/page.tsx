import { redirect } from 'next/navigation';
import CrmDashboardPage from '@/components/crm/CrmDashboardPage';
import { legacyCrmTabTarget } from '@/lib/crmRoutes';

export default async function CrmPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  // Old /crm?tab=… links (notifications, bookmarks) → one page per menu item.
  const target = legacyCrmTabTarget('/employee', await searchParams);
  if (target) redirect(target);
  return <CrmDashboardPage />;
}
