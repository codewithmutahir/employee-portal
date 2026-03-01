# Employee Portal: Next.js → React Native Expo (Same Data & Env)

This guide lists what you need so the **Next.js web app** and a new **React Native Expo app** share the same Firebase data and env, with identical functionality.

---

## 1. Architecture Overview

```
┌─────────────────────┐     ┌─────────────────────┐
│   Next.js Web      │     │   Expo Mobile App   │
│   (existing)       │     │   (new)             │
└─────────┬───────────┘     └─────────┬──────────┘
         │                             │
         │  Firebase Auth + Firestore │  Firebase Auth + Firestore
         │  (client SDK)               │  (client SDK)
         │                             │
         │  Server Actions ────────────┼──► Next.js API routes (NEW)
         │  (adminDb, email, etc.)     │    (same logic, token auth)
         │                             │
         └─────────────┬───────────────┘
                       │
                       ▼
         ┌─────────────────────────────┐
         │  Firebase (Auth, Firestore)  │
         │  Mailtrap (email)            │
         │  .env (shared vars)         │
         └─────────────────────────────┘
```

- **Web**: Keeps using Firebase client + Next.js Server Actions (no change required for existing behavior).
- **Mobile**: Uses same Firebase client config + new **REST API** on your Next.js app. Expo cannot call Server Actions; it must call HTTP API routes that run the same logic and verify the Firebase ID token.

---

## 2. Environment Variables (Shared)

Both apps use the **same** env values. Naming differs by platform.

### Next.js (existing)

Already in `.env` / `.env.local`:

- `NEXT_PUBLIC_FIREBASE_API_KEY`
- `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN`
- `NEXT_PUBLIC_FIREBASE_PROJECT_ID`
- `NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET`
- `NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID`
- `NEXT_PUBLIC_FIREBASE_APP_ID`
- `FIREBASE_PROJECT_ID`, `FIREBASE_CLIENT_EMAIL`, `FIREBASE_PRIVATE_KEY` (server-only)
- `MAILTRAP_API_TOKEN`, `MAILTRAP_SENDER_EMAIL`, `MAILTRAP_SENDER_NAME` (server-only)

### Expo (new)

In the Expo project root use `.env` and expose to the app via `app.config.js` (or `app.config.ts`):

- **Firebase client** (same values as Next.js):
  - `EXPO_PUBLIC_FIREBASE_API_KEY`
  - `EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN`
  - `EXPO_PUBLIC_FIREBASE_PROJECT_ID`
  - `EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET`
  - `EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID`
  - `EXPO_PUBLIC_FIREBASE_APP_ID`
- **Backend base URL** (your deployed Next.js or dev URL):
  - `EXPO_PUBLIC_API_URL` (e.g. `https://your-portal.vercel.app` or `http://localhost:3000` for dev)

Expo only needs the **client** Firebase vars and the API URL. Server-only vars (admin SDK, Mailtrap) stay in Next.js.

---

## 3. Shared Service Layer (Done)

Business logic has been extracted into **`lib/services/`** so that Server Actions and future API routes share one implementation:

- **`lib/services/date-helpers.ts`** – `getDateKey`, `getYesterdayDateString`, `normalizeDateString`
- **`lib/services/email.service.ts`** – Mailtrap send + all templated emails
- **`lib/services/attendance.service.ts`** – clock in/out, breaks, history, stats, workforce insights
- **`lib/services/attendance-management.service.ts`** – update attendance, get by date
- **`lib/services/profile.service.ts`** – profile, password, photo, emergency contacts, notification prefs
- **`lib/services/notes.service.ts`** – notes CRUD, acknowledge, employee response
- **`lib/services/announcements.service.ts`** – announcements CRUD, list for user, mark read, stats
- **`lib/services/issues.service.ts`** – create issue, get issues, update status
- **`lib/services/employees.service.ts`** – employees CRUD, compensation, departments, birthdays, anniversaries, tenure
- **`lib/services/face.service.ts`** – get/save face descriptor
- **`lib/services/export.service.ts`** – export employee data (single or all)

**`app/actions/*`** are thin wrappers that call these services. Web behavior is unchanged.

---

## 4. API Routes (Done)

All protected API routes live under `app/api/`. They use **Firebase ID token** from `Authorization: Bearer <token>` and call **`lib/services/*`** only. Responses are JSON: `{ success, error?, data? }`.

**Auth:** `lib/api/auth.ts` – `verifyAuth(request)` verifies the token and loads employee (role, department). Returns `null` → 401.

