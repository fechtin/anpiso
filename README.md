<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

# Anpiso

Anpiso is an AI-powered meeting assistant that records, transcribes, translates, and generates structured meeting minutes in real time — then saves, shares, and emails them.

> View the AI Studio entry: https://ai.studio/apps/f3555f60-73b9-4ebc-925f-0aa3248d177c

## Features

### Recording & transcription
- **Two audio sources**: microphone only, or system audio + mic (via screen capture).
- **Two STT engines**, switchable on the fly:
  - **Gemini Live** — multimodal streaming model with strong multilingual accuracy.
  - **Web Speech API** — browser-native, offline-friendly fallback.
- **Five source languages** for STT: English (`en-US`), Korean (`ko-KR`), Vietnamese (`vi-VN`), Japanese (`ja-JP`), Chinese (`zh-CN`).

### Live translation
- Streaming translation alongside the original transcript while recording.
- **Five target languages**: Vietnamese, English, Korean, Chinese, Japanese.
- Full-transcript re-translation after recording stops, for higher quality.

### Structured minutes
After the meeting, the app auto-generates:
- Title, time, location
- Participants
- Summary + short summary (~10 words, used as email subject)
- Action items with assignee (PIC) and deadline

Minutes are editable inline and re-saveable.

### Live sharing (WebRTC)
- Generate a shareable link — viewers see the live transcript, draft, elapsed time, and final minutes in real time.
- Live viewer count for the host.
- Peer-to-peer via WebRTC, with Firestore as the signaling channel.

### Persistence & integrations
- **Firebase Auth** — Google sign-in.
- **Firestore** — meeting history with pagination, time-range filter, single/bulk delete.
- **Google Drive** (optional) — auto-uploads the recorded audio (`.webm`) to a per-meeting folder under your app folder. OAuth code-flow exchange handled by Cloud Functions.
- **Gmail send** — exports minutes as a styled HTML email with one click.

### UI
- **Three UI languages**: Vietnamese, English, Korean (auto-detected, persisted).
- Tailwind CSS 4, responsive desktop + mobile, swipe-to-delete on meeting cards.

## Tech stack

| Layer | Tooling |
|---|---|
| Frontend | React 19, TypeScript 5.8, Vite 6 |
| Styling | Tailwind CSS 4 |
| AI | `@google/genai` (Gemini Live) |
| Backend | Firebase Auth, Firestore, Cloud Functions (Node 22, region `asia-northeast3`), Hosting |
| Realtime | WebRTC + Firestore signaling |
| Audio | MediaRecorder + `ts-ebml` (WebM duration fixup) |

## Project layout

```
.
├── App.tsx                  # Top-level app shell, auth + state orchestration
├── index.tsx                # Entry; routes /view/:roomId to ViewerPage
├── components/              # UI components (Recorder, Minutes, History, Share, ...)
├── hooks/
│   ├── useAISession.ts      # Gemini Live STT + translation session
│   ├── useWebSpeechSession.ts  # Web Speech STT + translation session
│   ├── useMeetingRecorder.ts   # Recording state machine, segment processing
│   ├── useTranslationQueue.ts  # Streaming translation buffer
│   ├── useHostSharing.ts    # WebRTC host (publishes live state)
│   └── useViewerSession.ts  # WebRTC viewer (consumes live state)
├── pages/ViewerPage.tsx     # Read-only viewer at /view/:roomId
├── services/
│   ├── aiService.ts         # Gemini calls (minutes generation, translation)
│   ├── meetingService.ts    # Firestore CRUD for meetings
│   ├── userSettingsService.ts  # Firestore CRUD for user prefs
│   ├── driveService.ts      # Drive upload, folder creation
│   ├── gmailService.ts      # Gmail send via REST
│   ├── signalingService.ts  # WebRTC SDP/ICE exchange via Firestore
│   ├── contactService.ts    # Email contacts
│   ├── apiKeyService.ts     # Per-user Gemini key handling
│   ├── logService.ts        # In-memory log bus for the LogBar
│   └── firebase.ts          # Firebase init + callable functions
├── i18n/                    # vi / en / ko translation tables
├── functions/               # Cloud Functions (Drive OAuth code exchange + refresh)
├── config/webrtc.ts         # ICE servers / signaling config
├── firestore.rules          # Security rules
├── firestore.indexes.json   # Composite indexes
└── firebase.json            # Hosting + functions + firestore wiring
```

## Running locally

**Prerequisites:** Node.js 22+, a Firebase project, a Google Cloud OAuth client.
No Gemini key is needed to build/run — each user supplies their own key in-app
(top-right menu); it is stored in their browser's localStorage and never bundled.

