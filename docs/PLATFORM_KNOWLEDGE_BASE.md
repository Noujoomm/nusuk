# PLATFORM_KNOWLEDGE_BASE — قاعدة معرفة منصة رؤية (Roya Platform)

> وثيقة حيّة تُبنى مرحلة بمرحلة لغرض واحد: تزويد AI Agent داخل المنصة بمعرفة كاملة ودقيقة عن الكود، قاعدة البيانات، الـAPIs، والـbusiness logic ليعمل بدقة عالية.

**المصدر:** `Noujoomm/nusuk-platform` — branch `main`
**Production URL:** roya2030.org (Railway deploy)

---

## جدول المحتويات

| المرحلة | الموضوع | الحالة |
|---|---|---|
| 1 | هيكل المشروع والـstack | ✅ مكتمل |
| 2 | مساعد رؤية (Roya Assistant) — Phase 1 | ✅ مكتمل |
| 3 | AI Agent V2 (Claude + Tools) — Phase 1 | ✅ مكتمل |
| 4 | — | pending |
| 4 | — | pending |
| 5 | — | pending |

---

## المرحلة 1 — هيكل المشروع والـstack

**آخر تحديث:** 2026-04-18 · commit مرجعي: `f5c1087` (post-Railpack migration).

### 1.1 طبيعة المستودع

- **Monorepo** بنمط **npm workspaces** (`apps/*`, `packages/*`). لا يوجد Turborepo ولا pnpm ولا Yarn؛ `package-lock.json` واحد على الجذر يغطي كل الـworkspaces.
- **Node:** `>=20.0.0` (محدّد في `package.json#engines`).
- **التطبيقات:** اثنان (`apps/api`, `apps/web`) + حزمة مشتركة واحدة شبه فارغة (`packages/shared`).

### 1.2 شجرة الجذر

```
nusuk-platform/
├─ apps/
│  ├─ api/                       ← NestJS 10 + Prisma 6 + Postgres (خلفية)
│  │  ├─ src/                    ← 34 module
│  │  ├─ prisma/                 ← schema.prisma (1663 سطر) + 6 migrations
│  │  ├─ scripts/
│  │  ├─ uploads/                ← multer temp dir (runtime فقط)
│  │  └─ Dockerfile              ← غير مستخدَم من Railway
│  └─ web/                       ← Next.js 14 App Router + Tailwind + Zustand (واجهة)
│     ├─ src/
│     │  ├─ app/(dashboard)/     ← 26 route (RTL Arabic-first)
│     │  ├─ components/
│     │  ├─ lib/                 ← api.ts (axios)، utils.ts، hooks مساندة
│     │  ├─ stores/              ← auth.ts, tasks.ts, notifications.ts (Zustand)
│     │  ├─ hooks/
│     │  └─ types/
│     ├─ public/
│     └─ Dockerfile              ← غير مستخدَم
├─ packages/
│  └─ shared/                    ← @nusuk/shared (ملف src/index.ts فقط — شبه فارغ)
├─ docs/                         ← ARCHITECTURE, AZURE_DEPLOYMENT, AZURE_FAST_DEPLOY,
│                                   RAILWAY_DEPLOYMENT + هذا الملف
├─ infra/main.bicep              ← Azure IaC (غير نشط)
├─ scripts/import_excel.py       ← سكربت استيراد منفصل (Python)
├─ backups/                      ← snapshot JSON تاريخي (فبراير)
├─ docker-compose.yml            ← dev environment (Postgres + API + Web)
├─ start.sh                      ← supervisor داخل الحاوية على Railway
├─ railway.json                  ← builder = RAILPACK (Metal env)
├─ render.yaml + render-*.sh     ← ✗ legacy (غير مستخدَم)
├─ vercel.json                   ← ✗ legacy
├─ .env / .env.example           ← DATABASE_URL, JWT_SECRET, JWT_REFRESH_SECRET,
│                                   JWT_ACCESS_EXPIRES, JWT_REFRESH_EXPIRES, API_PORT,
│                                   NODE_ENV, CORS_ORIGINS, [NEXT_PUBLIC_API_BASE_URL,
│                                   NEXT_PUBLIC_SOCKET_URL — اختياريان]
└─ package.json                  ← workspaces + build/db:deploy/start scripts
```

