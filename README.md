# BolSaathi Live 3.0 — Full-stack Urdu ↔ English Interpretation MVP

BolSaathi Live is a real-time assistance and interpretation workspace for English and Urdu conversations.

## Project Structure

```text
Team-Project-SMIT/
├── frontend/
│   ├── index.html               # Main workspace dashboard UI
│   ├── app.js                   # Client logic, Speech Recognition & Zoom Meeting SDK
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
- **Zoom Meeting SDK**: Embedded Zoom Meeting SDK setup with server-signed signatures.
- **Google Meet Extension**: Companion Chrome extension for translating live meeting captions.

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

3. **Development Mode**:
   ```bash
   npm run dev
   ```
   Open `http://localhost:5173` in your browser. Vite proxies `/api` calls to the Express server running on port `3000`.

4. **Production Build & Run**:
   ```bash
   npm start
   ```
