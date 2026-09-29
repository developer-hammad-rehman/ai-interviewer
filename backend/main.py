import json
import logging
import os
from datetime import timedelta
from uuid import uuid4

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Response
from fastapi.middleware.cors import CORSMiddleware
from livekit import api
from pydantic import BaseModel, ConfigDict, Field


load_dotenv()

logger = logging.getLogger(__name__)


def required_env(name: str) -> str:
    value = os.getenv(name, "").strip()

    if not value:
        raise RuntimeError(f"Missing environment variable: {name}")

    return value


LIVEKIT_URL = required_env("LIVEKIT_URL")
LIVEKIT_API_KEY = required_env("LIVEKIT_API_KEY")
LIVEKIT_API_SECRET = required_env("LIVEKIT_API_SECRET")

AGENT_NAME = os.getenv(
    "VOICE_AGENT_NAME",
    "hammad-voice-agent",
)

app = FastAPI(title="AI Interview Backend")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        os.getenv("FRONTEND_ORIGIN", "http://localhost:5173")
    ],
    allow_methods=["GET", "POST"],
    allow_headers=["Content-Type", "Authorization"],
)


class InterviewRequest(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)

    job_description: str = Field(
        min_length=100,
        max_length=15000,
    )

    question_count: int = Field(
        default=6,
        ge=3,
        le=12,
    )


class InterviewResponse(BaseModel):
    token: str
    serverUrl: str
    roomName: str


@app.get("/health")
def health():
    return {"status": "ok"}


@app.post(
    "/api/interviews/start",
    response_model=InterviewResponse,
)
async def start_interview(
    payload: InterviewRequest,
    response: Response,
):
    # Local development endpoint.
    # Add your application's user authentication before public deployment.

    room_name = f"interview-{uuid4().hex}"
    identity = f"candidate-{uuid4().hex}"

    token = (
        api.AccessToken(
            LIVEKIT_API_KEY,
            LIVEKIT_API_SECRET,
        )
        .with_identity(identity)
        .with_ttl(timedelta(minutes=10))
        .with_grants(
            api.VideoGrants(
                room_join=True,
                room=room_name,
                can_publish=True,
                can_publish_sources=["microphone"],
                can_subscribe=True,
                can_publish_data=False,
            )
        )
        .to_jwt()
    )

    interview_context = {
        "job_description": payload.job_description,
        "question_count": payload.question_count,
        "participant_identity": identity,
    }

    async with api.LiveKitAPI(
        url=LIVEKIT_URL,
        api_key=LIVEKIT_API_KEY,
        api_secret=LIVEKIT_API_SECRET,
    ) as livekit:
        try:
            await livekit.agent_dispatch.create_dispatch(
                api.CreateAgentDispatchRequest(
                    agent_name=AGENT_NAME,
                    room=room_name,
                    metadata=json.dumps(interview_context),
                )
            )
        except Exception:
            logger.exception("Unable to dispatch interview agent")

            # Best-effort cleanup if the room was partially created.
            try:
                await livekit.room.delete_room(
                    api.DeleteRoomRequest(room=room_name)
                )
            except Exception:
                logger.warning("Room cleanup could not be completed")

            raise HTTPException(
                status_code=502,
                detail="Unable to start the interview. Please try again.",
            ) from None

    response.headers["Cache-Control"] = "no-store"

    return InterviewResponse(
        token=token,
        serverUrl=LIVEKIT_URL,
        roomName=room_name,
    )