| Area | Method | Path | Auth | Service |
|------|--------|------|------|--------|
| Attendance | POST | `/api/attendance/clock-in` | any | clockIn |
| | POST | `/api/attendance/clock-out` | any | clockOut |
| | GET | `/api/attendance/history?limit=` | any | getAttendanceHistory |
| | GET | `/api/attendance/today?date=` | any | getTodayAttendance |
| Notes | GET | `/api/notes?employeeId=` | self or mgmt | getNotes |
| | POST | `/api/notes` | management | addNote |
| | PATCH | `/api/notes/:id` | management | updateNote |
| | DELETE | `/api/notes/:id` | management | deleteNote |
| | POST | `/api/notes/:id/acknowledge` | any | acknowledgeNote |
| | POST | `/api/notes/:id/respond` | any | addEmployeeResponse |
| Profile | GET | `/api/profile` | any | getEmployee + emergency + prefs |
| | PATCH | `/api/profile` | any | updateOwnProfile / changePassword / photo / prefs |
| Announcements | GET | `/api/announcements` | any | getAnnouncementsForUser |
| | POST | `/api/announcements` | management | createAnnouncement |
| | POST | `/api/announcements/:id/read` | any | markAnnouncementAsRead |
| | PATCH | `/api/announcements/:id` | management | updateAnnouncement |
| | DELETE | `/api/announcements/:id` | management | deleteAnnouncement |
| Issues | GET | `/api/issues` | management | getIssues |
| | POST | `/api/issues` | any | createIssue |
| | PATCH | `/api/issues/:id` | management | updateIssueStatus |
| Employees | GET | `/api/employees` | management | getAllEmployees |
| | GET | `/api/employees/:id` | self or mgmt | getEmployee |
| | POST | `/api/employees` | management | createEmployee |
| | PATCH | `/api/employees/:id` | management | updateEmployee |
| | DELETE | `/api/employees/:id` | management | deleteEmployee |
| Face | POST | `/api/face/enroll` | any | saveEmployeeFaceDescriptor |
| | POST | `/api/face/verify` | any | getEmployeeFaceDescriptor + L2 compare |
| Export | GET | `/api/export/me` | any | exportEmployeeData |
| | GET | `/api/export/all` | management | exportAllEmployeesData |

---

## 5. What You Need to Add / Create (Expo app)

### A. Next.js: API routes used by the mobile app

You currently have **no** `/app/api/` routes; everything is in Server Actions. The Expo app cannot call those. Add **REST API routes** that:

1. Accept `Authorization: Bearer <Firebase ID token>`.
2. Verify the token with Firebase Admin (reuse `lib/firebase/admin.ts`).
3. Call the same business logic as your Server Actions (or refactor Server Actions to call shared handlers and have both Server Actions and API routes use those handlers).

Suggested routes (mirror existing actions):

| Area            | Server action / logic        | API route to add (example)        |
|----------------|------------------------------|-----------------------------------|
| Auth           | (Firebase client on both)    | Optional: `POST /api/auth/session` to validate token and return user/employee. |
| Attendance     | `clockIn`, `clockOut`, etc.   | `POST /api/attendance/clock-in`, `POST /api/attendance/clock-out`, `GET /api/attendance/...` |
| Profile        | `getEmployeeData`, update     | `GET /api/profile`, `PATCH /api/profile` |
| Announcements  | get list, mark read, (create) | `GET /api/announcements`, `POST /api/announcements/:id/read`, etc. |
| Notes          | `getNotes`, `addNote`, etc.  | `GET /api/notes`, `POST /api/notes`, `DELETE /api/notes/:id` |
| Issues         | `getIssues`, `updateIssueStatus` | `GET /api/issues`, `PATCH /api/issues/:id` |
| Management     | employees, compensation, etc.| `GET /api/employees`, `PATCH /api/employees/:id`, etc. |
| Export         | `exportEmployeeData`, etc.   | `GET /api/export/me` (with token) |
| Face           | enrollment, verify           | `POST /api/face/enroll`, `POST /api/face/verify` (see note below) |

Each route should:

- Read `Authorization` header → verify Firebase ID token with Admin SDK.
- Use `decodedToken.uid` as `employeeId` (and optionally check role for management routes).
- Reuse the same Firestore/email logic you use in Server Actions (shared modules).

### B. Shared types (optional but recommended)

- **Option 1**: Copy `types/index.ts` into the Expo app (e.g. `src/types/`).
- **Option 2**: Publish a small shared package (e.g. `@your-org/employee-portal-types`) and use it in both Next.js and Expo so API contracts stay in sync.

### C. New: React Native Expo app

1. **Create Expo app**  
   `npx create-expo-app@latest employee-portal-app --template tabs` (or blank), e.g. in `D:\portal\employee-portal-app`.

