import { redirect } from 'next/navigation';

export default function LegacyAdminVerificationsRedirect() {
  redirect('/superadmin/verifications');
}
