import HrmPayrollWorkspace from '@/components/hrm/HrmPayrollWorkspace';

export default async function EmployeeHrmPayrollModulePage({ params }: { params: Promise<{ module: string }> }) {
  const { module } = await params;
  return <HrmPayrollWorkspace portal="employee" module={module} />;
}
