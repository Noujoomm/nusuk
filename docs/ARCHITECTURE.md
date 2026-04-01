# ROYA PLATFORM — System Architecture Document
### رؤية — منصة الذكاء التشغيلي

**Version:** 2.0  
**Date:** April 2026  
**Classification:** Internal — Engineering Reference

---

## 1. Platform Overview

Roya is an AI-powered operational intelligence platform built for managing large-scale projects (Hajj operations, distribution, consulting, training). It serves C-suite executives, track managers, and operations teams with real-time analytics, task management, and AI-driven insights.

**Primary Market:** Saudi Arabia (Vision 2030)  
**Language:** Arabic-first (RTL), English support  
**Users:** Executives, Project Managers, Track Leaders, Employees, HR

---

## 2. Architecture Layers

```
┌─────────────────────────────────────────────────────────────┐
│                    PRESENTATION LAYER                        │
│              Next.js 14 (App Router) + Tailwind              │
│              TypeScript + Recharts + shadcn/ui               │
├─────────────────────────────────────────────────────────────┤
│                    APPLICATION LAYER                          │
│                NestJS (REST API + WebSocket)                  │
│         JWT Auth + RBAC + Audit + Rate Limiting              │
├─────────────────────────────────────────────────────────────┤
│                       AI LAYER                               │
│              OpenAI GPT-4o + Embeddings                      │
│         Insights Engine + Report Generator                   │
├─────────────────────────────────────────────────────────────┤
│                      DATA LAYER                              │
│                PostgreSQL (Prisma ORM)                        │
│              47 models / 1260 lines schema                   │
├─────────────────────────────────────────────────────────────┤
│                   INTEGRATION LAYER                          │
│             ZKTeco BioTime (Attendance)                       │
│            File Processing (PPTX/Excel/PDF)                  │
├─────────────────────────────────────────────────────────────┤
│                    INFRASTRUCTURE                            │
│         Railway (Backend) + Render (Database)                │
│              GitHub Actions (CI/CD)                           │
└─────────────────────────────────────────────────────────────┘
```

---

## 3. Tech Stack

| Layer | Technology | Version |
|-------|-----------|---------|
| Frontend | Next.js (App Router) | 14.2 |
| Language | TypeScript | 5.x |
| Styling | Tailwind CSS | 3.4 |
| Charts | Recharts | 3.7 |
| Icons | Lucide React | latest |
| State | Zustand | 4.5 |
| HTTP Client | Axios | 1.7 |
| Backend | NestJS | 10.4 |
| ORM | Prisma | 6.19 |
| Database | PostgreSQL | 16 |
| Auth | JWT (Passport.js) | — |
| Real-time | Socket.IO | 4.8 |
| AI | OpenAI API (GPT-4o) | — |
| File Upload | Multer | — |
| Email | Nodemailer | — |
| Scheduling | @nestjs/schedule (Cron) | — |
| Deployment | Railway + Render | — |
| Font | IBM Plex Sans Arabic | — |

---

## 4. Monorepo Structure

