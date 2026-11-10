/**
 * Phase 0 safety gate for the future Admin/Employee AI surface.
 *
 * The gate is intentionally fail-closed: AI is enabled only when the
 * environment value is exactly "true" (case-insensitive). The gateway keeps
 * this gate as the first runtime check so a missing or malformed flag cannot
 * trigger an external provider call.
 */
export const isAiEnabled = (env: NodeJS.ProcessEnv = process.env): boolean =>
  env.AI_ENABLED?.trim().toLowerCase() === 'true';

export class AiDisabledError extends Error {
  readonly code = 'AI_DISABLED';
  readonly statusCode = 503;

  constructor() {
    super('AI features are currently disabled.');
    this.name = 'AiDisabledError';
  }
}

export const requireAiEnabled = (env: NodeJS.ProcessEnv = process.env): void => {
  if (!isAiEnabled(env)) {
    throw new AiDisabledError();
  }
};
