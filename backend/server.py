from fastapi import FastAPI, APIRouter
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
from pathlib import Path
from pydantic import BaseModel, Field
from typing import List, Dict, Optional
import uuid
from datetime import datetime, timezone


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
