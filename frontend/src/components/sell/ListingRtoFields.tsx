'use client';

import type { ChangeEvent } from 'react';
import type { ListingRtoFormState } from '@/lib/listingRtoForm';
import { handleDigitOnlyKeyDown } from '@/lib/listingFormSanitizers';
import { ApiFillBox } from '@/components/ui/ApiFillBadge';

const inputClass = 'w-full rounded-lg border border-gray-200 bg-[#F8FAFC] px-3 py-2.5 text-sm text-gray-900 outline-none transition focus:border-[#FFC107]';

const hirePurchaseOptions = [
  ['PENDING', 'Pending'],
  ['ACTIVE', 'Active'],
  ['NOT_APPLICABLE', 'Not Applicable'],
] as const;
const validityOptions = [['VALID', 'Valid'], ['EXPIRED', 'Expired'], ['NOT_AVAILABLE', 'Not available']] as const;
// Tax validity has an extra LLT (Lifetime) option — backend value is LIFETIME
const taxValidityOptions = [['VALID', 'Valid'], ['EXPIRED', 'Expired'], ['LIFETIME', 'LLT'], ['NOT_AVAILABLE', 'Not available']] as const;
const hsrpOptions = [['YES', 'Yes'], ['NO', 'No'], ['NOT_APPLICABLE', 'Not required'], ['PENDING', 'Pending']] as const;

function Field({
  label,
  children,
  required,
  compact = false,
  apiFill = null,
}: {
  label: string;
  children: React.ReactNode;
  required: boolean;
  compact?: boolean;
  apiFill?: { source: string; filled?: boolean } | null;
}) {
  return (
    <label className="block">
      <span className={compact
        ? "mb-1 block text-[11px] font-semibold text-gray-600"
        : "mb-1.5 block text-xs font-semibold uppercase tracking-wide text-gray-500"}>
        {label} {required ? <span className="text-red-500">*</span> : null}
      </span>
      <ApiFillBox apiFill={apiFill}>{children}</ApiFillBox>
    </label>
  );
}

