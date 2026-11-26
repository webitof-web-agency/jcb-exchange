'use client';

import { Star } from 'lucide-react';
import SearchableSelect from '@/components/ui/SearchableSelect';
import { headOfficeLabel, headOfficePlace, headOfficeProblem, selectedHeadOffice, type HrmHeadOffice } from '@/lib/hrmHeadOffice';

export const DefaultStar = () => <Star className="h-3.5 w-3.5 shrink-0 fill-amber-400 text-amber-500" role="img" aria-label="Default head office" />;

/**
 * The head office dropdown of the forms: every saved head office, the default one starred and already chosen. The
 * person is recorded at the chosen office's state and city, which are shown, not typed.
 */
export default function HrmHeadOfficeField({ id, offices, value, onChange, error, disabled = false, showPlace = true }: {
  id: string;
  offices: readonly HrmHeadOffice[];
  /** The chosen head office; '' = the default. */
  value: string;
  onChange: (office: HrmHeadOffice) => void;
  error?: string | undefined;
  disabled?: boolean;
  /** Off where only the office matters, not a place (giving access). */
  showPlace?: boolean;
}) {
  const selected = selectedHeadOffice(offices, value);
  const problem = showPlace ? headOfficeProblem(selected) : null;
  const message = error || problem;
  return (
    <div className="font-normal">
      <SearchableSelect
        id={id}
        options={offices.map((office) => ({ id: office.id, name: headOfficeLabel(office), ...(office.isDefault ? { icon: <DefaultStar /> } : {}) }))}
        value={selected?.id ?? ''}
        displayValue={selected ? headOfficeLabel(selected) : ''}
        onChange={(option) => { const office = offices.find((item) => item.id === option.id); if (office) onChange(office); }}
        placeholder={offices.length ? 'Select the head office' : 'No head office yet'}
        searchable={offices.length > 7}
        disabled={disabled || !offices.length}
        className="w-full"
      />
      {message ? <p id={`${id}-error`} role="alert" className="mt-1 text-xs font-medium text-rose-600">{message}</p> : selected ? (
        <p className="mt-1 flex flex-wrap items-center gap-x-1.5 text-xs leading-5 text-slate-500">
          {selected.isDefault ? <><DefaultStar /> Default head office.</> : <>★ marks the default head office.</>}
          {showPlace && headOfficePlace(selected) ? <span>Work place: {headOfficePlace(selected)}.</span> : null}
        </p>
      ) : null}
    </div>
  );
}
