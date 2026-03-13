# GoToMock Development Guide

## Quick Start

## Recommended (College-friendly): Docker Compose

This is the easiest way to run the full stack without installing MySQL locally.

1) Create the root env file:

- Copy `.env.example` to `.env` in the project root
- Fill `GROQ_API_KEY` / `OPENAI_API_KEY` if you want voice + AI features

2) Start everything:

```bash
docker-compose up --build
```

Windows (PowerShell) shortcut:

```powershell
./start.ps1 start
```

3) Open:

- Frontend: http://localhost:5173
- Backend: http://localhost:8000/docs

Note: MySQL is exposed on host port `3307` (to avoid conflicts with local MySQL).

## Deploy on a Linux VM (Docker) with persistent uploads

By default, audio/resume files are written under the backend's `uploads/` directory.
On a VM, you should mount this directory to a persistent host path so files survive container rebuilds.

1) Prepare the host directory (creates `/var/lib/gotomock/uploads` and sets permissions for the container user uid `1000`):

```bash
sh deploy/vm-prepare.sh
```

2) Deploy the production stack (nginx on port 80, backend on 8000, mysql on 3307):

```bash
docker compose -f docker-compose.prod.yml up -d --build
```

Uploads will persist on the VM at `/var/lib/gotomock/uploads`.

MySQL will be created automatically by Docker, and the backend will auto-create tables on first start.

### Prerequisites
- Node.js 18+ and npm
- Python 3.11+
- MySQL 8.0+
- OpenAI API Key (for Whisper)
- Groq API Key (for LLaMA)

### 1. Database Setup
```bash
# Start MySQL and create database
mysql -u root -p
CREATE DATABASE gotomock CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

# Import schema
mysql -u root -p gotomock < database/schema.sql
```

Tip: if you prefer the backend to create tables automatically (without importing schema.sql), you can run:

```bash
cd backend
python scripts/bootstrap_db.py
```

### 2. Backend Setup
```bash
cd backend

# Install dependencies
pip install -r requirements.txt

# Start the server
python -m uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

### 3. Frontend Setup
```bash
cd frontend

# Install dependencies
npm install

# Start development server
npm run dev
```

## API Configuration

### Required API Keys

1. **OpenAI API Key** - For Whisper voice transcription
   - Get from: https://platform.openai.com/api-keys
   - Add to the repo-root `.env`: `OPENAI_API_KEY=your-key-here`

2. **Groq API Key** - For LLaMA question generation
   - Get from: https://groq.com/
   - Add to the repo-root `.env`: `GROQ_API_KEY=your-key-here`

### Super Admin Setup

To bootstrap a college Super Admin (developer/owner only):

1) Set these env vars in the repo-root `.env`:

- `SUPER_ADMIN_SECRET=...` (keep private)
- Optional: `SUPERADMIN_BOOTSTRAP_ALLOW_REMOTE=true` (default is `false`, which restricts bootstrap to localhost)

```bash
curl -X POST "http://localhost:8000/api/super-admin/create-super-admin" \
   -H "X-Superadmin-Secret: YOUR_SUPER_ADMIN_SECRET" \
  -H "Content-Type: application/json" \
  -d '{
    "email": "superadmin@college.edu",
    "username": "superadmin",
    "password": "SecurePassword123!",
    "full_name": "Super Administrator",
      "college_name": "Your College Name"
  }'
```

## Testing the Application

### Platform Owner Setup (Developer only)

The platform owner account manages Super Admins (colleges).

You have two options:

1) Auto-seed an Owner on first run (recommended for local/dev)
2) Bootstrap via API (more controlled)

#### Option 1: Auto-seed on first run

Set these env vars in the repo-root `.env`:

- `OWNER_SEED_ON_STARTUP=true`
- `OWNER_SEED_EMAIL=...`
- `OWNER_SEED_USERNAME=...`
- `OWNER_SEED_PASSWORD=...`
- `OWNER_SEED_FULL_NAME=...`

On first start (when the DB tables are created), the backend will insert the Owner if none exists.

#### Option 2: Bootstrap via API

1) Set these env vars in the repo-root `.env`:

- `OWNER_BOOTSTRAP_SECRET=...` (keep private)
- Optional: `OWNER_BOOTSTRAP_ALLOW_REMOTE=true` (default is `false`, which restricts to localhost)

2) Bootstrap the first owner (localhost by default):

```bash
curl -X POST "http://localhost:8000/api/owner/bootstrap-owner" \
   -H "X-Owner-Secret: YOUR_OWNER_BOOTSTRAP_SECRET" \
   -H "Content-Type: application/json" \
   -d '{
      "email": "owner@platform.com",
      "username": "platform_owner",
      "password": "StrongPassword@123",
      "full_name": "Platform Owner"
   }'