```
nusuk-platform/
├── apps/
│   ├── api/                          # NestJS Backend
│   │   ├── prisma/
│   │   │   ├── schema.prisma         # 47 models, 1260 lines
│   │   │   └── seed.js               # Environment-aware seeding
│   │   ├── src/
│   │   │   ├── main.ts               # Bootstrap (port 4000)
│   │   │   ├── app.module.ts         # 25 modules registered
│   │   │   ├── health.controller.ts  # /api/health endpoint
│   │   │   ├── auth/                 # JWT + Refresh tokens
│   │   │   ├── users/                # User CRUD + permissions
│   │   │   ├── tracks/               # Track management + PPTX import
│   │   │   ├── tasks/                # Task CRUD + checklist + files + audit
│   │   │   ├── reports/              # Reports + chunked attachments
│   │   │   ├── daily-updates/        # Daily updates + read receipts
│   │   │   ├── analytics/            # Dashboard analytics + track performance
│   │   │   ├── distribution/         # Achievement + Deviation engine
│   │   │   ├── ai-engine/            # AI insights + copilot + alerts
│   │   │   ├── ai-reports/           # AI-generated reports
│   │   │   ├── ai-analysis/          # Track + KPI AI analysis
│   │   │   ├── embeddings/           # Vector embeddings for search
│   │   │   ├── search/               # Semantic search
│   │   │   ├── kpi-management/       # KPI tracking
│   │   │   ├── gantt/                # Gantt chart + dependencies + baselines
│   │   │   ├── scope-blocks/         # Hierarchical scope of work
│   │   │   ├── progress/             # Progress tracking + achievements
│   │   │   ├── executive-tasks/      # Executive task sheets
│   │   │   ├── notifications/        # System notifications
│   │   │   ├── comments/             # Threaded comments (polymorphic)
│   │   │   ├── audit/                # Audit logging
│   │   │   ├── files/                # File management
│   │   │   ├── storage/              # Storage abstraction
│   │   │   ├── imports/              # Data import engine
│   │   │   ├── system-export/        # Full system export/backup
│   │   │   ├── websocket/            # Real-time events (Socket.IO)
│   │   │   ├── openai/               # OpenAI client wrapper
│   │   │   └── common/               # Shared utilities
│   │   │       ├── prisma.module.ts
│   │   │       ├── prisma.service.ts # Singleton + retry + lifecycle
│   │   │       ├── guards/           # JWT, Roles, RateLimit
│   │   │       ├── decorators/       # @CurrentUser, @Roles
│   │   │       ├── filters/          # Exception filters
│   │   │       └── fix-filename.ts   # Arabic filename encoding fix
│   │   └── uploads/                  # Uploaded files storage
│   │
│   └── web/                          # Next.js Frontend
│       ├── src/
│       │   ├── app/
│       │   │   ├── layout.tsx        # Root layout (RTL, dark theme)
│       │   │   ├── login/            # Auth pages
│       │   │   ├── register/
│       │   │   ├── forgot-password/
│       │   │   └── (dashboard)/      # Protected dashboard routes
│       │   │       ├── page.tsx           # Home redirect
│       │   │       ├── layout.tsx         # Dashboard wrapper + sidebar
│       │   │       ├── dashboard/         # Executive dashboard
│       │   │       ├── tracks/            # Tracks listing + detail [id]
│       │   │       ├── tasks/             # Task management
│       │   │       ├── reports/           # Reports
│       │   │       ├── updates/           # Daily updates feed
│       │   │       ├── employees/         # HR employees
│       │   │       ├── penalties/         # Violations
│       │   │       ├── gantt/             # Gantt chart
│       │   │       ├── files/             # File repository
│       │   │       ├── ai-reports/        # AI report generation
│       │   │       ├── ai-analyze/        # AI file analysis
│       │   │       ├── ai-insights/       # AI intelligence module
│       │   │       ├── search/            # Semantic search
│       │   │       ├── import/            # Data import wizard
│       │   │       ├── executive-tasks/   # Executive tasks
│       │   │       ├── users/             # User management
│       │   │       └── system-export/     # System backup
│       │   ├── components/
│       │   │   ├── sidebar.tsx            # Navigation (role-based)
│       │   │   ├── dashboards/
│       │   │   │   ├── admin-dashboard.tsx
│       │   │   │   ├── employee-dashboard.tsx
│       │   │   │   ├── track-lead-dashboard.tsx
│       │   │   │   ├── hr-dashboard.tsx
│       │   │   │   └── executive/         # Modular dashboard components
│       │   │   ├── distribution/
│       │   │   │   ├── AchievementSection.tsx
│       │   │   │   └── DeviationSection.tsx
│       │   │   ├── tasks/                 # Task modals + panels
│       │   │   ├── gantt/                 # Gantt chart component
│       │   │   ├── comments/              # Comment threads
│       │   │   ├── notifications/         # Notification bell
│       │   │   └── ui/                    # Reusable UI atoms
│       │   ├── lib/
│       │   │   ├── api.ts                 # Axios client (460+ lines, 20+ API groups)
│       │   │   ├── utils.ts               # Formatting, labels, colors
│       │   │   ├── chart-theme.ts         # Unified chart styling
│       │   │   └── hijri-utils.ts         # Hijri ↔ Gregorian conversion
│       │   └── stores/
│       │       ├── auth.ts                # Auth state (Zustand)
│       │       ├── tasks.ts               # Task state
│       │       └── notifications.ts       # Notification state
│       └── tailwind.config.ts             # Brand colors + custom theme
│
├── packages/
│   └── shared/                            # Shared utilities (future)
├── docker-compose.yml
├── start.sh                               # Production startup script
├── render.yaml                            # Render deployment config
├── railway.json                           # Railway deployment config
└── package.json                           # Workspace root
```

