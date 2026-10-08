import {
  createHash,
  createHmac,
  randomBytes,
  randomUUID,
  timingSafeEqual
} from 'node:crypto';

const SESSION_TTL_MS = 4 * 60 * 60 * 1000;
const SIGNATURE_TOLERANCE_SECONDS = 5 * 60;
const MAX_ACTIVE_SESSIONS = 500;
const MAX_SESSIONS_PER_USER = 5;

function normalizeMeetingNumber(value) {
  const digits = String(value ?? '').replace(/\D/g, '');
  return /^\d{9,12}$/.test(digits) ? digits : null;
}

function getMeetingNumber(payload) {
  const candidates = [
    payload?.meeting_id,
    payload?.object?.id,
    payload?.meeting?.id
  ];

  for (const candidate of candidates) {
    const meetingNumber = normalizeMeetingNumber(candidate);
    if (meetingNumber) return meetingNumber;
  }

  return null;
}

function secureHexEqual(left, right) {
  if (typeof left !== 'string' || typeof right !== 'string') return false;
  if (!/^[\da-f]+$/i.test(left) || !/^[\da-f]+$/i.test(right)) return false;
  const leftBytes = Buffer.from(left, 'hex');
  const rightBytes = Buffer.from(right, 'hex');
  return leftBytes.length === rightBytes.length && timingSafeEqual(leftBytes, rightBytes);
}

export function verifyZoomWebhook({
  body,
  timestamp,
  signature,
  secret,
  nowSeconds = Math.floor(Date.now() / 1000)
}) {
  if (!secret || typeof timestamp !== 'string' || !/^\d{10}$/.test(timestamp)) return false;
  if (Math.abs(nowSeconds - Number(timestamp)) > SIGNATURE_TOLERANCE_SECONDS) return false;
  if (typeof signature !== 'string' || !/^v0=[\da-f]{64}$/i.test(signature)) return false;

  const serializedBody = JSON.stringify(body);
  if (typeof serializedBody !== 'string') return false;
  const expected = createHmac('sha256', secret)
    .update(`v0:${timestamp}:`)
    .update(serializedBody)
    .digest('hex');

  return secureHexEqual(signature.slice(3), expected);
}

function sendSse(response, event, payload) {
  if (response.destroyed || response.writableEnded) return;
  response.write(`event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`);
}

