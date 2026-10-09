import 'dotenv/config';
import express from 'express';
import helmet from 'helmet';
import jwt from 'jsonwebtoken';
import OpenAI from 'openai';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createFirebaseIdTokenVerifier } from './firebaseIdToken.js';
import { createZoomRtmsBridge } from './zoomRtms.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = Number(process.env.PORT || 3000);
const openai = process.env.OPENAI_API_KEY ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY }) : null;
const zoomRtms = createZoomRtmsBridge({
  webhookSecret: process.env.ZOOM_RTMS_WEBHOOK_SECRET,
  clientId: process.env.ZOOM_RTMS_CLIENT_ID,
  clientSecret: process.env.ZOOM_RTMS_CLIENT_SECRET
});
const firebaseIdTokenVerifier = createFirebaseIdTokenVerifier();

// Security & Middleware Configuration
app.use(helmet({
  contentSecurityPolicy: false,
  crossOriginEmbedderPolicy: false
}));

app.use(express.json({ limit: '1mb' }));

// Serve static frontend in production
if (process.env.NODE_ENV === 'production') {
  const distPath = path.join(__dirname, '../dist');
  app.use(express.static(distPath));

  app.get('/login', (_req, res) => res.sendFile(path.join(distPath, 'login.html')));
  app.get('/signup', (_req, res) => res.sendFile(path.join(distPath, 'signup.html')));
  app.get('/dashboard', (_req, res) => res.sendFile(path.join(distPath, 'index.html')));
  app.get('/contacts', (_req, res) => res.sendFile(path.join(distPath, 'contacts.html')));
  app.get('/features', (_req, res) => res.sendFile(path.join(distPath, 'features.html')));
  app.get('/use-cases', (_req, res) => res.sendFile(path.join(distPath, 'use-cases.html')));
  app.get('/pricing', (_req, res) => res.sendFile(path.join(distPath, 'pricing.html')));
}

/**
 * Health check endpoint
 */
app.get('/api/health', (_req, res) => {
  const zoomRtmsIsEnabled = zoomRtms.isConfigured;
  res.json({
    ok: true,
    service: 'Transzo AI',
    translationConfigured: Boolean(openai),
    zoomSdkConfigured: Boolean(process.env.ZOOM_MEETING_SDK_KEY && process.env.ZOOM_MEETING_SDK_SECRET),
    zoomRtmsConfigured: zoomRtmsIsEnabled,
    note: zoomRtmsIsEnabled
      ? 'Zoom RTMS captions are available after the meeting host starts the approved stream.'
      : 'Zoom RTMS requires a configured Linux backend, approved Zoom RTMS app, and webhook endpoint.'
  });
});

/**
 * Text translation endpoint (English ↔ Urdu)
 */
app.post('/api/translate', async (req, res) => {
  const { text, direction, glossary = [] } = req.body ?? {};

  if (typeof text !== 'string' || !text.trim() || text.length > 5000) {
    return res.status(400).json({ error: 'text is required (1–5000 characters).' });
  }

  if (!['en-ur', 'ur-en'].includes(direction)) {
    return res.status(400).json({ error: 'direction must be en-ur or ur-en.' });
  }

  if (!Array.isArray(glossary) || glossary.length > 40 || glossary.some((term) => typeof term !== 'string' || term.length > 160)) {
    return res.status(400).json({ error: 'glossary must be an array of up to 40 short text terms.' });
  }

  if (!openai) {
    return res.status(503).json({ error: 'OPENAI_API_KEY is not configured. Add it to .env and restart the server.' });
  }

  const target = direction === 'en-ur' ? 'natural Pakistani Urdu in Urdu script' : 'natural conversational English';
  const source = direction === 'en-ur' ? 'English' : 'Urdu';

  try {
    const response = await openai.responses.create({
      model: process.env.OPENAI_TRANSLATION_MODEL || 'gpt-4.1-mini',
      instructions: `Translate ${source} to ${target}. Preserve meaning, names, numbers, tone, and intent. Output only the translation, with no explanations. If the source is ambiguous, translate conservatively.

User glossary (treat entries as preferred terminology where relevant; do not translate proper names unless the entry clearly requests it):
${glossary.length ? glossary.map((term, i) => `${i + 1}. ${term}`).join('\n') : '(no custom glossary)'}`,
      input: text.trim(),
      max_output_tokens: 1200
    });

    const translation = (response.output_text || '').trim();
    if (!translation) {
      return res.status(502).json({ error: 'Translation provider returned no text.' });
    }

    res.json({ translation, direction, provider: 'openai' });
  } catch (error) {
    console.error('Translation provider error:', error?.status || error?.message || 'unknown');
    res.status(502).json({ error: 'Translation service failed. Check API status, key, quota, and server logs.' });
  }
});

/**
 * Text-To-Speech (TTS) endpoint
 */