---

## 5. Database Schema (47 Models)

### 5.1 Authentication & Users

```
User
├── id (String, CUID)
├── email (String, unique)
├── password (String, hashed)
├── name (String)
├── nameAr (String)
├── role (Role enum: admin, pm, track_lead, employee, hr)
├── isLocked (Boolean)
├── lastLoginAt (DateTime?)
├── trackId (String?) → Track
├── createdAt / updatedAt
│
├── → RefreshToken (1:N)
├── → TrackPermission (1:N)
├── → TaskAssignment (1:N)
├── → Comment (1:N)
├── → Notification (1:N)
└── → DailyUpdate (1:N)

RefreshToken
├── id, token (unique), userId → User
├── expiresAt, createdAt
```

### 5.2 Tracks & Organization

```
Track
├── id, name, nameAr, color, description
├── fieldSchema (Json) — dynamic field definitions
├── isDeleted
│
├── → Task (1:N)
├── → Employee (1:N)
├── → Deliverable (1:N)
├── → TrackKPI (1:N)
├── → Scope (1:N)
├── → ScopeBlock (1:N)
├── → Report (1:N)
├── → DailyUpdate (1:N)
├── → Penalty (1:N)
└── → TrackPermission (1:N)

TrackPermission
├── userId → User
├── trackId → Track
├── permissions (String[]) — ["view", "edit", "create", "delete"]

Employee
├── id, trackId → Track
├── name, nameAr, email, phone, role, department
├── contractType, startDate, endDate
├── isDeleted

Deliverable
├── id, trackId → Track
├── name, nameAr, outputs, deliveryIndicators
├── sortOrder, isDeleted
```

### 5.3 Tasks (Core Module)

```
Task
├── id, titleAr, descriptionAr
├── trackId → Track (optional)
├── status (new, pending, in_progress, under_review, completed, delayed, cancelled, scheduled)
├── priority (low, medium, high, critical)
├── progress (Float, 0-100)
├── assigneeType (TRACK, USER, HR, GLOBAL)
├── assigneeTrackId, assigneeUserId
├── startDate, dueDate, completedAt
├── isDeleted, createdById → User
│
│ Gantt Fields:
├── duration, isMilestone, isSummary, wbs
├── baselineStart, baselineFinish
├── constraintType, constraintDate
├── freeSlack, totalSlack, isCritical
│
├── → TaskAssignment (1:N) — multi-user assignment
├── → TaskFile (1:N) — attachments
├── → TaskChecklist (1:N) — item-level checklist with approval
├── → TaskUpdate (1:N) — daily progress updates
├── → TaskAuditLog (1:N) — full action history
├── → AdminNote (1:N) — private admin notes
├── → TaskDependency (1:N) — FS, SS, FF, SF dependencies
└── → ResourceAssignment (1:N) — resource allocation %

TaskAssignment
├── taskId → Task, userId → User
├── assignedById → User

TaskFile
├── taskId → Task
├── fileName, fileSize, mimeType, filePath
├── uploadedById → User, notes

TaskChecklist
├── taskId → Task, title, titleAr
├── isCompleted, status (pending/approved/completed/needs_revision)
├── createdById → User
```

### 5.4 Scope of Work

```
ScopeBlock (Hierarchical)
├── id, trackId → Track
├── code, title, titleAr, description
├── parentId → ScopeBlock (self-referencing tree)
├── level (0-5), orderIndex
├── status (pending, in_progress, completed, delayed)
├── progress (Float), progressUpdatedAt
│
├── → ScopeBlockAttachment (1:N)
└── → ScopeBlockUpdate (1:N) — timeline updates
```

