'use client';

import type { ChangeEvent } from 'react';
import type { ListingRtoFormState } from '@/lib/listingRtoForm';

const inputClass = 'w-full rounded-lg border border-gray-200 bg-[#F8FAFC] px-3 py-2.5 text-sm text-gray-900 outline-none transition focus:border-[#FFC107]';

const hirePurchaseOptions = [
  ['PENDING', 'Pending'],
  ['ACTIVE', 'Active'],
  ['TERMINATED', 'Terminated'],
  ['NOT_APPLICABLE', 'Not Applicable'],
] as const;
const validityOptions = [['VALID', 'Valid'], ['EXPIRED', 'Expired']] as const;
// Tax validity has an extra LLT (Lifetime) option — backend value is LIFETIME
const taxValidityOptions = [['VALID', 'Valid'], ['EXPIRED', 'Expired'], ['LIFETIME', 'LLT']] as const;
const hsrpOptions = [['YES', 'Yes'], ['NO', 'No']] as const;

function Field({ label, children, required }: { label: string; children: React.ReactNode; required: boolean }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-gray-500">
        {label} {required ? <span className="text-red-500">*</span> : null}
      </span>
      {children}
    </label>
  );
}

export default function ListingRtoFields({
  value,
  onChange,
  insuranceExpiry,
  onInsuranceExpiryChange,
  required = true,
}: {
  value: ListingRtoFormState;
  onChange: <K extends keyof ListingRtoFormState>(key: K, next: ListingRtoFormState[K]) => void;
  insuranceExpiry: string;
  onInsuranceExpiryChange: (next: string) => void;
  required?: boolean;
}) {
  const makeSelect = <K extends keyof ListingRtoFormState>(
    key: K,
    items: readonly (readonly [string, string])[],
  ) => (
    <select
      value={String(value[key])}
      onChange={(e: ChangeEvent<HTMLSelectElement>) =>
        onChange(key, e.target.value as ListingRtoFormState[K])
      }
      className={inputClass}
    >
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
    <Field label={label} required={required}>
      <div className="space-y-2">
        {makeSelect(statusKey, validityOptions)}
        <input
          type="date"
          required={required}
          value={String(value[dateKey] || '')}
          onChange={(e) => onChange(dateKey, e.target.value as ListingRtoFormState[D])}
          className={inputClass}
        />
      </div>
    </Field>
  );

  const isLlt = value.taxStatus === 'LIFETIME';

  return (
    <section className="rounded-2xl border border-gray-200 p-5">
      <div className="mb-4 flex items-center gap-2 text-gray-900">
        <h3 className="text-base font-semibold">RTO &amp; Vehicle Compliance</h3>
      </div>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        <Field label="Hire Purchase" required={required}>
          {makeSelect('hirePurchaseStatus', hirePurchaseOptions)}
        </Field>

        {/* Tax Validity — has LLT option; date hidden when LIFETIME selected */}
        <Field label="Tax Validity" required={required}>
          <div className="space-y-2">
            <select
              value={value.taxStatus}
              onChange={(e: ChangeEvent<HTMLSelectElement>) => {
                const next = e.target.value as ListingRtoFormState['taxStatus'];
                onChange('taxStatus', next);
                if (next === 'LIFETIME') {
                  onChange('taxValidUntil', '');
                }
              }}
              className={inputClass}
            >
              {taxValidityOptions.map(([v, l]) => (
                <option key={v} value={v}>{l}</option>
              ))}
            </select>
            {!isLlt && (
              <input
                type="date"
                required={required}
                value={value.taxValidUntil}
                onChange={(e) => onChange('taxValidUntil', e.target.value)}
                className={inputClass}
              />
            )}
            {isLlt && (
              <p className="text-xs font-medium text-amber-600">
                LLT — Lifetime Tax. No expiry date required.
              </p>
            )}
          </div>
        </Field>

        {dateField('fitnessStatus', 'fitnessValidUntil', 'Fitness Validity')}

        <Field label="Insurance Validity" required={required}>
          <div className="space-y-2">
            {makeSelect('insuranceStatus', validityOptions)}
            <input
              type="date"
              required={required}
              value={insuranceExpiry}
              onChange={(e) => onInsuranceExpiryChange(e.target.value)}
              className={inputClass}
            />
          </div>
        </Field>

        {dateField('pucStatus', 'pucValidUntil', 'PUC Validity')}

        <Field label="HSRP Valid" required={required}>
          {makeSelect('hsrpStatus', hsrpOptions)}
        </Field>

        <Field label="RTO Office" required={required}>
          <input
            required={required}
            value={value.rtoOffice}
            onChange={(e) => onChange('rtoOffice', e.target.value)}
            className={inputClass}
          />
        </Field>
        <Field label="RTO Agent Name" required={required}>
          <input
            required={required}
            value={value.rtoAgentName}
            onChange={(e) => onChange('rtoAgentName', e.target.value)}
            className={inputClass}
          />
        </Field>
        <Field label="RTO Expenses" required={required}>
          <input
            required={required}
            type="number"
            min={1}
            step={1}
            inputMode="numeric"
            value={value.rtoExpenses}
            onChange={(e) => onChange('rtoExpenses', e.target.value.replace(/\D/g, ''))}
            className={inputClass}
          />
        </Field>
        <Field label="Vehicle Maintenance Cost" required={required}>
          <input
            required={required}
            type="number"
            min={1}
            step={1}
            inputMode="numeric"
            value={value.vehicleMaintenanceCost}
            onChange={(e) => onChange('vehicleMaintenanceCost', e.target.value.replace(/\D/g, ''))}
            className={inputClass}
          />
        </Field>
      </div>
      <p className="mt-3 text-xs text-gray-500">
        Vehicle Type uses the existing Category field and Hours Running uses the existing Operating Hours field.
      </p>
    </section>
  );
}
