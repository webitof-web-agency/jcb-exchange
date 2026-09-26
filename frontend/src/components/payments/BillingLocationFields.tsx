"use client";

import { useEffect, useState } from 'react';
import api from '@/lib/api';
import SearchableSelect, { type Option } from '@/components/ui/SearchableSelect';

export default function BillingLocationFields({
  city,
  state,
  onChange,
}: {
  city: string;
  state: string;
  onChange: (location: { city: string; state: string }) => void;
}) {
  const [states, setStates] = useState<Option[]>([]);
  const [cities, setCities] = useState<Option[]>([]);
  const [stateId, setStateId] = useState('');
  const [loading, setLoading] = useState(true);
  const [citiesLoadedForStateId, setCitiesLoadedForStateId] = useState('');
  const selectedState = states.find(
    (option) => option.name.trim().toLowerCase() === state.trim().toLowerCase(),
  );
  const effectiveStateId = stateId || (selectedState ? String(selectedState.id) : '');

  useEffect(() => {
    let mounted = true;
    void (async () => {
      try {
        const countries = await api.get<Option[]>('/locations/countries');
        const india = (countries.data || []).find((option) => option.name.toLowerCase() === 'india');
        if (!india) return;
        const response = await api.get<Option[]>(`/locations/states/${india.id}`);
        if (!mounted) return;
        const nextStates = response.data || [];
        setStates(nextStates);
        const selected = nextStates.find((option) => option.name.toLowerCase() === state.trim().toLowerCase());
        if (selected) setStateId(String(selected.id));
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => { mounted = false; };
  }, [state]);

  useEffect(() => {
    if (!effectiveStateId) {
      return;
    }

    let mounted = true;
    void api.get<Option[]>(`/locations/cities/${effectiveStateId}`)
      .then((response) => {
        if (mounted) {
          setCities(response.data || []);
          setCitiesLoadedForStateId(effectiveStateId);
        }
      })
      .catch(() => {
        if (mounted) {
          setCities([]);
          setCitiesLoadedForStateId(effectiveStateId);
        }
      });

    return () => {
      mounted = false;
    };
  }, [effectiveStateId]);

  const loadingCities = Boolean(effectiveStateId && citiesLoadedForStateId !== effectiveStateId);
  const selectedCity = cities.find((option) => option.name.trim().toLowerCase() === city.trim().toLowerCase());

  return (
    <div className="rounded-xl border border-amber-200 bg-amber-50/60 p-4">
      <p className="text-sm font-bold text-gray-900">Billing location <span className="text-red-600">*</span></p>
      <p className="mt-1 text-xs text-gray-600">Select your billing city and state before continuing. This location is saved with this payment and your profile.</p>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <SearchableSelect
          options={states}
          value={stateId || state}
          displayValue={state}
          onChange={(option) => {
            setStateId(String(option.id));
            setCities([]);
            setCitiesLoadedForStateId('');
            onChange({ state: option.name, city: '' });
          }}
          placeholder={loading ? 'Loading states...' : 'Select state'}
          disabled={loading}
          className="bg-white"
        />
        <SearchableSelect
          options={cities}
          value={selectedCity ? String(selectedCity.id) : city}
          displayValue={city}
          onChange={(option) => onChange({ state, city: option.name })}
          placeholder={loadingCities ? 'Loading cities...' : state ? 'Select city' : 'Select state first'}
          disabled={!effectiveStateId || loadingCities}
          className="bg-white"
        />
      </div>
    </div>
  );
}