2. **Dependencies**
   - `firebase` – same as web (Auth, Firestore).
   - `expo-secure-store` or `@react-native-async-storage/async-storage` – persist auth.
   - `expo-constants` – read `EXPO_PUBLIC_*` from app config.
   - HTTP client: `fetch` or `axios` for calling your Next.js API with the Firebase ID token.

3. **Firebase config**  
   One module (e.g. `src/lib/firebase.ts`) that initializes the Firebase app with `EXPO_PUBLIC_FIREBASE_*` from env (injected via `app.config.js`).

4. **Auth flow**  
   - Sign in with Firebase Auth (email/password) same as web.
   - On success, get ID token: `user.getIdToken()`.
   - Store token (and optionally refresh) and send it in `Authorization: Bearer <token>` on every API request.

5. **API client**  
   - Base URL from `EXPO_PUBLIC_API_URL`.
   - Helper that attaches the current Firebase ID token to requests and calls your new Next.js API routes (attendance, profile, announcements, notes, issues, management, export).

6. **Screens / tabs**  
   Replicate main flows:
   - Login.
   - Dashboard (employee vs management, same rules as web).
   - Attendance (clock in/out, history).
   - Profile / settings.
   - Announcements.
   - Notes (and issues if applicable).
   - Management-only: employees, compensation, attendance management, reports, export.

7. **UI**  
   Use React Native components (e.g. React Native Paper, NativeBase, or custom) so the app looks native; no need for Tailwind/Radix on mobile.

### D. Face verification (special case)

- **Web**: Uses `face-api.js` / TensorFlow in the browser (camera + canvas).
- **Mobile**: Options:
  - **Option 1**: Use Expo Camera + a React Native–friendly face detection/embedding library and send embeddings to a **backend** endpoint that compares with stored embeddings (your existing Firestore/Storage data). You keep one source of truth.
  - **Option 2**: Add a **web view** in the Expo app that loads your existing Next.js face verification page and pass auth (e.g. token) so the same backend and logic are used.
  - **Option 3**: Simplify on mobile (e.g. PIN or skip face verification) and keep full face verification on web only.

Recommendation: Implement **Option 1** or **2** so both apps use the same stored face data and env.

---

## 6. Checklist Summary

| Item | Where | Status |
|------|--------|--------|
| Same Firebase project & env | Next.js + Expo `.env` | Use same Firebase client vars; add `EXPO_PUBLIC_*` and `EXPO_PUBLIC_API_URL` for Expo |
| API routes (mirror Server Actions) | Next.js `app/api/` | To do – verify Firebase token, reuse existing logic |
| Firebase token verification | Next.js API route handler | To do – use `adminAuth.verifyIdToken(token)` |
| Expo app scaffold | New repo/folder | To do – create with Expo, add Firebase + API client |
| Auth (Firebase + token to API) | Expo app | To do – login, `getIdToken()`, attach to API client |
| Shared types | Next.js + Expo | Optional – copy or shared package |
| Face verification on mobile | Expo + backend or WebView | Decide approach (backend comparison vs WebView) |
| CORS (if API on different host) | Next.js `next.config.js` | Only if Expo calls a different origin (e.g. deployed URL) |

---

## 7. Minimal API Auth Example (Next.js)

Use this pattern in every protected API route:

```ts
// app/api/auth/verify.ts or middleware
import { adminAuth } from '@/lib/firebase/admin';

export async function getUserIdFromRequest(request: Request): Promise<string | null> {
  const authHeader = request.headers.get('Authorization');
  const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;
  if (!token) return null;
  try {
    const decoded = await adminAuth.verifyIdToken(token);
    return decoded.uid; // Firebase UID = employeeId
  } catch {
    return null;
  }
}
```

Then in each route, e.g. `app/api/attendance/clock-in/route.ts`:

```ts
const userId = await getUserIdFromRequest(request);
if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
// then call same logic as clockIn(userId, dateOverride)
```

---

## 8. Env Example for Expo

**`.env`** (Expo project root, do not commit if it contains secrets; use `.env.example` for templates):

```env
EXPO_PUBLIC_FIREBASE_API_KEY=your_api_key
EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN=your_project.firebaseapp.com
EXPO_PUBLIC_FIREBASE_PROJECT_ID=your_project_id
EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET=your_project.appspot.com
EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=123456789
EXPO_PUBLIC_FIREBASE_APP_ID=1:123:web:abc
EXPO_PUBLIC_API_URL=https://your-nextjs-app.vercel.app
```

In **`app.config.js`** (Expo) you can load these so they’re available as `process.env.EXPO_PUBLIC_*` in the app (see [Expo env docs](https://docs.expo.dev/guides/environment-variables/)).

---

Once the API routes are in place and the Expo app uses the same env (Firebase + API URL), both the web and mobile app will share the same data and backend behavior.