### 5.5 Reports

```
Report
├── id, trackId → Track, authorId → User
├── type (daily, weekly, monthly, annual, operational)
├── title, achievements, kpiUpdates, challenges
├── supportNeeded, upcomingTasks, notes, aiSummary
├── reportDate
│
├── → ReportAttachment (1:N)
│       └── → ReportFileChunk (1:N) — chunked large file storage
```

### 5.6 Daily Updates

```
DailyUpdate
├── id, trackId → Track (optional)
├── authorId → User
├── title, content, scope (global/track/department)
├── isPinned
│
├── → DailyUpdateAttachment (1:N)
└── → DailyUpdateRead (1:N) — read receipts per user
```

### 5.7 Analytics & KPIs

```
KPIEntry
├── id, trackId → Track (optional)
├── name, nameAr, category, targetValue, currentValue
├── unit, period (monthly/quarterly/annual)

ProgressItem
├── entityType, entityId, progress (Float)

Achievement
├── entityType, entityId
├── title, titleAr, description, impactType
├── evidenceLinks (Json)
```

### 5.8 Distribution Track (Specialized)

```
DistributionAchievement
├── gregorianDate, hijriDate
├── companiesCount, batchesCount, cardsCount
├── cardsPerSpecialistPerHour, durationHours, specialistsCount
├── expectedCapacity (computed), achievementPercentage (computed)
├── createdById → User

DistributionDeviation
├── gregorianDate, hijriDate
├── companiesCount, parcelsCount
├── platformValue, factoryValue, distributionValue
├── total3h, booked3h, fullReceipt, completionCert
├── platformReports, appleReports, androidReports
├── All deviation % fields (computed)
├── createdById → User
```

### 5.9 Gantt & Scheduling

```
TaskDependency
├── predecessorId → Task, successorId → Task
├── type (FS, SS, FF, SF), lag (Int)

WorkCalendar
├── name, workDays (Int[]) — default: [0,1,2,3,4] = Sun-Thu
├── startHour, endHour

ResourceAssignment
├── taskId → Task, userId → User
├── units (Float) — allocation percentage
```

### 5.10 AI & Intelligence

```
AIReport
├── type (daily, weekly, monthly, executive, track_performance, kpi_analysis)
├── prompt, result (Text), status (pending/generating/completed/failed)
├── trackId, metadata (Json)

Embedding
├── entityType, entityId, content (Text)
├── embedding (Float[]) — vector for semantic search
```

### 5.11 System & Audit

```
AuditLog
├── actorId → User, actionType, entityType, entityId
├── trackId, beforeData (Json), afterData (Json)
├── ip, userAgent

Notification
├── userId → User, type (NotificationType enum)
├── title, body, entityType, entityId
├── isRead

Comment (Polymorphic)
├── entityType, entityId
├── authorId → User, content
├── parentId → Comment (threading)
├── mentions (String[])

ImportHistory
├── entityType, fileName, totalRows, successRows, failedRows
├── rollbackData (Json)
```

---

## 6. API Architecture

### 6.1 Module Map (25 Backend Modules)

