# Transzo AI — Google Meet Companion (Beta)

## Install
1. Extract the project ZIP.
2. Start the Node.js backend in the main project folder (`npm install`, configure `.env`, then `npm run dev`).
3. Open `chrome://extensions`, enable **Developer mode**, click **Load unpacked**, and select this `google-meet-extension` folder.
4. Open/refresh Google Meet, join a meeting and enable captions. Click the floating Transzo AI button, confirm caption-processing consent, then start interpreting.

## Permissions and privacy
The extension runs on Meet pages and can call the local API at `http://localhost:3000`. Caption text is sent to the configured backend only after the user starts interpreting and accepts the consent checkbox. It does not record raw audio, access the microphone, or send synthesized speech into the meeting. Local browser speech voices vary.

## Limitations
Google Meet's page DOM is not a stable public captions API. Caption detection is best-effort and may miss captions or identify unrelated page text after Meet changes its UI. This is a starter, not a verified production caption bridge. For dependable caption ingestion, evaluate supported Google Meet/Workspace APIs and account policies. Raw audio interpretation and sending generated audio into Meet require separate supported audio integrations.
