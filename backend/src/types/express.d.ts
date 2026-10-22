import 'express';

declare global {
  namespace Express {
    interface Request {
      user?: {
        id: string;
        email?: string | null;
        role: 'SUPER_ADMIN' | 'ADMIN' | 'EMPLOYEE' | 'PARTNER' | 'CUSTOMER';
        status?: 'ACTIVE' | 'INACTIVE' | 'SUSPENDED' | 'BLOCKED' | 'CLOSED';
      };
      // Set by the CRM module's requireCrmUser middleware.
      crmAccess?: import('../modules/crm/access').CrmAccess;
    }
  }
}

export {};
