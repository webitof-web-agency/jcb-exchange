import 'express';

declare global {
  namespace Express {
    interface UserPayload {
      id: string;
      email: string | null;
      role: 'SUPER_ADMIN' | 'ADMIN' | 'EMPLOYEE' | 'PARTNER' | 'CUSTOMER';
      status?: 'ACTIVE' | 'INACTIVE' | 'SUSPENDED' | 'BLOCKED' | 'CLOSED';
    }

    interface Request {
      user?: UserPayload;
    }
  }
}

export {};
