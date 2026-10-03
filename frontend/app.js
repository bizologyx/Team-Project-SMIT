import ZoomMtgEmbedded from '@zoom/meetingsdk/embedded';
import { requireAuth, logoutUser } from './auth.js';

const $ = (id) => document.getElementById(id);
const HISTORY_KEY = 'bolsaathi.sessionHistory.v1';

let zoomClient = null;
let recognition = null;
let lastTranslation = '';
let lastLanguage = 'ur';
let lastSource = '';
let sessionHistory = loadHistory();

let currentUser = null;
let currentProfile = null;

/**
 * Route protection and user profile display initialization
 */
async function initAuth() {
  const authData = await requireAuth();
  if (!authData) return;

  currentUser = authData.user;
  currentProfile = authData.profile;

  const userBadge = $('userBadge');
  if (userBadge) {
    const roleText = currentProfile?.role ? currentProfile.role.toUpperCase() : 'USER';
    const nameText = currentProfile?.full_name || currentUser.email;
    userBadge.textContent = `${nameText} (${roleText})`;
  }
}

/**
 * Load session history from localStorage
 */
function loadHistory() {
  try {
    const data = JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]');
    return Array.isArray(data) ? data.slice(0, 40) : [];
  } catch {
    return [];
  }
}

/**
 * Persist session history to localStorage and render
 */
function saveHistory() {
  try {
    localStorage.setItem(HISTORY_KEY, JSON.stringify(sessionHistory.slice(0, 40)));
  } catch {
    setStatus('Browser storage is unavailable; translation still works.', true);
  }
  renderHistory();
}

/**
 * Render history list in UI
 */
function renderHistory() {
  const countEl = $('historyCount');
  const listEl = $('historyList');
  if (!countEl || !listEl) return;

  countEl.textContent = `${sessionHistory.length} saved`;
  listEl.replaceChildren();

  if (!sessionHistory.length) {
    const empty = document.createElement('div');
    empty.className = 'hint';
    empty.textContent = 'Your completed translations will appear here.';
    listEl.append(empty);
    return;
  }

  sessionHistory.forEach((item, i) => {
    const row = document.createElement('div');
    row.className = 'history-item';

    const main = document.createElement('div');
    main.className = 'history-copy';

    const meta = document.createElement('small');
    meta.textContent = `${item.direction === 'en-ur' ? 'English → Urdu' : 'Urdu → English'} · ${new Date(item.at).toLocaleString()}`;

    const source = document.createElement('div');
    source.className = 'history-source';
    source.textContent = item.source;

    const target = document.createElement('div');
    target.className = 'history-target';
    target.textContent = item.translation;

    main.append(meta, source, target);

    const actions = document.createElement('div');
    actions.className = 'history-actions';

    const reuseBtn = document.createElement('button');
    reuseBtn.textContent = 'Reuse';
    reuseBtn.addEventListener('click', () => {
      $('direction').value = item.direction;
      $('manualText').value = item.source;
      $('englishText').textContent = item.direction === 'en-ur' ? item.source : `Urdu source: ${item.source}`;
      $('urduText').textContent = item.direction === 'en-ur' ? item.translation : `English translation: ${item.translation}`;
      lastSource = item.source;
      lastTranslation = item.translation;
      lastLanguage = item.direction === 'en-ur' ? 'ur' : 'en';
      setStatus('Loaded a saved translation.');
    });

    const removeBtn = document.createElement('button');
    removeBtn.textContent = 'Remove';
    removeBtn.addEventListener('click', () => {
      sessionHistory.splice(i, 1);
      saveHistory();
    });

    actions.append(reuseBtn, removeBtn);
    row.append(main, actions);
    listEl.append(row);
  });
}

/**
 * Extract glossary terms array from textarea
 */
function getGlossaryList() {
  const text = $('glossaryTerms')?.value || '';
  return text
    .split(/\n|,/)
    .map((x) => x.trim())
    .filter(Boolean)
    .slice(0, 40);
}

/**
 * Set log status message in UI
 */
const setStatus = (msg, isError = false) => {
  const statusEl = $('status');
  if (!statusEl) return;
  statusEl.textContent = msg;
  statusEl.className = isError ? 'log danger' : 'log';
};

/**
 * Helper method to post JSON to API endpoints
 */
