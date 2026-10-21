'use client';

import { useMemo } from 'react';
import api from '@/lib/api';
import { loadChart, type Account } from './ChartOfAccountsModule';
import { useResource } from './useResource';

export const CASH_BANK_KINDS = ['BANK', 'CASH', 'PETTY_CASH', 'WALLET', 'GATEWAY_CLEARING'];
export const isCashBank = (account: Pick<Account, 'kind'> | undefined) => Boolean(account && CASH_BANK_KINDS.includes(account.kind));

export type PickerOption = { id: string; name: string };

/**
 * Optional pickers keep their "—" (clear) option only once something is chosen; while empty the
 * picker shows its placeholder, e.g. "Required".
 */
export const optionalChoices = (options: PickerOption[], value: string) => (value ? options : options.filter((option) => option.id !== ''));

/** Ledgers, parties, vehicles and cost centres for voucher pickers, loaded once per screen. */
export function useLedgerLookups() {
  const chart = useResource(loadChart, 'chart');
  const parties = useResource(async () => (await api.get('/finance-hub/parties', { params: { pageSize: 500 } })).data.parties as Array<{ id: string; code: string; name: string }>, 'lookup-parties');
  const vehicles = useResource(async () => (await api.get('/finance-hub/vehicles', { params: { limit: 500 } })).data.vehicles as Array<{ id: string; label: string }>, 'lookup-vehicles');
  const costCentres = useResource(async () => (await api.get('/finance-hub/cost-centres')).data.costCentres as Array<{ id: string; code: string; name: string; isActive: boolean }>, 'lookup-cost-centres');

  return useMemo(() => {
    const accounts = chart.data?.accounts ?? [];
    const groupNature = new Map((chart.data?.groups ?? []).map((group) => [group.id, group.nature]));
    return {
      loading: chart.loading || parties.loading || vehicles.loading || costCentres.loading,
      error: chart.error || parties.error || vehicles.error || costCentres.error,
      schemaMissing: chart.schemaMissing || parties.schemaMissing,
      installed: Boolean(chart.data?.installed),
      accounts,
      accountsById: new Map(accounts.map((account) => [account.id, account])),
      natureOf: (account: Account) => groupNature.get(account.groupId),
      accountOption: (account: Account): PickerOption => ({ id: account.id, name: `${account.code} · ${account.name}` }),
      partyOptions: [{ id: '', name: '—' }, ...(parties.data ?? []).map((party) => ({ id: party.id, name: `${party.code} · ${party.name}` }))] as PickerOption[],
      vehicleOptions: [{ id: '', name: '—' }, ...(vehicles.data ?? []).map((vehicle) => ({ id: vehicle.id, name: vehicle.label }))] as PickerOption[],
      costCentreOptions: [{ id: '', name: '—' }, ...(costCentres.data ?? []).filter((item) => item.isActive).map((item) => ({ id: item.id, name: `${item.code} · ${item.name}` }))] as PickerOption[],
    };
  }, [chart.data, chart.error, chart.loading, chart.schemaMissing, costCentres.data, costCentres.error, costCentres.loading, parties.data, parties.error, parties.loading, parties.schemaMissing, vehicles.data, vehicles.error, vehicles.loading]);
}

export type LedgerLookups = ReturnType<typeof useLedgerLookups>;

export const toPaise = (value: string | number) => {
  const amount = typeof value === 'number' ? value : Number(String(value).replace(/,/g, ''));
  return Number.isFinite(amount) && amount > 0 ? Math.round(amount * 100) : 0;
};

export const fromPaise = (paise: number) => (paise / 100).toFixed(2);

export const todayIso = () => {
  const now = new Date(Date.now() + 330 * 60 * 1000);
  return now.toISOString().slice(0, 10);
};
