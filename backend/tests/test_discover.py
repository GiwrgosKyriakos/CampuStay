"""Backend tests for Discovery: candidates, swipe, matches, user-public.

Covers review-request bullets #2, #3, #4, #5, and #7.
"""
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
def api():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


@pytest.fixture
def fresh_uid():
    # Use a UUID-shaped id (matches what frontend generates for anon users)
    return f"test-{uuid.uuid4().hex}"


# ---- Candidates ----
class TestCandidates:
    def test_candidates_returns_8_demo_users_for_new_user(self, api, fresh_uid):
        r = api.get(f"{BASE_URL}/api/candidates/{fresh_uid}", timeout=15)
        assert r.status_code == 200, r.text
        data = r.json()
        assert "candidates" in data and isinstance(data["candidates"], list)
        names = [c["name"] for c in data["candidates"]]
        # Should include all 8 demo users
        for expected in ["Sofia", "Liam", "Noah", "Emma", "Aisha", "Marco", "Kai", "Lena"]:
            assert expected in names, f"Missing demo candidate {expected}. Got {names}"
        assert len(data["candidates"]) >= 8

    def test_candidate_shape(self, api, fresh_uid):
        r = api.get(f"{BASE_URL}/api/candidates/{fresh_uid}", timeout=15)
        data = r.json()
        c = data["candidates"][0]
        for k in ["id", "name", "age", "gender", "budget", "university", "program", "bio", "tags", "photo"]:
            assert k in c, f"Candidate missing key {k}: {c}"
        assert isinstance(c["tags"], list)
        assert c["photo"] and c["photo"].startswith("http")
        # No mongo _id leak
        assert "_id" not in c

    def test_sofia_is_female_with_photo(self, api, fresh_uid):
        r = api.get(f"{BASE_URL}/api/candidates/{fresh_uid}", timeout=15)
        sofia = next((c for c in r.json()["candidates"] if c["name"] == "Sofia"), None)
        assert sofia is not None
        assert sofia["gender"] == "Female"
        assert sofia["photo"] and sofia["photo"].startswith("http")

    def test_candidates_excludes_self(self, api, fresh_uid):
        # If user's own id equals a demo id, it should be filtered out
        r = api.get(f"{BASE_URL}/api/candidates/demo_1", timeout=15)
        ids = [c["id"] for c in r.json()["candidates"]]
        assert "demo_1" not in ids


# ---- Swipe + Matches ----
class TestSwipeAndMatches:
    def test_right_swipe_persists_but_no_match(self, api, fresh_uid):
        # Right-swipe demo_1 (Sofia)
        r = api.post(
            f"{BASE_URL}/api/swipe",
            json={"user_id": fresh_uid, "target_id": "demo_1", "direction": "right"},
            timeout=15,
        )
        assert r.status_code == 200
        body = r.json()
        assert body["ok"] is True
        # Demo users don't swipe back → no mutual match
        assert body["matched"] is False

        # Now that we swiped Sofia, the next /candidates call should exclude her
        r2 = api.get(f"{BASE_URL}/api/candidates/{fresh_uid}", timeout=15)
        ids = [c["id"] for c in r2.json()["candidates"]]
        assert "demo_1" not in ids

    def test_my_matches_lists_right_swiped_users(self, api, fresh_uid):
        # Right-swipe demo_2 (Liam) and demo_3 (Noah)
        for tid in ("demo_2", "demo_3"):
            api.post(
                f"{BASE_URL}/api/swipe",
                json={"user_id": fresh_uid, "target_id": tid, "direction": "right"},
                timeout=15,
            )
        # Left-swipe demo_4 → must NOT show in matches
        api.post(
            f"{BASE_URL}/api/swipe",
            json={"user_id": fresh_uid, "target_id": "demo_4", "direction": "left"},
            timeout=15,
        )
        r = api.get(f"{BASE_URL}/api/my-matches/{fresh_uid}", timeout=15)
        assert r.status_code == 200
        data = r.json()
        ids = [m["id"] for m in data["matches"]]
        assert "demo_2" in ids and "demo_3" in ids
        assert "demo_4" not in ids

    def test_left_swipe_does_not_appear_in_matches(self, api, fresh_uid):
        api.post(
            f"{BASE_URL}/api/swipe",
            json={"user_id": fresh_uid, "target_id": "demo_5", "direction": "left"},
            timeout=15,
        )
        r = api.get(f"{BASE_URL}/api/my-matches/{fresh_uid}", timeout=15)
        ids = [m["id"] for m in r.json()["matches"]]
        assert "demo_5" not in ids

    def test_empty_state_after_all_swiped(self, api, fresh_uid):
        for tid in ("demo_1", "demo_2", "demo_3", "demo_4", "demo_5", "demo_6", "demo_7", "demo_8"):
            api.post(
                f"{BASE_URL}/api/swipe",
                json={"user_id": fresh_uid, "target_id": tid, "direction": "left"},
                timeout=15,
            )
        r = api.get(f"{BASE_URL}/api/candidates/{fresh_uid}", timeout=15)
        assert r.status_code == 200
        # Only demo users are seeded → after swiping all, list should be empty
        # (unless another test's TEST_ user happened to have a full profile — unlikely)
        cands = r.json()["candidates"]
        demo_ids = {"demo_1", "demo_2", "demo_3", "demo_4", "demo_5", "demo_6", "demo_7", "demo_8"}
        assert not any(c["id"] in demo_ids for c in cands)