async function api(path, body) {
  const response = await fetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  const data = response.headers.get('content-type')?.includes('application/json')
    ? await response.json()
    : null;
  if (!response.ok) {
    throw new Error(data?.error || `Request failed (${response.status})`);
  }
  return data;
}

/**
 * Check backend health status
 */
async function checkHealth() {
  try {
    const res = await fetch('/api/health');
    const data = await res.json();
    $('health').textContent = `Backend online · OpenAI translation/TTS: ${
      data.translationConfigured ? 'configured' : 'not configured'
    } · Zoom SDK: ${data.zoomSdkConfigured ? 'configured' : 'not configured'}. ${data.note}`;
  } catch {
    $('health').textContent = 'Backend unavailable. Start Node.js server and open this page through localhost.';
  }
}

/**
 * Join Zoom Meeting using Zoom Embedded SDK
 */
async function joinZoom() {
  const meetingNumber = $('meetingNumber').value.trim();
  const userName = $('displayName').value.trim() || currentProfile?.full_name || 'BolSaathi User';
  if (!meetingNumber) return setStatus('Enter a Zoom meeting number first.', true);

  try {
    setStatus('Preparing Zoom Meeting SDK…');
    const signed = await api('/api/zoom/signature', {
      meetingNumber,
      role: Number($('meetingRole').value)
    });

    zoomClient = ZoomMtgEmbedded.createClient();
    const root = $('zoomRoot');
    root.textContent = '';

    await zoomClient.init({
      zoomAppRoot: root,
      language: 'en-US',
      patchJsMedia: true,
      leaveOnPageUnload: true
    });

    await zoomClient.join({
      sdkKey: signed.sdkKey,
      signature: signed.signature,
      meetingNumber: signed.meetingNumber,
      password: $('meetingPass').value,
      userName,
      userEmail: currentUser?.email || ''
    });

    $('zoomState').textContent = 'Joined (SDK)';
    $('joinZoom').disabled = true;
    $('leaveZoom').disabled = false;
    setStatus('Zoom joined. Reminder: this does not yet route remote Zoom audio into the translation pipeline.');
  } catch (e) {
    $('zoomRoot').textContent = 'Zoom SDK could not join. Check credentials, SDK app settings, meeting ID/passcode, allowed domains and browser console.';
    setStatus(e.message || 'Zoom join failed.', true);
  }
}

/**
 * Leave Zoom Meeting
 */
async function leaveZoom() {
  try {
    if (zoomClient) await zoomClient.leaveMeeting();
  } catch {}
  zoomClient = null;
  $('zoomState').textContent = 'Not connected';
  $('joinZoom').disabled = false;
  $('leaveZoom').disabled = true;
  $('zoomRoot').textContent = 'Left meeting. Join again when ready.';
  setStatus('Zoom meeting left.');
}

/**
 * Translate text via backend API
 */
async function translateText(text, direction = $('direction').value) {
  if (!text.trim()) return setStatus('Enter or recognize some speech first.', true);

  setStatus('Translating…');
  $('englishText').textContent = direction === 'en-ur' ? text : `Urdu source: ${text}`;
  $('manualText').value = text;

  try {
    const result = await api('/api/translate', {
      text,
      direction,
      glossary: getGlossaryList()
    });

    lastSource = text;
    lastTranslation = result.translation;
    lastLanguage = direction === 'en-ur' ? 'ur' : 'en';

    sessionHistory.unshift({
      source: text,
      translation: result.translation,
      direction,
      at: new Date().toISOString()
    });
    sessionHistory = sessionHistory.slice(0, 40);
    saveHistory();

    if (direction === 'en-ur') {
      $('urduText').textContent = result.translation;
    } else {
      $('urduText').textContent = `English translation: ${result.translation}`;
    }

    setStatus(`Translation ready (${result.provider}). ${$('autoPlay').checked ? 'Generating speech…' : 'Auto-play is off.'}`);
    if ($('autoPlay').checked) {
      await playSpeech(lastTranslation, lastLanguage);
    } else {
      setStatus('Translation ready. Press Play translation to hear it.');
    }
  } catch (e) {
    setStatus(e.message, true);
  }
}

/**
 * Play speech synthesis using backend TTS endpoint
 */
