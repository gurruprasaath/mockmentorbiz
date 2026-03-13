# GoToMock - AI-Powered Mock Interview Platform for Colleges

A comprehensive mock interview platform designed specifically for college students, featuring AI-powered question generation, voice interaction, and comprehensive admin management.

## 🌟 Features

### For Students
- **3 Interview Modes:**
  - Resume-based mock interviews
  - Domain-specific interviews
  - Admin-scheduled interviews
- **Voice & Text Support:** Answer questions via voice or text
- **Real-time Feedback:** Get instant performance insights
- **Progress Tracking:** Monitor improvement over time

### For Admins
- **Student Management:** Track performance of students under your department
- **Interview Scheduling:** Schedule interviews for your students
- **Performance Analytics:** Comprehensive reports and insights
- **Proctoring:** Monitor interviews and detect malpractice

### For Super Admins
- **Multi-department Management:** Create and manage department admins
- **College-wide Analytics:** Overview of all departments
- **System Configuration:** Configure platform settings

## 🛠 Tech Stack

- **Frontend:** React 18 + TypeScript + Vite
- **Backend:** FastAPI + Python 3.11
- **Database:** MySQL 8.0
- **AI/ML:** 
  - OpenAI Whisper (Voice Recognition)
  - Groq LLaMA (Question Generation)
- **Authentication:** JWT Tokens
- **Real-time:** WebSockets
- **Proctoring:** WebRTC + Computer Vision

## 📁 Project Structure

```
gotomock/
├── frontend/           # React TypeScript app
│   ├── src/
│   │   ├── components/
│   │   ├── pages/
│   │   ├── hooks/
│   │   └── utils/
│   └── package.json
├── backend/           # FastAPI application
│   ├── app/
│   │   ├── api/
│   │   ├── models/
│   │   ├── services/
│   │   └── utils/
│   └── requirements.txt
├── database/          # MySQL schema
│   └── migrations/
└── docs/             # Documentation
```

## 🚀 Getting Started

### Prerequisites
- Node.js 18+ and npm
- Python 3.11+
- MySQL 8.0+
- OpenAI API Key (for Whisper)
- Groq API Key (for LLaMA)

### Installation

1. **Clone and setup the project:**
   ```bash
   cd gotomock
   ```

2. **Backend setup:**
   ```bash
   cd backend
   pip install -r requirements.txt
   python -m uvicorn app.main:app --reload
   ```

3. **Frontend setup:**
   ```bash
   cd frontend
   npm install
   npm run dev
   ```

4. **Database setup:**
   ```bash
   mysql -u root -p < database/schema.sql
   ```

### Environment Variables

Create a single repo-root `.env` (copy from `.env.example`):

**Repo root (.env):**
```env
DATABASE_URL=mysql+pymysql://user:password@localhost:3306/gotomock
SECRET_KEY=your-secret-key-here
OPENAI_API_KEY=your-openai-key
GROQ_API_KEY=your-groq-key
SUPER_ADMIN_SECRET=your-super-secret-key

# Frontend (Vite)
VITE_API_BASE_URL=http://localhost:8000
```

Note: if you're using the included Docker Compose setup, MySQL is exposed on host port `3307` (container port `3306`).


The frontend and backend both read env vars from the repo root.

## 🔐 Admin Hierarchy

1. **Super Admin** - One per college, manages department admins
2. **Department Admins** - Manages students in their department
3. **Students** - Join using department admin's unique ID

## 📚 API Endpoints

- **Authentication:** `/auth/login`, `/auth/register`
- **Students:** `/students/interview`, `/students/performance`
- **Admins:** `/admin/schedule`, `/admin/analytics`
- **Super Admin:** `/super-admin/create` (restricted)

## 🎯 Interview Types

1. **Resume-based:** Upload resume → AI generates relevant questions
2. **Domain-based:** Select domain → Get domain-specific questions  
3. **Scheduled:** Admin creates interview → Student attends at scheduled time

## 🔍 Proctoring Features

- **Face Detection:** Ensure student presence
- **Tab Switching:** Detect window changes
- **Multiple Faces:** Identify potential cheating
- **Audio Analysis:** Monitor background noise

## 📈 Performance Metrics

- **Response Time:** How quickly students answer
- **Accuracy:** Quality of responses
- **Confidence Score:** Voice analysis metrics
- **Interview Completion Rate:** Percentage of completed interviews

## 🤝 Contributing

This project is designed for college use. Contact the development team for contributions and improvements.

## 📄 License

This project is licensed under the MIT License.

---

**Built with ❤️ for college students to ace their interviews!**