
const GMAIL_SCOPE = 'https://www.googleapis.com/auth/gmail.send';
const TOKEN_KEY = 'gmail_send_token';
const EXPIRY_KEY = 'gmail_send_token_expiry';

export const gmailService = {
  /**
   * Lấy access token cho gmail.send theo kiểu incremental authorization:
   * chỉ hỏi quyền đúng lúc user bấm gửi, cache trong session (~1h).
   */
  async getSendToken(): Promise<string> {
    const cached = sessionStorage.getItem(TOKEN_KEY);
    const expiry = Number(sessionStorage.getItem(EXPIRY_KEY) || '0');
    if (cached && Date.now() < expiry - 60_000) return cached;

    return new Promise((resolve, reject) => {
      const client = google.accounts.oauth2.initTokenClient({
        client_id: import.meta.env.VITE_GOOGLE_CLIENT_ID,
        scope: GMAIL_SCOPE,
        callback: (resp) => {
          if (resp.error) {
            reject(new Error(resp.error_description || resp.error));
            return;
          }
          sessionStorage.setItem(TOKEN_KEY, resp.access_token);
          sessionStorage.setItem(EXPIRY_KEY, String(Date.now() + Number(resp.expires_in) * 1000));
          resolve(resp.access_token);
        },
      });
      client.requestAccessToken();
    });
  },

  clearSendToken() {
    sessionStorage.removeItem(TOKEN_KEY);
    sessionStorage.removeItem(EXPIRY_KEY);
  },

  async sendEmail(
    accessToken: string,
    to: string[],
    subject: string,
    htmlBody: string
  ): Promise<void> {
    const boundary = 'boundary_' + Date.now();
    const encodedSubject = '=?UTF-8?B?' + btoa(unescape(encodeURIComponent(subject))) + '?=';

    const mimeMessage = [
      `To: ${to.join(', ')}`,
      `Subject: ${encodedSubject}`,
      'MIME-Version: 1.0',
      `Content-Type: multipart/alternative; boundary="${boundary}"`,
      '',
      `--${boundary}`,
      'Content-Type: text/html; charset=UTF-8',
      'Content-Transfer-Encoding: base64',
      '',
      btoa(unescape(encodeURIComponent(htmlBody))),
      `--${boundary}--`,
    ].join('\r\n');

    const raw = btoa(mimeMessage)
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');

    const response = await fetch(
      'https://gmail.googleapis.com/gmail/v1/users/me/messages/send',
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ raw }),
      }
    );

    if (response.status === 401) throw new Error('TOKEN_EXPIRED');
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData?.error?.message || `Gmail API error: ${response.status}`);
    }
  },
};