app.post('/api/speech', async (req, res) => {
  const { text, language } = req.body ?? {};

  if (typeof text !== 'string' || !text.trim() || text.length > 3000) {
    return res.status(400).json({ error: 'text is required (1–3000 characters).' });
  }

  if (!['ur', 'en'].includes(language)) {
    return res.status(400).json({ error: 'language must be ur or en.' });
  }

  if (!openai) {
    return res.status(503).json({ error: 'OPENAI_API_KEY is not configured.' });
  }

  try {
    const speech = await openai.audio.speech.create({
      model: process.env.OPENAI_TTS_MODEL || 'gpt-4o-mini-tts',
      voice: process.env.OPENAI_TTS_VOICE || 'coral',
      input: text.trim(),
      instructions: language === 'ur'
        ? 'Speak clearly and naturally in Urdu as used in Pakistan. Keep a conversational pace.'
        : 'Speak clearly and naturally in conversational English. Keep a conversational pace.',
      response_format: 'mp3'
    });

    const bytes = Buffer.from(await speech.arrayBuffer());
    res.set({
      'Content-Type': 'audio/mpeg',
      'Cache-Control': 'no-store',
      'Content-Length': String(bytes.length)
    });
    res.send(bytes);
  } catch (error) {
    console.error('Speech provider error:', error?.status || error?.message || 'unknown');
    res.status(502).json({ error: 'Speech generation failed. Verify TTS model availability, API quota, and voice support.' });
  }
});

/**
 * Zoom Meeting SDK signature generation endpoint
 */
app.post('/api/zoom/signature', (req, res) => {
  const { meetingNumber, role = 0 } = req.body ?? {};
  const sdkKey = process.env.ZOOM_MEETING_SDK_KEY;
  const sdkSecret = process.env.ZOOM_MEETING_SDK_SECRET;

  if (!sdkKey || !sdkSecret) {
    return res.status(503).json({ error: 'Zoom Meeting SDK credentials are not configured.' });
  }

  const mn = String(meetingNumber || '').replace(/\s/g, '');
  if (!/^\d{9,12}$/.test(mn)) {
    return res.status(400).json({ error: 'Enter a valid Zoom meeting number.' });
  }

  if (![0, 1].includes(Number(role))) {
    return res.status(400).json({ error: 'role must be 0 (attendee) or 1 (host).' });
  }

  const iat = Math.floor(Date.now() / 1000) - 30;
  const exp = iat + 60 * 60 * 2;
  const token = jwt.sign(
    { sdkKey, mn, role: Number(role), iat, exp, tokenExp: exp },
    sdkSecret,
    { algorithm: 'HS256' }
  );

  res.json({ signature: token, sdkKey, meetingNumber: mn, role: Number(role) });
});

/**
 * Create a short-lived browser ticket for a Zoom meeting transcript stream.
 */
async function requireFirebaseUser(req, res, next) {
  const authorization = req.get('authorization') || '';
  const match = authorization.match(/^Bearer ([^\s]+)$/);
  const projectId = process.env.FIREBASE_PROJECT_ID || process.env.VITE_FIREBASE_PROJECT_ID;

  if (!match) {
    return res.status(401).json({ error: 'Sign in to Transzo AI before starting live interpretation.' });
  }

  if (!projectId) {
    return res.status(503).json({ error: 'Set FIREBASE_PROJECT_ID on the backend to authorize Zoom RTMS sessions.' });
  }

  try {
    req.firebaseUser = await firebaseIdTokenVerifier.verify(match[1], projectId);
    return next();
  } catch (error) {
    return res.status(error.statusCode || 503).json({
      error: error.statusCode === 401
        ? error.message
        : 'Could not verify the Transzo AI account. Check backend connectivity and logs.'
    });
  }
}

app.post('/api/zoom/rtms/session', requireFirebaseUser, (req, res) => {
  try {
    const session = zoomRtms.createSession(req.body?.meetingNumber, req.firebaseUser.sub);
    res.status(201).json(session);
  } catch (error) {
    res.status(error.statusCode || 500).json({
      error: error.statusCode ? error.message : 'Could not create a Zoom RTMS session.'
    });
  }
});

/**
 * Stream transcripts from an active Zoom RTMS session to the matching browser.
 */
app.get('/api/zoom/rtms/events/:sessionId', (req, res) => {
  const unsubscribe = zoomRtms.subscribe(req.params.sessionId, req.query.token, res);
  if (!unsubscribe) {
    return res.status(401).json({ error: 'Zoom RTMS session is invalid or expired.' });
  }

  res.on('close', unsubscribe);
});

/**
 * Verify Zoom's signed webhook and connect or disconnect the RTMS client.
 */
app.post('/api/zoom/rtms/webhook', async (req, res) => {
  const result = await zoomRtms.handleWebhook({
    timestamp: req.get('x-zm-request-timestamp'),
    signature: req.get('x-zm-signature'),
    body: req.body
  });
  res.status(result.statusCode).json(result.body);
});

/**
 * Fallback route for single-page app support
 */
app.get('*', (_req, res) => {
  if (process.env.NODE_ENV === 'production') {
    return res.sendFile(path.join(__dirname, '../dist', 'index.html'));
  }
  res.status(404).send('Frontend is served by Vite during development. Open http://localhost:5173');
});

app.listen(PORT, () => console.log(`Transzo AI server running at http://localhost:${PORT}`));