### 1.3 الـStack الفعلي

**Backend (`apps/api`)**

| الفئة | المحتوى |
|---|---|
| Framework | NestJS 10.4.15 (platform-express, platform-socket.io, websockets, schedule, throttler, passport, jwt, config) |
| ORM | Prisma 6.4.1 (`@prisma/client`) — provider `postgresql` |
| Auth | JWT access + refresh · `passport-jwt` · جدول `refresh_tokens` لدعم revocation |
| Realtime | Socket.IO (module `websocket/`) |
| Validation | class-validator + class-transformer — Global ValidationPipe مع `whitelist: true` + `forbidNonWhitelisted: true` |
| AI | `openai` SDK (6.x) · نقطة واحدة مركزية في `openai/openai.service.ts` |
| Office exports | `docx`, `exceljs`, `pptxgenjs`, `archiver`, `pdfkit` (غير فعّال) |
| Storage | Postgres كـ`DB_CHUNKED` (chunks 2MB) — `StorageService` يدعم LOCAL/S3 لكن الإنتاج DB فقط |
| Misc | bcrypt · helmet · cookie-parser · nodemailer · resend · applicationinsights (Azure) · openai |
| Build output | `dist/` — entry: `dist/src/main.js` |

**Frontend (`apps/web`)**

| الفئة | المحتوى |
|---|---|
| Framework | Next.js 14.2 — App Router · `output: 'standalone'` · Arabic RTL |
| UI | Tailwind CSS + tailwind-merge · lucide-react icons · react-hot-toast · recharts |
| State | Zustand (stores: `auth.ts`, `tasks.ts`, `notifications.ts`) — لا Redux/RTK/React Query |
| HTTP | Axios instance مع interceptor لـauto refresh على 401 (`src/lib/api.ts`) |
| Realtime client | `socket.io-client` |
| Locale | hijri-converter · date-fns (en) |
| Build output | `.next/standalone/apps/web/server.js` (مسار monorepo standalone) |

**Shared (`packages/shared`)**

- اسم الحزمة: `@nusuk/shared`.
- المحتوى حالياً: `src/index.ts` واحد تقريباً فارغ — الحزمة شبه مهجورة، لا يوجد types أو utilities مشتركة فعلية. فرصة لتوحيد DTOs/enums لاحقاً.

### 1.4 قاعدة البيانات (لمحة عامة — تفصّل في مرحلة لاحقة)

- Provider: PostgreSQL.
- Schema: ملف واحد `apps/api/prisma/schema.prisma` بطول **1663 سطر**.
- عدد الـmigrations المُسجَّلة محلياً: **6** (init + add_excel_models + add_enterprise_modules + phase1_collaboration + phase2_tasks_ai + …).
- **⚠️ مهم:** الإنتاج على Railway يُسيَّر بـ`prisma db push` (`npm run db:deploy`) وليس بـ`prisma migrate deploy`. جدول `_prisma_migrations` على قاعدة الإنتاج قد يكون غير مكتمل. **لا يُستخدَم `migrate deploy` إلا بعد تشغيل `migrate resolve --applied` يدوياً لكل migration — وإلا سيفشل الـdeploy بخطأ P3005/P3009.**

### 1.5 قائمة modules في الـAPI (34 module · 29 لها controllers)

**Core & infra**

| Module | غرض مختصر |
|---|---|
| `common/` | PrismaService, JwtAuthGuard, RolesGuard, `@Roles()` decorator, `@CurrentUser()` decorator, `fixMulterFilename()` |
| `auth/` | تسجيل دخول · refresh tokens · reset password |
| `users/` | إدارة المستخدمين |
| `tracks/` | المسارات (Tracks) — المفهوم الأساسي للتنظيم |
| `audit/` | AuditLog لكل الأحداث (before/after JSON snapshots) |
| `storage/` | StorageService (LOCAL/S3) — لا يُستخدَم في الإنتاج |
| `websocket/` | Socket.IO gateway |

**Features**

