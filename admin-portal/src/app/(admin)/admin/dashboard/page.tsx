'use client';

import { useAuthStore } from '@/store/authStore';

export default function AdminDashboardPage() {
  const user = useAuthStore((state) => state.user);
  const isEmployee = user?.role === 'EMPLOYEE';

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
        <h2 className="text-xl font-bold text-gray-900">{isEmployee ? 'Employee Workspace' : 'Admin Workspace'}</h2>
        <p className="mt-2 max-w-2xl text-sm text-gray-600">
          {isEmployee
            ? 'This account is configured as an employee user. The super admin can assign module-specific permissions here as the next phase.'
            : 'This account is configured as an admin user. The super admin can assign module-specific permissions here as the next phase.'}
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Role</p>
          <p className="mt-2 text-lg font-bold text-gray-900">{user?.role || 'ADMIN'}</p>
        </div>
        <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Status</p>
          <p className="mt-2 text-lg font-bold text-gray-900">{user?.status || 'ACTIVE'}</p>
        </div>
        <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Permissions</p>
          <p className="mt-2 text-sm font-medium text-gray-700">
            {user?.permissions && user.permissions.length > 0 ? user.permissions.join(', ') : 'Awaiting module assignment'}
          </p>
        </div>
      </div>
    </div>
  );
}
