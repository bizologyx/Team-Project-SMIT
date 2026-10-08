# Transzo AI — Full-stack Urdu ↔ English Interpretation MVP

Transzo AI is a real-time assistance and interpretation workspace for English and Urdu conversations.

## Project Structure

```text
Team-Project-SMIT/
├── frontend/
│   ├── index.html               # Main workspace dashboard UI
│   ├── app.js                   # Client logic, Speech Recognition & Zoom Meeting SDK
│   ├── demo.html                # Frontend-only product demo with three sample screens
│   ├── demo.js                  # Client-side demo navigation and sample interactions
│   ├── contacts.html            # Contacts manager UI
│   ├── contacts.js              # Contacts management & browser local storage logic
│   └── google-meet-extension/   # Chrome extension companion for Google Meet captions
├── backend/
│   └── server.js                # Express server handling OpenAI Translation/TTS APIs & Zoom SDK signatures
├── .env.example                 # Environment variables template
├── package.json                 # Project dependencies and npm scripts
├── vite.config.js               # Vite frontend configuration
└── README.md                    # Project documentation
```

## Features & Implementation Status

- **Glossary & AI Translation**: Custom terms passed to OpenAI translation model (English ↔ Urdu).
- **Session Memory**: Recent translations stored locally in the browser with export to `.txt`.
- **Text-to-Speech (TTS)**: OpenAI audio TTS generation played locally.
- **Private Contact Book**: Browser-local contact book with search, CSV import/export, and language preferences.
- **Zoom live interpretation**: Zoom RTMS live transcripts are translated and spoken into a chosen audio output. To share that speech in a Zoom call, the local computer needs a virtual audio cable selected as the browser output and as the Zoom microphone.
- **Zoom Meeting SDK**: Embedded Zoom Meeting SDK setup with server-signed signatures.
- **Google Meet Extension**: Companion Chrome extension for translating live meeting captions.
- **Frontend-only product demo**: Explore sample text translations and simulated meeting captions at `/demo.html`; demo content does not call the backend.

## How to Run Locally

1. **Install Dependencies**:
   ```bash
   npm install
   ```

2. **Configure Environment Variables**:
   Copy `.env.example` to `.env` and fill in required keys:
   - `OPENAI_API_KEY`
   - `ZOOM_MEETING_SDK_KEY`
   - `ZOOM_MEETING_SDK_SECRET`
   - `FIREBASE_PROJECT_ID` (required by the RTMS session endpoint to verify the signed-in Firebase user)
   - `ZOOM_RTMS_CLIENT_ID`, `ZOOM_RTMS_CLIENT_SECRET`, and `ZOOM_RTMS_WEBHOOK_SECRET` for Zoom RTMS

3. **Development Mode**:
   ```bash
   npm run dev
   ```
   Open `http://localhost:5173` in your browser. Vite proxies `/api` calls to the Express server running on port `3000`.

4. **Production Build & Run**:
   ```bash
   npm start
   ```

## Zoom live interpretation setup

Zoom RTMS runs in the backend and the official Node RTMS package supports Linux and macOS. Deploy the backend on Node.js 22+ on Linux (recommended); a Windows development backend intentionally reports RTMS as unavailable.

1. Create a **user-managed General app** in the [Zoom App Marketplace](https://marketplace.zoom.us/) and add Realtime Media Streams.
2. Add the `meeting:read:meeting_transcript` scope and subscribe to `meeting.rtms_started` and `meeting.rtms_stopped`.
3. Set the app's event notification endpoint to `https://YOUR_HOST/api/zoom/rtms/webhook`. The backend verifies Zoom's request signature; the URL must be public HTTPS. Configure the app's webhook secret token as `ZOOM_RTMS_WEBHOOK_SECRET`.
4. Add the app's Client ID and Client Secret as `ZOOM_RTMS_CLIENT_ID` and `ZOOM_RTMS_CLIENT_SECRET` on the Linux backend. They are only used by the RTMS connection and must not be exposed in the browser.
5. The Zoom account must have an active Developer Pack subscription and RTMS must be allowed by the account administrator. Enable the app's approved auto-start policy or have the meeting host start/approve the RTMS app. A webhook subscription alone does not start a meeting stream.
6. Join Zoom through the Transzo workspace. Enable Zoom live transcription/captions if required by the meeting, select **Zoom live transcript (RTMS)**, agree to transcript processing, then choose **Connect to live captions**. The status waits for Zoom to send a `meeting.rtms_started` event. This button connects Transzo to an RTMS stream; the host starts/approves that stream in Zoom.
7. If the people in the call should hear the translation, install and select a virtual audio cable. Use its **playback/output** device with Transzo's **Choose speaker or virtual cable** button, then select that cable's matching **recording/input** device as the Zoom microphone. Confirm Zoom's RTMS sharing notice and obtain the meeting participants' consent.

This flow translates the live transcript supplied by Zoom RTMS. It does not publish audio through RTMS; the optional virtual cable routes speech from the browser into Zoom. RTMS session tickets require a valid signed-in Firebase ID token, so the backend also needs the Firebase project ID. Use a supported Chromium browser on HTTPS for device selection and `setSinkId`. The Zoom meeting and its host policies determine whether a transcript stream starts. Audio routing and live RTMS behavior must be tested with an approved Zoom app and a real Developer Pack-enabled meeting; API credentials and meeting access cannot be supplied by a frontend-only build.
