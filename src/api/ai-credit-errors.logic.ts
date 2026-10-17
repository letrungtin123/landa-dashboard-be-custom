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
    case 'AI_CREDIT_MONTH_NOT_FOUND': return 'aiCredits.admin.apiErrors.monthNotFound';
    case 'TENANT_NOT_FOUND': return 'aiCredits.admin.apiErrors.tenantNotFound';
    default: return null;
  }
}

/** A refused input of the AI points routes (400): the server names the field. */
export const AI_CREDIT_INVALID_INPUT_CODE = 'AI_CREDIT_INVALID_INPUT';

/** Fields the AI points routes can refuse, with a plain label each (under aiCredits.admin.apiErrors.fields). */
export const AI_CREDIT_INPUT_FIELDS = [
  'name', 'code', 'description', 'monthly_price_vnd', 'monthly_points', 'provider_cost_ratio', 'safety_buffer_ratio',
  'is_unlimited', 'is_active', 'sort_order', 'plan_id', 'points', 'price_vnd', 'reason', 'vnd_per_usd', 'source_note',
  'cost_vnd', 'note', 'month', 'tenantId', 'planId',
] as const;

/**
 * Plain message of a refused input: `key` with `fieldKey` (the field's label)
 * when the field is known, else a generic message. Null for any other code.
 */
export function aiCreditInvalidInputKeys(code: unknown, field: unknown): { key: string; fieldKey: string | null } | null {
  if (code !== AI_CREDIT_INVALID_INPUT_CODE) return null;
  const known = AI_CREDIT_INPUT_FIELDS.includes(field as typeof AI_CREDIT_INPUT_FIELDS[number]);
  return known
    ? { key: 'aiCredits.admin.apiErrors.invalidField', fieldKey: `aiCredits.admin.apiErrors.fields.${String(field)}` }
    : { key: 'aiCredits.admin.apiErrors.invalidInput', fieldKey: null };
}
