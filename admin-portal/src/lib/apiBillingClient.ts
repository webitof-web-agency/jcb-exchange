import api from '@/lib/api';
import type { ApiBillingSummary } from './apiBilling';

export const fetchApiBillingSummary = async (): Promise<ApiBillingSummary> => {
  const response = await api.get<ApiBillingSummary & { success: boolean }>('/api-billing/summary');
  return {
    wallet: response.data.wallet,
    services: response.data.services,
  };
};