1. Install dependencies (root + functions):
   ```bash
   npm install
   npm --prefix functions install
   ```

2. Copy `.env.example` → `.env.local` and fill in (web client config):
   ```bash
   # Firebase web config
   VITE_FIREBASE_API_KEY=...
   VITE_FIREBASE_AUTH_DOMAIN=...
   VITE_FIREBASE_PROJECT_ID=...
   VITE_FIREBASE_STORAGE_BUCKET=...
   VITE_FIREBASE_MESSAGING_SENDER_ID=...
   VITE_FIREBASE_APP_ID=...

   # Google OAuth (for Drive)
   VITE_GOOGLE_CLIENT_ID=...
   ```
   > Do **not** put a Gemini API key in any `VITE_*` var — it would be baked into
   > the client bundle and exposed to every visitor.

3. Copy `functions/.env.example` → `functions/.env` for the callable functions:
   ```bash
   GOOGLE_CLIENT_ID=...           # same OAuth client as above
   GOOGLE_CLIENT_SECRET=...
   ```

4. Place your Firebase admin service-account key at `firebase-auth.json` (used by deploy scripts).

5. Run the dev server:
   ```bash
   npm run dev          # http://localhost:3000
   npm run dev:3002     # alt port, kills any process holding 3002 first
   ```

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Vite dev server on port 3000 |
| `npm run build` | Production bundle to `dist/` |
| `npm run lint` | TypeScript type-check (`tsc --noEmit`) |
| `npm run preview` | Preview the production build |
| `npm run deploy` | Build + deploy hosting, functions, rules, indexes |
| `npm run deploy:hosting` | Hosting only |
| `npm run deploy:rules` | Firestore rules only |
| `npm run deploy:indexes` | Firestore indexes only |

Cloud Functions deploy from their own folder:
```bash
npm --prefix functions run deploy
```

> **Pick the Firebase project when deploying.** `.firebaserc` ships with a
> placeholder (`your-project-id`), so the deploy scripts aren't tied to any
> instance. Target your own project by appending `--project` (npm forwards it
> to the underlying `firebase deploy`):
> ```bash
> npm run deploy:hosting -- --project your-firebase-project
> ```
> This keeps your real project id out of the repo. Alternatively, edit
> `.firebaserc` locally — but then don't commit that change.

## Cloud Functions

Two callable functions in `asia-northeast3`:

- `exchangeDriveCode` — exchanges an OAuth authorization code for a Drive access token (server-side client secret).
- `refreshDriveToken` — refreshes an expired Drive access token before the next upload.

Both require Firebase Auth and only act on the calling user.

## Permissions & APIs to enable

In your Google Cloud project:
- **Gemini API** (Generative Language API)
- **Google Drive API** — scope `https://www.googleapis.com/auth/drive.file`
- **Gmail API** — scope `https://www.googleapis.com/auth/gmail.send`
- OAuth 2.0 Client ID (Web), with `http://localhost:3000` and your hosting domain as authorized origins

## CI/CD (GitHub Actions)

`.github/workflows/deploy.yml` builds and deploys on every push to `main`
(and can be run manually via **Actions → Run workflow**). It deploys hosting,
functions, and Firestore rules/indexes.

Add these **repository secrets** (Settings → Secrets and variables → Actions):

| Secret | Value |
|---|---|
| `FIREBASE_SERVICE_ACCOUNT` | Full JSON of your Firebase service-account key |
| `FIREBASE_PROJECT_ID` | Your Firebase project id (e.g. `my-app`) |
| `VITE_FIREBASE_API_KEY` | From your `.env.local` |
| `VITE_FIREBASE_AUTH_DOMAIN` | " |
| `VITE_FIREBASE_PROJECT_ID` | " |
| `VITE_FIREBASE_STORAGE_BUCKET` | " |
| `VITE_FIREBASE_MESSAGING_SENDER_ID` | " |
| `VITE_FIREBASE_APP_ID` | " |
| `VITE_GOOGLE_CLIENT_ID` | " |
| `GOOGLE_CLIENT_ID` | OAuth client id (for the callable functions) |
| `GOOGLE_CLIENT_SECRET` | OAuth client secret |

No secret is ever committed — the workflow writes `.env` and `functions/.env`
at build time from these secrets. The project id is passed via `--project`, so
`.firebaserc` can keep its placeholder.

## License

Anpiso is licensed under the **GNU Affero General Public License v3.0** (AGPL-3.0) —
see [LICENSE](LICENSE) for the full text.

In short: you are free to use, modify, and self-host this software, but **if you
run a modified version as a network service, you must make your modified source
code available to its users** under the same license.

Copyright (C) 2026 FechTin (https://fechtin.com)
