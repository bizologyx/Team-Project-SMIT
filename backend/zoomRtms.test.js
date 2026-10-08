import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import test from 'node:test';
import { createZoomRtmsBridge, verifyZoomWebhook } from './zoomRtms.js';

const WEBHOOK_SECRET = 'test-webhook-secret';
const NOW_SECONDS = 1_800_000_000;

function signedWebhook(body) {
  const timestamp = String(NOW_SECONDS);
  const signature = `v0=${createHmac('sha256', WEBHOOK_SECRET)
    .update(`v0:${timestamp}:${JSON.stringify(body)}`)
    .digest('hex')}`;

  return { body, timestamp, signature };
}

function createResponse() {
  const response = {
    statusCode: null,
    headers: {},
    events: [],
    destroyed: false,
    writableEnded: false,
    status(statusCode) {
      this.statusCode = statusCode;
      return this;
    },
    set(headers) {
      Object.assign(this.headers, headers);
      return this;
    },
    flushHeaders() {},
    write(chunk) {
      this.events.push(chunk);
      return true;
    }
  };
  return response;
}

test('verifies fresh Zoom webhook signatures using the serialized request body', () => {
  const webhook = signedWebhook({ event: 'meeting.rtms_started' });
  assert.equal(verifyZoomWebhook({ ...webhook, secret: WEBHOOK_SECRET, nowSeconds: NOW_SECONDS }), true);
  assert.equal(verifyZoomWebhook({
    ...webhook,
    body: { event: 'meeting.rtms_stopped' },
    secret: WEBHOOK_SECRET,
    nowSeconds: NOW_SECONDS
  }), false);
  assert.equal(verifyZoomWebhook({
    ...webhook,
    secret: WEBHOOK_SECRET,
    nowSeconds: NOW_SECONDS + 301
  }), false);
});

test('answers Zoom endpoint validation with the required HMAC token', async () => {
  const bridge = createZoomRtmsBridge({
    webhookSecret: WEBHOOK_SECRET,
    clientId: 'rtms-client',
    clientSecret: 'rtms-secret',
    platform: 'linux',
    now: () => NOW_SECONDS * 1000,
    logError() {}
  });

  try {
    const result = await bridge.handleWebhook({
      body: { event: 'endpoint.url_validation', payload: { plainToken: 'zoom-challenge' } }
    });

    assert.equal(result.statusCode, 200);
    assert.equal(result.body.plainToken, 'zoom-challenge');
    assert.equal(result.body.encryptedToken, createHmac('sha256', WEBHOOK_SECRET)
      .update('zoom-challenge')
      .digest('hex'));
  } finally {
    bridge.close();
  }
});

test('rejects RTMS when the backend platform is unsupported', () => {
  const bridge = createZoomRtmsBridge({
    webhookSecret: WEBHOOK_SECRET,
    clientId: 'rtms-client',
    clientSecret: 'rtms-secret',
    platform: 'win32',
    logError() {}
  });

  assert.throws(
    () => bridge.createSession('1234567890', 'user-1'),
    (error) => error.statusCode === 503 && error.message.includes('Linux or macOS')
  );
  bridge.close();
});

test('relays an authorized Zoom transcript and leaves the client on stop', async () => {
  let transcriptCallback;
  let joinedPayload;
  let leaveCount = 0;
  const bridge = createZoomRtmsBridge({
    webhookSecret: WEBHOOK_SECRET,
    clientId: 'rtms-client',
    clientSecret: 'rtms-secret',
    platform: 'linux',
    now: () => NOW_SECONDS * 1000,
    logError() {},
    createClient: () => ({
      onTranscriptData(callback) {
        transcriptCallback = callback;
        return true;
      },
      join(payload) {
        joinedPayload = payload;
        return true;
      },
      leave() {
        leaveCount++;
        return true;
      }
    })
  });

  try {
    const session = bridge.createSession('123 456 7890', 'user-1');
    const response = createResponse();
    const unsubscribe = bridge.subscribe(session.sessionId, session.token, response);

    assert.equal(typeof unsubscribe, 'function');
    assert.equal(bridge.subscribe(session.sessionId, 'incorrect-token', createResponse()), false);

    const payload = {
      meeting_id: '1234567890',
      meeting_uuid: 'meeting-uuid',
      rtms_stream_id: 'stream-1',
      server_urls: 'wss://rtms.example.test'
    };
    const started = signedWebhook({ event: 'meeting.rtms_started', payload });
    const startedResult = await bridge.handleWebhook({
      ...started,
      nowSeconds: NOW_SECONDS
    });

    assert.equal(startedResult.statusCode, 200);
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(joinedPayload, payload);

    transcriptCallback(Buffer.from('Hello from Zoom'), 15, 99, { userName: 'Sam' });
    assert.ok(response.events.some((chunk) => chunk.includes('"text":"Hello from Zoom"')));
    assert.ok(response.events.some((chunk) => chunk.includes('"speaker":"Sam"')));

    const stopped = signedWebhook({ event: 'meeting.rtms_stopped', payload });
    const stoppedResult = await bridge.handleWebhook({
      ...stopped,
      nowSeconds: NOW_SECONDS
    });

    assert.equal(stoppedResult.statusCode, 200);
    assert.equal(leaveCount, 1);
    unsubscribe();
  } finally {
    bridge.close();
  }
});
