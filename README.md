# Automated Job Application Email System

## 1. Architecture overview

This project is designed as a modular monorepo with a Node.js/Express backend and a React dashboard.

- Backend: Express API, MongoDB persistence, email sending orchestration, scheduling, validation, logging, and Gmail integration.
- Frontend: React dashboard for contacts, campaigns, resumes, and reply tracking.
- Database: MongoDB with Mongoose models for contacts, resumes, campaigns, logs, replies, and OAuth metadata.
- Email provider abstraction: Nodemailer is the initial provider, while the service layer is separated so another provider can replace it later.
- Queue and scheduling: MongoDB-backed campaign jobs with node-cron polling for due jobs.
- Gmail integration: OAuth2-managed Gmail API sync for reply tracking and thread history.

## 2. Folder structure

```text
emailSender/
├─ README.md
├─ package.json
├─ .env.example
├─ backend/
│  ├─ package.json
│  ├─ src/
│  │  ├─ app.js
│  │  ├─ server.js
│  │  ├─ config/
│  │  │  ├─ db.js
│  │  │  ├─ env.js
│  │  │  └─ logger.js
│  │  ├─ constants/
│  │  │  └─ email.js
│  │  ├─ middleware/
│  │  │  ├─ auth.js
│  │  │  ├─ errorHandler.js
│  │  │  ├─ rateLimiter.js
│  │  │  └─ upload.js
│  │  ├─ models/
│  │  │  ├─ Contact.js
│  │  │  ├─ Campaign.js
│  │  │  ├─ EmailLog.js
│  │  │  ├─ Resume.js
│  │  │  ├─ GmailAccount.js
│  │  │  └─ Reply.js
│  │  ├─ routes/
│  │  │  ├─ auth.js
│  │  │  ├─ contacts.js
│  │  │  ├─ resumes.js
│  │  │  ├─ campaigns.js
│  │  │  └─ dashboard.js
│  │  ├─ services/
│  │  │  ├─ emailService.js
│  │  │  ├─ gmailService.js
│  │  │  ├─ schedulerService.js
│  │  │  └─ campaignService.js
│  │  ├─ utils/
│  │  │  ├─ emailTemplate.js
│  │  │  ├─ fileParser.js
│  │  │  └─ validators.js
│  │  └─ tests/
│  │     ├─ validators.test.js
│  │     └─ emailTemplate.test.js
│  └─ .env.example
├─ frontend/
│  ├─ package.json
│  ├─ index.html
│  ├─ src/
│  │  ├─ App.jsx
│  │  ├─ main.jsx
│  │  └─ styles.css
│  └─ vite.config.js
└─ .env.example
```

## 3. External services and when they are used

### MongoDB + Mongoose
- Used for storing contacts, campaigns, email logs, resumes, Gmail OAuth metadata, and replies.
- Why needed: persistence across app restarts and queue durability.
- Setup: create a MongoDB Atlas cluster or local MongoDB instance, then set MONGODB_URI.
- Cost: free tier available for local/Atlas dev usage; paid for larger production workloads.
- Credentials required: MongoDB connection URI and optional database name.

### Gmail SMTP (Nodemailer)
- Used for sending the initial batch of emails and test emails when campaign approval begins.
- Why needed: simple provider access, reliable outbound delivery, and provider abstraction layer.
- Setup: enable 2FA on the Gmail account and use an app password or OAuth-based SMTP credentials.
- Cost: free for standard Gmail accounts with provider limits; commercial usage may require business account or mailbox configuration.
- Credentials required: SMTP user, password/app password, host, port, security flag.

### Gmail API + OAuth 2.0
- Used for reply detection, thread checking, and message synchronization.
- Why needed: track replies associated with past sends and reconcile them with campaigns.
- Setup: create a Google Cloud project, enable Gmail API, create OAuth client ID, and authorize the app with Gmail scope `https://www.googleapis.com/auth/gmail.readonly` and `https://www.googleapis.com/auth/gmail.modify`.
- Cost: free for typical usage under Google Cloud usage quotas; may have billing activated for production scale.
- Credentials required: OAuth client ID/secret, refresh token, token metadata, Gmail account connection.

### Excel/CSV parsing
- Used when uploading contact lists from CSV or Excel files.
- Why needed: import and validate contact data.
- Setup: no external service required; libraries are included in the backend.
- Cost: free.
- Credentials required: none.

### node-cron and scheduler
- Used to trigger queued campaigns and enforce daily limits and allowed windows.
- Why needed: run recurring scheduled jobs even after server restarts.
- Setup: run the Node app and optionally PM2 to keep it alive.
- Cost: free.
- Credentials required: none.

### PM2
- Used to keep the process alive on a server and restart on crash.
- Why needed: production reliability.
- Setup: install with `npm i -g pm2` and run the provided ecosystem config.
- Cost: free for local use; server hosting costs are separate.
- Credentials required: none.

