// ============================================================
// Keycloak Auth Config — OIDC popup flow + PKCE
// Pattern giống msalConfig.ts (Microsoft popup login)
// Client: confidential → FE chỉ lấy authorization code, không exchange
// ============================================================

import { config } from "@/config/env";
import { generateCodeChallenge, generateCodeVerifier, generateRandomToken } from "@/utils/pkce";

/** Kết quả popup login — code + code_verifier cho PKCE */
export interface KeycloakPopupResult {
  code: string;
  codeVerifier: string;
}

// ── PKCE Utilities ──────────────────────────────────────────

// ── Auth URL Builder ────────────────────────────────────────

/**
 * Build Keycloak authorization URL với PKCE.
 * response_type=code → lấy authorization code (không phải token).
 * Code sẽ được gửi đến LMS backend cùng code_verifier để exchange server-side.
 */
async function buildKeycloakAuthUrl(): Promise<{
  url: string;
  state: string;
  codeVerifier: string;
}> {
  const state = generateRandomToken();
  const nonce = generateRandomToken();
  const codeVerifier = generateCodeVerifier();
  const codeChallenge = await generateCodeChallenge(codeVerifier);

  // Lưu state để verify callback (chống CSRF)
  sessionStorage.setItem("kc_auth_state", state);

  const redirectUri = config.publicOrigin + import.meta.env.BASE_URL + "keycloak-callback.html";

  const params = new URLSearchParams({
    client_id: config.keycloakClientId,
    response_type: "code",
    redirect_uri: redirectUri,
    scope: "openid profile email",
    state,
    nonce,
    code_challenge: codeChallenge,
    code_challenge_method: "S256",
  });

  return {
    url: `${config.keycloakAuthority}/protocol/openid-connect/auth?${params.toString()}`,
    state,
    codeVerifier,
  };
}

/**
 * Lấy redirect_uri dùng cho Keycloak callback.
 * Phải khớp với URL đã đăng ký trên Keycloak client.
 */
export function getKeycloakRedirectUri(): string {
  return config.publicOrigin + import.meta.env.BASE_URL + "keycloak-callback.html";
}

/**
 * Mở popup Keycloak Login và lấy authorization code + code_verifier.
 *
 * Flow:
 *   1. Mở popup → Keycloak login page (với code_challenge)
 *   2. User đăng nhập → Keycloak redirect về /keycloak-callback?code=xxx&state=yyy
 *   3. Đọc code từ URL query params của popup
 *   4. Verify state → đóng popup → trả về { code, codeVerifier }
 *
 * @returns { code, codeVerifier } từ Keycloak
 * @throws Error nếu user đóng popup, timeout, hoặc lỗi
 */
export function keycloakPopupLogin(): Promise<KeycloakPopupResult> {
  return new Promise((resolve, reject) => {
    if (!config.keycloakClientId) {
      reject(new Error("Keycloak Client ID chưa được cấu hình."));
      return;
    }

    // Build auth URL async because PKCE challenge generation may use Web Crypto.
    buildKeycloakAuthUrl()
      .then(({ url: authUrl, state: expectedState, codeVerifier }) => {
        // Mở popup giữa màn hình
        const width = 500;
        const height = 700;
        const left = window.screenX + (window.outerWidth - width) / 2;
        const top = window.screenY + (window.outerHeight - height) / 2;

        const popup = window.open(
          authUrl,
          "keycloak-login",
          `width=${width},height=${height},left=${left},top=${top},scrollbars=yes,resizable=yes`
        );

        if (!popup) {
          reject(new Error("Không thể mở popup. Vui lòng tắt trình chặn popup."));
          return;
        }

        // Poll popup URL mỗi 300ms để đọc authorization code
        const pollInterval = setInterval(() => {
          try {
            // Popup đã đóng (user tự đóng)
            if (!popup || popup.closed) {
              clearInterval(pollInterval);
              reject(new Error("Đã hủy đăng nhập."));
              return;
            }

            // Kiểm tra popup đã redirect về origin chưa
            const popupUrl = popup.location.href;
            if (!popupUrl || !popupUrl.startsWith(window.location.origin)) {
              return; // Vẫn đang ở Keycloak → chờ tiếp
            }

            // Parse query params
            const url = new URL(popupUrl);
            const code = url.searchParams.get("code");
            const state = url.searchParams.get("state");
            const error = url.searchParams.get("error");

            if (error) {
              clearInterval(pollInterval);
              popup.close();
              const errorDesc = url.searchParams.get("error_description") || "Lỗi xác thực Keycloak.";
              reject(new Error(decodeURIComponent(errorDesc)));
              return;
            }

            if (code) {
              clearInterval(pollInterval);
              popup.close();

              // Verify state (chống CSRF)
              if (state !== expectedState) {
                reject(new Error("State mismatch — possible CSRF attack."));
                return;
              }

              sessionStorage.removeItem("kc_auth_state");
              resolve({ code, codeVerifier });
              return;
            }
          } catch {
            // Cross-origin error — popup vẫn ở Keycloak → bỏ qua, chờ tiếp
          }
        }, 300);

        // Timeout sau 2 phút
        setTimeout(() => {
          clearInterval(pollInterval);
          if (popup && !popup.closed) popup.close();
          reject(new Error("Đăng nhập đã hết thời gian."));
        }, 120_000);
      })
      .catch(reject);
  });
}