| Module | غرض مختصر |
|---|---|
| `reports/` | التقارير (Report + ReportAttachment + ReportFileChunk) — القلب النصي للمنصة |
| `tasks/` | المهام التنفيذية (Task + TaskFile + TaskChecklist + AdminNote + TaskUpdate + TaskAuditLog) |
| `executive-tasks/` | مهام تنفيذية من نوع Excel-import (sheets, sortOrder) |
| `daily-updates/` | تحديثات يومية مع مرفقات و"read" tracking |
| `gantt/` | جانت + ResourceAssignment |
| `scope-blocks/` | نطاقات العمل (scope) + مرفقاتها وتحديثاتها |
| `progress/` | حساب التقدم والإنجاز |
| `analytics/` | تحليلات مجمّعة |
| `productivity/` | مقاييس إنتاجية |
| `kpi-management/` | KPI definitions + entries |
| `distribution/` | Achievements + Deviations (مسار التوزيع) |
| `comments/` | تعليقات على التقارير |
| `notifications/` | إشعارات + preferences |
| `search/` | بحث داخلي |
| `files/` | مخزن الملفات العام (UploadedFile) |
| `imports/` + `data-import/` | استيراد من Excel |
| `system-export/` | تصدير كامل للنظام |

**AI family (ست modules)**

| Module | غرض |
|---|---|
| `openai/` | عميل OpenAI مركزي — `chat()`, `generateEmbedding()`, `generateEmbeddings()` |
| `ai-engine/` | Insights + predictions + executive summary + command-center |
| `ai-reports/` | تقارير مولّدة آلياً من KPIs/Tasks |
| `ai-analysis/` | تحليل ملفات بالـAI |
| `embeddings/` | فهرسة entities للبحث الدلالي |
| `insights/` | تنبيهات قواعدية rule-based (لا AI) |
| `reports-intelligence/` ⭐ | **المركز الجديد** — تجميع Reports + إعادة صياغة + تصدير (docx/xlsx/pptx/md/txt/pdf) |

**Back-office**

| Module | غرض |
|---|---|
| `support-services/` | Custody + CustodyItem + CustodyMember + CustodyInvoice + SupportRequest |
| `custody-funds/` | CustodyFund v2 + Transactions + Members + Invoices + Alerts |

### 1.6 واجهة الويب — الـroutes

Dashboard group `(dashboard)` (26 صفحة):

```
/                        — الرئيسية
/dashboard               — لوحة قيادة تنفيذية
/tracks, /tracks/[id]    — المسارات + تفاصيل
/tasks                   — المهام
/gantt                   — مخطط جانت
/productivity            — الإنتاجية
/reports                 — التقارير
/ai-reports              — التقارير الذكية (توليد)
/ai-insights             — رؤى AI
/ai-analyze              — تحليل ملفات AI
/reports-intelligence           — مركز ذكاء التقارير ⭐ (admin + system_manager)
/reports-intelligence/[id]/print — طباعة/PDF
/achievements-progress   — تقدم الإنجازات
/track-performance       — أداء المسارات
/executive-tasks         — مهام تنفيذية
/employees               — الموظفون
/files                   — الملفات
/penalties               — الغرامات
/kpis                    — مؤشرات الأداء
/search                  — بحث ذكي
/import                  — استيراد البيانات
/updates                 — التحديثات اليومية
/support-services        — خدمات مساندة
/system-export           — النظام والنسخ الاحتياطي
/users                   — المستخدمون (admin)
/admin                   — إدارة
/command-center          — مركز القيادة
```

الـsidebar في [apps/web/src/components/sidebar.tsx](../apps/web/src/components/sidebar.tsx) يُصفّي الروابط حسب `user.role` (مصفوفة `roles: []` لكل entry).

### 1.7 بنية النشر (Deployment footprint)

**نشط (production):**
- **Railway** — service متصل بـ`Noujoomm/nusuk-platform` main.
  - `builder: RAILPACK` (Metal env — بعد الترحيل من Nixpacks).
  - `buildCommand: npm run build` (يشغّل `nest build` ثم `next build`).
  - `preDeployCommand: npm run db:deploy` (prisma db push).
  - `startCommand: bash start.sh` — يشغّل API في الخلفية، ينتظر `/health` لمدة 60s، ثم `exec` Next.js standalone.
  - `healthcheckPath: /health`, `healthcheckTimeout: 180`.
  - حاوية واحدة تستضيف العمليتين؛ Next.js `rewrites` في [next.config.js](../apps/web/next.config.js) تمرّر `/api/*`, `/health`, `/uploads/*`, `/socket.io/*` إلى API داخلياً.

