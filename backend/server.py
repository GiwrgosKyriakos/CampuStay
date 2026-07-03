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
    name: Optional[str] = None
    photos: List[str] = []
    age: Optional[int] = None
    about: Optional[str] = None
    gender: Optional[str] = None
    city: Optional[str] = None
    has_place: bool = False
    looking_for_apartment: bool = False
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


# ---- Discovery: backend-driven roommate deck + swipes/matches ----
def build_candidate(user: dict, profile: dict) -> dict:
    photos = profile.get("photos") or []
    photo = photos[0] if photos else (user.get("picture") or profile.get("photo"))
    program = profile.get("program") or profile.get("year_of_study") or "Student"
    email = user.get("email") or "roomie@app"
    return {
        "id": user["user_id"],
        "name": user.get("name") or email.split("@")[0],
        "age": profile.get("age") or 20,
        "gender": profile.get("gender") or "Prefer Not To Say",
        "budget": profile.get("budget") or 0,
        "university": profile.get("university") or "",
        "program": program,
        "bio": profile.get("about") or "",
        "tags": profile.get("tags") or [],
        "photo": photo,
    }


DEMO_CANDIDATES = [
    {"id": "demo_1", "email": "sofia@demo.roomie", "name": "Sofia", "age": 22, "gender": "Female", "budget": 650, "university": "TU Berlin", "program": "MSc Architecture", "bio": "Early riser, plant mom, makes a mean pasta. Looking for a chill, tidy flatmate.", "tags": ["Non-smoker", "Pet-friendly", "Early bird"], "photo": "https://images.unsplash.com/photo-1438761681033-6461ffad8d80?crop=entropy&cs=srgb&fm=jpg&w=800&q=80"},
    {"id": "demo_2", "email": "liam@demo.roomie", "name": "Liam", "age": 24, "gender": "Male", "budget": 800, "university": "LMU Munich", "program": "PhD Physics", "bio": "Coffee-fueled researcher. Quiet weekdays, board games on weekends.", "tags": ["Non-smoker", "Quiet", "Gamer"], "photo": "https://images.unsplash.com/photo-1500648767791-00dcc994a43e?crop=entropy&cs=srgb&fm=jpg&w=800&q=80"},
    {"id": "demo_3", "email": "noah@demo.roomie", "name": "Noah", "age": 21, "gender": "Male", "budget": 550, "university": "RWTH Aachen", "program": "BSc Computer Science", "bio": "Into climbing, lo-fi beats, and late-night coding. Easy to live with.", "tags": ["Sporty", "Night owl", "Vegetarian"], "photo": "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?crop=entropy&cs=srgb&fm=jpg&w=800&q=80"},
    {"id": "demo_4", "email": "emma@demo.roomie", "name": "Emma", "age": 23, "gender": "Female", "budget": 720, "university": "Uni Heidelberg", "program": "MA Psychology", "bio": "Loves Sunday brunches, yoga, and a clean kitchen. Good vibes only.", "tags": ["Non-smoker", "Tidy", "Yoga"], "photo": "https://images.unsplash.com/photo-1494790108377-be9c29b29330?crop=entropy&cs=srgb&fm=jpg&w=800&q=80"},
    {"id": "demo_5", "email": "aisha@demo.roomie", "name": "Aisha", "age": 20, "gender": "Female", "budget": 600, "university": "Uni Hamburg", "program": "BA Media Studies", "bio": "Film nerd & weekend baker. I'll share the cookies if you share the remote.", "tags": ["Foodie", "Creative", "Social"], "photo": "https://images.unsplash.com/photo-1544005313-94ddf0286df2?crop=entropy&cs=srgb&fm=jpg&w=800&q=80"},
    {"id": "demo_6", "email": "marco@demo.roomie", "name": "Marco", "age": 25, "gender": "Male", "budget": 900, "university": "ETH Zürich", "program": "MSc Mechanical Eng.", "bio": "Cyclist, cook, and casual guitar player. Respect for shared spaces is key.", "tags": ["Sporty", "Tidy", "Musician"], "photo": "https://images.unsplash.com/photo-1519085360753-af0119f7cbe7?crop=entropy&cs=srgb&fm=jpg&w=800&q=80"},
    {"id": "demo_7", "email": "kai@demo.roomie", "name": "Kai", "age": 22, "gender": "Non-binary", "budget": 680, "university": "Uni Köln", "program": "MA Sociology", "bio": "Big on community dinners and houseplants. Calm, friendly, and reliable.", "tags": ["Pet-friendly", "Plant lover", "Calm"], "photo": "https://images.unsplash.com/photo-1531123897727-8f129e1688ce?crop=entropy&cs=srgb&fm=jpg&w=800&q=80"},
    {"id": "demo_8", "email": "lena@demo.roomie", "name": "Lena", "age": 24, "gender": "Female", "budget": 750, "university": "FU Berlin", "program": "PhD Biology", "bio": "Lab by day, vinyl & wine by night. Looking for a long-term, drama-free home.", "tags": ["Non-smoker", "Music", "Quiet"], "photo": "https://images.unsplash.com/photo-1534528741775-53994a69daeb?crop=entropy&cs=srgb&fm=jpg&w=800&q=80"},
]