# ---- user-public (chat header) ----
class TestUserPublic:
    def test_user_public_for_demo_user(self, api):
        r = api.get(f"{BASE_URL}/api/user-public/demo_1", timeout=15)
        assert r.status_code == 200
        u = r.json()["user"]
        assert u["id"] == "demo_1"
        assert u["name"] == "Sofia"
        assert u["gender"] == "Female"
        assert u["photo"] and u["photo"].startswith("http")
        assert "_id" not in u

    def test_user_public_not_found(self, api):
        r = api.get(f"{BASE_URL}/api/user-public/definitely-not-a-real-user", timeout=15)
        assert r.status_code == 404


# ---- Profile persistence (review bullet #6) ----
class TestProfileForTabIntegration:
    def test_put_then_get_full_profile(self, api, fresh_uid):
        payload = {
            "photos": ["https://example.com/me.jpg"],
            "age": 22,
            "about": "TEST profile",
            "gender": "Female",
            "city": "Berlin",
            "has_place": False,
            "university": "TU Berlin",
            "year_of_study": "MSc CS",
            "budget": 700,
            "move_in": "2026-02-01",
            "instagram": "",
            "facebook": "",
            "linkedin": "",
            "twitter": "",
        }
        put = api.put(f"{BASE_URL}/api/profile/{fresh_uid}", json=payload, timeout=15)
        assert put.status_code == 200
        got = api.get(f"{BASE_URL}/api/profile/{fresh_uid}", timeout=15)
        assert got.status_code == 200
        prof = got.json()["profile"]
        assert prof is not None
        # These are the fields the Profile tab reads
        assert prof["university"] == "TU Berlin"
        assert prof["year_of_study"] == "MSc CS"
        assert prof["gender"] == "Female"
        assert prof["budget"] == 700
        assert prof["photos"] == ["https://example.com/me.jpg"]
        # No _id leak
        assert "_id" not in prof

    def test_get_profile_for_unknown_user_is_null(self, api, fresh_uid):
        r = api.get(f"{BASE_URL}/api/profile/{fresh_uid}", timeout=15)
        assert r.status_code == 200
        assert r.json()["profile"] is None

    def test_match_count_reflects_right_swipes(self, api, fresh_uid):
        # right-swipe 3 demo users
        for tid in ("demo_1", "demo_2", "demo_3"):
            api.post(
                f"{BASE_URL}/api/swipe",
                json={"user_id": fresh_uid, "target_id": tid, "direction": "right"},
                timeout=15,
            )
        r = api.get(f"{BASE_URL}/api/my-matches/{fresh_uid}", timeout=15)
        assert r.status_code == 200
        assert len(r.json()["matches"]) == 3
