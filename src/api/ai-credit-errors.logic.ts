/** Any AI call refused because the tenant's AI points of the month are spent. */
export const AI_CREDIT_LIMIT_REACHED_CODE = 'AI_CREDIT_LIMIT_REACHED';
/** A new AI ID run refused because the points left do not cover its expected cost. */
export const AI_CREDIT_INSUFFICIENT_FOR_RUN_CODE = 'AI_CREDIT_INSUFFICIENT_FOR_RUN';

/** Both are refusals sent before any work starts: nothing was created or charged. */
export const AI_CREDIT_ERROR_CODES = [AI_CREDIT_LIMIT_REACHED_CODE, AI_CREDIT_INSUFFICIENT_FOR_RUN_CODE] as const;
export type AiCreditErrorCode = typeof AI_CREDIT_ERROR_CODES[number];

/** i18n keys of the plain messages (same copy in the chat, the AI ID start screen and toasts). */
export const AI_CREDIT_ERROR_KEYS: Readonly<Record<AiCreditErrorCode, string>> = {
  AI_CREDIT_LIMIT_REACHED: 'aiCredits.errors.limitReached',
  AI_CREDIT_INSUFFICIENT_FOR_RUN: 'aiCredits.errors.insufficientForRun',
};

export function isAiCreditErrorCode(code: unknown): code is AiCreditErrorCode {
  return AI_CREDIT_ERROR_CODES.includes(code as AiCreditErrorCode);
}

/** i18n key of the plain message for an AI points refusal, or null for any other code. */
export function aiCreditErrorKey(code: unknown): string | null {
  return isAiCreditErrorCode(code) ? AI_CREDIT_ERROR_KEYS[code] : null;
}

/** Superadmin AI points actions: codes with their own plain message (others use the server text or a fallback). */
export function aiCreditAdminErrorKey(code: unknown): string | null {
  switch (code) {
    case 'AI_CREDIT_PLAN_CODE_TAKEN': return 'aiCredits.admin.apiErrors.planCodeTaken';
    case 'AI_CREDIT_PLAN_INACTIVE': return 'aiCredits.admin.apiErrors.planInactive';
    case 'AI_CREDIT_PLAN_NOT_FOUND': return 'aiCredits.admin.apiErrors.planNotFound';
    case 'AI_CREDIT_MONTH_INVALID': return 'aiCredits.admin.apiErrors.monthInvalid';
    case 'TENANT_NOT_FOUND': return 'aiCredits.admin.apiErrors.tenantNotFound';
    default: return null;
  }
}
