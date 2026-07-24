// Google Identity Services (GIS) type declarations
declare namespace google.accounts.oauth2 {
  interface CodeClientConfig {
    client_id: string;
    scope: string;
    ux_mode?: 'popup' | 'redirect';
    callback: (response: CodeResponse) => void;
    redirect_uri?: string;
  }

  interface CodeResponse {
    code: string;
    scope: string;
    error?: string;
    error_description?: string;
    error_uri?: string;
  }

  interface CodeClient {
    requestCode(): void;
  }

  function initCodeClient(config: CodeClientConfig): CodeClient;

  interface TokenClientConfig {
    client_id: string;
    scope: string;
    prompt?: string;
    callback: (response: TokenResponse) => void;
  }

  interface TokenResponse {
    access_token: string;
    expires_in: number | string;
    scope: string;
    error?: string;
    error_description?: string;
  }

  interface TokenClient {
    requestAccessToken(overrides?: { prompt?: string }): void;
  }

  function initTokenClient(config: TokenClientConfig): TokenClient;
}
