# KavachAI Frontend

> **Quantum-Safe Infrastructure Dashboard**
> Built for PNB Hackathon 2026 by **InfiniTech**

This frontend application provides a powerful and interactive dashboard for visualizing cryptographic vulnerabilities and managing the transition to **Post-Quantum Cryptography (PQC)**.

It enables security administrators to monitor infrastructure **Quantum Readiness**, perform scans, analyze risks, and follow AI-generated remediation strategies.

---

## 📌 Table of Contents

- [Features](#-features)
- [Architecture & Flow](#-architecture--flow)
- [Tech Stack](#️-tech-stack)
- [Project Structure](#-project-structure)
- [Local Setup (First Time)](#-local-setup-first-time)
- [Running the Application](#-running-the-application)
- [Application Modules & Routes](#-application-modules--routes)
- [Team](#-team)

---

## 🚀 Features

| Feature | Description |
|---|---|
| **Infrastructure Mapping** | Discover domains, subdomains, IPs, and services interactively. |
| **PQC Risk Scoring** | ML-based scoring with CIA (Confidentiality, Integrity, Availability) metrics. |
| **Cryptographic Inventory (CBOM)** | Detailed TLS versions, cipher suites, and PQC algorithms. |
| **AI-Powered Roadmaps** | Migration guidance with recommendations (ML-KEM, CRYSTALS-Dilithium). |
| **Interactive AI Chatbot** | Query scan results and compliance insights. |
| **Secure Authentication Flow** | JWT + OTP-based login integration. |
| **Data Visualization** | Risk distribution and trends using charts. |

---

## 🔄 Architecture & Flow

### Execution Flow / How it Works

1. **Authenticate**: User logs in with email and OTP verification (2FA).
2. **Discover**: User inputs a domain → system maps assets (subdomains, IPs, services).
3. **Configure**: User sets business context (criticality, SLA).
4. **Audit**: Run Soft Scan or Deep Scan.
5. **Analyze**: View PQC readiness score, inspect cryptographic inventory, download CBOM report.
6. **Remediate**: Follow AI-generated recommendations for upgrading infrastructure.

---

## 🛠️ Tech Stack

### Frontend Core
| Technology | Purpose |
|---|---|
| **React.js (Vite)** | Core UI framework and build tool |
| **React Router DOM** | Client-side routing |
| **React Hooks** | State management (`useState`, `useEffect`, `useContext`) |

### Styling & UI
| Technology | Purpose |
|---|---|
| **Tailwind CSS** | Utility-first CSS framework |
| **Framer Motion** | Animations and transitions |
| **Lucide React** | Iconography |

### API & Data Handling
| Technology | Purpose |
|---|---|
| **Axios** | HTTP client (with JWT interceptors) |
| **Chart.js / Recharts** | Data visualization |

---

## 📂 Project Structure

```text
frontend-pnb/
│
├── public/              # Static assets and branding
├── src/
│   ├── assets/          # Images and global styles
│   ├── components/      # Reusable UI components
│   ├── layouts/         # Layout wrappers (Auth, Dashboard)
│   ├── pages/           # Views (Scan, History, Results, Chat)
│   ├── services/        # API configuration (Axios)
│   ├── utils/           # Helpers (CIA scoring, formatters)
│   └── App.jsx          # Root component & protected routes
├── tailwind.config.js   # Theme configuration
├── vite.config.js       # Vite configuration
└── package.json         # Dependencies
```

---

## ⚙️ Local Setup (First Time)

### Prerequisites
- Node.js (v18+)
- Running Backend Server (`backend-pnb`)

### Setup

1. **Clone & Navigate**
   ```bash
   git clone <repository-url>
   cd frontend-pnb
   ```

2. **Install Dependencies**
   ```bash
   npm install
   ```

3. **Configure Environment Variables**
   Create a `.env` file in the root of `frontend-pnb`:
   ```env
   VITE_API_BASE_URL=http://localhost:3000/api
   ```
   *(Ensure this matches the port where your backend is running.)*

---

## 🏃 Running the Application

### Start Development Server
```bash
npm run dev
```

The application will typically start on `http://localhost:5173`. Open this URL in your browser to access the KavachAI Dashboard.

---

## 📊 Application Modules & Routes

### Authentication (`/login`, `/verify-otp`)
- Login with email & password.
- OTP verification (2FA).
- JWT-based session handling.

### Dashboard (`/dashboard`)
- High-level overview of infrastructure.
- Risk distribution and PQC readiness trends.

### Discovery (`/discovery`)
- Input domain for asset mapping.
- View discovered subdomains, IPs, and services.

### Audit Center (`/scan`)
- Configure and run Soft / Deep scans.
- Monitor scan progress in real-time.

### Results View (`/results/:scanId`)
- Detailed TLS/SSL configuration details.
- Cipher suite analysis.
- PQC readiness insights.

### CBOM Reports (`/cbom`)
- Generate cryptographic inventory.
- Download PDF reports.

### History Portal (`/history`)
- View past scans.
- Analyze trends over time.

### AI Chatbot (`/chat`)
- Ask contextual questions about specific scans.
- Get compliance and security insights directly from the LLM.

---

## 👤 Team

- **Author:** InfiniTech
- **Event:** PNB Hackathon 2026
