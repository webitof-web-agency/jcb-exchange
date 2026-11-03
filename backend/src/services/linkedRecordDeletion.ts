// The rules for deleting Sold Vehicle and RTO records (including a Sold Vehicle that was handed to
// RTO Work) are in sellAccountDeletion.service.ts. This error is kept for older callers.
export class RtoHandoffRequiredError extends Error {
  readonly code = 'RTO_HANDOFF_REQUIRED';
  readonly statusCode = 409;

  constructor() {
    super('This Sold Vehicle was transferred to RTO Work. Delete it from the RTO Work section first.');
    this.name = 'RtoHandoffRequiredError';
  }
}
