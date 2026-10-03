# BolSaathi Live 3.0 — Full-stack Urdu ↔ English interpretation MVP

This project keeps the original `BolSaathi-Live.html` in the folder as a reference and adds a two-way interpretation dashboard with a Node.js backend.

## Honest implementation status

**Implemented in this starter**
- Optional custom meeting glossary passed server-side to guide translation of names, acronyms, product names and preferred terminology.
- Browser-local session history (up to 40 translations), reuse/remove controls, and `.txt` session export. History stays on the device and is not uploaded as a separate transcript.
- Translation input validation for glossary terms; API keys remain server-side.
- Responsive dark-green dashboard based on the original design language.
- Node.js/Express server with health check.
- Server-side OpenAI text translation endpoint (English → Urdu and Urdu → English).
- Server-side text-to-speech endpoint and local browser playback.
- Zoom Meeting SDK join flow with a server-generated signature endpoint.
- Optional browser SpeechRecognition demo input, with an explicit consent checkbox.
- `.env.example`; API secrets are not embedded in browser code.

**Not production-complete / not verified**
- Zoom RTMS meeting audio ingestion is not wired into the UI or translation pipeline. The webhook endpoint is deliberately disabled until official webhook verification and event handlers are implemented.
- Synthesized speech is played locally in the browser; it is **not injected into the Zoom meeting**. That needs a separately validated SDK/audio-routing design and testing on the intended OS/browser.
- The Meeting SDK package/build compatibility, app allow-list, signature requirements, account permissions and meeting policies must be verified with your Zoom app credentials and current Zoom documentation.
- Speech recognition in the browser uses the device's selected microphone only; it does not tap Zoom's internal remote audio stream.
- Urdu TTS pronunciation/voice quality and the selected model's availability for Urdu must be tested. The app reports API errors rather than silently pretending speech was generated.
- The project is a starter, not a claim of an already working real-time interpreter. A true low-latency experience requires streaming STT, translation, streaming TTS, audio queues, echo control, interruption handling, and RTMS/audio-output integration.

## Requirements

- Node.js 22 or newer (required by current Zoom RTMS SDK family; this starter uses Meeting SDK package too).
- Zoom Meeting SDK app credentials.
- OpenAI API key with access to the configured translation and TTS models.
- A Zoom app with appropriate Meeting SDK configuration and allowed domains/origins.
- For remote meeting audio: a separately configured Zoom RTMS app, appropriate scopes/events, Developer Pack credits, public HTTPS endpoint, and host/admin authorization as required.

## Run locally

1. Install Node.js 22+.
2. Copy `.env.example` to `.env` and fill in `OPENAI_API_KEY`, `ZOOM_MEETING_SDK_KEY`, and `ZOOM_MEETING_SDK_SECRET`.
3. Install packages: `npm install`.
4. Development: run `npm run dev`, then open `http://localhost:5173`. The Vite frontend proxies `/api` to the Node backend on port 3000.
5. Production-style run: `npm start` builds the frontend and serves it from the Node backend at `http://localhost:3000`.
6. Open the app in a supported browser. Use localhost for development; deployed production use requires HTTPS.
6. First test translation using the text box. Then test TTS. Finally test joining a meeting with a non-production meeting and an authorized test account.

## Zoom SDK setup and permissions

1. Create/configure a Zoom Meeting SDK app in the Zoom App Marketplace and use the SDK Key/Secret from its credentials page.
2. Configure allowed domains/origins and any SDK app settings required by Zoom's current docs.
3. Set the credentials only in server-side `.env`. Never send the secret to the browser, commit it, or put it in HTML.
4. A user must have permission to join the meeting; the host's passcode/waiting-room/account policies still apply. Role `host` must only be selected by someone authorized to act as host.
5. RTMS is separate from the Meeting SDK join. Add the required RTMS audio/transcript scopes and started/stopped event subscriptions in the Zoom Marketplace app. Zoom currently documents a Developer Pack credits prerequisite for RTMS; confirm pricing and account eligibility before use.
6. The host/admin may control whether RTMS starts automatically or requires approval. Tell participants what audio/text is being processed and obtain the permissions/consent required by your organization and applicable rules.
7. Before deploying, implement and test Zoom webhook URL validation and signature verification for the exact RTMS app type. The provided webhook endpoint intentionally returns 501 when configured and must not be treated as operational.

