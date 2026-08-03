import { UserManager, WebStorageStateStore } from 'oidc-client-ts';

let manager: UserManager | null = null;
let accessToken: string | null = null;

export const isKeycloakMode = process.env.NEXT_PUBLIC_AUTH_MODE === 'keycloak';

export function getOidcManager(): UserManager {
  if (typeof window === 'undefined') throw new Error('OIDC is browser-only');
  if (!manager) {
    const authority = process.env.NEXT_PUBLIC_KEYCLOAK_ISSUER;
    const clientId = process.env.NEXT_PUBLIC_KEYCLOAK_CLIENT_ID;
    if (!authority || !clientId) throw new Error('Missing public Keycloak configuration');
    manager = new UserManager({
      authority,
      client_id: clientId,
      redirect_uri: `${window.location.origin}/auth/callback`,
      post_logout_redirect_uri: `${window.location.origin}/`,
      response_type: 'code',
      scope: 'openid profile email',
      automaticSilentRenew: false,
      monitorSession: true,
      userStore: new WebStorageStateStore({ store: window.sessionStorage }),
      stateStore: new WebStorageStateStore({ store: window.sessionStorage }),
    });
  }
  return manager;
}

export function setAccessToken(token: string | null): void {
  accessToken = token;
}

export function getAccessToken(): string | null {
  return accessToken;
}
