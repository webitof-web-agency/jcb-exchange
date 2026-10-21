import prisma from '../../../lib/prisma';

// Existing flows (Sold Vehicles, payments, listing payments …) call emit() after their own
// transaction commits. It only queues work for the posting worker and must never throw back
// into the caller, so an accounting problem can never block an operational save.

export type FinanceHubSourceType =
  | 'SELL_ACCOUNT'
  | 'SELL_ACCOUNT_PAYMENT'
  | 'LISTING_PAYMENT'
  | 'CUSTOMER_PRIME'
  | 'PARTNER_DEPOSIT'
  | 'API_WALLET_LEDGER';

type QueueClient = {
  finPostingQueue: {
    create: (args: { data: { sourceType: string; sourceId: string; event: string } }) => Promise<unknown>;
  };
};

export const createFinanceHubEmitter = (
  client: QueueClient,
  logError: (message: string, error: unknown) => void = (message, error) => console.error(message, error),
) => async (sourceType: FinanceHubSourceType, sourceId: string, event: string) => {
  try {
    if (!sourceId) return false;
    await client.finPostingQueue.create({
      data: { sourceType, sourceId: sourceId.slice(0, 100), event: event.slice(0, 60) },
    });
    return true;
  } catch (error) {
    logError(`[finance-hub] could not queue ${sourceType}:${sourceId}:${event}`, error);
    return false;
  }
};

export const financeHubEvents = {
  emit: createFinanceHubEmitter(prisma),
};
