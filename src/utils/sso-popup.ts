import type { PublicSsoProvider } from "@/api/custom-sso";
import { generateCodeChallenge, generateCodeVerifier, generateRandomToken } from "@/utils/pkce";

export interface SsoPopupResult {
  code: string;
  codeVerifier: string;
  redirectUri: string;
}

export async function openSsoPopup(provider: PublicSsoProvider): Promise<SsoPopupResult> {
  const state = generateRandomToken();
  const nonce = generateRandomToken();
  const codeVerifier = generateCodeVerifier();
  const codeChallenge = await generateCodeChallenge(codeVerifier);
  const redirectUri = `${window.location.origin}${provider.callback_path || "/sso-callback.html"}`;

  const url = new URL(provider.authorization_url);
  url.searchParams.set("client_id", provider.client_id);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("scope", provider.scopes.join(" "));
  url.searchParams.set("state", state);
  url.searchParams.set("nonce", nonce);
  url.searchParams.set("code_challenge", codeChallenge);
  url.searchParams.set("code_challenge_method", "S256");

  return new Promise((resolve, reject) => {
    const width = 520;
    const height = 720;
    const left = window.screenX + (window.outerWidth - width) / 2;
    const top = window.screenY + (window.outerHeight - height) / 2;
    const popup = window.open(
      url.toString(),
      `${provider.provider}-sso-login`,
      `width=${width},height=${height},left=${left},top=${top},scrollbars=yes,resizable=yes`,
    );

    if (!popup) {
      reject(new Error("Không thể mở popup. Vui lòng tắt trình chặn popup."));
      return;
    }

    const timeout = window.setTimeout(() => {
      window.clearInterval(poll);
      if (!popup.closed) popup.close();
      reject(new Error("Đăng nhập SSO đã hết thời gian."));
    }, 120_000);

    const poll = window.setInterval(() => {
      try {
        if (popup.closed) {
          window.clearTimeout(timeout);
          window.clearInterval(poll);
          reject(new Error("Đã hủy đăng nhập."));
          return;
        }

        if (!popup.location.href.startsWith(window.location.origin)) return;
        const current = new URL(popup.location.href);
        const error = current.searchParams.get("error");
        if (error) {
          window.clearTimeout(timeout);
          window.clearInterval(poll);
          popup.close();
          reject(new Error(current.searchParams.get("error_description") || "SSO provider từ chối đăng nhập."));
          return;
        }

        const code = current.searchParams.get("code");
        const returnedState = current.searchParams.get("state");
        if (code) {
          window.clearTimeout(timeout);
          window.clearInterval(poll);
          popup.close();
          if (returnedState !== state) {
            reject(new Error("SSO state không hợp lệ."));
            return;
          }
          resolve({ code, codeVerifier, redirectUri });
        }
      } catch {
        // Cross-origin while popup is still on provider domain.
      }
    }, 300);
  });
}
