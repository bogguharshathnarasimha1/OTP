import hashlib
import os
import re
from datetime import datetime, timedelta, timezone
from typing import Annotated, Generator

import jwt
from dotenv import load_dotenv
from fastapi import Depends, FastAPI, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from pydantic import BaseModel, ConfigDict, EmailStr, field_validator
from sqlalchemy.orm import Session

from database import SessionLocal, init_db
from models import OtpRecord, User
from services import create_otp_expiry, generate_otp, hash_value, send_registration_otp

load_dotenv()

SECRET_KEY = os.getenv("SECRET_KEY", "change-this-to-a-strong-random-secret")
ALGORITHM = os.getenv("ALGORITHM", "HS256")
ACCESS_TOKEN_EXPIRE_MINUTES = int(os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES", "60"))

app = FastAPI(title="OTP Authentication API")
init_db()
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

security = HTTPBearer(auto_error=False)


def get_db() -> Generator[Session, None, None]:
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


@app.on_event("startup")
def startup_event() -> None:
    init_db()


class AuthRegisterRequest(BaseModel):
    email: EmailStr
    password: str
    full_name: str | None = None

    @field_validator("password")
    @classmethod
    def validate_password_strength(cls, value: str) -> str:
        pattern = re.compile(r"^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{8,}$")
        if not pattern.match(value):
            raise ValueError("Password is weak. Use at least 8 characters, including uppercase, lowercase, number, and special character.")
        return value


class AuthLoginRequest(BaseModel):
    email: EmailStr
    password: str


class VerifyOtpRequest(BaseModel):
    email: EmailStr
    otp: str


class TokenPayload(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    email: str


@app.get("/api/health")
def health() -> dict:
    return {"status": "ok"}


def hash_password(password: str) -> str:
    salt = os.urandom(16)
    derived = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt, 100_000)
    return f"pbkdf2_sha256$100000${salt.hex()}${derived.hex()}"


def verify_password(password: str, password_hash: str) -> bool:
    try:
        algorithm, iterations, salt_hex, hash_hex = password_hash.split("$")
        if algorithm != "pbkdf2_sha256":
            return False
        salt = bytes.fromhex(salt_hex)
        derived = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt, int(iterations))
        return derived.hex() == hash_hex
    except (ValueError, TypeError):
        return False


def create_access_token(email: str) -> str:
    payload = {"sub": email, "exp": datetime.now(timezone.utc) + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)}
    return jwt.encode(payload, SECRET_KEY, algorithm=ALGORITHM)


def get_current_user(
    credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(security)],
    db: Session = Depends(get_db),
) -> User:
    if not credentials:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Authentication required")

    token = credentials.credentials
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        email = payload.get("sub")
        if not email:
            raise ValueError("Missing user email")
    except jwt.PyJWTError as exc:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid or expired token") from exc

    user = db.query(User).filter(User.email == email).first()
    if not user:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User not found")
    return user


@app.post("/api/auth/register")
def register_user(payload: AuthRegisterRequest, db: Session = Depends(get_db)) -> dict:
    email = payload.email.lower().strip()
    password = payload.password.strip()

    existing = db.query(User).filter(User.email == email).first()
    if existing:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Account already exists. Please log in.")

    user = User(
        email=email,
        full_name=payload.full_name.strip() if payload.full_name else None,
        password_hash=hash_password(password),
        is_verified=True,
    )
    db.add(user)
    db.commit()
    db.refresh(user)

    return {"success": True, "message": "Registration successful. You can now log in.", "user": {"email": user.email}}


@app.post("/api/auth/verify-registration-otp")
def verify_registration_otp(payload: VerifyOtpRequest, db: Session = Depends(get_db)) -> dict:
    email = payload.email.lower().strip()
    otp = payload.otp.strip()

    user = db.query(User).filter(User.email == email).first()
    if not user:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Account not registered")

    otp_record = db.query(OtpRecord).filter(OtpRecord.email == email).first()
    if not otp_record:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid OTP")

    expires_at = otp_record.expires_at
    if expires_at.tzinfo is None:
        expires_at = expires_at.replace(tzinfo=timezone.utc)

    if datetime.now(timezone.utc) > expires_at:
        db.delete(otp_record)
        db.commit()
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="OTP expired. Please request a new one.")

    if hash_value(otp) != otp_record.otp_hash:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid OTP")

    user.is_verified = True
    db.delete(otp_record)
    db.commit()
    return {"success": True, "message": "Registration verified successfully."}


@app.post("/api/auth/login")
def login_user(payload: AuthLoginRequest, db: Session = Depends(get_db)) -> dict:
    email = payload.email.lower().strip()
    password = payload.password.strip()

    user = db.query(User).filter(User.email == email).first()
    if not user:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Account not registered")

    if not verify_password(password, user.password_hash):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Incorrect password")

    if not user.is_verified:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Account not yet verified")

    return {"success": True, "message": "Password verified. Sending OTP..."}


@app.post("/api/auth/send-login-otp")
def send_login_otp(payload: AuthLoginRequest, db: Session = Depends(get_db)) -> dict:
    email = payload.email.lower().strip()
    password = payload.password.strip()

    user = db.query(User).filter(User.email == email).first()
    if not user:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Account not registered")

    if not verify_password(password, user.password_hash):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Incorrect password")

    if not user.is_verified:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Account not yet verified")

    otp = generate_otp()
    otp_hash = hash_value(otp)
    otp_record = db.query(OtpRecord).filter(OtpRecord.email == email).first()
    if otp_record:
        otp_record.otp_hash = otp_hash
        otp_record.expires_at = create_otp_expiry()
    else:
        db.add(OtpRecord(email=email, otp_hash=otp_hash, expires_at=create_otp_expiry()))
    db.commit()

    try:
        send_registration_otp(email, otp)
    except Exception as exc:
        db.rollback()
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Failed to send OTP email.") from exc

    return {"success": True, "message": "OTP sent to your email. Please verify to complete login."}


@app.post("/api/auth/verify-login-otp")
def verify_login_otp(payload: VerifyOtpRequest, db: Session = Depends(get_db)) -> dict:
    email = payload.email.lower().strip()
    otp = payload.otp.strip()

    user = db.query(User).filter(User.email == email).first()
    if not user:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Account not registered")

    otp_record = db.query(OtpRecord).filter(OtpRecord.email == email).first()
    if not otp_record:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid OTP")

    expires_at = otp_record.expires_at
    if expires_at.tzinfo is None:
        expires_at = expires_at.replace(tzinfo=timezone.utc)

    if datetime.now(timezone.utc) > expires_at:
        db.delete(otp_record)
        db.commit()
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="OTP expired. Please request a new one.")

    if hash_value(otp) != otp_record.otp_hash:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid OTP")

    db.delete(otp_record)
    db.commit()

    token = create_access_token(user.email)
    return {
        "success": True,
        "message": "Login verified successfully.",
        "access_token": token,
        "token_type": "bearer",
    }


@app.get("/api/auth/me")
def get_me(current_user: User = Depends(get_current_user)) -> dict:
    return {
        "success": True,
        "user": {
            "email": current_user.email,
            "full_name": current_user.full_name,
            "is_verified": current_user.is_verified,
            "created_at": current_user.created_at.isoformat() if current_user.created_at else None,
        },
    }


if __name__ == "__main__":
    import uvicorn

    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
