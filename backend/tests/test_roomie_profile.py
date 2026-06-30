"""Backend tests for Roomie Profile (quiz) endpoints."""
import os
import uuid
import pytest
import requests

BASE_URL = os.environ.get("EXPO_PUBLIC_BACKEND_URL", os.environ.get("EXPO_BACKEND_URL", "")).rstrip("/")
if not BASE_URL:
    # fall back to frontend/.env if not exported
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


class TestRoomieProfileGetEmpty:
    """GET returns empty answers when no profile saved"""

    def test_get_empty_profile(self, api_client, fresh_user_id):
        r = api_client.get(f"{BASE_URL}/api/roomie-profile/{fresh_user_id}", timeout=15)
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["user_id"] == fresh_user_id
        assert data["answers"] == {}
        assert data["updated_at"] is None


class TestRoomieProfilePutAndGet:
    """PUT upserts answers and GET returns persisted data"""

    def test_put_then_get_persistence(self, api_client, fresh_user_id):
        payload = {"answers": {"q1": 0, "q2": 1, "q3": 2, "q15": 0}}
        put = api_client.put(
            f"{BASE_URL}/api/roomie-profile/{fresh_user_id}", json=payload, timeout=15
        )
        assert put.status_code == 200, put.text
        pdata = put.json()
        assert pdata["user_id"] == fresh_user_id
        assert pdata["answers"] == payload["answers"]
        assert pdata["updated_at"] is not None

        get = api_client.get(f"{BASE_URL}/api/roomie-profile/{fresh_user_id}", timeout=15)
        assert get.status_code == 200
        gdata = get.json()
        assert gdata["answers"] == payload["answers"]
        assert gdata["updated_at"] == pdata["updated_at"]

    def test_put_overwrites_previous_answers(self, api_client, fresh_user_id):
        # initial
        api_client.put(
            f"{BASE_URL}/api/roomie-profile/{fresh_user_id}",
            json={"answers": {"q1": 0, "q2": 0}},
            timeout=15,
        )
        # update
        new_payload = {"answers": {"q1": 2, "q5": 1}}
        r = api_client.put(
            f"{BASE_URL}/api/roomie-profile/{fresh_user_id}", json=new_payload, timeout=15
        )
        assert r.status_code == 200
        get = api_client.get(f"{BASE_URL}/api/roomie-profile/{fresh_user_id}", timeout=15)
        assert get.json()["answers"] == new_payload["answers"]

    def test_full_15_answers(self, api_client, fresh_user_id):
        answers = {f"q{i}": (i % 3) for i in range(1, 16)}
        r = api_client.put(
            f"{BASE_URL}/api/roomie-profile/{fresh_user_id}",
            json={"answers": answers},
            timeout=15,
        )
        assert r.status_code == 200
        get = api_client.get(f"{BASE_URL}/api/roomie-profile/{fresh_user_id}", timeout=15)
        assert get.json()["answers"] == answers


class TestRoomieProfileValidation:
    """Validation errors for malformed payloads"""

    def test_put_missing_answers_field(self, api_client, fresh_user_id):
        r = api_client.put(
            f"{BASE_URL}/api/roomie-profile/{fresh_user_id}", json={}, timeout=15
        )
        assert r.status_code == 422

    def test_put_invalid_answer_type(self, api_client, fresh_user_id):
        r = api_client.put(
            f"{BASE_URL}/api/roomie-profile/{fresh_user_id}",
            json={"answers": {"q1": "not-an-int"}},
            timeout=15,
        )
        assert r.status_code == 422

    def test_put_empty_answers_ok(self, api_client, fresh_user_id):
        r = api_client.put(
            f"{BASE_URL}/api/roomie-profile/{fresh_user_id}",
            json={"answers": {}},
            timeout=15,
        )
        assert r.status_code == 200
        assert r.json()["answers"] == {}


class TestRoomieProfileNoMongoId:
    """Ensure mongo _id is not exposed"""

    def test_no_mongo_id_in_response(self, api_client, fresh_user_id):
        api_client.put(
            f"{BASE_URL}/api/roomie-profile/{fresh_user_id}",
            json={"answers": {"q1": 1}},
            timeout=15,
        )
        get = api_client.get(f"{BASE_URL}/api/roomie-profile/{fresh_user_id}", timeout=15)
        body = get.json()
        assert "_id" not in body
