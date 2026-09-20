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

function getRuntimeOrigin(): string {
  return typeof window !== "undefined" ? window.location.origin : "";
}

function parseUrl(raw: string): URL | null {
  try {
    return new URL(raw);
  } catch {
    return null;
  }
}

function isSameOriginToken(value: string): boolean {
  const normalized = value.trim().toLowerCase();
  return normalized === "auto" || normalized === "same-origin" || normalized === "self";
}

function resolveSameOriginPath(value: string, runtimeOrigin: string, key: string): string | null {
  const prefix = "same-origin:";
  if (!value.toLowerCase().startsWith(prefix)) return null;

  const pathname = value.slice(prefix.length).trim();
  const unsafeSegment = pathname.split('/').some((segment) => segment === '.' || segment === '..');
  if (
    !runtimeOrigin ||
    !pathname.startsWith("/") ||
    pathname.startsWith("//") ||
    pathname.includes("\\") ||
    pathname.includes("%") ||
    pathname.includes("?") ||
    pathname.includes("#") ||
    unsafeSegment
  ) {
    throw new Error(`[ENV] ${key} must use a safe same-origin absolute path, for example "same-origin:/admin".`);
  }

  return `${runtimeOrigin}${pathname.replace(/\/+$/, "")}`;
}

function resolvePublicOrigin(): string {
  const runtimeOrigin = getRuntimeOrigin();
  const raw = (import.meta.env.VITE_PUBLIC_ORIGIN || "").trim();

  if (!raw || isSameOriginToken(raw)) {
    if (runtimeOrigin) return runtimeOrigin;
    throw new Error("[ENV] VITE_PUBLIC_ORIGIN must be set when runtime origin is unavailable.");
  }

  const candidates: string[] = raw.split(",").map((item: string) => item.trim()).filter(Boolean);
  const runtimeUrl = runtimeOrigin ? parseUrl(runtimeOrigin) : null;

  if (runtimeUrl) {
    const matchingCandidate = candidates
      .map((candidate: string) => parseUrl(candidate))
      .find((candidate: URL | null): candidate is URL => candidate !== null && candidate.hostname === runtimeUrl.hostname);

    if (matchingCandidate) {
      return runtimeUrl.protocol === "https:" && matchingCandidate.protocol === "http:"
        ? runtimeOrigin
        : matchingCandidate.origin;
    }

    return runtimeOrigin;
  }

  const firstValid = candidates
    .map((candidate: string) => parseUrl(candidate))
    .find((candidate: URL | null): candidate is URL => candidate !== null);
  if (firstValid) return firstValid.origin;

  throw new Error(`[ENV] VITE_PUBLIC_ORIGIN is not valid: "${raw}"`);
}

function isLoopbackHost(hostname: string): boolean {
  const normalized = hostname.toLowerCase().replace(/^\[|\]$/g, "");
  return normalized === "localhost" || normalized === "127.0.0.1" || normalized === "::1";
}

function isPrivateLiteralHost(hostname: string): boolean {
  const normalized = hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (isLoopbackHost(normalized) || normalized === "0.0.0.0" || normalized === "::") return true;
  if (/^(?:10|127)\./.test(normalized)) return true;
  if (/^192\.168\./.test(normalized)) return true;
  if (/^169\.254\./.test(normalized)) return true;
  if (/^172\.(?:1[6-9]|2\d|3[01])\./.test(normalized)) return true;
  if (/^100\.(?:6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./.test(normalized)) return true;
  return normalized.startsWith("fc") || normalized.startsWith("fd") || normalized.startsWith("fe80:");
}

function resolveCustomApiUrl(): string {
  const raw = (import.meta.env.VITE_CUSTOM_API_URL || "").trim();
  const runtimeOrigin = getRuntimeOrigin();

  const sameOriginPath = resolveSameOriginPath(raw, runtimeOrigin, "VITE_CUSTOM_API_URL");
  if (sameOriginPath) return sameOriginPath;

  if (isSameOriginToken(raw)) {
    if (runtimeOrigin) return runtimeOrigin;
    throw new Error("[ENV] VITE_CUSTOM_API_URL uses same-origin, but runtime origin is unavailable.");
  }

  const configuredUrl = requireUrl("VITE_CUSTOM_API_URL");
  const parsed = parseUrl(configuredUrl);

  if (
    runtimeOrigin &&
    typeof window !== "undefined" &&
    window.location.protocol === "https:" &&
    parsed?.protocol === "http:" &&
    !isLoopbackHost(parsed.hostname)
  ) {
    return runtimeOrigin;
  }

  return configuredUrl;
}

function resolveCourseAssetUploadOrigin(): string {
  const raw = (import.meta.env.VITE_COURSE_ASSET_UPLOAD_ORIGIN || "").trim();
  if (!raw || isSameOriginToken(raw)) return "";

  const configuredUrl = requireUrl("VITE_COURSE_ASSET_UPLOAD_ORIGIN");
  const parsed = parseUrl(configuredUrl);
  if (!parsed || parsed.protocol !== "https:" || parsed.username || parsed.password || parsed.pathname !== "/" || parsed.search || parsed.hash || isPrivateLiteralHost(parsed.hostname)) {
    throw new Error("[ENV] VITE_COURSE_ASSET_UPLOAD_ORIGIN must be a public HTTPS origin without a path, credentials, query, or fragment.");
  }
  return parsed.origin;
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

  get publicOrigin(): string {
    return resolvePublicOrigin();
  },

  /** Keycloak OIDC Authority URL — tùy chọn, không crash nếu thiếu */
  keycloakAuthority: (import.meta.env.VITE_KEYCLOAK_AUTHORITY || "").trim(),

  /** Keycloak OIDC Client ID — tùy chọn, không crash nếu thiếu */
  keycloakClientId: (import.meta.env.VITE_KEYCLOAK_CLIENT_ID || "").trim(),

  /** Custom Express Backend URL — bắt buộc cho auth mới */
  get customApiUrl(): string {
    return resolveCustomApiUrl();
  },

  /**
   * Optional dedicated HTTPS origin for large authenticated course-asset
   * uploads. It is intentionally separate from Storage; the browser still
   * sends the upload through the audited application API.
   */
  get courseAssetUploadOrigin(): string {
    return resolveCourseAssetUploadOrigin();
  },

  get apiBaseUrl(): string {
    return "";
  },
} as const;
