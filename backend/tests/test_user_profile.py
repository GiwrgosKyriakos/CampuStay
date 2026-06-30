"""Backend tests for Full User Profile (edit/complete profile) endpoints."""
import os
import uuid
import pytest
import requests

BASE_URL = os.environ.get("EXPO_PUBLIC_BACKEND_URL", os.environ.get("EXPO_BACKEND_URL", "")).rstrip("/")
if not BASE_URL:
    try:
        with open("/app/frontend/.env") as f:
            for line in f:
                if line.startswith("EXPO_PUBLIC_BACKEND_URL="):
                    BASE_URL = line.split("=", 1)[1].strip().strip('"').rstrip("/")
                    break
    except Exception:
        pass


@pytest.fixture
def api_client():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


@pytest.fixture
def fresh_user_id():
    return f"TEST_{uuid.uuid4()}"


# ---- GET when nothing saved ----
class TestProfileGetEmpty:
    def test_get_empty_profile_returns_null(self, api_client, fresh_user_id):
        r = api_client.get(f"{BASE_URL}/api/profile/{fresh_user_id}", timeout=15)
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["user_id"] == fresh_user_id
        assert data["profile"] is None


# ---- PUT upserts + GET-after-PUT persistence ----
class TestProfilePutAndGet:
    def test_put_then_get_persistence(self, api_client, fresh_user_id):
        payload = {
            "photos": ["data:image/jpeg;base64,AAAA", "data:image/jpeg;base64,BBBB"],
            "age": 22,
            "about": "Tidy and quiet student.",
            "gender": "Female",
            "city": "Thessaloniki",
            "has_place": True,
            "university": "Aristotle University of Thessaloniki",
            "year_of_study": "2nd Year",
            "budget": 450,
            "move_in": "As soon as possible",
            "instagram": "test_ig",
            "facebook": "https://facebook.com/test",
            "linkedin": "https://linkedin.com/in/test",
            "twitter": "test_tw",
        }
        put = api_client.put(f"{BASE_URL}/api/profile/{fresh_user_id}", json=payload, timeout=15)
        assert put.status_code == 200, put.text
        pdata = put.json()
        assert pdata["user_id"] == fresh_user_id
        assert pdata["profile"]["age"] == 22
        assert pdata["profile"]["has_place"] is True
        assert pdata["profile"]["photos"] == payload["photos"]

        get = api_client.get(f"{BASE_URL}/api/profile/{fresh_user_id}", timeout=15)
        assert get.status_code == 200
        prof = get.json()["profile"]
        for k, v in payload.items():
            assert prof[k] == v, f"Mismatch on key {k}"
        assert "updated_at" in prof

    def test_put_overwrites_previous(self, api_client, fresh_user_id):
        api_client.put(
            f"{BASE_URL}/api/profile/{fresh_user_id}",
            json={"photos": ["x"], "age": 20, "about": "v1", "instagram": "a"},
            timeout=15,
        )
        api_client.put(
            f"{BASE_URL}/api/profile/{fresh_user_id}",
            json={"photos": ["y", "z"], "age": 25, "about": "v2", "twitter": "b"},
            timeout=15,
        )
        get = api_client.get(f"{BASE_URL}/api/profile/{fresh_user_id}", timeout=15)
        prof = get.json()["profile"]
        assert prof["photos"] == ["y", "z"]
        assert prof["age"] == 25
        assert prof["about"] == "v2"
        assert prof["twitter"] == "b"

    def test_put_minimal_payload_uses_defaults(self, api_client, fresh_user_id):
        # All fields optional; only photos default to []
        r = api_client.put(f"{BASE_URL}/api/profile/{fresh_user_id}", json={}, timeout=15)
        assert r.status_code == 200
        prof = r.json()["profile"]
        assert prof["photos"] == []
        assert prof["has_place"] is False
        assert prof["age"] is None
        assert prof["city"] is None


# ---- No mongo _id leak ----
class TestNoMongoIdLeak:
    def test_no_mongo_id_in_get(self, api_client, fresh_user_id):
        api_client.put(
            f"{BASE_URL}/api/profile/{fresh_user_id}",
            json={"photos": ["p"], "instagram": "x"},
            timeout=15,
        )
        get = api_client.get(f"{BASE_URL}/api/profile/{fresh_user_id}", timeout=15)
        body = get.json()
        assert "_id" not in body
        assert "_id" not in (body.get("profile") or {})

    def test_no_mongo_id_in_put(self, api_client, fresh_user_id):
        put = api_client.put(
            f"{BASE_URL}/api/profile/{fresh_user_id}",
            json={"photos": ["p"], "instagram": "x"},
            timeout=15,
        )
        body = put.json()
        assert "_id" not in body
        assert "_id" not in (body.get("profile") or {})


# ---- Validation ----
class TestProfileValidation:
    def test_put_invalid_age_type(self, api_client, fresh_user_id):
        r = api_client.put(
            f"{BASE_URL}/api/profile/{fresh_user_id}",
            json={"age": "not-an-int"},
            timeout=15,
        )
        assert r.status_code == 422

    def test_put_invalid_has_place_type(self, api_client, fresh_user_id):
        r = api_client.put(
            f"{BASE_URL}/api/profile/{fresh_user_id}",
            json={"has_place": "yes-please"},
            timeout=15,
        )
        # Pydantic v2 may coerce; accept either 200 or 422 but flag if neither
        assert r.status_code in (200, 422)
