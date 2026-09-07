/** Keeps every locale structurally aligned with the Vietnamese source of truth. */
export type TranslationSchema<T> = {
  [K in keyof T]: T[K] extends string ? string : TranslationSchema<T[K]>;
};
