import jwt from 'jsonwebtoken';
import { createPublicKey } from 'node:crypto';

const FIREBASE_CERTIFICATES_URL =
  'https://www.googleapis.com/robot/v1/metadata/x509/securetoken@system.gserviceaccount.com';

export function createFirebaseIdTokenVerifier({ fetchImpl = fetch, now = Date.now } = {}) {
  let certificates = new Map();
  let certificatesExpireAt = 0;
  let certificatesRequest = null;

  async function loadCertificates(forceRefresh = false) {
    if (!forceRefresh && certificates.size && certificatesExpireAt > now()) {
      return certificates;
    }

    if (certificatesRequest) return certificatesRequest;

    certificatesRequest = (async () => {
      let response;
      try {
        response = await fetchImpl(FIREBASE_CERTIFICATES_URL);
      } catch {
        const error = new Error('Could not reach Firebase token verification service.');
        error.statusCode = 503;
        throw error;
      }

      if (!response.ok) {
        const error = new Error('Could not load Firebase token verification certificates.');
        error.statusCode = 503;
        throw error;
      }

      const pemByKeyId = await response.json();
      if (!pemByKeyId || typeof pemByKeyId !== 'object' || Array.isArray(pemByKeyId)) {
        const error = new Error('Firebase returned invalid token verification certificates.');
        error.statusCode = 503;
        throw error;
      }

      certificates = new Map(
        Object.entries(pemByKeyId).map(([keyId, pem]) => [
          keyId,
          createPublicKey(pem)
        ])
      );
      const maxAge = response.headers.get('cache-control')?.match(/max-age=(\d+)/)?.[1];
      certificatesExpireAt = now() + Number(maxAge || 3600) * 1000;
      return certificates;
    })();

    try {
      return await certificatesRequest;
    } finally {
      certificatesRequest = null;
    }
  }

  async function verify(token, projectId) {
    if (typeof token !== 'string' || token.length > 8192 || !projectId) {
      const error = new Error('A Firebase ID token and project ID are required.');
      error.statusCode = 401;
      throw error;
    }

    const decoded = jwt.decode(token, { complete: true });
    const keyId = decoded?.header?.kid;
    if (!keyId || decoded.header.alg !== 'RS256') {
      const error = new Error('Firebase ID token is invalid.');
      error.statusCode = 401;
      throw error;
    }

    let keys = await loadCertificates();
    if (!keys.has(keyId)) keys = await loadCertificates(true);
    const key = keys.get(keyId);
    if (!key) {
      const error = new Error('Firebase ID token uses an unknown signing key.');
      error.statusCode = 401;
      throw error;
    }

    let claims;
    try {
      claims = jwt.verify(token, key, {
        algorithms: ['RS256'],
        audience: projectId,
        issuer: `https://securetoken.google.com/${projectId}`,
        clockTimestamp: Math.floor(now() / 1000),
        clockTolerance: 60
      });
    } catch {
      const error = new Error('Firebase ID token is invalid or expired.');
      error.statusCode = 401;
      throw error;
    }

    if (typeof claims === 'string' || !claims.sub) {
      const error = new Error('Firebase ID token has no user identity.');
      error.statusCode = 401;
      throw error;
    }

    return claims;
  }

  return { verify };
}