async def seed_demo_users():
    for c in DEMO_CANDIDATES:
        uid = c["id"]
        await db.users.update_one(
            {"user_id": uid},
            {"$set": {"user_id": uid, "email": c["email"], "name": c["name"], "picture": None, "provider": "demo"}},
            upsert=True,
        )
        await db.user_profiles.update_one(
            {"user_id": uid},
            {"$set": {
                "user_id": uid, "age": c["age"], "gender": c["gender"], "budget": c["budget"],
                "university": c["university"], "program": c["program"], "about": c["bio"],
                "tags": c["tags"], "photos": [c["photo"]], "has_place": False,
            }},
            upsert=True,
        )


class SwipeIn(BaseModel):
    user_id: str
    target_id: str
    direction: str


@api_router.get("/candidates/{user_id}")
async def get_candidates(user_id: str):
    swiped = set()
    async for s in db.swipes.find({"user_id": user_id}, {"target_id": 1}):
        swiped.add(s["target_id"])
    out = []
    async for p in db.user_profiles.find({
        "age": {"$ne": None}, "gender": {"$ne": None}, "photos.0": {"$exists": True},
    }):
        uid = p.get("user_id")
        if not uid or uid == user_id or uid in swiped:
            continue
        u = await db.users.find_one({"user_id": uid})
        if not u:
            continue
        out.append(build_candidate(u, p))
    return {"candidates": out}


@api_router.post("/swipe")
async def swipe(body: SwipeIn):
    now = datetime.now(timezone.utc).isoformat()
    await db.swipes.update_one(
        {"user_id": body.user_id, "target_id": body.target_id},
        {"$set": {"user_id": body.user_id, "target_id": body.target_id, "direction": body.direction, "created_at": now}},
        upsert=True,
    )
    matched = False
    if body.direction == "right":
        rev = await db.swipes.find_one({"user_id": body.target_id, "target_id": body.user_id, "direction": "right"})
        matched = rev is not None
    return {"ok": True, "matched": matched}


@api_router.get("/my-matches/{user_id}")
async def my_matches(user_id: str):
    out = []
    async for s in db.swipes.find({"user_id": user_id, "direction": "right"}).sort("created_at", -1):
        uid = s["target_id"]
        u = await db.users.find_one({"user_id": uid})
        p = await db.user_profiles.find_one({"user_id": uid})
        if u and p:
            out.append(build_candidate(u, p))
    return {"matches": out}


@api_router.get("/user-public/{user_id}")
async def user_public(user_id: str):
    u = await db.users.find_one({"user_id": user_id})
    p = await db.user_profiles.find_one({"user_id": user_id})
    if not u or not p:
        raise HTTPException(status_code=404, detail="Not found")
    return {"user": build_candidate(u, p)}


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

@app.on_event("startup")
async def _startup_seed():
    try:
        await seed_demo_users()
        logger.info("Demo roommate candidates seeded.")
    except Exception as e:
        logger.warning(f"Demo seed failed: {e}")


@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