**Legacy غير مستخدم (يُحتفظ به في الـrepo):**
- `render.yaml` + `render-build.sh` + `render-start.sh`
- `vercel.json`
- `infra/main.bicep` (Azure)
- `apps/api/Dockerfile`, `apps/web/Dockerfile` (Railway يتجاهلها صراحةً عند استخدام builder غير DOCKERFILE)

**Local dev:**
- `docker-compose.yml` يشغّل Postgres + API + Web. Scripts: `npm run dev:api`, `npm run dev:web`.

### 1.8 متغيرات البيئة المعروفة

من `.env.example`:

| المتغير | الغرض | إلزامي |
|---|---|---|
| `DATABASE_URL` | Postgres connection | نعم |
| `JWT_SECRET` | توقيع access tokens | نعم |
| `JWT_REFRESH_SECRET` | توقيع refresh tokens | نعم |
| `JWT_ACCESS_EXPIRES` | `15m` افتراضياً | لا |
| `JWT_REFRESH_EXPIRES` | `7d` افتراضياً | لا |
| `API_PORT` | 4000 افتراضياً | لا |
| `NODE_ENV` | `production` على Railway | لا |
| `CORS_ORIGINS` | `*` افتراضياً | لا |
| `NEXT_PUBLIC_API_BASE_URL` | للـfrontend، يُترَك فارغاً في single-service | لا |
| `NEXT_PUBLIC_SOCKET_URL` | للـsocket client | لا |
| `OPENAI_API_KEY` | لتشغيل AI features | لا (لكن AI معطّل بدونه) |
| `OPENAI_MODEL` | `gpt-4o` افتراضياً | لا |
| `OPENAI_EMBEDDING_MODEL` | `text-embedding-3-small` افتراضياً | لا |
| `STORAGE_PROVIDER` | `LOCAL` أو `S3` — حالياً غير مُفعَّل (DB_CHUNKED) | لا |

`start.sh` يفرض وجود `DATABASE_URL`, `JWT_SECRET`, `JWT_REFRESH_SECRET` ويفشل fast-start بدونها.

### 1.9 الأدوار (Roles) المعرَّفة

`enum Role` في [schema.prisma](../apps/api/prisma/schema.prisma):

| Role | تسمية عربية | ملاحظة |
|---|---|---|
| `admin` | مدير النظام | أعلى صلاحية تاريخياً |
| `system_manager` | المدير التنفيذي | أُضيف مع `reports-intelligence` |
| `pm` | مدير المشروع | |
| `track_lead` | قائد المسار | |
| `employee` | موظف | |
| `hr` | موارد بشرية | |

الـlabels في [apps/web/src/lib/utils.ts](../apps/web/src/lib/utils.ts) → `ROLE_LABELS`.

الحماية تتم عبر `@UseGuards(JwtAuthGuard, RolesGuard)` + `@Roles('admin', …)` — انظر `common/guards/roles.guard.ts` و`common/decorators/roles.decorator.ts`.

### 1.10 ملاحظات مهمة للـAI Agent المستقبلي

1. **مرجع الحقيقة للـDB schema:** ملف `apps/api/prisma/schema.prisma` فقط. migrations تاريخية وقد لا تعكس الإنتاج.
2. **مرجع الـAPI endpoints:** ملفات `*.controller.ts` في `apps/api/src/*/` — 29 controller.
3. **مرجع الـroles لكل endpoint:** decorator `@Roles(...)` مباشرة فوق الدالة، وإلا الـendpoint مفتوح لأي مستخدم مُوثَّق.
4. **مرجع الـfrontend API client:** `apps/web/src/lib/api.ts` — كل الـaxios calls موحّدة هنا.
5. **AI خمسة modules + واحد جديد:** يحتاج mapping دقيق في المرحلة التالية (أي module يخدم أي غرض؟). الخلط بينها سهل.
6. **`reports`** و**`ai-reports`** و**`reports-intelligence`** كلها موجودة — أسماء متقاربة لكن وظائف مختلفة تماماً:
   - `reports/` = CRUD للتقارير اليدوية التي يكتبها المستخدمون.
   - `ai-reports/` = تقارير AI مولّدة من KPIs/Tasks dashboard data.
   - `reports-intelligence/` = تجميع تقارير `reports/` + إعادة صياغة AI + تصدير.
