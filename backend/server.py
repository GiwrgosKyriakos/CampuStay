from fastapi import FastAPI, APIRouter, Header, HTTPException, Depends
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
import secrets
import httpx
from pathlib import Path
from passlib.context import CryptContext
from pydantic import BaseModel, Field, EmailStr
from typing import List, Dict, Optional
import uuid
from datetime import datetime, timezone, timedelta


ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# MongoDB connection
mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

# Create the main app without a prefix
app = FastAPI()

# Create a router with the /api prefix
api_router = APIRouter(prefix="/api")


# Define Models
class StatusCheck(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    client_name: str
    timestamp: datetime = Field(default_factory=datetime.utcnow)

class StatusCheckCreate(BaseModel):
    client_name: str

# Add your routes to the router instead of directly to app
@api_router.get("/")
async def root():
    return {"message": "Hello World"}

@api_router.post("/status", response_model=StatusCheck)
async def create_status_check(input: StatusCheckCreate):
    status_dict = input.dict()
    status_obj = StatusCheck(**status_dict)
    _ = await db.status_checks.insert_one(status_obj.dict())
    return status_obj

@api_router.get("/status", response_model=List[StatusCheck])
async def get_status_checks():
    status_checks = await db.status_checks.find().to_list(1000)
    return [StatusCheck(**status_check) for status_check in status_checks]


# ---- Roomie Compatibility Profile (quiz) ----
class RoomieProfileIn(BaseModel):
    answers: Dict[str, int]


@api_router.get("/roomie-profile/{user_id}")
async def get_roomie_profile(user_id: str):
    doc = await db.roomie_profiles.find_one({"user_id": user_id})
    if not doc:
        return {"user_id": user_id, "answers": {}, "updated_at": None}
    return {
        "user_id": user_id,
        "answers": doc.get("answers", {}),
        "updated_at": doc.get("updated_at"),
    }


@api_router.put("/roomie-profile/{user_id}")
async def save_roomie_profile(user_id: str, payload: RoomieProfileIn):
    now = datetime.now(timezone.utc).isoformat()
    await db.roomie_profiles.update_one(
        {"user_id": user_id},
        {
            "$set": {"answers": payload.answers, "updated_at": now},
            "$setOnInsert": {"user_id": user_id},
        },
        upsert=True,
    )
    return {"user_id": user_id, "answers": payload.answers, "updated_at": now}


# ---- Full User Profile (edit/complete profile) ----
class FullProfileIn(BaseModel):
    photos: List[str] = []
    age: Optional[int] = None
    about: Optional[str] = None
    gender: Optional[str] = None
    city: Optional[str] = None
    has_place: bool = False
    university: Optional[str] = None
    year_of_study: Optional[str] = None
    budget: Optional[int] = None
    move_in: Optional[str] = None
    instagram: Optional[str] = None
    facebook: Optional[str] = None
    linkedin: Optional[str] = None
    twitter: Optional[str] = None


@api_router.get("/profile/{user_id}")
async def get_user_profile(user_id: str):
    doc = await db.user_profiles.find_one({"user_id": user_id})
    if not doc:
        return {"user_id": user_id, "profile": None}
    doc.pop("_id", None)
    return {"user_id": user_id, "profile": doc}


@api_router.put("/profile/{user_id}")
async def save_user_profile(user_id: str, payload: FullProfileIn):
    now = datetime.now(timezone.utc).isoformat()
    data = payload.dict()
    data["updated_at"] = now
    await db.user_profiles.update_one(
        {"user_id": user_id},
        {"$set": data, "$setOnInsert": {"user_id": user_id}},
        upsert=True,
    )
    return {"user_id": user_id, "profile": {**data, "user_id": user_id}}


class BlockedProfile(BaseModel):
    id: str
    name: str


class NotificationPreferences(BaseModel):
    new_matches: bool = True
    direct_messages: bool = True
    app_updates_and_tips: bool = True


class PrivacyPreferences(BaseModel):
    is_visible: bool = True
    blocked_profiles: List[BlockedProfile] = Field(default_factory=list)


class UserSettingsIn(BaseModel):
    notifications: Optional[NotificationPreferences] = None
    privacy: Optional[PrivacyPreferences] = None


class DeleteAccountBody(BaseModel):
    credential: str


@api_router.get("/user-settings/{user_id}")
async def get_user_settings(user_id: str):
    doc = await db.user_settings.find_one({"user_id": user_id})
    if not doc:
        return {
            "user_id": user_id,
            "notifications": {
                "new_matches": True,
                "direct_messages": True,
                "app_updates_and_tips": True,
            },
            "privacy": {
                "is_visible": True,
                "blocked_profiles": [],
            },
        }
    doc.pop("_id", None)
    return doc


@api_router.put("/user-settings/{user_id}")
async def save_user_settings(user_id: str, payload: UserSettingsIn):
    data: Dict[str, object] = {"user_id": user_id}
    update_data: Dict[str, object] = {}
    if payload.notifications is not None:
        update_data["notifications"] = payload.notifications.dict()
    if payload.privacy is not None:
        update_data["privacy"] = payload.privacy.dict()
    if update_data:
        await db.user_settings.update_one(
            {"user_id": user_id},
            {"$set": update_data, "$setOnInsert": {"user_id": user_id}},
            upsert=True,
        )
    doc = await db.user_settings.find_one({"user_id": user_id})
    if not doc:
        doc = {
            "user_id": user_id,
            "notifications": {
                "new_matches": True,
                "direct_messages": True,
                "app_updates_and_tips": True,
            },
            "privacy": {
                "is_visible": True,
                "blocked_profiles": [],
            },
        }
    doc.pop("_id", None)
    return doc


@api_router.delete("/delete-account/{user_id}")
async def delete_account(user_id: str, payload: DeleteAccountBody):
    # Remove all account-related documents from the database.
    await db.user_profiles.delete_one({"user_id": user_id})
    await db.roomie_profiles.delete_one({"user_id": user_id})
    await db.user_settings.delete_one({"user_id": user_id})
    return {"deleted": True}


# ---- Authentication (Emergent Google + email/password sessions) ----
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
SESSION_DAYS = 7
EMERGENT_SESSION_URL = "https://demobackend.emergentagent.com/auth/v1/env/oauth/session-data"


def _new_user_id() -> str:
    return f"user_{uuid.uuid4().hex[:12]}"


def _public_user(user: dict) -> dict:
    return {
        "user_id": user["user_id"],
        "email": user.get("email"),
        "name": user.get("name"),
        "picture": user.get("picture"),
    }


async def _create_session(user_id: str) -> str:
    token = secrets.token_urlsafe(32)
    now = datetime.now(timezone.utc)
    await db.user_sessions.insert_one({
        "session_token": token,
        "user_id": user_id,
        "created_at": now.isoformat(),
        "expires_at": (now + timedelta(days=SESSION_DAYS)).isoformat(),
    })
    return token


async def get_current_user(authorization: Optional[str] = Header(None)):
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Missing token")
    token = authorization.split(" ", 1)[1]
    sess = await db.user_sessions.find_one({"session_token": token})
    if not sess:
        raise HTTPException(status_code=401, detail="Invalid session")
    exp = sess.get("expires_at")
    try:
        exp_dt = datetime.fromisoformat(exp)
        if exp_dt.tzinfo is None:
            exp_dt = exp_dt.replace(tzinfo=timezone.utc)
        if exp_dt < datetime.now(timezone.utc):
            raise HTTPException(status_code=401, detail="Session expired")
    except (TypeError, ValueError):
        pass
    user = await db.users.find_one({"user_id": sess["user_id"]}, {"_id": 0})
    if not user:
        raise HTTPException(status_code=401, detail="User not found")
    return user


class RegisterIn(BaseModel):
    email: EmailStr
    password: str
    name: Optional[str] = None


class LoginIn(BaseModel):
    email: EmailStr
    password: str


class GoogleIn(BaseModel):
    session_id: str


@api_router.post("/auth/register")
async def auth_register(body: RegisterIn):
    email = body.email.lower()
    if await db.users.find_one({"email": email}):
        raise HTTPException(status_code=400, detail="Email already registered")
    if len(body.password) < 6:
        raise HTTPException(status_code=400, detail="Password must be at least 6 characters")
    user = {
        "user_id": _new_user_id(),
        "email": email,
        "name": body.name or email.split("@")[0],
        "picture": None,
        "password_hash": pwd_context.hash(body.password),
        "provider": "email",
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.users.insert_one(user)
    token = await _create_session(user["user_id"])
    return {"token": token, "user": _public_user(user)}


@api_router.post("/auth/login")
async def auth_login(body: LoginIn):
    user = await db.users.find_one({"email": body.email.lower()})
    if not user or not user.get("password_hash") or not pwd_context.verify(body.password, user["password_hash"]):
        raise HTTPException(status_code=401, detail="Invalid email or password")
    token = await _create_session(user["user_id"])
    return {"token": token, "user": _public_user(user)}


@api_router.post("/auth/google")
async def auth_google(body: GoogleIn):
    async with httpx.AsyncClient(timeout=15) as cx:
        r = await cx.get(EMERGENT_SESSION_URL, headers={"X-Session-ID": body.session_id})
    if r.status_code != 200:
        raise HTTPException(status_code=401, detail="Invalid Google session")
    data = r.json()
    email = (data.get("email") or "").lower()
    if not email:
        raise HTTPException(status_code=401, detail="No email from provider")
    user = await db.users.find_one({"email": email})
    if not user:
        user = {
            "user_id": _new_user_id(),
            "email": email,
            "name": data.get("name"),
            "picture": data.get("picture"),
            "provider": "google",
            "created_at": datetime.now(timezone.utc).isoformat(),
        }
        await db.users.insert_one(user)
    else:
        await db.users.update_one(
            {"email": email},
            {"$set": {"name": data.get("name"), "picture": data.get("picture")}},
        )
    token = data.get("session_token") or secrets.token_urlsafe(32)
    now = datetime.now(timezone.utc)
    await db.user_sessions.update_one(
        {"session_token": token},
        {"$set": {
            "session_token": token,
            "user_id": user["user_id"],
            "created_at": now.isoformat(),
            "expires_at": (now + timedelta(days=SESSION_DAYS)).isoformat(),
        }},
        upsert=True,
    )
    return {"token": token, "user": _public_user(user)}


@api_router.get("/auth/me")
async def auth_me(user=Depends(get_current_user)):
    return {"user": _public_user(user)}


@api_router.post("/auth/logout")
async def auth_logout(authorization: Optional[str] = Header(None)):
    if authorization and authorization.startswith("Bearer "):
        token = authorization.split(" ", 1)[1]
        await db.user_sessions.delete_one({"session_token": token})
    return {"ok": True}


# Include the router in the main app
app.include_router(api_router)
app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
