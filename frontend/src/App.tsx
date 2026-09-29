import { useEffect, useRef, useState } from "react";
import {
  BarVisualizer,
  LiveKitRoom,
  RoomAudioRenderer,
  StartAudio,
  useConnectionState,
  useLocalParticipant,
  useRoomContext,
  useTranscriptions,
  useVoiceAssistant,
} from "@livekit/components-react";
import {
  ArrowRight,
  Check,
  Clock3,
  FileText,
  Headphones,
  MessageSquare,
  Mic,
  MicOff,
  PhoneOff,
} from "lucide-react";

import "@livekit/components-styles";
import "./App.css";

type InterviewSession = {
  token: string;
  serverUrl: string;
  roomName: string;
};

const API_URL = (
  import.meta.env.VITE_API_BASE_URL || "http://localhost:8000"
).replace(/\/$/, "");

const agentLabels: Record<string, string> = {
  disconnected: "Waiting for interviewer",
  connecting: "Connecting interviewer",
  initializing: "Preparing your interview",
  listening: "Listening to your answer",
  thinking: "Considering your answer",
  speaking: "Interviewer speaking",
  failed: "Interviewer unavailable",
};

function formatTime(seconds: number) {
  const minutes = Math.floor(seconds / 60);
  return `${String(minutes).padStart(2, "0")}:${String(
    seconds % 60,
  ).padStart(2, "0")}`;
}