| Module | Route Prefix | Responsibility |
|--------|-------------|----------------|
| AuthModule | `/api/auth` | Login, register, refresh, password reset |
| UsersModule | `/api/users` | User CRUD, permissions, lock/unlock |
| TracksModule | `/api/tracks` | Track CRUD, employees, deliverables, scopes, KPIs, penalties |
| TasksModule | `/api/tasks` | Task CRUD, checklist, files, updates, audit, assignments |
| ReportsModule | `/api/reports` | Report CRUD, chunked attachments |
| DailyUpdatesModule | `/api/daily-updates` | Updates, attachments, read receipts |
| AnalyticsModule | `/api/analytics` | Dashboard analytics, track performance engine |
| DistributionModule | `/api/distribution` | Achievement + Deviation CRUD + calculations |
| AiEngineModule | `/api/ai-engine` | AI insights, copilot chat, smart alerts |
| AIReportsModule | `/api/ai/reports` | AI-generated reports |
| AIAnalysisModule | `/api/ai/analysis` | Track and KPI AI analysis |
| EmbeddingsModule | `/api/ai/embeddings` | Vector embeddings + indexing |
| SearchModule | `/api/search` | Semantic + text search |
| KPIModule | `/api/kpis` | KPI management |
| GanttModule | `/api/gantt` | Gantt tasks, dependencies, calendars, baselines, auto-schedule |
| ScopeBlocksModule | `/api/scope-blocks` | Hierarchical scope management |
| ProgressModule | `/api/progress` | Progress tracking, achievements |
| ExecutiveTasksModule | `/api/executive-tasks` | Executive task sheets |
| CommentsModule | `/api/comments` | Threaded comments |
| NotificationsModule | `/api/notifications` | Notifications + preferences |
| FilesModule | `/api/files` | File upload, analysis, management |
| ImportsModule | `/api/imports` | Data import engine |
| SystemExportModule | `/api/admin` | System stats, export, integrity check |
| AuditModule | `/api/audit` | Audit log viewer |
| WebsocketModule | — | Real-time events via Socket.IO |

### 6.2 Authentication Flow

```
POST /api/auth/login        → { accessToken, refreshToken }
POST /api/auth/refresh       → { accessToken } (using refresh cookie)
POST /api/auth/register      → Create user
POST /api/auth/logout        → Invalidate tokens
GET  /api/auth/me            → Current user profile
POST /api/auth/forgot-password → Send reset email
POST /api/auth/reset-password  → Reset with token
```

JWT Strategy:
- Access token: 15 min expiry
- Refresh token: 7 day expiry, stored in DB
- Auto-refresh interceptor on frontend (401 → retry with new token)

### 6.3 Role-Based Access Control (RBAC)

| Role | Key Permissions |
|------|----------------|
| `admin` | Full system access, user management, system export |
| `pm` | All tracks, all tasks, analytics, AI features |
| `track_lead` | Own track only, tasks within track, distribution analytics |
| `employee` | Own assigned tasks, daily updates, comments |
| `hr` | Employee management, daily updates |

Implementation:
- `@Roles('admin', 'pm')` decorator on controllers
- `RolesGuard` validates `user.role` from JWT payload
- `JwtAuthGuard` on all protected routes
- `TrackPermission` model for granular per-track access

---

## 7. Frontend Architecture

### 7.1 Routing (Next.js App Router)

```
/login                    → Login page
/register                 → Registration
/forgot-password          → Password reset request
/(dashboard)/             → Home (role-based redirect)
/(dashboard)/dashboard    → Executive dashboard (admin, pm)
/(dashboard)/tracks       → Track listing
/(dashboard)/tracks/[id]  → Track detail (9 tabs: tasks, reports, updates, 
                            attachments, comments, scope, details, 
                            achievement*, deviation*)
/(dashboard)/tasks        → Global task management
/(dashboard)/gantt        → Gantt chart view
/(dashboard)/reports      → Reports management
/(dashboard)/updates      → Daily updates feed
/(dashboard)/employees    → Employee management
/(dashboard)/penalties    → Violations
/(dashboard)/files        → File repository
/(dashboard)/ai-reports   → AI report generation
/(dashboard)/ai-analyze   → AI file analysis
/(dashboard)/ai-insights  → AI intelligence module
/(dashboard)/search       → Semantic search
/(dashboard)/import       → Data import wizard
/(dashboard)/executive-tasks → Executive task sheets
/(dashboard)/users        → User management (admin only)
/(dashboard)/system-export → System backup (admin only)

* Achievement/Deviation tabs visible only in Distribution track
  for admin, pm, track_lead roles
```

### 7.2 State Management

- **Zustand** for global state (auth, tasks, notifications)
- **React state** for local component state
- **SWR-like pattern** with `useCallback` + `useEffect` for data fetching
- **Auto-refresh** on dashboards (15-second intervals)

### 7.3 API Client (`lib/api.ts`)

