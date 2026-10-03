import 'dotenv/config';
import express from 'express';
import helmet from 'helmet';
import jwt from 'jsonwebtoken';
import OpenAI from 'openai';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = Number(process.env.PORT || 3000);
const openai = process.env.OPENAI_API_KEY ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY }) : null;

app.use(helmet({
  // Zoom Meeting SDK and audio playback may need scripts/media from external origins.
  // For production, replace this relaxed policy with a tested, explicit allow-list.
  contentSecurityPolicy: false,
  crossOriginEmbedderPolicy: false
}));
app.use(express.json({ limit: '1mb' }));
if (process.env.NODE_ENV === 'production') app.use(express.static(path.join(__dirname, 'dist')));

app.get('/api/health', (_req, res) => res.json({
  ok: true,
  service: 'BolSaathi Live 3.0',
  translationConfigured: Boolean(openai),
  zoomSdkConfigured: Boolean(process.env.ZOOM_MEETING_SDK_KEY && process.env.ZOOM_MEETING_SDK_SECRET),
  note: 'Zoom RTMS audio ingestion and audio injection require separate setup; see README.'
}));

app.post('/api/translate', async (req, res) => {
  const { text, direction, glossary = [] } = req.body ?? {};
  if (typeof text !== 'string' || !text.trim() || text.length > 5000) {
    return res.status(400).json({ error: 'text is required (1–5000 characters).' });
  }
  if (!['en-ur', 'ur-en'].includes(direction)) {
    return res.status(400).json({ error: 'direction must be en-ur or ur-en.' });
  }
  if (!Array.isArray(glossary) || glossary.length > 40 || glossary.some(term => typeof term !== 'string' || term.length > 160)) {
    return res.status(400).json({ error: 'glossary must be an array of up to 40 short text terms.' });
  }
  if (!openai) return res.status(503).json({ error: 'OPENAI_API_KEY is not configured. Add it to .env and restart the server.' });
  const target = direction === 'en-ur' ? 'natural Pakistani Urdu in Urdu script' : 'natural conversational English';
  const source = direction === 'en-ur' ? 'English' : 'Urdu';
  try {
    const response = await openai.responses.create({
      model: process.env.OPENAI_TRANSLATION_MODEL || 'gpt-4.1-mini',
      instructions: `Translate ${source} to ${target}. Preserve meaning, names, numbers, tone, and intent. Output only the translation, with no explanations. If the source is ambiguous, translate conservatively.

User glossary (treat entries as preferred terminology where relevant; do not translate proper names unless the entry clearly requests it):\n${glossary.length ? glossary.map((term, i) => `${i + 1}. ${term}`).join('\n') : '(no custom glossary)'}`,
      input: text.trim(),
      max_output_tokens: 1200
    });
    const translation = (response.output_text || '').trim();
    if (!translation) return res.status(502).json({ error: 'Translation provider returned no text.' });
    res.json({ translation, direction, provider: 'openai' });
  } catch (error) {
    console.error('Translation provider error:', error?.status || error?.message || 'unknown');
    res.status(502).json({ error: 'Translation service failed. Check API status, key, quota, and server logs.' });
  }
});

app.post('/api/speech', async (req, res) => {
  const { text, language } = req.body ?? {};
  if (typeof text !== 'string' || !text.trim() || text.length > 3000) {
    return res.status(400).json({ error: 'text is required (1–3000 characters).' });
  }
  if (!['ur', 'en'].includes(language)) return res.status(400).json({ error: 'language must be ur or en.' });
  if (!openai) return res.status(503).json({ error: 'OPENAI_API_KEY is not configured.' });
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
    res.set({ 'Content-Type': 'audio/mpeg', 'Cache-Control': 'no-store', 'Content-Length': String(bytes.length) });
    res.send(bytes);
  } catch (error) {
    console.error('Speech provider error:', error?.status || error?.message || 'unknown');
    res.status(502).json({ error: 'Speech generation failed. Verify TTS model availability, API quota, and voice support for the target language.' });
  }
});

// Zoom Meeting SDK signatures must be generated server-side. Never expose the SDK secret.
app.post('/api/zoom/signature', (req, res) => {
  const { meetingNumber, role = 0 } = req.body ?? {};
  const sdkKey = process.env.ZOOM_MEETING_SDK_KEY;
  const sdkSecret = process.env.ZOOM_MEETING_SDK_SECRET;
  if (!sdkKey || !sdkSecret) return res.status(503).json({ error: 'Zoom Meeting SDK credentials are not configured.' });
  const mn = String(meetingNumber || '').replace(/\s/g, '');
  if (!/^\d{9,12}$/.test(mn)) return res.status(400).json({ error: 'Enter a valid Zoom meeting number.' });
  if (![0, 1].includes(Number(role))) return res.status(400).json({ error: 'role must be 0 (attendee) or 1 (host).' });
  const iat = Math.floor(Date.now() / 1000) - 30;
  const exp = iat + 60 * 60 * 2;
  const token = jwt.sign({ sdkKey, mn, role: Number(role), iat, exp, tokenExp: exp }, sdkSecret, { algorithm: 'HS256' });
  res.json({ signature: token, sdkKey, meetingNumber: mn, role: Number(role) });
});

// This endpoint is deliberately a guarded integration placeholder. Do not accept
// unsigned webhooks in production. Configure official Zoom verification and RTMS
// subscriptions before enabling a real stream.
app.post('/api/zoom/rtms/webhook', (req, res) => {
  if (!process.env.ZOOM_RTMS_WEBHOOK_SECRET) {
    return res.status(503).json({ error: 'RTMS webhook verification is not configured. See README.' });
  }
  // TODO: implement the current Zoom webhook URL-validation and signature verification
  // exactly as documented for the selected Zoom app type, then handle RTMS lifecycle events.
  return res.status(501).json({ error: 'RTMS webhook verification/handlers are not implemented in this starter.' });
});

app.get('*', (_req, res) => {
  if (process.env.NODE_ENV === 'production') return res.sendFile(path.join(__dirname, 'dist', 'index.html'));
  res.status(404).send('Frontend is served by Vite during development. Open http://localhost:5173');
});
app.listen(PORT, () => console.log(`BolSaathi Live 2.0 running at http://localhost:${PORT}`));
