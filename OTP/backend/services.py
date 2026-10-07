import hashlib
import os
import random
import smtplib
from datetime import datetime, timedelta, timezone
from email.message import EmailMessage

from dotenv import load_dotenv

load_dotenv()


def generate_otp() -> str:
    return str(random.randint(100000, 999999))


def hash_value(value: str) -> str:
    return hashlib.sha256(value.encode("utf-8")).hexdigest()


def send_registration_otp(email: str, otp: str) -> None:
    smtp_host = os.getenv("SMTP_HOST")
    smtp_port = int(os.getenv("SMTP_PORT", "587"))
    smtp_user = os.getenv("SMTP_USER")
    smtp_password = os.getenv("SMTP_PASSWORD")
    smtp_from = os.getenv("SMTP_FROM", smtp_user)

    if not smtp_host or not smtp_user or not smtp_password:
        raise RuntimeError("SMTP configuration is missing.")

    msg = EmailMessage()
    msg["Subject"] = "Your Account Verification OTP"
    msg["From"] = smtp_from
    msg["To"] = email
    msg.set_content(
        f"Your OTP is {otp}. This code expires in 5 minutes."
    )
    msg.add_alternative(
        "<html><body><p>Your OTP is <strong>{}</strong>.</p><p>This code expires in 5 minutes.</p></body></html>".format(otp),
        subtype="html",
    )

    with smtplib.SMTP(smtp_host, smtp_port) as server:
        server.starttls()
        server.login(smtp_user, smtp_password)
        server.send_message(msg)


def otp_expires_in_minutes() -> int:
    return int(os.getenv("OTP_EXPIRE_MINUTES", "5"))


def create_otp_expiry() -> datetime:
    return datetime.now(timezone.utc) + timedelta(minutes=otp_expires_in_minutes())
