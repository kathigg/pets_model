const TOKEN_URL = 'http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/token';
const REFRESH_EARLY_MS = 5 * 60 * 1000;

/** Fetches short-lived OAuth tokens for the Cloud Run service identity. */
export function createMetadataAccessTokenProvider({ fetchImpl = fetch, now = Date.now } = {}) {
  let cachedToken;
  let expiresAt = 0;
  let inFlight;

  return async function accessTokenProvider() {
    if (cachedToken && now() < expiresAt - REFRESH_EARLY_MS) return cachedToken;
    if (inFlight) return inFlight;

    inFlight = (async () => {
      const response = await fetchImpl(TOKEN_URL, {
        headers: { 'Metadata-Flavor': 'Google' },
        signal: AbortSignal.timeout(3000)
      });
      if (!response.ok) throw new Error('Cloud Run service identity is unavailable');
      const payload = await response.json();
      if (typeof payload?.access_token !== 'string' || !payload.access_token ||
          !Number.isFinite(payload.expires_in) || payload.expires_in <= 0) {
        throw new Error('Cloud Run service identity returned an invalid token');
      }
      cachedToken = payload.access_token;
      expiresAt = now() + payload.expires_in * 1000;
      return cachedToken;
    })();

    try {
      return await inFlight;
    } finally {
      inFlight = undefined;
    }
  };
}
