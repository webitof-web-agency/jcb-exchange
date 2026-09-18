export const canRetrySmsOutbox = ({ status, attempts }: { status: string; attempts: number }) =>
  status === 'FAILED' && attempts < 3;
