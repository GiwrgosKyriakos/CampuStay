"""Backend tests for Authentication endpoints (email/password + Google session validation + /me)."""
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
def fresh_email():
    return f"TEST_{uuid.uuid4().hex[:12]}@example.com"


# ---- Register ----
class TestAuthRegister:
    def test_register_success_returns_token_and_user(self, api_client, fresh_email):
        r = api_client.post(
            f"{BASE_URL}/api/auth/register",
            json={"email": fresh_email, "password": "secret123"},
            timeout=15,
        )
        assert r.status_code == 200, r.text
        data = r.json()
        assert "token" in data and isinstance(data["token"], str) and len(data["token"]) > 10
        assert "user" in data
        u = data["user"]
        assert u["email"] == fresh_email.lower()
        assert u["user_id"].startswith("user_")
        assert u.get("name")  # default derives from email prefix

    def test_register_duplicate_email_returns_400(self, api_client, fresh_email):
        api_client.post(
            f"{BASE_URL}/api/auth/register",
            json={"email": fresh_email, "password": "secret123"},
            timeout=15,
        )
        r = api_client.post(
            f"{BASE_URL}/api/auth/register",
            json={"email": fresh_email, "password": "secret123"},
            timeout=15,
        )
        assert r.status_code == 400
        assert "already" in r.json()["detail"].lower()

    def test_register_short_password_returns_400(self, api_client, fresh_email):
        r = api_client.post(
            f"{BASE_URL}/api/auth/register",
            json={"email": fresh_email, "password": "abc"},
            timeout=15,
        )
        assert r.status_code == 400
        assert "6 characters" in r.json()["detail"]

    def test_register_invalid_email_returns_422(self, api_client):
        r = api_client.post(
            f"{BASE_URL}/api/auth/register",
            json={"email": "not-an-email", "password": "secret123"},
            timeout=15,
        )
        assert r.status_code == 422


# ---- Login ----
class TestAuthLogin:
    def test_login_success_after_register(self, api_client, fresh_email):
        api_client.post(
            f"{BASE_URL}/api/auth/register",
            json={"email": fresh_email, "password": "secret123"},
            timeout=15,
        )
        r = api_client.post(
            f"{BASE_URL}/api/auth/login",
            json={"email": fresh_email, "password": "secret123"},
            timeout=15,
        )
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["token"]
        assert data["user"]["email"] == fresh_email.lower()

    def test_login_wrong_password_returns_401(self, api_client, fresh_email):
        api_client.post(
            f"{BASE_URL}/api/auth/register",
            json={"email": fresh_email, "password": "secret123"},
            timeout=15,
        )
        r = api_client.post(
            f"{BASE_URL}/api/auth/login",
            json={"email": fresh_email, "password": "WRONG_password"},
            timeout=15,
        )
        assert r.status_code == 401
        assert "invalid" in r.json()["detail"].lower()

    def test_login_unknown_email_returns_401(self, api_client):
        r = api_client.post(
            f"{BASE_URL}/api/auth/login",
            json={"email": f"nobody_{uuid.uuid4().hex}@example.com", "password": "whatever123"},
            timeout=15,
        )
        assert r.status_code == 401


# ---- /auth/me ----
class TestAuthMe:
    def test_me_without_token_returns_401(self, api_client):
        r = api_client.get(f"{BASE_URL}/api/auth/me", timeout=15)
        assert r.status_code == 401

    def test_me_with_invalid_token_returns_401(self, api_client):
        r = api_client.get(
            f"{BASE_URL}/api/auth/me",
            headers={"Authorization": "Bearer not-a-real-token"},
            timeout=15,
        )
        assert r.status_code == 401

    def test_me_with_bearer_returns_user(self, api_client, fresh_email):
        reg = api_client.post(
            f"{BASE_URL}/api/auth/register",
            json={"email": fresh_email, "password": "secret123"},
            timeout=15,
        )
        token = reg.json()["token"]
        r = api_client.get(
            f"{BASE_URL}/api/auth/me",
            headers={"Authorization": f"Bearer {token}"},
            timeout=15,
        )
        assert r.status_code == 200
        u = r.json()["user"]
        assert u["email"] == fresh_email.lower()
        assert u["user_id"].startswith("user_")
        assert "password_hash" not in u  # no secret leak


# ---- Google session (validates Emergent session-id error path only; no live token) ----
class TestAuthGoogle:
    def test_google_invalid_session_returns_401(self, api_client):
        r = api_client.post(
            f"{BASE_URL}/api/auth/google",
            json={"session_id": "definitely-invalid-session-id"},
            timeout=20,
        )
        assert r.status_code == 401


# ---- Logout ----
class TestAuthLogout:
    def test_logout_invalidates_token(self, api_client, fresh_email):
        reg = api_client.post(
            f"{BASE_URL}/api/auth/register",
            json={"email": fresh_email, "password": "secret123"},
            timeout=15,
        )
        token = reg.json()["token"]
        r = api_client.post(
            f"{BASE_URL}/api/auth/logout",
            headers={"Authorization": f"Bearer {token}"},
            timeout=15,
        )
        assert r.status_code == 200
        # /me must now fail
        me = api_client.get(
            f"{BASE_URL}/api/auth/me",
            headers={"Authorization": f"Bearer {token}"},
            timeout=15,
        )
        assert me.status_code == 401
