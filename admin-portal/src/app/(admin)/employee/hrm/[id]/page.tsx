import HrmEmployeeDetail from '@/components/hrm/HrmEmployeeDetail';
import HrmDashboard from '@/components/hrm/HrmDashboard';
import { isHrmWorkspaceSection } from '@/lib/hrmNavigation';

export default async function EmployeeHrmEmployeePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (isHrmWorkspaceSection(id)) return <HrmDashboard portal="employee" initialModule={id} />;
  return <HrmEmployeeDetail id={id} portal="employee" />;
}