7. **Prisma db push vs migrate deploy:** الإنتاج يعتمد الأول. تحويل الإنتاج للـmigrate deploy يحتاج `prisma migrate resolve --applied` لكل migration أولاً.
8. **Arabic filename handling:** موجود في `common/fix-filename.ts` — يجب استخدامه في كل multer interceptor لمنع mojibake.
9. **Storage strategy:** ملفات كبيرة تُخزَّن chunked في Postgres (2MB/chunk). لا S3 في الإنتاج حالياً رغم دعم الكود له.
10. **Global throttler:** كل endpoint محمي بـ`ThrottlerGuard` (100 طلب/دقيقة). قد يظهر 429 تحت الضغط.

---

## المرحلة 2 — مساعد رؤية (Roya Assistant) — Phase 1

**آخر تحديث:** 2026-04-19.

### 2.1 الهدف من المرحلة

تحويل نص الـsystem prompt الذي كتبته الإدارة إلى مساعد يعمل فعلاً داخل المنصة — **Q&A سياقي فقط دون تنفيذ أدوات حيّة**. تنفيذ الأدوات (function calling) يُؤجَّل لـPhase 2 (المرحلة 3 من الـKB).

### 2.2 المسار (Route) ومن يصل إليه

- `/dashboard/assistant` — متاح لكل الأدوار الست (admin, system_manager, pm, track_lead, employee, hr).
- يظهر في الـsidebar تحت مسمى **"مساعد رؤية"** (أيقونة `Sparkles`).
- الحماية: `JwtAuthGuard` على الـendpoint؛ لا `@Roles` — السياق هو الذي يُشكّل ما يستطيع المستخدم طلبه.

### 2.3 الـendpoints الخلفية

| Method | Path | غرض | حماية |
|---|---|---|---|
| `POST` | `/agent/chat` | محادثة عابرة — ترجع ردّ النموذج فقط | JWT + ValidationPipe |

**Body schema** ([agent.dto.ts](../apps/api/src/agent/agent.dto.ts)):
```ts
{
  message: string,              // 1..8000 chars
  history?: Array<{             // optional, max 30 turns
    role: 'user' | 'assistant',
    content: string
  }>
}
```

**Response:** `{ reply: string, modelUsed: string }` (بدون `sessionId` — المحادثة عابرة في Phase 1).

### 2.4 حقن السياق الديناميكي

كل استدعاء يبني `AgentUserContext` من قاعدة البيانات، **ليس من جسم الطلب**، لمنع انتحال الأدوار:

```ts
{
  userId, userName, userRole,
  userTrackIds?,           // يُستخرَج من TrackPermission فقط لـtrack_lead
  currentDateIso,
  llmDisplayName           // من OPENAI_MODEL، افتراضياً gpt-4o
}
```

ثم يُمرَّر إلى `renderAgentSystemPrompt(ctx)` التي تنتج الـsystem prompt النهائي مع كتلة "السياق الحالي للمحادثة" على الرأس قبل الـprompt الثابت.

### 2.5 الملفات الجديدة

```
apps/api/src/agent/
├─ agent-prompt.ts     ← النص الثابت + دالة render مع interpolation
├─ agent.dto.ts        ← ChatRequestDto + ChatMessageDto (class-validator)
├─ agent.service.ts    ← buildContext() + chat() — يستدعي OpenAIService
├─ agent.controller.ts ← POST /agent/chat — JwtAuthGuard فقط
└─ agent.module.ts     ← imports: PrismaModule, OpenAIModule

apps/web/src/app/(dashboard)/assistant/
└─ page.tsx            ← chat UI — RTL، بدون persistence (state-only)
```

