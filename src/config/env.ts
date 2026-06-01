// ============================================================
// Env Config — Xác thực biến môi trường bắt buộc
// App CRASH ngay nếu thiếu biến — không fallback, không đoán
// ============================================================

function requireEnv(key: string): string {
  const value = import.meta.env[key];
  if (!value || value.trim() === "") {
    throw new Error(
      `[ENV] Thiếu biến môi trường: ${key}. Kiểm tra file .env.local.`
    );
  }
  return value.trim();
}

function requireEnvNumber(key: string, fallback?: number): number {
  const raw = import.meta.env[key];
  if (!raw && fallback !== undefined) return fallback;
  const num = Number(raw);
  if (isNaN(num) || num <= 0) {
    throw new Error(`[ENV] ${key} phải là số dương, nhận: "${raw}"`);
  }
  return num;
}

function requireUrl(key: string, allowEmpty = false): string {
  const url = import.meta.env[key] || "";
  if (allowEmpty && url.trim() === "") return "";
  
  if (!url || url.trim() === "") {
    throw new Error(`[ENV] Thiếu biến môi trường: ${key}. Kiểm tra file .env.local.`);
  }
  if (!url.startsWith("http://") && !url.startsWith("https://")) {
    throw new Error(`[ENV] ${key} phải là URL hợp lệ, nhận: "${url}"`);
  }
  return url.replace(/\/+$/, "");
}

export const config = {
  // Cho phép lấy từ env nếu có, nếu không thì fallback về origin hiện tại
  get lmsBaseUrl(): string {
    return requireUrl("VITE_OPENEDX_LMS_URL", true) || window.location.origin;
  },
  get cmsBaseUrl(): string {
    return requireUrl("VITE_OPENEDX_CMS_URL", true) || window.location.origin;
  },
  /** OpenEdX Client ID — tùy chọn (đang chuyển sang custom backend) */
  clientId: (import.meta.env.VITE_OPENEDX_CLIENT_ID || "").trim(),
  /** OpenEdX Client Secret — tùy chọn (đang chuyển sang custom backend) */
  clientSecret: (import.meta.env.VITE_OPENEDX_CLIENT_SECRET || "").trim(),
  tokenRefreshBufferMs: requireEnvNumber("VITE_TOKEN_REFRESH_BUFFER_MS", 300_000),
  apiTimeoutMs: requireEnvNumber("VITE_API_TIMEOUT_MS", 30_000),
  googleClientId: (import.meta.env.VITE_GOOGLE_CLIENT_ID || "").trim(),
  microsoftClientId: (import.meta.env.VITE_MICROSOFT_CLIENT_ID || "").trim(),
  microsoftAuthority: (
    import.meta.env.VITE_MICROSOFT_AUTHORITY ||
    "https://login.microsoftonline.com/common"
  ).trim(),

  publicOrigin: (import.meta.env.VITE_PUBLIC_ORIGIN || window.location.origin).trim(),

  /** Keycloak OIDC Authority URL — tùy chọn, không crash nếu thiếu */
  keycloakAuthority: (import.meta.env.VITE_KEYCLOAK_AUTHORITY || "").trim(),

  /** Keycloak OIDC Client ID — tùy chọn, không crash nếu thiếu */
  keycloakClientId: (import.meta.env.VITE_KEYCLOAK_CLIENT_ID || "").trim(),

  /** Custom Express Backend URL — bắt buộc cho auth mới */
  customApiUrl: requireUrl("VITE_CUSTOM_API_URL"),

  get apiBaseUrl(): string {
    return "";
  },
} as const;