## Secrets and privacy

- Keep `.env` private and add it to `.gitignore` (already included).
- Never expose OpenAI or Zoom secrets in frontend JavaScript or source maps.
- Do not log raw meeting audio, transcripts, passcodes, or API credentials. Current server logs only provider error status/message.
- Add authentication, rate limits, request-size limits, retention controls, consent/notice, and a production CSP before public deployment.
- Treat translation as assistive: names, money, deadlines, legal/business terms and idioms can be mistranslated. Confirm important commitments in writing.

## Architecture for the next production milestone

`Zoom meeting -> authorized RTMS audio stream (per participant) -> streaming speech recognition -> incremental English/Urdu translation -> streaming TTS -> local audio playback`

The reverse direction needs `user microphone -> Urdu STT -> English translation -> English TTS -> a supported path to deliver audio to meeting participants`. The final step is not implemented here. Test whether your selected Zoom SDK and operating system support a permitted audio-source injection method; otherwise evaluate an OS virtual audio device or a Zoom-supported interpretation path. Do not assume RTMS itself sends synthesized audio back into the meeting.

## Official docs to verify before deployment

- Zoom RTMS overview: https://developers.zoom.us/docs/rtms/
- Zoom RTMS media handling: https://developers.zoom.us/docs/rtms/video-sdk/media/
- Zoom RTMS getting started: https://developers.zoom.us/docs/rtms/meetings/getting-started/
- Zoom RTMS Node.js SDK: https://developers.zoom.us/docs/rtms/sdk/
- Zoom Meeting SDK for Web: https://developers.zoom.us/docs/meeting-sdk/web/
- OpenAI API docs: https://platform.openai.com/docs/

These APIs, SDK versions, pricing, permissions, and language quality can change. Verify the live documentation and test the actual account/plan before relying on production behavior.


## Google Meet Companion extension (beta)

The `google-meet-extension/` folder contains a Chrome Manifest V3 extension. Load it unpacked from `chrome://extensions` with Developer mode enabled. Start the Node.js backend, open Google Meet, enable captions, then open the floating panel and explicitly consent before starting caption translation. It translates visible caption DOM text as a best-effort integration; Meet markup can change. It uses local browser speech synthesis and does not capture raw meeting audio or send generated audio into the call. Test before relying on it.


## New in 3.0: meeting glossary and session memory

- Add optional glossary entries in the interpretation panel, one per line (for example `Acme = Acme`, `sprint = اسپرنٹ`, or `Sara Ahmed = Sara Ahmed`). These are sent with each translation request and included in the model's translation instructions.
- Successful translations are saved in browser local storage on the current device (maximum 40). Reuse a previous item, remove one entry, export the session to a text file, or clear all local history.
- Local history can contain meeting content. Use it only when permitted, and clear it on shared devices. It is not a secure multi-user transcript store.
- This release does not claim end-to-end live Zoom interpretation: the existing Zoom join flow is separate from RTMS remote-audio ingestion and outgoing translated-audio routing.


## New Contacts page

Open `/contacts.html` from the Workspace navigation to manage a private, browser-local contact book. Features include add/edit/delete, search, relationship filters (client/collaborator/other), preferred language, company and meeting notes, copy details, CSV import/export, and a live contact count in navigation. Contact data is stored in localStorage on the current browser/device; it is not synced to the backend or shared across devices. Use CSV import with columns such as `name,company,email,phone,kind,language,notes`.
