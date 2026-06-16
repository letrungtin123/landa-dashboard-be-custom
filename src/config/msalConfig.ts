// ============================================================
// Microsoft Auth Config — OAuth2 popup flow thủ công
// Không dùng MSAL library — giảm bundle size + tránh bugs
// ============================================================

import { config } from "@/config/env";
import { generateRandomToken } from "@/utils/pkce";

const MICROSOFT_SCOPES = ["openid", "profile", "email"];

function buildMicrosoftAuthUrl(): string {
  const nonce = generateRandomToken();
  sessionStorage.setItem("ms_auth_nonce", nonce);

  const params = new URLSearchParams({
    client_id: config.microsoftClientId,
    response_type: "id_token",
    redirect_uri: config.publicOrigin + import.meta.env.BASE_URL + "auth-redirect.html",
    scope: MICROSOFT_SCOPES.join(" "),
    response_mode: "fragment",
    nonce,
  });

  return `${config.microsoftAuthority}/oauth2/v2.0/authorize?${params.toString()}`;
}

/**
 * Mở popup Microsoft Login → lấy id_token.
 * @returns id_token (JWT) chứa email, name, sub
 */
export function microsoftPopupLogin(): Promise<string> {
  return new Promise((resolve, reject) => {
    if (!config.microsoftClientId) {
      reject(new Error("Microsoft Client ID chưa cấu hình."));
      return;
    }

    const authUrl = buildMicrosoftAuthUrl();
    const w = 500, h = 700;
    const left = window.screenX + (window.outerWidth - w) / 2;
    const top = window.screenY + (window.outerHeight - h) / 2;

    const popup = window.open(
      authUrl, "microsoft-login",
      `width=${w},height=${h},left=${left},top=${top},scrollbars=yes,resizable=yes`
    );

    if (!popup) {
      reject(new Error("Trình chặn popup đang bật. Vui lòng tắt và thử lại."));
      return;
    }

    const poll = setInterval(() => {
      try {
        if (!popup || popup.closed) {
          clearInterval(poll);
          reject(new Error("Đã hủy đăng nhập."));
          return;
        }

        const url = popup.location.href;
        if (!url || !url.startsWith(window.location.origin)) return;

        const hash = popup.location.hash;
        if (hash && hash.includes("id_token")) {
          clearInterval(poll);
          popup.close();
          const params = new URLSearchParams(hash.substring(1));
          const idToken = params.get("id_token");
          if (idToken) resolve(idToken);
          else reject(new Error("Không nhận được token."));
          return;
        }

        if (hash && hash.includes("error")) {
          clearInterval(poll);
          popup.close();
          const params = new URLSearchParams(hash.substring(1));
          reject(new Error(decodeURIComponent(params.get("error_description") || "Lỗi xác thực.")));
          return;
        }
      } catch {
        // Cross-origin — popup ở trang Microsoft, chờ tiếp
      }
    }, 300);

    setTimeout(() => {
      clearInterval(poll);
      if (popup && !popup.closed) popup.close();
      reject(new Error("Đăng nhập hết thời gian."));
    }, 120_000);
  });
}
