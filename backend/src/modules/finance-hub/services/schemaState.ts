// The admin portal can run against a database where the finance-hub migration has not been
// applied yet. Treat a missing table as "not ready" instead of a 500.
export const isFinanceHubSchemaMissing = (error: unknown) => {
  const databaseError = error as { code?: string; message?: string } | null;
  return (
    databaseError?.code === 'P2021' ||
    databaseError?.code === 'P2010' ||
    /relation "Fin[A-Za-z]+" does not exist/.test(databaseError?.message || '')
  );
};

export class FinanceHubSchemaMissingError extends Error {
  constructor() {
    super('Finance workspace tables are not installed yet. Apply the finance hub migration first.');
    this.name = 'FinanceHubSchemaMissingError';
  }
}
