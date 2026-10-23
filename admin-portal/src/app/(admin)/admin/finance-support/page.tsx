import { redirect } from 'next/navigation';

export default function SuperAdminHomepageEditorRedirectPage() {
  redirect('/admin/settings');
}
