import { Suspense } from 'react';
import HrmEmployeeDirectory from '@/components/hrm/HrmEmployeeDirectory';

export default function AdminHrmPage() {
  // The directory keeps its filters in the URL, which needs a Suspense boundary.
  return (
    <Suspense fallback={<div className="p-8 text-center text-sm text-slate-500">Loading employee directory…</div>}>
      <HrmEmployeeDirectory portal="admin" />
    </Suspense>
  );
}