+ تعديلات:
- `apps/api/src/app.module.ts`: يسجّل `AgentModule`.
- `apps/web/src/lib/api.ts`: يُصدِّر `agentApi.chat(message, history)`.
- `apps/web/src/components/sidebar.tsx`: إدخال nav item "مساعد رؤية" لكل الأدوار.

### 2.6 سلوكيات صلبة تم فرضها

1. **لا tool hallucination:** الـprompt يذكر صراحةً أن الأدوات قيد التطوير ويمنع النموذج من ادّعاء استدعاء tool أو فبركة نتائج.
2. **History capped:** العميل يرسل history لكن السيرفر يقطع آخر 20 رسالة فقط قبل الإرسال للنموذج. `class-validator` يفرض حد 30 رسالة على مستوى الـDTO.
3. **Message-size cap:** `MaxLength(8000)` على كل رسالة.
4. **No DB writes:** لا توجد جداول جديدة. Persistence مؤجَّل لـPhase 2 لتفادي تعقيد migration قبل أن نحتاجه فعلاً.
5. **No audit log:** لم نربط `AuditService` بهذه المحادثات بعد — محادثات عابرة لا تستحق تضخيم `audit_logs`. سيُراجَع مع Phase 2 عند إضافة persistence.
6. **Rate limit:** يخضع لـ`ThrottlerGuard` العام (100 طلب/دقيقة/IP) — بدون تخصيص إضافي.

### 2.7 حدود Phase 1 (صريحة)

- **لا function calling.** النموذج لا يقرأ أو يكتب أي شيء في الـDB.
- **لا persistence.** إعادة تحميل الصفحة = محادثة جديدة.
- **لا streaming.** الرد يصل كاملاً أو يفشل كاملاً.
- **نموذج واحد.** `OPENAI_MODEL` (افتراضياً `gpt-4o`). التحويل لـClaude يتطلب إضافة `@anthropic-ai/sdk` وسطر واحد في `agent.service.ts`.
- **حقن أعمق للسياق** (آخر نشاط المستخدم، `CURRENT_SEASON` حج/عمرة، تاريخ هجري) placeholder في `AgentUserContext` لكن غير مفعّل — يُقرأ لاحقاً من `AuditLog` والجداول المعنية.

### 2.8 ماذا يحتاج Phase 2 لاحقاً

1. **Tool catalogue منظَّم** يلتفّ حول الـ29 controller الموجودة (read-only أولاً).
2. **Persistence:** جداول `AgentConversation` + `AgentMessage` (messages indexed by conversation) + استرجاع آخر 20 جلسة للمستخدم.
3. **Streaming:** Server-Sent Events من `/agent/chat/stream` لتحسين الإحساس بالسرعة.
4. **Tool-use audit:** كل استدعاء tool يُسجَّل في `AuditService` مع `entityType: 'agent_tool_call'` و`afterData: { tool, inputs, outputSummary }`.
5. **Per-role tool gating:** كل tool يحمل metadata للأدوار المسموح لها، والـagent runtime يصفّي catalogue قبل تمريره للنموذج.
6. **Seasonality + hijri context:** فعيل `currentSeason` و`currentHijriDate` من مكتبة `hijri-converter` الموجودة على الـfrontend، أو الاستعلام عنها سيرفر-سايد.

### 2.9 كيف تجربه

1. تأكّد أن `OPENAI_API_KEY` مضبوط على Railway (`OpenAIService` يكتب warning في الـlogs عند غيابه).
2. بعد نشر الـcommit، افتح `/assistant` على roya2030.org.
3. اكتب سؤالاً مثل: "لخّص لي الفرق بين `reports` و`ai-reports` و`reports-intelligence`" — يجب أن يجيب بدقة لأن هذا في الـsystem prompt.
4. اطلب بيانات حيّة ("كم مهمة عليّ؟") — يجب أن يوجّهك لصفحة المسار/المهام بدلاً من فبركة رقم. هذا هو السلوك المطلوب حالياً.

---

## المرحلة 3 — AI Agent V2 (Claude + Tools) — Phase 1

**آخر تحديث:** 2026-04-19.

### 3.1 الفرق بينها وبين المرحلة 2

