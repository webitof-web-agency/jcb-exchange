'use client';

import { useEffect, useState } from 'react';
import api from '@/lib/api';
import SearchableSelect from '@/components/ui/SearchableSelect';

export type LocationOption = { id: string | number; name: string };

const inputClassName = 'h-[34px] w-full rounded-lg border border-gray-200 bg-white px-2.5 text-[13px] font-medium text-gray-900 placeholder:font-normal placeholder:text-gray-400 outline-none transition focus:border-amber-500 focus:ring-2 focus:ring-amber-500/15 disabled:bg-gray-50 disabled:text-gray-500';

/** City picker for an Indian state; falls back to free text when the city list is unavailable. */
export default function CitySelect({ stateName, states, value, onChange, disabled }: { stateName?: string; states: LocationOption[]; value?: string; onChange: (value: string) => void; disabled?: boolean }) {
  const [cities, setCities] = useState<LocationOption[]>([]);
  const [loadedFor, setLoadedFor] = useState('');
  const stateId = states.find((state) => state.name.toLowerCase() === String(stateName || '').toLowerCase())?.id;

  useEffect(() => {
    if (!stateId) return;
    let cancelled = false;
    api.get<LocationOption[]>(`/locations/cities/${stateId}`)
      .then((response) => { if (!cancelled) { setCities(response.data || []); setLoadedFor(String(stateId)); } })
      .catch(() => { if (!cancelled) { setCities([]); setLoadedFor(String(stateId)); } });
    return () => { cancelled = true; };
  }, [stateId]);

  const available = stateId && loadedFor === String(stateId) ? cities : [];
  if (!stateId || !available.length) {
    return (
      <input
        type="text"
        value={value || ''}
        disabled={disabled}
        placeholder={stateId ? 'Type city' : 'Select state first'}
        onChange={(event) => onChange(event.target.value)}
        className={inputClassName}
      />
    );
  }
  return (
    <SearchableSelect
      size="sm"
      options={available}
      value={value || ''}
      displayValue={value || ''}
      placeholder="Select city"
      searchable
      disabled={disabled}
      onChange={(option) => onChange(option.name)}
      className="w-full"
    />
  );
}
