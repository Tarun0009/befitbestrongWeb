# Auth — Design Review

## Problem

Every request needs to know who's calling and what they're allowed to do — without adding a login round-trip to the hot path, and with a way to instantly force-logout a compromised account. Password-hashing services and MFA flows already exist as commodities; reimplementing them is engineering debt from day zero.

## Options considered

### 1. Roll our own — DB users, bcrypt, sessions

**Pros**: total control.
**Cons**: password reset flows, email verification, MFA, breach-notification signaling, rate limits per email — all reinvented. Every one is a footgun (see: any breach post-mortem). Not worth building for a portfolio project when the goal is depth *elsewhere*.

### 2. Auth0 / Clerk / Supabase Auth

**Pros**: batteries-included. Very fast to wire up.
**Cons**: adds a paid dependency; forces some vendor-shaped choices on the DB schema.

### 3. Firebase Auth (chosen)

Firebase owns credentials. We verify ID tokens on the server via `firebase-admin`, persist a local `User` row keyed by `firebaseUid`, and attach roles as **custom claims** so RBAC decisions never require a DB hit.

**Pros**:
- Free tier covers ~50k MAU. Zero credential storage on our side.
- Custom claims land in the ID token itself — role checks are token parsing, not a lookup.
- Well-supported client SDK.

**Cons**:
- Google as a dependency. Not portable in a hurry.
- Tokens are 1h-valid by default; force-logout only takes effect at the next refresh cycle. See "revocation" below.

## Decision

Firebase Auth + a thin server-side sync. Custom claims for role. Redis-backed revocation set on top of Firebase's own refresh-token revocation to close the 1-hour token window.

## Data model

```
User
  id           cuid          # our PK; never leaves the server
  firebaseUid  string UNIQUE # links to Firebase's identity
  email        string UNIQUE # denormalized for admin lookups
  name         string?
  role         CUSTOMER | ADMIN
```

`User.role` is authoritative. Firebase custom claims are a **cache** of `User.role` — kept in sync by `updateUserRole()` and re-set on next `syncSession()` if they drift.

## Login → session → hot path

```
1. User signs in via Firebase Web SDK on the client.
2. Client fetches idToken, calls POST /auth/session with { idToken }.
3. Server verifies via admin.auth().verifyIdToken(idToken).
   If no User row exists, INSERT one (email + firebaseUid).
   If custom claim `role` doesn't match User.role, setCustomUserClaims.
4. Client refreshes the ID token (to pick up any updated claim) and stores it.
5. Every subsequent authed request sends `Authorization: Bearer <idToken>`.
```

### `requireAuth` middleware (the hot path)

```
- Parse Bearer header.
- admin.auth().verifyIdToken(token, checkRevoked=false)  ← we own revocation
- redis.EXISTS auth:revoked:{uid}                        ← force-logout check
    if set → 401 token_revoked
- redis.GET auth:user:{uid}                              ← 60s cache
    if miss → prisma.user.findUnique(firebaseUid=uid); SETEX 60s
- role = decoded.role ?? user.role
- req.auth = { uid, userId, email, role }
```

Two round-trips avoided on the hot path:

1. **DB lookup** — cached in Redis for 60s per UID.
2. **Firebase revocation check** — Firebase's `checkRevoked=true` costs a network call to Google. We skip it and use our own Redis revocation set instead (see below).

## Revocation

Firebase supports `revokeRefreshTokens(uid)` — but that only invalidates the **refresh** token. The customer's current **ID token** (up to 1h old) still verifies. For a compromised account we can't wait an hour.

Solution: a Redis set `auth:revoked:{uid}` written by `revokeSession()`:

```
async revokeSession(uid) {
  await Promise.all([
    admin.auth().revokeRefreshTokens(uid),        # future tokens
    redis.set(REVOCATION_KEY(uid), "1", "EX", 3600), # existing token window
    invalidateUserCache(uid),                      # drop the 60s cache
  ]);
}
```

`requireAuth` checks this set on every request. TTL matches the max token lifetime (1h) so the set auto-expires — no cleanup job. After 1h the revoked ID token would fail Firebase's own signature check anyway (it's expired), so the Redis entry has done its job and can vanish.

## RBAC

- `req.auth.role` set by `requireAuth` (from custom claim, falling back to DB).
- `requireRole('ADMIN')` middleware guards `/admin/*`.
- Frontend `RequireAuth` component reads the same claim from the Firebase user object.

**Role changes:**

```
POST /admin/users/:id/role
  → prisma.user.update({ role })
  → admin.setCustomUserClaims(uid, { role })
  → admin.revokeRefreshTokens(uid)   # forces client to fetch new token
  → redis SET auth:revoked:{uid}     # invalidates existing ID token
  → redis DEL auth:user:{uid}        # drops the 60s cache
```

Result: the affected user is forcibly re-authenticated on their next request. Their new token carries the new claim.

## Rate limiting

`/auth/*` runs through the Redis sliding-window rate limiter (`middleware/rateLimit.ts`) — 20 requests / 60s per IP. Enough for a real user, not enough for credential-stuffing at any interesting scale.

## Frontend integration

- `AuthBridge` component subscribes to `onIdTokenChanged` and syncs Redux (`auth.user`, `auth.idToken`).
- On first sign-in, calls `POST /auth/session` so the backend upserts the user row.
- Then calls `POST /cart/merge` to fold the guest cart into the user cart.
- All RTK Query base queries attach the ID token and retry once on 401 after `getIdToken(true)`.

## What's not here

- **MFA.** Firebase supports SMS/TOTP; frontend flows not built.
- **Password reset UI.** Firebase supports `sendPasswordResetEmail`; no UI yet.
- **Social login.** Would need extra work on the client; server side is provider-agnostic.
- **Session listing / device management.** No UI to see active sessions.
- **Passkeys.** Adjacent to Firebase's roadmap; skipped.

## Resume-ready phrases

- "Firebase Auth for credentials + `firebase-admin` for server-side verification. Custom claims propagate role into the ID token — RBAC checks are token parsing, not a DB lookup."
- "60-second Redis cache of verified UID → user, so the hot authenticated path avoids Postgres."
- "Redis-backed revocation set complements Firebase's `revokeRefreshTokens` — instant force-logout on the ID-token window Firebase can't invalidate on its own."
- "Role changes atomically update the DB, the Firebase custom claim, and revoke both the refresh token AND the ID token via the Redis set. Next request re-authenticates."
- "Sliding-window Redis rate limiter on `/auth/*` — 20 req/min per IP."