| الجانب | المرحلة 2 (`agent/`) | المرحلة 3 (`ai-agent/`) |
|---|---|---|
| المسار | `/dashboard/assistant` (صفحة كاملة) | `POST /ai-agent/chat` فقط — UI يأتي في Phase 2 من هذه المجموعة (Cmd+K) |
| النموذج | OpenAI `gpt-4o` (عبر `OpenAIService`) | Anthropic Claude Sonnet 4.5 (قابل للتبديل بالـenv) |
| Tools | لا | نعم — 3 أدوات read-only فعلية |
| Audit log | لا | نعم — جدول `AIAuditLog` مخصّص |
| Guardrails | basic (length cap) | طبقات: length + rate limit (20/min/user) + prompt-injection regex + output scrubber |
| Session persistence | client-only | لا قاعدة بيانات للمحادثات (بعد) — فقط audit log |
| Voice / Streaming / RAG | لا | مؤجَّل لمراحل 2/3/4 من السبيك |

الاثنان يتعايشان: مسار `/assistant` لا يزال يعمل على الـGPT ويخدم UI جاهز؛ `ai-agent` هو المسار الجديد الذي سيربط لاحقاً بـCommand Palette.

### 3.2 الملفات الجديدة

```
apps/api/src/ai-agent/
├─ ai-agent.module.ts
├─ ai-agent.controller.ts          ← POST /ai-agent/chat (JwtAuthGuard)
├─ ai-agent.service.ts             ← orchestration (context → guardrails → tools → audit)
├─ dto/chat-request.dto.ts
├─ interfaces/
│  ├─ agent-context.interface.ts
│  └─ tool-definition.interface.ts ← includes AgentRole union
├─ prompts/system-prompt.ts        ← stable prefix + runtime block (cacheable)
├─ services/
│  ├─ claude.service.ts            ← Anthropic SDK wrapper + tool-use loop (non-streaming)
│  ├─ guardrails.service.ts        ← length + rate + regex + output sanitizer
│  └─ tool-registry.service.ts     ← role-filtered catalogue + execution re-check
└─ tools/
   ├─ custody.tools.ts             ← list_custodies (SupportServicesService)
   ├─ invoices.tools.ts            ← list_custody_invoices (SupportServicesService)
   └─ distribution.tools.ts        ← distribution_achievement_dashboard + distribution_deviation_dashboard
```

### 3.3 Prisma schema

جدول واحد جديد + enum واحد:

- `AIAuditLog` — يسجَّل كل turn (ناجح، فاشل، محظور). لا حذف (لا `@@ttl` ولا cascade).
- `AIActionStatus` — `SUCCESS | FAILED | REQUIRES_CONFIRMATION | DENIED_BY_GUARDRAILS | DENIED_BY_PERMISSIONS`.
- `AIKnowledgeDocument` و`AIQuickAction` محضّران للمراحل القادمة، لكن لا كود يقرأ/يكتب عليها بعد.

**مؤجَّل عمداً لـPhase 4 (RAG):** `AIDocumentChunk` مع عمود `vector(1536)`. السبب:
- لا يوجد `pgvector` في الـmigrations ولا في الـschema الحالية.
- `prisma db push` في `preDeployCommand` سيفشل لو أضفنا `Unsupported("vector(1536)")` بدون `CREATE EXTENSION vector` مسبقاً على قاعدة Railway.
- إضافة العمود بـ`Bytes?` placeholder الآن = خلط semantics وندَن تقني. ننتظر المرحلة التي نستخدم فيها الـembeddings فعلياً.

### 3.4 متغيرات البيئة الجديدة

أُضيفت لـ`.env.example` (يحتاج ضبطها على Railway):

```
ANTHROPIC_API_KEY=sk-ant-...          # إلزامي — بدونها /ai-agent/chat يرد 503
ANTHROPIC_MODEL_DEFAULT=claude-sonnet-4-5
ANTHROPIC_MODEL_SIMPLE=claude-haiku-4-5   # Phase 2 routing
ANTHROPIC_MODEL_COMPLEX=claude-opus-4-5   # Phase 2 routing
AI_RATE_LIMIT_PER_MIN=20
AI_MAX_QUERY_LENGTH=2000
AI_MAX_TOKENS_PER_RESPONSE=4096
AI_AGENT_ENABLED=true
AI_WRITE_OPERATIONS_ENABLED=false       # Phase 1 = read-only
```