Single Axios instance with:
- Base URL from `NEXT_PUBLIC_API_BASE_URL`
- Request interceptor: auto-inject JWT from localStorage
- Response interceptor: auto-refresh on 401 (queue mechanism)
- 20+ API groups: `authApi`, `tasksApi`, `tracksApi`, `reportsApi`, etc.

### 7.4 Design System

- **Theme:** Dark glassmorphism (`.glass` class = `bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl`)
- **Font:** IBM Plex Sans Arabic
- **Primary Color:** `#10B981` (Emerald/Brand green)
- **Direction:** RTL by default (`<html dir="rtl">`)
- **Components:** Custom + shadcn/ui patterns
- **Charts:** Recharts with unified theme (`lib/chart-theme.ts`)
- **Numbers:** English format only (`en-US` locale, `ar-SA-u-nu-latn` for dates)

---

## 8. AI Layer

### 8.1 AI Engine Module

```
/api/ai-engine/insights        → Generated insights from platform data
/api/ai-engine/copilot         → Natural language Q&A about platform data
/api/ai-engine/alerts          → Smart anomaly detection alerts
/api/ai-engine/predictions     → Performance forecasting
/api/ai-engine/executive-summary → CEO-level summary
```

### 8.2 AI Reports Module

```
POST /api/ai/reports/generate  → Generate report (daily, weekly, executive, etc.)
GET  /api/ai/reports           → List generated reports
GET  /api/ai/reports/:id       → Get specific report
GET  /api/ai/reports/:id/excel → Download as Excel
```

### 8.3 Data Flow

```
Platform Data (Tasks, Reports, Updates, KPIs)
    ↓
Analytics Service (aggregation + computation)
    ↓
AI Engine Service (structured prompts → OpenAI GPT-4o)
    ↓
Structured Output (insights, recommendations, summaries)
    ↓
Frontend (cards, alerts, copilot chat)
```

### 8.4 Prompt Strategy

- System prompt provides role context + data schema
- User data injected as structured JSON
- Output format enforced (JSON schema for insights)
- Token-efficient: send aggregated stats, not raw records
- Caching: cache AI responses to avoid repeated API calls

---

## 9. Real-Time System

### WebSocket (Socket.IO)

Events:
- `task:created`, `task:updated`, `task:deleted`
- `notification:new`
- `update:created`

Used for:
- Live dashboard updates
- Notification bell counter
- Task status changes

---

## 10. File Handling

### Upload Flow

```
Client → FormData (multipart) → Multer (disk storage) → Database record
```

### Features
- Max file size: 50MB per file
- Allowed: PDF, DOCX, XLSX, PPTX, images, CSV, ZIP
- Blocked: EXE, JS, SH, BAT, etc.
- Arabic filename fix: `fixMulterFilename()` (Buffer latin1 → UTF-8)
- Chunked upload for large report attachments
- Content-Disposition with UTF-8 encoding for downloads

### Storage
- Local disk (`uploads/` directory) in current deployment
- `StorageModule` abstraction layer (ready for S3 migration)

---

## 11. Security

| Layer | Implementation |
|-------|---------------|
| Authentication | JWT + Refresh tokens (HttpOnly) |
| Authorization | Role-based guards (`@Roles` decorator) |
| Rate Limiting | ThrottlerModule (100 req/min) |
| Input Validation | class-validator DTOs |
| CORS | Origin filtering |
| Headers | Helmet middleware |
| File Upload | Extension + MIME type + size validation |
| Audit | Full action logging (AuditLog model) |
| Password | bcrypt hashing |
| SQL Injection | Prisma parameterized queries |

---

## 12. Deployment

### Current Production

```
┌──────────────────────┐     ┌─────────────────────┐
│   Railway             │     │   Render              │
│   (Single Container)  │     │   (PostgreSQL 16)     │
│                       │     │                       │
│   NestJS API :4000    │────▶│   nusuk_db            │
│   Next.js   :8080     │     │   Frankfurt region    │
│                       │     │                       │
└──────────────────────┘     └─────────────────────┘
```

### Startup Script (`start.sh`)

