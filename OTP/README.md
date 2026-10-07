# OTP Authentication App

This project is a FastAPI + SQLite authentication system with a frontend OTP flow.

## Project structure

```text
OTP-Generator-main/
├── backend/
│   ├── .env
│   ├── .env.example
│   ├── database.py
│   ├── main.py
│   ├── models.py
│   ├── services.py
│   ├── requirements.txt
│   └── tests/
│       └── test_auth_flow.py
├── frontend/
│   ├── index.html
│   ├── register.html
│   ├── style.css
│   └── script.js
├── README.md
└── .gitignore
```

## 1) Install backend dependencies

```bash
cd backend
python -m venv .venv
. .venv/Scripts/activate
python -m pip install --upgrade pip
pip install -r requirements.txt
```

## 2) Configure environment

Copy the example file and add your Gmail App Password:

```bash
copy .env.example .env
```

Then update `.env`:

```env
DATABASE_URL=sqlite:///./auth.db
SECRET_KEY=change-this-to-a-strong-random-secret
ALGORITHM=HS256
ACCESS_TOKEN_EXPIRE_MINUTES=60
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your_email@gmail.com
SMTP_PASSWORD=your_gmail_app_password
SMTP_FROM=your_email@gmail.com
OTP_EXPIRE_MINUTES=5
```

Important:
- Use a Gmail App Password, not your normal Gmail password.
- Keep SMTP credentials server-side only.

## 3) Start the backend

```bash
cd backend
. .venv/Scripts/activate
uvicorn main:app --host 0.0.0.0 --port 8000 --reload
```

The API will run at:

```text
http://localhost:8000
```

## 4) Open the frontend

Open the frontend page in a browser:

```text
frontend/index.html
```

or serve it locally:

```bash
cd frontend
python -m http.server 8000
```

Then visit:

```text
http://localhost:8000
```

## 5) Test the app

```bash
cd backend
. .venv/Scripts/activate
pytest -q
```

## Authentication flow

- Register with email + password
- Backend creates a user with `is_verified = false`
- Backend generates a 6-digit OTP and sends it by email
- User verifies OTP to complete registration
- Verified users log in directly using email + password
- JWT token is created for authenticated requests

## Notes

- SQLite is used for persistent local development storage.
- The SQLite database file is created automatically on app startup.
- OTPs expire after 5 minutes by default.