function InterviewRoom({
  questionCount,
  connectedAt,
}: {
  questionCount: number;
  connectedAt: number | null;
}) {
  const room = useRoomContext();
  const connection = useConnectionState();
  const { state, audioTrack } = useVoiceAssistant();
  const { localParticipant, isMicrophoneEnabled } = useLocalParticipant();
  const transcripts = useTranscriptions();

  const [elapsed, setElapsed] = useState(0);
  const [micBusy, setMicBusy] = useState(false);
  const [controlError, setControlError] = useState("");

  const transcriptRef = useRef<HTMLDivElement>(null);
  const followTranscript = useRef(true);

  const connected = connection === "connected";
  const status = !connected
    ? connection === "reconnecting"
      ? "Reconnecting…"
      : "Connecting to interview…"
    : agentLabels[state] || "Preparing your interview";

  const interviewerMessages = transcripts.filter(
    (item) => item.participantInfo.identity !== localParticipant.identity,
  );

  const latestInterviewerText =
    interviewerMessages[interviewerMessages.length - 1]?.text;

  const lastTranscriptText = transcripts[transcripts.length - 1]?.text;

  useEffect(() => {
    if (!connectedAt) return;

    const update = () => {
      setElapsed(Math.floor((Date.now() - connectedAt) / 1000));
    };

    update();

    const timer = window.setInterval(update, 1000);
    return () => window.clearInterval(timer);
  }, [connectedAt]);

  useEffect(() => {
    const panel = transcriptRef.current;

    if (panel && followTranscript.current) {
      panel.scrollTop = panel.scrollHeight;
    }
  }, [transcripts.length, lastTranscriptText]);

  async function toggleMicrophone() {
    if (micBusy || !connected) return;

    setMicBusy(true);
    setControlError("");

    try {
      await localParticipant.setMicrophoneEnabled(!isMicrophoneEnabled);
    } catch {
      setControlError(
        "Unable to change the microphone. Check browser permissions.",
      );
    } finally {
      setMicBusy(false);
    }
  }

  async function endInterview() {
    if (!window.confirm("End this interview and leave the room?")) return;

    try {
      await room.disconnect();
    } catch {
      setControlError("Unable to disconnect. Please try again.");
    }
  }

  return (
    <div className="interview-shell">
      <header className="session-header">
        <div>
          <div className="eyebrow">INTERVIEW ROOM</div>
          <h1>Your practice interview</h1>
        </div>

        <div className="session-meta">
          <span className={`connection-pill ${connected ? "online" : ""}`}>
            <span className="status-dot" />
            {connected ? "Connected" : connection}
          </span>

          <span className="timer">
            <Clock3 size={16} aria-hidden="true" />
            {formatTime(elapsed)}
          </span>
        </div>
      </header>

      <div className="interview-grid">
        <main className="interview-main">
          <section className="interviewer-stage">
            <div className="stage-top">
              <span className="stage-label">AI interviewer</span>
              <span className="audio-label">
                <Headphones size={14} aria-hidden="true" />
                Audio interview
              </span>
            </div>

            <div className="interviewer-center">
              <div
                className={`avatar-ring ${
                  state === "speaking" ? "is-speaking" : ""
                }`}
              >
                <div className="interviewer-avatar">AI</div>
              </div>

              <h2>Your interviewer</h2>
              <p>Questions tailored to your job description</p>

              <BarVisualizer
                state={state}
                trackRef={audioTrack}
                barCount={7}
                className="voice-visualizer"
              />
            </div>

            <div className="stage-bottom">
              <span className="speaking-status" role="status">
                <span className="status-dot" />
                {status}
              </span>

              <span className="stage-note">Take your time to answer</span>
            </div>
          </section>

          <section className="interviewer-message">
            <div className="section-label">
              <MessageSquare size={16} aria-hidden="true" />
              Latest from your interviewer
            </div>

            <p>
              {latestInterviewerText ||
                "Your interviewer will introduce the role and ask the first question."}
            </p>
          </section>

          <div className="candidate-row">
            <div className="candidate-profile">
              <div className="candidate-avatar">YOU</div>
              <div>
                <strong>You</strong>
                <span>Candidate</span>
              </div>
            </div>

            <span className={`mic-status ${isMicrophoneEnabled ? "" : "muted"}`}>
              {isMicrophoneEnabled ? (
                <Mic size={16} aria-hidden="true" />
              ) : (
                <MicOff size={16} aria-hidden="true" />
              )}
              {isMicrophoneEnabled ? "Microphone on" : "Microphone muted"}
            </span>
          </div>

          {controlError && (
            <p className="error-banner" role="alert">
              {controlError}
            </p>
          )}

          <div className="call-controls">
            <button
              className={`button mic-button ${
                !isMicrophoneEnabled ? "mic-is-muted" : ""
              }`}
              onClick={toggleMicrophone}
              disabled={micBusy || !connected}
              aria-pressed={!isMicrophoneEnabled}
            >
              {isMicrophoneEnabled ? (
                <Mic size={18} aria-hidden="true" />
              ) : (
                <MicOff size={18} aria-hidden="true" />
              )}
              {isMicrophoneEnabled ? "Mute" : "Unmute"}
            </button>

            <button className="button end-button" onClick={endInterview}>
              <PhoneOff size={18} aria-hidden="true" />
              End interview
            </button>
          </div>

          <StartAudio
            label="Click to enable interviewer audio"
            className="enable-audio"
          />

          <RoomAudioRenderer />
        </main>

        <aside className="transcript-panel">
          <div className="transcript-header">
            <div>
              <h2>Live transcript</h2>
              <p>Your conversation, as it happens</p>
            </div>
            <MessageSquare size={19} aria-hidden="true" />
          </div>

          <div
            className="transcript-list"
            ref={transcriptRef}
            role="log"
            aria-label="Interview transcript"
            onScroll={() => {
              const panel = transcriptRef.current;
              if (!panel) return;

              followTranscript.current =
                panel.scrollHeight - panel.scrollTop - panel.clientHeight < 80;
            }}
          >
            {transcripts.length === 0 ? (
              <div className="transcript-empty">
                <MessageSquare size={28} aria-hidden="true" />
                <h3>The conversation starts here</h3>
                <p>
                  Questions and your transcribed answers will appear during
                  the interview.
                </p>
              </div>
            ) : (
              transcripts.map((item, index) => {
                const isCandidate =
                  item.participantInfo.identity === localParticipant.identity;

                return (
                  <article
                    className={`transcript-entry ${
                      isCandidate ? "candidate-entry" : ""
                    }`}
                    key={index}
                  >
                    <div className="transcript-speaker">
                      <span className="speaker-avatar">
                        {isCandidate ? "Y" : "AI"}
                      </span>
                      <strong>{isCandidate ? "You" : "Interviewer"}</strong>
                    </div>
                    <p>{item.text}</p>
                  </article>
                );
              })
            )}
          </div>

          <div className="transcript-footer">
            <span>Interview plan</span>
            <strong>{questionCount} main questions · follow-ups may vary</strong>
          </div>
        </aside>
      </div>

      <p className="session-disclaimer">
        AI practice interview · AI-generated voice · Say “end the interview”
        to request closing feedback before leaving.
      </p>
    </div>
  );
}

