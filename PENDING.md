# Pending — Manual Setup & Verification

Things that need external accounts, credentials, or manual UI clicks. Grouped by phase so you can knock them off in one sitting later.

---

## Phase 2 — Firebase Auth Setup

### 1. Create the Firebase project
- [ ] Go to https://console.firebase.google.com/ → **Add project**
- [ ] Project name: `ecommerceWeb` (or whatever you prefer)
- [ ] Skip Google Analytics (not needed for this build)

### 2. Enable Email/Password sign-in
- [ ] In the Firebase Console → **Build → Authentication → Get started**
- [ ] Sign-in method tab → **Email/Password** → toggle **Enable** → **Save**
- [ ] (Do NOT enable email link / passwordless — we're doing password only for now)

### 3. Web app config → frontend/.env.local
- [ ] Project Settings (gear icon) → **General** → scroll to **Your apps** → click the **`</>`** icon to register a web app
- [ ] Nickname: `ecommerceWeb-web` → **Register** (skip Firebase Hosting)
- [ ] Copy the `firebaseConfig` object values into `frontend/.env.local`:
  ```
  NEXT_PUBLIC_FIREBASE_API_KEY="AIza…"
  NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN="ecommerceweb-xxxx.firebaseapp.com"
  NEXT_PUBLIC_FIREBASE_PROJECT_ID="ecommerceweb-xxxx"
  NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET="ecommerceweb-xxxx.appspot.com"
  NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID="1234567890"
  NEXT_PUBLIC_FIREBASE_APP_ID="1:1234567890:web:abcd…"
  ```

### 4. Service account → backend/.env
- [ ] Project Settings → **Service accounts** → **Generate new private key** → **Generate key** (downloads a JSON file)
- [ ] Open the JSON. Copy into `backend/.env`:
  - `project_id`  → `FIREBASE_PROJECT_ID`
  - `client_email` → `FIREBASE_CLIENT_EMAIL`
  - `private_key` → `FIREBASE_PRIVATE_KEY` — **keep the `\n` escape sequences intact**, wrap in double quotes:
    ```
    FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\nMIIEv…\n-----END PRIVATE KEY-----\n"
    ```
- [ ] **Delete the downloaded JSON file** once you've copied the values. Do not commit it.

### 5. Restart both servers
```bash
# Backend picks up .env on restart
# In backend/: ./node_modules/.bin/tsx watch src/server.ts

# Frontend picks up .env.local on restart
# In frontend/: ./node_modules/.bin/next dev -p 3005
```

### 6. Verification checklist (do these in order)
- [ ] Open http://localhost:3005 → header shows **Log in / Sign up**
- [ ] Click **Sign up** → create a test account (`test@example.com` / any 8-char password)
- [ ] Land on `/account` — both cards populate:
  - **Client (Firebase → Redux)**: UID, email, role=CUSTOMER, ID token preview
  - **Server (/auth/me)**: same UID (as User ID), email, role=CUSTOMER
- [ ] Log out via header button → back to `/` → header shows Log in / Sign up again
- [ ] Log in with the same credentials → back on `/account`
- [ ] Bad login: `test@example.com` / `wrongpass` → red error "Invalid email or password."

### 7. Promote yourself to admin (once verified working)
```bash
# 1. Get your userId from /account (the "User ID" field on the server card)
# 2. Grab your Firebase ID token from browser devtools:
#    Application tab → IndexedDB → firebaseLocalStorageDb → find your user → copy stsTokenManager.accessToken
# 3. Call the admin endpoint (needs an already-existing ADMIN — for the FIRST admin, do this DB trick):

# Bootstrap the first admin directly via Prisma Studio:
cd backend
./node_modules/.bin/prisma studio
# → open User table → change role from CUSTOMER to ADMIN → save
# → then in the frontend, log out + log in again to pick up the custom claim
#   (or wait 60s for the resolveUser cache to expire — but re-auth is faster)

# After that, /admin/users/{id}/role can promote others via API.
```

---

## Phase 6 — Payment (Razorpay)

The checkout flow works out of the box in **dev mode** — clicking Pay marks the order as PAID via `/checkout/dev-complete` without going through Razorpay. To wire up the real payment gateway:

- [ ] Sign up at https://dashboard.razorpay.com/signup
- [ ] Toggle **Test Mode** (switch top-right)
- [ ] Settings → **API Keys** → **Generate Test Key** → paste `key_id` + `key_secret` into `backend/.env` as `RAZORPAY_KEY_ID` and `RAZORPAY_KEY_SECRET`
- [ ] Settings → **Webhooks** → add `http://localhost:4000/webhooks/razorpay` (use `ngrok` for local Razorpay to reach you) → generate a secret → `RAZORPAY_WEBHOOK_SECRET`
- [ ] Restart backend. Checkout page will now open the real Razorpay modal (frontend polls `/checkout/config` to decide).

### Docker + migration reminder

Phase 6 added new tables (Order, OrderItem, Payment, WebhookEvent, Address). After starting Docker:

```bash
docker compose up -d
cd backend
./node_modules/.bin/prisma migrate deploy
./node_modules/.bin/prisma generate
```

---

## Notes
- Firebase Auth free tier is generous (50k MAU) — no billing required for email/password
- Never commit `.env`, `.env.local`, or the service-account JSON
- If Firebase config is missing, the app still boots and lets you browse the storefront; only `/auth/*` endpoints return 503
---

## Phase 10B / 10D — Resend Email Delivery (Optional)

Order-status hooks and back-in-stock demand work without an email provider. To
send real messages:

- [ ] Create a Resend account and verify a sending domain.
- [ ] Create an API key and set RESEND_API_KEY in backend/.env.
- [ ] Set EMAIL_FROM to a verified sender address.
- [ ] Set FRONTEND_URL to the storefront URL used in restock links.
- [ ] Restart the backend.
- [ ] Open /admin/demand and confirm that email delivery shows as enabled.

When email is not configured, stock-alert subscriptions remain active and visible
to admins; they are not falsely marked as delivered.


---

## Phase 11A — Production Launch Checklist

Use [docs/PRODUCTION_CONFIGURATION.md](./docs/PRODUCTION_CONFIGURATION.md) as the
operator runbook.

- [ ] Choose final storefront and API HTTPS hostnames.
- [ ] Copy `deploy/.env.production.example` to the ignored
  `deploy/.env.production` and replace every placeholder.
- [ ] Add the storefront hostname to Firebase authorized domains.
- [ ] Enable Firebase Email/Password auth in the production Firebase project.
- [ ] Create Razorpay live keys and configure
  `https://<api-host>/webhooks/razorpay` with a unique secret.
- [ ] Decide whether email is launch-blocking; if yes, verify the sending domain
  and set `EMAIL_DELIVERY_REQUIRED=true` with both email variables.
- [ ] Configure TLS reverse proxying and verify `TRUST_PROXY_HOPS` matches it.
- [ ] Take and restore-test a PostgreSQL backup before the first migration.
- [ ] Run the config, test, build, Compose, migration, and health commands from the
  production runbook.
- [ ] Confirm `/health/ready` and frontend `/health` report the deployed release.
