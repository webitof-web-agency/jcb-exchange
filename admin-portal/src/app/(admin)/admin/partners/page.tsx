import { redirect } from 'next/navigation';

export default function LegacyAdminListingsRedirect() {
  redirect('/superadmin/listings');
}
