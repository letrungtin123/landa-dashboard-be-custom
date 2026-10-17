/** Success envelope of the custom backend: `{ success: true, data, message? }`. Reuse it in new API modules. */
export interface ApiResponse<T> {
  success: boolean;
  data: T;
  message?: string;
}