```
1. Validate env vars (DATABASE_URL, JWT_SECRET, JWT_REFRESH_SECRET)
2. Run: prisma db push (sync schema)
3. Run: prisma seed (if needed)
4. Start API on port 4000
5. Wait for API health check
6. Start Next.js standalone on port 8080
```

### Environment Variables

| Variable | Purpose |
|----------|---------|
| `DATABASE_URL` | PostgreSQL connection string (with `?sslmode=require`) |
| `JWT_SECRET` | Access token signing key |
| `JWT_REFRESH_SECRET` | Refresh token signing key |
| `JWT_ACCESS_EXPIRES` | Access token TTL (default: 15m) |
| `JWT_REFRESH_EXPIRES` | Refresh token TTL (default: 7d) |
| `API_PORT` | Backend port (default: 4000) |
| `PORT` | Frontend port (default: 8080) |
| `NODE_ENV` | production / development |
| `CORS_ORIGINS` | Allowed origins |
| `NEXT_PUBLIC_API_BASE_URL` | Frontend → Backend URL |
| `OPENAI_API_KEY` | OpenAI API key |

---

## 13. Distribution Track (Specialized Module)

### Achievement Engine (نسبة الإنجاز)

**Input (raw data only):**
- Date (Gregorian + Hijri via bi-directional sync)
- Batches, Cards, Cards/Specialist/Hour, Duration, Specialists

**Calculation:**
```
Expected = cardsPerHour × duration × specialists
Achievement % = (actualCards / expected) × 100
```

- Values >100% = overachievement (green badge)
- Rounded to 1 decimal place
- Division-by-zero safe

### Deviation Engine (نسبة الانحراف)

**4 independent subsections:**
1. **Inputs Deviation:** Platform vs Factory vs Distribution
2. **Appointment Booking (3H):** Companies booked vs total
3. **Completion Certificate:** Completion %
4. **System Reports:** Platform/Apple/Android issue distribution

**Access:** admin, pm, track_lead (Distribution only)

---

## 14. Performance & Resilience

### Database
- Prisma singleton pattern (`PrismaService`)
- Connection retry (5 attempts with backoff)
- SSL for Render PostgreSQL
- Proper `onModuleInit` / `onModuleDestroy` lifecycle

### API
- Rate limiting: 100 req/min per IP
- Request timeout: 600 seconds
- Body size limit: 500MB (for imports)
- Structured error responses

### Frontend
- Auto-refresh dashboards (15s interval)
- Optimistic UI updates
- Error boundaries
- Loading skeletons
- Toast notifications (react-hot-toast)

---

## 15. Future Roadmap

### Phase 1 (Current)
- [x] Core platform (tasks, tracks, reports, updates)
- [x] Executive dashboard with analytics
- [x] Distribution achievement + deviation
- [x] AI reports + insights
- [x] Gantt chart + dependencies
- [x] Semantic search

### Phase 2 (Planned)
- [ ] Multi-tenancy (PostgreSQL RLS)
- [ ] ClickUp integration (bidirectional sync)
- [ ] Mobile app (React Native)
- [ ] Advanced notifications (WhatsApp/SMS)
- [ ] Custom dashboard builder

### Phase 3 (Future)
- [ ] Redis caching layer
- [ ] ClickHouse analytics warehouse
- [ ] Custom ML models (time-series forecasting)
- [ ] SSO (SAML 2.0 / OAuth)
- [ ] Billing system (Stripe)

---

## 16. Key Design Decisions

| Decision | Rationale |
|----------|-----------|
| Single container (API + Frontend) | Simplifies deployment for current scale |
| Prisma over raw SQL | Type-safe queries, auto-migrations, schema-first |
| NestJS over Express | Module system, DI, guards, decorators — enterprise patterns |
| Zustand over Redux | Lightweight, less boilerplate, sufficient for current needs |
| Recharts over D3 | React-native, declarative, good enough for dashboards |
| Arabic-first RTL | Primary market requirement |
| English numerals only | Consistency across charts, tables, exports |
| Monorepo (npm workspaces) | Shared types, single build, simpler CI |
| Dark theme default | Executive feel, modern look |

---

*End of Architecture Document*
