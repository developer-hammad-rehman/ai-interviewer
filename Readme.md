# Interviewroom

Interviewroom is a voice-based AI practice interview application. A candidate pastes a job description, chooses the number of main questions, joins a LiveKit audio room, and speaks with an AI interviewer that adapts its questions to the role. The room also shows a live transcript and provides spoken feedback when the interview ends.

## Features

- Job-description-driven interview questions. The agent extracts the role, seniority, responsibilities, and required skills from the submitted description.
- Configurable interview length. The UI offers 4, 6, 8, or 10 main questions. The backend accepts 3–12, so other clients can use any value in that range.
- Adaptive follow-ups. The interviewer can ask one short follow-up when the candidate's answer provides something specific worth exploring.
- Voice conversation. Candidate audio is published through LiveKit; the interviewer replies with an OpenAI realtime voice model.
- Live interview status. The room indicates connection state and agent state such as preparing, listening, thinking, speaking, reconnecting, or unavailable.
- Audio visualization. The interviewer avatar and bar visualizer react to the agent's voice track.
- Live transcript. Both interviewer and candidate transcriptions are displayed in a scrolling panel. The panel follows new messages unless the candidate scrolls upward.
- Microphone control. Candidates can mute and unmute their microphone. Browser permission errors are shown in the room.
- Interview timer. The elapsed time starts when the LiveKit room connects.
- Early ending. The candidate can leave with the End interview button or request an ending verbally. The agent is instructed to provide brief evidence-based feedback before closing.
- Responsive lobby and room UI. The interface includes preparation guidance, question-count selection, status indicators, accessible labels, focus styles, and mobile layout rules.
- Basic failure handling. The client handles request timeouts, invalid backend responses, LiveKit errors, microphone failures, and failed room disconnects.

## Architecture

The project has three runtime pieces:

```text
Browser (React/Vite)
        |
        | POST /api/interviews/start
        v
FastAPI session API  ---- LiveKit server API ----> LiveKit room
        |                                             ^
        | dispatch metadata                            |
        v                                             |
LiveKit voice-agent worker ---------------------------+
        |
        +--> OpenAI realtime model + Silero VAD
```

### 1. Frontend

`frontend/src/App.tsx` contains the application flow:

1. The lobby collects a job description and question count.
2. The client rejects descriptions shorter than 100 characters and sends a `POST` request to the backend.
3. The backend returns a LiveKit token, server URL, and unique room name.
4. `LiveKitRoom` connects the browser with audio enabled and video disabled.
5. `InterviewRoom` reads LiveKit connection state, voice-agent state, audio tracks, and transcriptions to render the room.
6. Disconnecting or encountering a room/media error returns the user to the lobby with an error or completion notice.

The frontend API base URL is read from `VITE_API_BASE_URL` and defaults to `http://localhost:8000`.

### 2. FastAPI session API

`backend/main.py` is responsible for short-lived interview session creation. It does not conduct the conversation and does not store interview data.

`POST /api/interviews/start` performs the following work:

1. Validates the job description length (100–15,000 characters) and question count (3–12).
2. Generates a unique room name such as `interview-<uuid>` and candidate identity such as `candidate-<uuid>`.
3. Creates a LiveKit JWT with a 10-minute TTL.
4. Grants the candidate permission to join the selected room, publish microphone audio, and subscribe to room audio. Video and data publishing are disabled.
5. Serializes the job description, question count, and candidate identity into agent-dispatch metadata.
6. Dispatches the configured voice agent into the room through the LiveKit server API.
7. Deletes the room on a best-effort basis if dispatch fails, then returns HTTP 502.
8. Returns the token, LiveKit server URL, and room name with `Cache-Control: no-store`.

`GET /health` returns `{ "status": "ok" }` and can be used for a basic availability check.

### 3. LiveKit voice-agent worker

`backend/agent.py` defines the conversational worker:

- `prewarm()` loads Silero VAD once per worker process.
- `entrypoint()` reads and validates the dispatch metadata.
- The worker waits up to 60 seconds for the exact candidate identity assigned to the room.
- `InterviewAgent` builds the interviewer instructions and supplies the job description as lower-priority reference context.
- `AgentSession` uses `GPTLiveModel` with the `marin` voice and `gpt-4o-mini` response model.
- The agent starts with a short introduction, identifies the inferred role, and asks exactly one first question.
- The instruction set controls question sequencing, follow-ups, clarification behavior, early termination, feedback, and safe handling of untrusted text inside job descriptions.

## Interview behavior

The agent is instructed to:

- ask one question at a time;
- begin with relevant experience;
- cover the most important competencies from the job description;
- include practical scenarios and trade-offs suited to the seniority;
- avoid unrelated trivia and invented requirements;
- ask for clarification instead of guessing;
- acknowledge “I don't know” and move on;
- repeat or simplify a question when requested;
- respect an early-end request; and
- give feedback based only on answers actually heard in the conversation.

Feedback contains specific strengths, areas lacking detail or accuracy, and two concrete practice suggestions. The agent is explicitly told not to assess appearance, accent, personality, or hiring suitability.

## Repository structure