async function playSpeech(text = lastTranslation, language = lastLanguage) {
  if (!text) return setStatus('No translation to play yet.', true);

  try {
    setStatus(`Generating ${language === 'ur' ? 'Urdu' : 'English'} audio…`);
    const response = await fetch('/api/speech', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, language })
    });

    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      throw new Error(data.error || `Speech request failed (${response.status})`);
    }

    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const audio = new Audio(url);

    audio.onended = () => {
      URL.revokeObjectURL(url);
      setStatus('Audio playback finished.');
    };
    audio.onerror = () => {
      URL.revokeObjectURL(url);
      setStatus('Audio playback failed.', true);
    };

    await audio.play();
    setStatus('Playing translated audio locally. It is not automatically sent into Zoom.');
  } catch (e) {
    setStatus(e.message, true);
  }
}

/**
 * Start browser Web Speech Recognition
 */
function startMic() {
  if (!$('sendConsent').checked) {
    return setStatus('Please confirm that recognized text may be sent to the configured translation API.', true);
  }

  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SR) {
    return setStatus('Speech recognition is not supported in this browser. Use text test mode or a supported Chrome browser.', true);
  }

  if (recognition) {
    try { recognition.stop(); } catch {}
  }

  recognition = new SR();
  recognition.continuous = true;
  recognition.interimResults = false;

  const dir = $('direction').value;
  recognition.lang = dir === 'en-ur' ? 'en-US' : 'ur-PK';

  recognition.onstart = () => {
    $('startMic').disabled = true;
    $('stopMic').disabled = false;
    setStatus('Microphone listening. This captures the selected device input only—not Zoom internal audio.');
  };

  recognition.onresult = (event) => {
    const result = event.results[event.results.length - 1];
    const text = result?.[0]?.transcript?.trim();
    if (text) translateText(text, dir);
  };

  recognition.onerror = (event) => setStatus(`Microphone recognition error: ${event.error}`, true);

  recognition.onend = () => {
    $('startMic').disabled = false;
    $('stopMic').disabled = true;
  };

  try {
    recognition.start();
  } catch (e) {
    setStatus(e.message, true);
  }
}

/**
 * Stop browser speech recognition
 */
function stopMic() {
  if (recognition) {
    try { recognition.stop(); } catch {}
  }
  $('startMic').disabled = false;
  $('stopMic').disabled = true;
  setStatus('Microphone stopped.');
}

// Event Listeners
$('joinZoom')?.addEventListener('click', joinZoom);
$('leaveZoom')?.addEventListener('click', leaveZoom);
$('translateBtn')?.addEventListener('click', () => translateText($('manualText').value));
$('startMic')?.addEventListener('click', startMic);
$('stopMic')?.addEventListener('click', stopMic);
$('playLast')?.addEventListener('click', () => playSpeech());
$('logoutBtn')?.addEventListener('click', () => logoutUser());

$('stopAudio')?.addEventListener('click', () => {
  document.querySelectorAll('audio').forEach((a) => {
    a.pause();
    a.currentTime = 0;
  });
  setStatus('Audio stopped.');
});

$('exportSession')?.addEventListener('click', () => {
  if (!sessionHistory.length) return setStatus('There are no saved translations to export.', true);

  const text = sessionHistory
    .slice()
    .reverse()
    .map((item, index) => `${index + 1}. ${item.direction === 'en-ur' ? 'English → Urdu' : 'Urdu → English'}\n${new Date(item.at).toLocaleString()}\nSOURCE: ${item.source}\nTRANSLATION: ${item.translation}`)
    .join('\n\n----------------------------------------\n\n');

  const blob = new Blob([`BolSaathi Live — Session Export\nGenerated: ${new Date().toLocaleString()}\n\n${text}`], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `bolsaathi-session-${new Date().toISOString().slice(0, 10)}.txt`;
  anchor.click();
  URL.revokeObjectURL(url);
  setStatus('Session export downloaded.');
});

$('clearHistory')?.addEventListener('click', () => {
  if (!sessionHistory.length) return;
  if (confirm('Clear all translations saved in this browser?')) {
    sessionHistory = [];
    saveHistory();
    setStatus('Local session history cleared.');
  }
});

$('copyEnglish')?.addEventListener('click', async () => {
  try {
    await navigator.clipboard.writeText(lastSource || $('englishText').textContent);
    setStatus('Source text copied.');
  } catch {
    setStatus('Clipboard permission unavailable.', true);
  }
});

window.addEventListener('beforeunload', () => {
  try { recognition?.stop(); } catch {}
});

// Initialization
initAuth();
renderHistory();
checkHealth();
