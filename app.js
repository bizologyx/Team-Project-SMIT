import ZoomMtgEmbedded from '@zoom/meetingsdk/embedded';
const $ = (id) => document.getElementById(id);
let zoomClient = null, recognition = null, lastTranslation = '', lastLanguage = 'ur', lastSource = '';
const HISTORY_KEY = 'bolsaathi.sessionHistory.v1';
let sessionHistory = loadHistory();
function loadHistory() { try { const x = JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]'); return Array.isArray(x) ? x.slice(0, 40) : []; } catch { return []; } }
function saveHistory() { try { localStorage.setItem(HISTORY_KEY, JSON.stringify(sessionHistory.slice(0, 40))); } catch { setStatus('Browser storage is unavailable; translation still works.', true); } renderHistory(); }
function renderHistory() { const count = $('historyCount'); const list = $('historyList'); if (!count || !list) return; count.textContent = `${sessionHistory.length} saved`; list.replaceChildren(); if (!sessionHistory.length) { const empty = document.createElement('div'); empty.className = 'hint'; empty.textContent = 'Your completed translations will appear here.'; list.append(empty); return; } sessionHistory.forEach((item, i) => { const row = document.createElement('div'); row.className = 'history-item'; const main = document.createElement('div'); main.className = 'history-copy'; const meta = document.createElement('small'); meta.textContent = `${item.direction === 'en-ur' ? 'English → Urdu' : 'Urdu → English'} · ${new Date(item.at).toLocaleString()}`; const source = document.createElement('div'); source.className = 'history-source'; source.textContent = item.source; const target = document.createElement('div'); target.className = 'history-target'; target.textContent = item.translation; main.append(meta, source, target); const actions = document.createElement('div'); actions.className = 'history-actions'; const reuse = document.createElement('button'); reuse.textContent = 'Reuse'; reuse.addEventListener('click', () => { $('direction').value = item.direction; $('manualText').value = item.source; $('englishText').textContent = item.direction === 'en-ur' ? item.source : 'Urdu source: ' + item.source; $('urduText').textContent = item.direction === 'en-ur' ? item.translation : 'English translation: ' + item.translation; lastSource = item.source; lastTranslation = item.translation; lastLanguage = item.direction === 'en-ur' ? 'ur' : 'en'; setStatus('Loaded a saved translation.'); }); const remove = document.createElement('button'); remove.textContent = 'Remove'; remove.addEventListener('click', () => { sessionHistory.splice(i, 1); saveHistory(); }); actions.append(reuse, remove); row.append(main, actions); list.append(row); }); }
function glossaryList() { return $('glossaryTerms').value.split(/\n|,/).map(x => x.trim()).filter(Boolean).slice(0, 40); }
const setStatus = (msg, bad=false) => { $('status').textContent = msg; $('status').className = bad ? 'log danger' : 'log'; };
async function api(path, body) {
  const r = await fetch(path, { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(body) });
  const data = r.headers.get('content-type')?.includes('application/json') ? await r.json() : null;
  if (!r.ok) throw new Error(data?.error || `Request failed (${r.status})`);
  return data;
}
async function health() {
  try { const r = await fetch('/api/health'); const d = await r.json(); $('health').textContent = `Backend online · OpenAI translation/TTS: ${d.translationConfigured?'configured':'not configured'} · Zoom SDK: ${d.zoomSdkConfigured?'configured':'not configured'}. ${d.note}`; }
  catch { $('health').textContent = 'Backend unavailable. Start Node.js server and open this page through localhost.'; }
}
async function joinZoom() {
  const meetingNumber = $('meetingNumber').value.trim();
  const userName = $('displayName').value.trim() || 'BolSaathi User';
  if (!meetingNumber) return setStatus('Enter a Zoom meeting number first.', true);
  try {
    setStatus('Preparing Zoom Meeting SDK…');
    const signed = await api('/api/zoom/signature', { meetingNumber, role:Number($('meetingRole').value) });
    zoomClient = ZoomMtgEmbedded.createClient();
    const root = $('zoomRoot'); root.textContent = '';
    await zoomClient.init({ zoomAppRoot:root, language:'en-US', patchJsMedia:true, leaveOnPageUnload:true });
    await zoomClient.join({ sdkKey:signed.sdkKey, signature:signed.signature, meetingNumber:signed.meetingNumber, password:$('meetingPass').value, userName, userEmail:'' });
    $('zoomState').textContent = 'Joined (SDK)'; $('joinZoom').disabled = true; $('leaveZoom').disabled = false;
    setStatus('Zoom joined. Reminder: this does not yet route remote Zoom audio into the translation pipeline.');
  } catch (e) { $('zoomRoot').textContent = 'Zoom SDK could not join. Check credentials, SDK app settings, meeting ID/passcode, allowed domains and browser console.'; setStatus(e.message || 'Zoom join failed.', true); }
}
async function leaveZoom() {
  try { if (zoomClient) await zoomClient.leaveMeeting(); } catch {}
  zoomClient = null; $('zoomState').textContent='Not connected'; $('joinZoom').disabled=false; $('leaveZoom').disabled=true; $('zoomRoot').textContent='Left meeting. Join again when ready.'; setStatus('Zoom meeting left.');
}
async function translateText(text, direction=$('direction').value) {
  if (!text.trim()) return setStatus('Enter or recognize some speech first.', true);
  setStatus('Translating…'); $('englishText').textContent = direction === 'en-ur' ? text : 'Urdu source: ' + text; $('manualText').value = text;
  try {
    const result = await api('/api/translate', { text, direction, glossary: glossaryList() });
    lastSource = text; lastTranslation = result.translation; lastLanguage = direction === 'en-ur' ? 'ur' : 'en';
    sessionHistory.unshift({ source: text, translation: result.translation, direction, at: new Date().toISOString() }); sessionHistory = sessionHistory.slice(0, 40); saveHistory();
    if (direction === 'en-ur') $('urduText').textContent = result.translation;
    else $('urduText').textContent = `English translation: ${result.translation}`;
    setStatus(`Translation ready (${result.provider}). ${$('autoPlay').checked ? 'Generating speech…' : 'Auto-play is off.'}`);
    if ($('autoPlay').checked) await playSpeech(lastTranslation, lastLanguage);
    else setStatus('Translation ready. Press Play translation to hear it.');
  } catch(e) { setStatus(e.message, true); }
}
async function playSpeech(text=lastTranslation, language=lastLanguage) {
  if (!text) return setStatus('No translation to play yet.', true);
  try {
    setStatus(`Generating ${language === 'ur' ? 'Urdu' : 'English'} audio…`);
    const r = await fetch('/api/speech', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({ text, language }) });
    if (!r.ok) { const d = await r.json().catch(()=>({})); throw new Error(d.error || `Speech request failed (${r.status})`); }
    const blob = await r.blob(); const url = URL.createObjectURL(blob); const audio = new Audio(url);
    audio.onended = () => { URL.revokeObjectURL(url); setStatus('Audio playback finished.'); };
    audio.onerror = () => { URL.revokeObjectURL(url); setStatus('Audio playback failed.', true); };
    await audio.play(); setStatus('Playing translated audio locally. It is not automatically sent into Zoom.');
  } catch(e) { setStatus(e.message, true); }
}
function startMic() {
  if (!$('sendConsent').checked) return setStatus('Please confirm that recognized text may be sent to the configured translation API.', true);
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SR) return setStatus('Speech recognition is not supported in this browser. Use text test mode or a supported Chrome browser.', true);
  if (recognition) { try { recognition.stop(); } catch {} }
  recognition = new SR(); recognition.continuous = true; recognition.interimResults = false;
  const dir = $('direction').value; recognition.lang = dir === 'en-ur' ? 'en-US' : 'ur-PK';
  recognition.onstart = () => { $('startMic').disabled=true; $('stopMic').disabled=false; setStatus('Microphone listening. This captures the selected device input only—not Zoom internal audio.'); };
  recognition.onresult = (event) => { const result = event.results[event.results.length-1]; const text = result?.[0]?.transcript?.trim(); if (text) translateText(text, dir); };
  recognition.onerror = (event) => setStatus(`Microphone recognition error: ${event.error}`, true);
  recognition.onend = () => { $('startMic').disabled=false; $('stopMic').disabled=true; };
  try { recognition.start(); } catch(e) { setStatus(e.message, true); }
}
function stopMic() { if (recognition) { try { recognition.stop(); } catch {} } $('startMic').disabled=false; $('stopMic').disabled=true; setStatus('Microphone stopped.'); }
$('joinZoom').addEventListener('click', joinZoom); $('leaveZoom').addEventListener('click', leaveZoom);
$('translateBtn').addEventListener('click', () => translateText($('manualText').value));
$('startMic').addEventListener('click', startMic); $('stopMic').addEventListener('click', stopMic);
$('playLast').addEventListener('click', () => playSpeech()); $('stopAudio').addEventListener('click', () => { document.querySelectorAll('audio').forEach(a=>{a.pause();a.currentTime=0;}); setStatus('Audio stopped.'); });
$('exportSession').addEventListener('click', () => { if (!sessionHistory.length) return setStatus('There are no saved translations to export.', true); const text = sessionHistory.slice().reverse().map((x, i) => `${i + 1}. ${x.direction === 'en-ur' ? 'English → Urdu' : 'Urdu → English'}\n${new Date(x.at).toLocaleString()}\nSOURCE: ${x.source}\nTRANSLATION: ${x.translation}`).join('\n\n----------------------------------------\n\n'); const blob = new Blob([`BolSaathi Live — Session Export\nGenerated: ${new Date().toLocaleString()}\n\n${text}`], { type: 'text/plain;charset=utf-8' }); const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = `bolsaathi-session-${new Date().toISOString().slice(0,10)}.txt`; a.click(); URL.revokeObjectURL(url); setStatus('Session export downloaded.'); });
$('clearHistory').addEventListener('click', () => { if (!sessionHistory.length) return; if (confirm('Clear all translations saved in this browser?')) { sessionHistory = []; saveHistory(); setStatus('Local session history cleared.'); } });
$('copyEnglish').addEventListener('click', async () => { try { await navigator.clipboard.writeText(lastSource || $('englishText').textContent); setStatus('Source text copied.'); } catch { setStatus('Clipboard permission unavailable.', true); } });
window.addEventListener('beforeunload', () => { try { recognition?.stop(); } catch {} });
renderHistory();
health();
