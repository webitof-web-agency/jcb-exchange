import HrmOfficeDetail from '@/components/hrm/HrmOfficeDetail';

export default async function AdminHrmOfficePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <HrmOfficeDetail officeId={id} portal="admin" />;
}