export default function ListingRtoFields({
  value,
  onChange,
  insuranceExpiry,
  onInsuranceExpiryChange,
  required = true,
  compact = false,
  apiFillSource = '',
  apiFilled = false,
  manufacturingYear,
}: {
  value: ListingRtoFormState;
  onChange: <K extends keyof ListingRtoFormState>(key: K, next: ListingRtoFormState[K]) => void;
  insuranceExpiry: string;
  onInsuranceExpiryChange: (next: string) => void;
  required?: boolean;
  compact?: boolean;
  /** Shows the AI badge on fields that vehicle verification can fill. */
  apiFillSource?: string;
  apiFilled?: boolean;
  /** HSRP fields are asked only for vehicles made before 2019 (later ones come with HSRP fitted). */
  manufacturingYear?: string | number | null;
}) {
  const year = Number(manufacturingYear);
  const showHsrp = Number.isInteger(year) && year > 0 && year < 2019;
  const apiFill = apiFillSource ? { source: apiFillSource, filled: apiFilled } : null;
  const currentInputClass = compact
    ? 'w-full rounded-lg border border-gray-200 bg-[#F8FAFC] px-2.5 py-1.5 text-xs text-gray-900 outline-none transition focus:border-[#FFC107] focus:bg-white focus:ring-1 focus:ring-[#FFC107] h-[34px]'
    : inputClass;

  const makeSelect = <K extends keyof ListingRtoFormState>(
    key: K,
    items: readonly (readonly [string, string])[],
  ) => (
    <select
      value={String(value[key])}
      onChange={(e: ChangeEvent<HTMLSelectElement>) =>
        onChange(key, e.target.value as ListingRtoFormState[K])
      }
      className={currentInputClass}
    >
      {key === 'hirePurchaseStatus' && value[key] === 'TERMINATED' ? (
        <option value="TERMINATED" hidden>Existing value: Terminated</option>
      ) : null}
      {items.map(([v, l]) => (
        <option key={v} value={v}>{l}</option>
      ))}
    </select>
  );

  const dateField = <S extends keyof ListingRtoFormState, D extends keyof ListingRtoFormState>(
    statusKey: S,
    dateKey: D,
    label: string,
  ) => (
    <Field label={label} required={required} compact={compact} apiFill={apiFill}>
      <div className={compact ? "space-y-1.5" : "space-y-2"}>
        <select
          value={String(value[statusKey])}
          onChange={(e: ChangeEvent<HTMLSelectElement>) => {
            const next = e.target.value as ListingRtoFormState[S];
            onChange(statusKey, next);
            if (next !== 'VALID') onChange(dateKey, '' as ListingRtoFormState[D]);
          }}
          className={currentInputClass}
        >
          {validityOptions.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
        {value[statusKey] === 'VALID' ? (
          <input
            type="date"
            required={required}
            value={String(value[dateKey] || '')}
            onChange={(e) => onChange(dateKey, e.target.value as ListingRtoFormState[D])}
            className={currentInputClass}
          />
        ) : value[statusKey] === 'NOT_AVAILABLE' ? (
          <p className="rounded-lg bg-gray-50 px-2.5 py-1.5 text-[11px] text-gray-500">
            No valid date returned. You may enter it manually.
          </p>
        ) : null}
      </div>
    </Field>
  );

  const isLlt = value.taxStatus === 'LIFETIME';

  return (
    <section className={`border border-gray-200 ${compact ? 'rounded-xl p-3.5 sm:p-4 bg-white' : 'rounded-2xl p-5'}`}>
      <div className={`${compact ? 'mb-2.5' : 'mb-4'} flex items-center gap-2 text-gray-900`}>
        <h3 className={`${compact ? 'text-sm font-bold' : 'text-base font-semibold'}`}>RTO &amp; Vehicle Compliance</h3>
      </div>
      <div className={`grid ${compact ? 'gap-2.5 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4' : 'gap-4 md:grid-cols-2 xl:grid-cols-3'}`}>
        <Field label="Hire Purchase" required={required} compact={compact} apiFill={apiFill}>
          {makeSelect('hirePurchaseStatus', hirePurchaseOptions)}
        </Field>
        <Field label="Financer Name" required={false} compact={compact} apiFill={apiFill}>
          <input
            value={value.financerName}
            maxLength={80}
            onChange={(e) => onChange('financerName', e.target.value.replace(/[^A-Za-z0-9\s.&/-]/g, ''))}
            className={currentInputClass}
            placeholder="Financer / Bank name"
          />
        </Field>

        {/* Tax Validity — has LLT option; date hidden when LIFETIME selected */}
        <Field label="Tax Validity" required={required} compact={compact} apiFill={apiFill}>
          <div className={compact ? "space-y-1.5" : "space-y-2"}>
            <select
              value={value.taxStatus}
              onChange={(e: ChangeEvent<HTMLSelectElement>) => {
                const next = e.target.value as ListingRtoFormState['taxStatus'];
                onChange('taxStatus', next);
                if (next !== 'VALID') {
                  onChange('taxValidUntil', '');
                }
              }}
              className={currentInputClass}
            >
              {taxValidityOptions.map(([v, l]) => (
                <option key={v} value={v}>{l}</option>
              ))}
            </select>
            {value.taxStatus === 'VALID' && (
              <input
                type="date"
                required={required}
                value={value.taxValidUntil}
                onChange={(e) => onChange('taxValidUntil', e.target.value)}
                className={currentInputClass}
              />
            )}
            {isLlt && (
              <p className="text-[11px] font-medium text-amber-600">
                LLT — Lifetime Tax. No expiry date required.
              </p>
            )}
            {value.taxStatus === 'NOT_AVAILABLE' && (
              <p className="rounded-lg bg-gray-50 px-2.5 py-1.5 text-[11px] text-gray-500">
                No valid tax date returned. Select a status to edit.
              </p>
            )}
          </div>
        </Field>

        {dateField('fitnessStatus', 'fitnessValidUntil', 'Fitness Validity')}

        <Field label="Insurance Validity" required={required} compact={compact} apiFill={apiFill}>
          <div className={compact ? "space-y-1.5" : "space-y-2"}>
            <select
              value={value.insuranceStatus}
              onChange={(e: ChangeEvent<HTMLSelectElement>) => {
                const next = e.target.value as ListingRtoFormState['insuranceStatus'];
                onChange('insuranceStatus', next);
                if (next !== 'VALID') onInsuranceExpiryChange('');
              }}
              className={currentInputClass}
            >
              {validityOptions.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
            {value.insuranceStatus === 'VALID' ? (
              <input
                type="date"
                required={required}
                value={insuranceExpiry}
                onChange={(e) => onInsuranceExpiryChange(e.target.value)}
                className={currentInputClass}
              />
            ) : value.insuranceStatus === 'NOT_AVAILABLE' ? (
              <p className="rounded-lg bg-gray-50 px-2.5 py-1.5 text-[11px] text-gray-500">
                No valid insurance date returned.
              </p>
            ) : null}
          </div>
        </Field>

        {dateField('pucStatus', 'pucValidUntil', 'PUC Validity')}

        {showHsrp ? (
          <Field label="HSRP Valid" required={false} compact={compact}>
            {makeSelect('hsrpStatus', hsrpOptions)}
          </Field>
        ) : null}
        {showHsrp ? (
          <Field label="HSRP Number" required={false} compact={compact} apiFill={apiFill}>
            <input
              value={value.hsrpNumber}
              maxLength={30}
              onChange={(e) => onChange('hsrpNumber', e.target.value.toUpperCase().replace(/[^A-Z0-9-]/g, '').slice(0, 30))}
              className={currentInputClass}
              placeholder="HSRP plate number"
            />
          </Field>
        ) : null}

        <Field label="RTO Office" required={required} compact={compact} apiFill={apiFill}>
          <input
            required={required}
            value={value.rtoOffice}
            maxLength={50}
            onChange={(e) => onChange('rtoOffice', e.target.value.replace(/[^A-Za-z0-9\s-]/g, ''))}
            className={currentInputClass}
            placeholder="e.g. DL-01 or Delhi Central"
          />
        </Field>
        <Field label="RTO Agent Name" required={false} compact={compact}>
          <input
            value={value.rtoAgentName}
            maxLength={60}
            onChange={(e) => onChange('rtoAgentName', e.target.value.replace(/[^A-Za-z\s.]/g, ''))}
            className={currentInputClass}
            placeholder="Agent name"
          />
        </Field>
        <Field label="RTO Expenses" required={false} compact={compact}>
          <input
            type="text"
            inputMode="numeric"
            pattern="[0-9]*"
            maxLength={9}
            value={value.rtoExpenses}
            onKeyDown={handleDigitOnlyKeyDown}
            onChange={(e) => onChange('rtoExpenses', e.target.value.replace(/\D/g, '').slice(0, 9))}
            className={currentInputClass}
            placeholder="e.g. 15000"
          />
        </Field>
        <Field label="Vehicle Maintenance Cost" required={false} compact={compact}>
          <input
            type="text"
            inputMode="numeric"
            pattern="[0-9]*"
            maxLength={9}
            value={value.vehicleMaintenanceCost}
            onKeyDown={handleDigitOnlyKeyDown}
            onChange={(e) => onChange('vehicleMaintenanceCost', e.target.value.replace(/\D/g, '').slice(0, 9))}
            className={currentInputClass}
            placeholder="e.g. 25000"
          />
        </Field>
      </div>
      <p className="mt-2.5 text-[11px] text-gray-500">
        Vehicle Type uses the existing Category field and Hours Running uses the existing Operating Hours field.
      </p>
    </section>
  );
}
