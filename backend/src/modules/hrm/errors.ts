export class HrmHttpError extends Error {
  constructor(
    readonly statusCode: number,
    readonly code: string,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = 'HrmHttpError';
  }
}

export class HrmNotFoundError extends HrmHttpError {
  constructor(message = 'The requested HRM record was not found.') {
    super(404, 'HRM_NOT_FOUND', message);
  }
}

export class HrmAuthorizationError extends HrmHttpError {
  constructor(message = 'You do not have access to this HRM record.') {
    super(403, 'HRM_SCOPE_DENIED', message);
  }
}

export class HrmConflictError extends HrmHttpError {
  constructor(message = 'The HRM operation conflicts with the current record state.') {
    super(409, 'HRM_CONFLICT', message);
  }
}