```

3) Login as owner:

- `http://localhost:5173/owner/login`

4) Create Super Admins (colleges) from Owner Dashboard:

- `http://localhost:5173/owner`

### 1. Create Super Admin
Use the API call above to create a super admin account.

### 2. Login as Super Admin
- Go to http://localhost:5173/login
- Use the super admin credentials

### 3. Create Department Admin
- Go to `http://localhost:5173/super-admin/admins` and create a department admin
- Note the unique admin ID generated

### 4. Register Student
- Go to http://localhost:5173/register
- Use the admin ID from step 3
- Complete student registration

### 5. Test Interview Features
- Login as student
- Try different interview modes:
  - Resume-based (upload a PDF resume)
  - Domain-based (select a domain)
  - Wait for scheduled interviews from admin

## Development URLs

- **Frontend**: http://localhost:5173
- **Backend API**: http://localhost:8000
- **API Documentation**: http://localhost:8000/docs
- **Database (Docker Compose)**: localhost:3307 (container 3306)
- **Database (Local MySQL)**: localhost:3306

## Project Structure

```
gotomock/
├── frontend/              # React TypeScript app
│   ├── src/
│   │   ├── components/    # Reusable components
│   │   ├── pages/         # Page components
│   │   ├── stores/        # Zustand state management
│   │   ├── utils/         # Utility functions
│   │   └── hooks/         # Custom React hooks
│   └── package.json
├── backend/               # FastAPI application
│   ├── app/
│   │   ├── api/           # API routes
│   │   ├── models.py      # SQLAlchemy models
│   │   ├── database.py    # Database configuration
│   │   └── utils/         # Utility functions
│   └── requirements.txt
└── database/              # Database schema
    └── schema.sql
```

## Features Implemented

### ✅ Authentication & Authorization
- JWT-based authentication
- Role-based access control (Student, Admin, Super Admin)
- Secure password hashing

### ✅ Admin Hierarchy
- Super admin can create department admins
- Department admins manage their students
- Unique admin IDs for student registration

### ✅ Interview Modes
- **Resume-based**: Upload resume → AI generates questions
- **Domain-based**: Select domain → Get domain-specific questions
- **Scheduled**: Admin schedules → Student attends at specific time

### ✅ AI Integration
- **OpenAI Whisper**: Voice transcription
- **Groq LLaMA**: Question generation and response analysis
- Smart scoring and feedback system

### ✅ Proctoring System
- Face detection (multiple faces, no face)
- Tab switching detection
- Audio anomaly detection
- Malpractice reporting

### ✅ Performance Analytics
- Technical, communication, and confidence scores
- Performance trends and insights
- Detailed feedback and recommendations

### ✅ Voice Features
- Voice question playback
- Voice response recording
- Speech-to-text conversion
- Voice confidence analysis

## Next Steps

1. **Test thoroughly** with all three user roles
2. **Configure API keys** for full AI functionality
3. **Customize domains** in the database for your institution
4. **Deploy** to production environment
5. **Set up monitoring** and logging

## Troubleshooting

### Common Issues

1. **Database Connection Failed**
   - Check MySQL is running
   - Verify credentials in the repo-root `.env`
   - Ensure database exists

2. **API Keys Not Working**
   - Verify OpenAI and Groq API keys are valid
   - Check API key permissions and billing

3. **CORS Issues**
   - Ensure frontend URL is in ALLOWED_ORIGINS
   - Check if ports match configuration

4. **Voice Features Not Working**
   - Verify browser microphone permissions
   - Check OpenAI API key for Whisper access

For more help, check the API documentation at http://localhost:8000/docs when the backend is running.