import assert from 'node:assert/strict';
import { generateKeyPairSync } from 'node:crypto';
import jwt from 'jsonwebtoken';
import test from 'node:test';
import { createFirebaseIdTokenVerifier } from './firebaseIdToken.js';

test('verifies a Firebase ID token against its project and cached signing certificate', async () => {
  const now = 1_800_000_000_000;
  const { publicKey, privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
  const key = publicKey.export({ type: 'spki', format: 'pem' });
  let fetchCount = 0;
  const verifier = createFirebaseIdTokenVerifier({
    now: () => now,
    fetchImpl: async () => {
      fetchCount++;
      return {
        ok: true,
        headers: { get: () => 'public, max-age=3600' },
        json: async () => ({ 'firebase-test-key': key })
      };
    }
  });

  const token = jwt.sign({
    sub: 'firebase-user-123',
    aud: 'transzo-project',
    iss: 'https://securetoken.google.com/transzo-project',
    iat: Math.floor(now / 1000) - 30,
    exp: Math.floor(now / 1000) + 600
  }, privateKey, { algorithm: 'RS256', keyid: 'firebase-test-key' });

  assert.equal((await verifier.verify(token, 'transzo-project')).sub, 'firebase-user-123');
  assert.equal((await verifier.verify(token, 'transzo-project')).sub, 'firebase-user-123');
  assert.equal(fetchCount, 1);
  await assert.rejects(verifier.verify(token, 'different-project'), { statusCode: 401 });
});
