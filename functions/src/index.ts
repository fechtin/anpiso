import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { initializeApp } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';

initializeApp();
const db = getFirestore();

const TOKEN_URL = 'https://oauth2.googleapis.com/token';

export const exchangeDriveCode = onCall({ region: 'asia-northeast3' }, async (request) => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'Must be logged in');
  }

  const { authCode } = request.data as { authCode: string };
  if (!authCode) {
    throw new HttpsError('invalid-argument', 'authCode is required');
  }

  const uid = request.auth.uid;
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    throw new HttpsError('internal', 'OAuth credentials not configured');
  }

  const tokenRes = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code: authCode,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: 'postmessage',
      grant_type: 'authorization_code',
    }),
  });

  if (!tokenRes.ok) {
    const err = await tokenRes.text();
    console.error('Token exchange failed:', err);
    throw new HttpsError('internal', 'Failed to exchange authorization code');
  }

  const tokens = await tokenRes.json();

  if (tokens.refresh_token) {
    await db.doc(`driveTokens/${uid}`).set({
      refreshToken: tokens.refresh_token,
      updatedAt: FieldValue.serverTimestamp(),
    });
  }

  return {
    accessToken: tokens.access_token as string,
    expiresIn: tokens.expires_in as number,
  };
});

export const refreshDriveToken = onCall({ region: 'asia-northeast3' }, async (request) => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'Must be logged in');
  }

  const uid = request.auth.uid;
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    throw new HttpsError('internal', 'OAuth credentials not configured');
  }

  const doc = await db.doc(`driveTokens/${uid}`).get();
  if (!doc.exists) {
    throw new HttpsError('not-found', 'No Drive authorization found. Please re-enable Drive.');
  }

  const refreshToken = doc.data()?.refreshToken;
  if (!refreshToken) {
    throw new HttpsError('not-found', 'Refresh token missing. Please re-enable Drive.');
  }

  const tokenRes = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
    }),
  });

  if (!tokenRes.ok) {
    const err = await tokenRes.text();
    console.error('Token refresh failed:', err);

    if (tokenRes.status === 400 || tokenRes.status === 401) {
      await db.doc(`driveTokens/${uid}`).delete();
      throw new HttpsError('permission-denied', 'Drive access revoked. Please re-enable Drive.');
    }

    throw new HttpsError('internal', 'Failed to refresh token');
  }

  const tokens = await tokenRes.json();

  return {
    accessToken: tokens.access_token as string,
    expiresIn: tokens.expires_in as number,
  };
});