export default function App() {
  const [session, setSession] = useState<InterviewSession | null>(null);
  const [jobDescription, setJobDescription] = useState("");
  const [questionCount, setQuestionCount] = useState(6);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [sessionEnded, setSessionEnded] = useState(false);
  const [connectedAt, setConnectedAt] = useState<number | null>(null);

  const requestInProgress = useRef(false);

  async function startInterview() {
    if (requestInProgress.current) return;

    const description = jobDescription.trim();

    if (description.length < 100) {
      setError("Enter a job description of at least 100 characters.");
      return;
    }

    requestInProgress.current = true;
    setLoading(true);
    setError("");
    setSessionEnded(false);

    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 30000);

    try {
      const response = await fetch(`${API_URL}/api/interviews/start`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify({
          job_description: description,
          question_count: questionCount,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          typeof data.detail === "string"
            ? data.detail
            : `Unable to start the interview (${response.status}).`,
        );
      }

      if (!data.token || !data.serverUrl || !data.roomName) {
        throw new Error("The backend returned an invalid interview session.");
      }

      setConnectedAt(null);
      setSession(data);
    } catch (err) {
      setError(
        err instanceof Error && err.name === "AbortError"
          ? "Starting the interview timed out. Please try again."
          : err instanceof Error
            ? err.message
            : "Unable to start the interview.",
      );
    } finally {
      window.clearTimeout(timeout);
      requestInProgress.current = false;
      setLoading(false);
    }
  }

  function finishSession() {
    setSession(null);
    setConnectedAt(null);
    setSessionEnded(true);
  }

  return (
    <div className="app">
      <nav className="app-nav">
        <a className="brand" href="/">
          <span className="brand-mark">
            <Mic size={20} aria-hidden="true" />
          </span>
          Interview<span className="brand-light">room</span>
        </a>

        <span className="nav-badge">Practice with purpose</span>
      </nav>

      {error && (
        <div className="global-error" role="alert">
          {error}
        </div>
      )}

      {session ? (
        <LiveKitRoom
          key={session.roomName}
          token={session.token}
          serverUrl={session.serverUrl}
          connect={true}
          audio={true}
          video={false}
          onConnected={() => {
            setConnectedAt((previous) => previous ?? Date.now());
          }}
          onDisconnected={finishSession}
          onError={(err) => {
            setError(err.message);
            finishSession();
          }}
          onMediaDeviceFailure={() => {
            setError(
              "Microphone unavailable. Allow microphone access and try again.",
            );
            finishSession();
          }}
        >
          <InterviewRoom
            questionCount={questionCount}
            connectedAt={connectedAt}
          />
        </LiveKitRoom>
      ) : (
        <main className="lobby">
          <section className="lobby-intro">
            <span className="intro-pill">
              <Headphones size={15} aria-hidden="true" />
              Your next interview starts here
            </span>

            <h1>
              Walk in
              <br />
              <span>prepared.</span>
            </h1>

            <p className="intro-description">
              Practice a real conversation for the role you want.
              Share the job description and let your AI interviewer
              take it from there.
            </p>

            <div className="preparation-list">
              <div>
                <span>01</span>
                <p>
                  <strong>Share the role</strong>
                  Paste the responsibilities and requirements.
                </p>
              </div>

              <div>
                <span>02</span>
                <p>
                  <strong>Have the conversation</strong>
                  Answer focused questions and relevant follow-ups.
                </p>
              </div>

              <div>
                <span>03</span>
                <p>
                  <strong>Know what to improve</strong>
                  Hear feedback based on your answers.
                </p>
              </div>
            </div>

            <div className="preparation-tip">
              <Headphones size={21} aria-hidden="true" />
              <p>
                Find a quiet place, use headphones, and answer as you would
                in a real interview.
              </p>
            </div>
          </section>

          <section className="setup-card">
            <div className="setup-heading">
              <div className="setup-icon">
                <FileText size={23} aria-hidden="true" />
              </div>
              <div>
                <h2>Set up your interview</h2>
                <p>A little context makes better questions.</p>
              </div>
            </div>

            {sessionEnded && !error && (
              <div className="ended-notice" role="status">
                <Check size={18} aria-hidden="true" />
                Session ended. Your job description is ready for another attempt.
              </div>
            )}

            <label className="field-label" htmlFor="job-description">
              Job description
            </label>

            <textarea
              id="job-description"
              value={jobDescription}
              onChange={(event) => setJobDescription(event.target.value)}
              placeholder={
                "Paste the job description here…\n\n" +
                "Include the role, responsibilities, required skills, " +
                "and experience level."
              }
              maxLength={15000}
              disabled={loading}
            />

            <div className="field-help">
              <span>At least 100 characters</span>
              <span>{jobDescription.length.toLocaleString()} / 15,000</span>
            </div>

            <fieldset className="question-fieldset" disabled={loading}>
              <legend>Target number of main questions</legend>

              <div className="question-options">
                {[4, 6, 8, 10].map((count) => (
                  <button
                    key={count}
                    type="button"
                    className={questionCount === count ? "selected" : ""}
                    aria-pressed={questionCount === count}
                    onClick={() => setQuestionCount(count)}
                  >
                    <strong>{count}</strong>
                    <span>questions</span>
                  </button>
                ))}
              </div>
            </fieldset>

            <div className="setup-detail">
              <Mic size={16} aria-hidden="true" />
              <span>English · Voice interview · Adaptive follow-ups</span>
            </div>

            <button
              className="button start-button"
              onClick={startInterview}
              disabled={loading || jobDescription.trim().length < 100}
            >
              {loading ? "Preparing your interview…" : "Enter interview room"}
              {!loading && <ArrowRight size={19} aria-hidden="true" />}
            </button>

            <p className="setup-disclaimer">
              Your browser will request microphone access.
              You’ll speak with an AI-generated voice.
            </p>
          </section>
        </main>
      )}
    </div>
  );
}