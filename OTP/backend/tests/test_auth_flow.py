from fastapi.testclient import TestClient
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))
import main


def test_register_and_verify_user(monkeypatch):
    monkeypatch.setattr(main, "send_registration_otp", lambda email, otp: None)

    with TestClient(main.app) as client:
        email = "newuser1@example.com"
        password = "StrongPass@123"

        register_resp = client.post(
            "/api/auth/register",
            json={"email": email, "password": password},
        )
        assert register_resp.status_code == 200, register_resp.text
        payload = register_resp.json()
        assert payload["success"] is True
        assert "OTP" in payload["message"]

        otp_resp = client.post(
            "/api/auth/verify-registration-otp",
            json={"email": email, "otp": payload["otp"]},
        )
        assert otp_resp.status_code == 200, otp_resp.text
        assert otp_resp.json()["success"] is True


def test_login_for_verified_account(monkeypatch):
    monkeypatch.setattr(main, "send_registration_otp", lambda email, otp: None)

    with TestClient(main.app) as client:
        email = "newuser2@example.com"
        password = "StrongPass@123"

        reg = client.post(
            "/api/auth/register",
            json={"email": email, "password": password},
        )
        assert reg.status_code == 200, reg.text
        otp = reg.json()["otp"]

        verify = client.post(
            "/api/auth/verify-registration-otp",
            json={"email": email, "otp": otp},
        )
        assert verify.status_code == 200, verify.text

        login = client.post(
            "/api/auth/login",
            json={"email": email, "password": password},
        )
        assert login.status_code == 200, login.text
        data = login.json()
        assert data["success"] is True
        assert "access_token" in data