```text
.
├── Readme.md                  # Project documentation
├── backend/
│   ├── main.py                # FastAPI app, validation, JWTs, agent dispatch
│   ├── agent.py               # LiveKit voice-agent worker
│   ├── pyproject.toml         # Python project metadata and pinned dependencies
│   ├── requirements.txt       # Pip-compatible dependency list
│   ├── uv.lock                # Locked uv dependency resolution
│   └── .env                   # Local secrets/configuration; do not commit
└── frontend/
    ├── src/
    │   ├── App.tsx            # Lobby, room, API call, and LiveKit UI logic
    │   ├── App.css            # Component-specific styles
    │   ├── index.css          # Global styles, layout, colors, typography
    │   └── main.tsx           # React entry point
    ├── public/                # Favicon and public SVG assets
    ├── package.json           # Scripts and JavaScript dependencies
    ├── package-lock.json      # Locked npm dependency tree
    └── vite.config.ts         # Vite React configuration
```

## Requirements

- Python 3.12 or newer
- Node.js and npm
- A LiveKit Cloud or self-hosted LiveKit server
- LiveKit API key and secret
- An OpenAI API key available to the agent worker
- A browser with microphone support and permission to access it

## Configuration

Create `backend/.env` with the following variables:

```env
LIVEKIT_URL=wss://your-livekit-host
LIVEKIT_API_KEY=your-livekit-api-key
LIVEKIT_API_SECRET=your-livekit-api-secret
OPENAI_API_KEY=your-openai-api-key
VOICE_AGENT_NAME=interview-voice-agent
FRONTEND_ORIGIN=http://localhost:5173
```

Create `frontend/.env` with:

```env
VITE_API_BASE_URL=http://localhost:8000
```

`VOICE_AGENT_NAME` must be the same name used when registering/running the agent. The API defaults to `hammad-voice-agent`, while the worker defaults to `interview-voice-agent`; set it explicitly in both environments to avoid a dispatch mismatch.

Never expose `LIVEKIT_API_SECRET`, `LIVEKIT_API_KEY`, or `OPENAI_API_KEY` in frontend variables, source control, browser code, or client logs. If a secret has been exposed, rotate it before using the project outside local development.

## Local development

### Start the backend API

```bash
cd backend
python -m venv .venv
source .venv/bin/activate       # Windows: .venv\Scripts\activate
pip install -r requirements.txt
uvicorn main:app --reload --port 8000
```

The API is then available at `http://localhost:8000`. Interactive API documentation is available at `/docs`.

### Start the voice agent

In a second terminal:

```bash
cd backend
source .venv/bin/activate       # Windows: .venv\Scripts\activate
python agent.py dev
```

The worker must remain running and connected to the same LiveKit project as the FastAPI API. In a deployed environment, run the worker with the production command supported by the installed LiveKit Agents CLI rather than the development command.

### Start the frontend

In a third terminal:

```bash
cd frontend
npm install
npm run dev
```

Open the Vite URL, normally `http://localhost:5173`, allow microphone access, paste a sufficiently long job description, select a question count, and enter the interview room.

## Frontend commands

From `frontend/`:

```bash
npm run dev       # Start Vite development server
npm run build     # Type-check and create a production build
npm run lint      # Run ESLint
npm run preview   # Preview the production build locally
```

## API contract

### Start an interview

`POST /api/interviews/start`

Request:

```json
{
  "job_description": "At least 100 characters ...",
  "question_count": 6
}
```

Response:

```json
{
  "token": "<short-lived LiveKit JWT>",
  "serverUrl": "wss://your-livekit-host",
  "roomName": "interview-<uuid>"
}
```

Validation errors are returned by FastAPI as HTTP 422. Agent-dispatch failures return HTTP 502. The browser also applies a 30-second request timeout.

## Security and production considerations

The current endpoint is explicitly intended for local development and has no application user authentication. Before public deployment:

- authenticate the caller and authorize interview creation;
- add rate limiting and abuse protection;
- keep all LiveKit and OpenAI secrets server-side;
- use HTTPS for the frontend and secure WebSocket/TLS LiveKit URLs;
- restrict CORS to the exact deployed frontend origin;
- add structured logging, metrics, and request tracing;
- define retention and consent rules for voice/transcript data;
- validate maximum payload sizes at the reverse proxy as well as in the app;
- handle stale rooms and agent timeouts with a cleanup policy; and
- add automated tests for API validation, dispatch failures, metadata validation, and client error states.

There is currently no database, user account system, saved interview history, transcript export, or persistent feedback record. Interview state exists in the LiveKit room and in the active browser session only.

## Troubleshooting

**The interview cannot start:** confirm the API is running, `VITE_API_BASE_URL` points to it, and the browser origin matches `FRONTEND_ORIGIN`.

**The API returns 502:** confirm the LiveKit URL/key/secret are valid and that the worker is running with the same `VOICE_AGENT_NAME` as the API.

**The room connects but the interviewer never speaks:** check the agent worker logs, `OPENAI_API_KEY`, LiveKit connectivity, and the browser's audio playback permission. The room includes a “Click to enable interviewer audio” control for browsers that block autoplay.

**The microphone is unavailable:** grant microphone permission, check that another application is not exclusively using the device, and reload the page.

**The worker shuts down before the candidate joins:** the worker waits 60 seconds for the candidate identity returned in the session token. Start the room promptly after creating the session.

## License

No license is currently specified in the repository.