**مراعاة نسخة النموذج:** الـspec ذكر `claude-sonnet-4-5` (أحدث من 4-5 متاح الآن هو `claude-sonnet-4-6` و`claude-opus-4-7`). الاختيار يتم من الـenv vars فقط — تبديل الإصدار لا يحتاج أي تعديل على الكود.

### 3.5 الأدوات الثلاث (Phase 1)

| Tool | يغلف | الأدوار المسموحة |
|---|---|---|
| `list_custodies` | `SupportServicesService.listCustodies({status, search, page, pageSize})` | admin, system_manager, pm, track_lead |
| `list_custody_invoices` | `SupportServicesService.listInvoices({custodyId, status, search, dateFrom, dateTo, page, pageSize})` | نفس السابق |
| `distribution_achievement_dashboard` | `DistributionService.achievementDashboard()` | نفس السابق |
| `distribution_deviation_dashboard` | `DistributionService.deviationDashboard()` | نفس السابق |

كلها read-only و`isDestructive: false`. الـ`employee` و`hr` لا يصلان لأي منها في هذه المرحلة.

### 3.6 طبقات الحماية الأربع (من السبيك)

1. **Input validation** (قبل Claude): طول + rate limit + prompt-injection regex (عربي + إنجليزي) + empty check. Haiku off-topic probe **مؤجَّل** — يضاعف تكلفة كل request؛ الـprompt + tool catalogue بالفعل يضيّقان النطاق.
2. **System prompt**: persona + anti-jailbreak + Phase-1 read-only disclosure.
3. **Tool access control**: `ToolRegistryService.getForContext()` يفلتر الـcatalogue حسب الدور + `AI_WRITE_OPERATIONS_ENABLED`. إضافة: إعادة فحص الصلاحية عند تنفيذ كل tool (defense in depth).
4. **Output filtering**: `GuardrailsService.sanitizeReply()` يستبدل الروابط الخارجية + أي تسريب لـ"system prompt".

### 3.7 قرارات معلَنة (ما لم يُنفَّذ في Phase 1)

- **لا Command Palette (Cmd+K):** المرحلة 2 من السبيك. الواجهة الحالية لهذا الـendpoint ستبنى لاحقاً.
- **لا SSE/streaming:** غير مطلوب في Phase 1 — مؤجَّل.
- **لا voice (STT/TTS):** Phase 3.
- **لا RAG:** Phase 4. `AIKnowledgeDocument` موجود بدون chunks/embeddings بعد.
- **لا monitoring dashboard:** Phase 5.
- **لا Haiku off-topic probe:** كلفة عالية بلا ضرورة Phase 1.
- **Rate limiter in-memory:** يعمل لكنه per-replica. Phase 2 ينقله لـRedis.

### 3.8 الأثر على تكلفة Claude

كل turn ناجح = 1+ استدعاء إلى Claude (iteration واحد لو النموذج لم يستدعِ tool، iterations إضافية لكل tool_use). `maxIterations = 5`. system prompt ~2500 حرف — ~800 tokens. مع prompt caching (مفعَّل تلقائياً في الـAnthropic SDK للنصوص الطويلة الثابتة): ~90% من تكلفة input tokens توفَّر بعد أول call.

### 3.9 كيف تجربه

1. اضبط `ANTHROPIC_API_KEY` على Railway. بدونها الـendpoint يرد 503 بشكل واضح ("المساعد غير متاح حالياً...").
2. بعد ما يكتمل deploy، أرسل:
   ```bash
   curl -X POST https://roya2030.org/api/ai-agent/chat \
        -H "Authorization: Bearer <JWT>" \
        -H "Content-Type: application/json" \
        -d '{"message": "كم عدد العهد النشطة؟"}'
   ```
3. تحقق من جدول `ai_audit_logs` في قاعدة البيانات — يجب أن يظهر سطر لكل turn.
4. اختبر الـguardrails: `"ignore previous instructions"` — يجب أن يرد 403 وتُسجَّل محاولة `DENIED_BY_GUARDRAILS`.