export function createZoomRtmsBridge({
  webhookSecret = '',
  clientId = '',
  clientSecret = '',
  platform = process.platform,
  createClient,
  now = Date.now,
  logError = console.error
} = {}) {
  const sessions = new Map();
  const subscribers = new Map();
  const streams = new Map();
  let sdkPromise;

  const isConfigured = Boolean(
    webhookSecret &&
    clientId &&
    clientSecret &&
    (platform === 'linux' || platform === 'darwin')
  );

  async function getClient() {
    if (createClient) return createClient();

    process.env.ZM_RTMS_CLIENT = clientId;
    process.env.ZM_RTMS_SECRET = clientSecret;
    sdkPromise ||= import('@zoom/rtms');

    const rtms = await sdkPromise;
    return new rtms.default.Client();
  }

  function removeExpiredSessions() {
    for (const [sessionId, session] of sessions) {
      if (session.expiresAt <= now()) sessions.delete(sessionId);
    }
  }

  function createSession(meetingNumberInput, ownerUid) {
    if (!isConfigured) {
      const reason = platform !== 'linux' && platform !== 'darwin'
        ? 'Zoom RTMS requires a Linux or macOS backend.'
        : 'Configure the Zoom RTMS webhook secret, client ID, and client secret on the Linux backend.';
      const error = new Error(reason);
      error.statusCode = 503;
      throw error;
    }

    const meetingNumber = normalizeMeetingNumber(meetingNumberInput);
    if (!meetingNumber) {
      const error = new Error('Enter a valid Zoom meeting number.');
      error.statusCode = 400;
      throw error;
    }

    removeExpiredSessions();
    if (typeof ownerUid !== 'string' || !ownerUid) {
      const error = new Error('A signed-in Firebase user is required to start RTMS.');
      error.statusCode = 401;
      throw error;
    }

    const ownedSessions = [...sessions.values()]
      .filter((session) => session.ownerUid === ownerUid).length;
    if (ownedSessions >= MAX_SESSIONS_PER_USER || sessions.size >= MAX_ACTIVE_SESSIONS) {
      const error = new Error('Too many active Zoom interpretation sessions. Stop an existing session first.');
      error.statusCode = 429;
      throw error;
    }

    const sessionId = randomUUID();
    const token = randomBytes(32).toString('hex');
    const expiresAt = now() + SESSION_TTL_MS;
    sessions.set(sessionId, {
      meetingNumber,
      ownerUid,
      tokenHash: createHash('sha256').update(token).digest('hex'),
      expiresAt
    });

    return {
      sessionId,
      token,
      expiresAt: new Date(expiresAt).toISOString()
    };
  }

  function subscribe(sessionId, token, response) {
    const session = sessions.get(sessionId);
    const tokenHash = typeof token === 'string'
      ? createHash('sha256').update(token).digest('hex')
      : '';

    if (
      !session ||
      session.expiresAt <= now() ||
      !secureHexEqual(session.tokenHash, tokenHash)
    ) {
      return false;
    }

    response.status(200);
    response.set({
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no'
    });
    response.flushHeaders();
    response.write(': Transzo AI Zoom RTMS stream connected\n\n');

    let meetingSubscribers = subscribers.get(session.meetingNumber);
    if (!meetingSubscribers) {
      meetingSubscribers = new Set();
      subscribers.set(session.meetingNumber, meetingSubscribers);
    }
    meetingSubscribers.add(response);

    let expiryTimer;
    const unsubscribe = () => {
      clearTimeout(expiryTimer);
      meetingSubscribers.delete(response);
      if (!meetingSubscribers.size) subscribers.delete(session.meetingNumber);
    };
    expiryTimer = setTimeout(() => {
      sendSse(response, 'bridge-error', {
        message: 'This live interpretation session has expired. Start a new session to continue.'
      });
      unsubscribe();
      sessions.delete(sessionId);
      response.end();
    }, Math.max(0, session.expiresAt - now()));
    expiryTimer.unref?.();

    sendSse(response, 'status', {
      state: 'waiting',
      message: 'Waiting for the Zoom host to start the approved RTMS stream.'
    });

    return unsubscribe;
  }

  function broadcast(meetingNumber, event, payload) {
    if (!meetingNumber) return;
    for (const response of subscribers.get(meetingNumber) || []) {
      sendSse(response, event, payload);
    }
  }

  async function connectStream(payload) {
    const streamId = payload?.rtms_stream_id;
    if (typeof streamId !== 'string' || !streamId) {
      logError('Zoom RTMS started event has no stream ID.');
      return;
    }

    if (streams.has(streamId)) return;

    const meetingNumber = getMeetingNumber(payload);
    const stream = { client: null, meetingNumber, stopped: false };
    streams.set(streamId, stream);

    try {
      const client = await getClient();
      if (stream.stopped) {
        client.leave();
        return;
      }

      stream.client = client;

      client.onTranscriptData((data, _size, timestamp, metadata = {}) => {
        const text = Buffer.isBuffer(data) ? data.toString('utf8') : String(data ?? '');
        if (!text.trim() || text.length > 5000) return;

        broadcast(meetingNumber, 'caption', {
          text: text.trim(),
          speaker: typeof metadata.userName === 'string' ? metadata.userName : '',
          timestamp: Number.isFinite(Number(timestamp)) ? Number(timestamp) : now()
        });
      });

      await client.join(payload);
      if (!stream.stopped) {
        broadcast(meetingNumber, 'status', {
          state: 'connected',
          message: 'Zoom live transcript connected.'
        });
      }
    } catch (error) {
      streams.delete(streamId);
      broadcast(meetingNumber, 'bridge-error', {
        message: 'Could not connect to the Zoom RTMS stream. Check the Zoom RTMS app credentials and server logs.'
      });
      logError('Zoom RTMS stream connection failed:', error?.message || 'unknown error');
    }
  }

  function stopStream(payload) {
    const streamId = payload?.rtms_stream_id;
    if (typeof streamId !== 'string' || !streamId) return;

    const stream = streams.get(streamId);
    if (!stream) return;

    stream.stopped = true;
    streams.delete(streamId);

    try {
      stream.client?.leave();
    } catch (error) {
      logError('Could not leave Zoom RTMS stream:', error?.message || 'unknown error');
    }

    broadcast(stream.meetingNumber, 'status', {
      state: 'stopped',
      message: 'The Zoom RTMS stream has stopped.'
    });
  }

  async function handleWebhook({ timestamp, signature, body }) {
    if (!webhookSecret) {
      return { statusCode: 503, body: { error: 'ZOOM_RTMS_WEBHOOK_SECRET is not configured.' } };
    }

    if (body?.event === 'endpoint.url_validation') {
      const plainToken = body?.payload?.plainToken;
      if (typeof plainToken !== 'string' || !plainToken || plainToken.length > 2048) {
        return { statusCode: 400, body: { error: 'Zoom webhook validation token is missing.' } };
      }
      const encryptedToken = createHmac('sha256', webhookSecret).update(plainToken).digest('hex');
      return { statusCode: 200, body: { plainToken, encryptedToken } };
    }

    if (!verifyZoomWebhook({
      body,
      timestamp,
      signature,
      secret: webhookSecret,
      nowSeconds: Math.floor(now() / 1000)
    })) {
      return { statusCode: 401, body: { error: 'Invalid or expired Zoom webhook signature.' } };
    }

    if (body?.event === 'meeting.rtms_started') {
      void connectStream(body.payload);
    } else if (body?.event === 'meeting.rtms_stopped') {
      stopStream(body.payload);
    }

    return { statusCode: 200, body: { ok: true } };
  }

  const cleanupTimer = setInterval(removeExpiredSessions, 5 * 60 * 1000);
  cleanupTimer.unref?.();

  return {
    get isConfigured() {
      return isConfigured;
    },
    createSession,
    handleWebhook,
    subscribe,
    close() {
      clearInterval(cleanupTimer);
      for (const [streamId, stream] of streams) {
        stream.stopped = true;
        try {
          stream.client?.leave();
        } catch (error) {
          logError('Could not close Zoom RTMS stream:', error?.message || 'unknown error');
        }
        streams.delete(streamId);
      }
    }
  };
}
