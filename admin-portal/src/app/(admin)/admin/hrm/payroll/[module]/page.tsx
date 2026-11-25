import HrmPayrollWorkspace from '@/components/hrm/HrmPayrollWorkspace';

export default async function AdminHrmPayrollModulePage({ params }: { params: Promise<{ module: string }> }) {
  const { module } = await params;
  return <HrmPayrollWorkspace portal="admin" module={module} />;
}