### Multer and file storage
- Used to upload resume PDFs and contact files.
- Why needed: secure temporary storage and retrieval for campaign sending.
- Setup: configure upload destination, file size limits, and MIME validation.
- Cost: free.
- Credentials required: none.

## 4. Required environment variables

Create a local `.env` file in the backend using the template in `.env.example`.

```env
PORT=5000
NODE_ENV=development
APP_NAME=email-sender
JWT_SECRET=super_secret_change_me
MONGODB_URI=mongodb://localhost:27017/email_sender
FRONTEND_URL=http://localhost:5173

SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=yourgmail@gmail.com
SMTP_PASS=your_app_password
SMTP_FROM="Your Name <yourgmail@gmail.com>"

GMAIL_CLIENT_ID=your_google_client_id
GMAIL_CLIENT_SECRET=your_google_client_secret
GMAIL_REDIRECT_URI=http://localhost:5000/api/auth/gmail/callback
GMAIL_REFRESH_TOKEN=optional

UPLOAD_DIR=uploads
MAX_FILE_SIZE=5242880
DEFAULT_TIMEZONE=Asia/Kolkata
DEFAULT_DAILY_LIMIT=20
DEFAULT_BATCH_SIZE=5
DEFAULT_DELAY_MS=30000

RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX=200
```

## 5. Architecture and service responsibilities

- Providers layer: isolates SMTP/email provider implementation from the campaign engine.
- Repository layer: Mongoose models and query access.
- Validation layer: Zod schemas for contact uploads, campaign creation, resume validation, and API payloads.
- Scheduling layer: checks due campaigns and ensures only allowed times and caps are honored.
- Queue layer: persisted job state and per-contact sending status in MongoDB.
- Gmail integration layer: OAuth token management, polling, and reply matching.
- Dashboard layer: React frontend for campaign and status management.

## 6. API endpoints

### Auth
- POST `/api/auth/login` – authenticate dashboard user with email/password.
- POST `/api/auth/register` – register a local dashboard user.
- GET `/api/auth/gmail/connect` – start Gmail OAuth flow.
- GET `/api/auth/gmail/callback` – finish OAuth callback and store token metadata.
- GET `/api/auth/gmail/status` – report linked Gmail status.

### Contacts
- POST `/api/contacts/upload` – upload CSV/XLSX and parse contacts.
- GET `/api/contacts` – list contacts with filters.
- GET `/api/contacts/:id` – view a specific contact.
- DELETE `/api/contacts/:id` – delete a contact.

### Resumes
- POST `/api/resumes/upload` – upload a PDF resume.
- GET `/api/resumes` – list available resumes.
- GET `/api/resumes/:id` – get resume metadata.
- DELETE `/api/resumes/:id` – delete a resume.

### Campaigns
- POST `/api/campaigns` – create a campaign.
- GET `/api/campaigns` – list all campaigns.
- GET `/api/campaigns/:id` – get campaign details.
- PATCH `/api/campaigns/:id` – update subject/body/schedule.
- POST `/api/campaigns/:id/test-email` – send a test email.
- POST `/api/campaigns/:id/start` – begin sending.
- POST `/api/campaigns/:id/pause` – pause campaign.
- POST `/api/campaigns/:id/resume` – resume campaign.
- POST `/api/campaigns/:id/cancel` – cancel campaign.
- GET `/api/campaigns/:id/export` – export CSV results.

### Dashboard
- GET `/api/dashboard/overview` – aggregate campaign metrics.
- GET `/api/dashboard/replies` – list replies and thread info.
- GET `/api/dashboard/jobs` – list queued and sent jobs.

## 7. Security and compliance notes

- No hardcoded credentials.
- Keep SMTP and OAuth secrets under environment variables.
- Use JWT-based auth for the dashboard and restrict API routes.
- Use file validation and allowlist MIME types.
- Respect provider limits and never bypass them with unrealistic email throughput.
- Honor opt-out and suppression lists.
- Keep replies tracking readonly or minimally invasive.
- Never add tracking pixels by default.

## 8. Build and run plan

1. Install dependencies with npm workspaces.
2. Set the required environment variables.
3. Start MongoDB.
4. Start backend: `npm run dev:backend`.
5. Start frontend: `npm run dev:frontend`.
6. For production, use PM2 with a generated ecosystem config.

## 9. Development phases

- Phase 1: project setup, environment config, MongoDB connection, Gmail connection test.
- Phase 2: contact CSV/Excel upload, validation, deduplication, resume upload.
- Phase 3: email templates, preview, test-send flow, Nodemailer integration.
- Phase 4: persistent queue, scheduling, daily limits, retry handling, campaign controls.
- Phase 5: React dashboard, campaign stats, CSV export.
- Phase 6: Gmail API OAuth and reply tracking.
- Phase 7: security review, tests, deployment, PM2, documentation.

The code in this repository follows the same staged implementation path, beginning with Phase 1 setup and continuing through working backend services and a dashboard UI.
