import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { promisify } from "node:util";
import {
  expect,
  test,
  type APIRequestContext,
} from "@playwright/test";
import {
  cleanupCheckoutFixture,
  setupCheckoutFixture,
  type CheckoutFixture,
} from "../checkout/support/checkoutFixture";

/**
 * Production account-lifecycle launch gate.
 *
 * The E2E backend uses a zero-day deletion grace period so final anonymization
 * is testable immediately. Staging/production retain the configured grace.
 */

const backendUrl = process.env.E2E_BACKEND_URL ?? "http://localhost:4000";
const firebaseProjectId =
  process.env.E2E_FIREBASE_PROJECT_ID ?? "demo-befitbestrong-e2e";
const firebaseAuthEmulatorUrl =
  process.env.NEXT_PUBLIC_FIREBASE_AUTH_EMULATOR_URL ??
  "http://127.0.0.1:9099";
const firebaseApiKey =
  process.env.NEXT_PUBLIC_FIREBASE_API_KEY ?? "e2e-api-key";
const originalPassword = "Account-lifecycle-original-1";
const changedPassword = "Account-lifecycle-changed-2";

const deviceSessionsByIdToken = new Map<string, string>();
const execFileAsync = promisify(execFile);
const backendDirectory = path.resolve(process.cwd(), "../backend");
const tsxCli = path.join(
  backendDirectory,
  "node_modules",
  "tsx",
  "dist",
  "cli.mjs",
);

interface FirebaseSession {
  idToken: string;
  refreshToken: string;
  localId: string;
  email: string;
}

interface SyncedUser {
  id: string;
  email: string;
}

interface OobCode {
  email?: string;
  newEmail?: string;
  oobCode?: string;
  requestType?: string;
}

test.describe("account lifecycle security launch gate", () => {
  test.describe.configure({ mode: "serial" });

  test("1. password change invalidates every other refresh token and active API token", async ({
    request,
  }) => {
    const email = disposableEmail("password");
    let cleanupToken: string | undefined;
    const changedAt = new Date();

    try {
      const firstSession = await createFirebaseAccount(
        request,
        email,
        originalPassword,
      );
      cleanupToken = firstSession.idToken;
      await syncBackendSession(request, firstSession.idToken);

      const otherDevice = await signIn(
        request,
        email,
        originalPassword,
      );
      await syncBackendSession(request, otherDevice.idToken);
      const passwordChange = await firebasePost(request, "accounts:update", {
        idToken: firstSession.idToken,
        password: changedPassword,
        returnSecureToken: true,
      });
      expect(passwordChange.status()).toBe(200);
      const changed = (await passwordChange.json()) as FirebaseSession;
      cleanupToken = changed.idToken;

      const serverConfirmation = await request.post(
        `${backendUrl}/auth/security/password-changed`,
        {
          headers: bearer(
            changed.idToken,
            deviceSessionsByIdToken.get(firstSession.idToken),
          ),
        },
      );
      expect(serverConfirmation.status()).toBe(204);

      // Production Firebase revokes the refresh token. The Auth Emulator can
      // still mint one immediately, so also prove that our server-side device
      // revocation rejects any token it returns.
      const refreshAttempt = await refreshIdToken(
        request,
        otherDevice.refreshToken,
      );
      if (refreshAttempt.status() === 200) {
        const refreshed = (await refreshAttempt.json()) as { id_token?: string };
        expect(refreshed.id_token).toBeTruthy();
        const rejectedRefreshedToken = await request.get(`${backendUrl}/auth/me`, {
          headers: bearer(
            refreshed.id_token!,
            deviceSessionsByIdToken.get(otherDevice.idToken),
          ),
        });
        expect(rejectedRefreshedToken.status()).toBe(401);
        const rejection = (await rejectedRefreshedToken.json()) as {
          error?: { code?: string };
        };
        expect(["token_revoked", "session_revoked"]).toContain(
          rejection.error?.code,
        );
      } else {
        expect(refreshAttempt.status()).toBeGreaterThanOrEqual(400);
      }

      // The API must reject already-issued one-hour ID tokens immediately.
      const apiAttempt = await request.get(`${backendUrl}/auth/me`, {
        headers: bearer(otherDevice.idToken),
      });
      expect(apiAttempt.status()).toBe(401);
      await expect(apiAttempt.json()).resolves.toMatchObject({
        error: { code: "token_revoked" },
      });

      const securityEmail = await runProbe<{ count: number }>(
        "security-email",
        email,
        changedAt.toISOString(),
      );
      expect(securityEmail.count).toBeGreaterThan(0);
    } finally {
      try {
        const cleanupSession = await signInResponse(request, email, changedPassword);
        if (cleanupSession.status() === 200) {
          cleanupToken = ((await cleanupSession.json()) as FirebaseSession).idToken;
        }
      } catch {
        // The disposable Auth Emulator may close a cleanup connection during shutdown.
      }
      await bestEffortDeleteFirebaseUser(request, cleanupToken);
      await runProbe("cleanup-user", email);
    }
  });

  test("1b. an individually revoked browser session cannot recreate itself with its stale token", async ({
    request,
  }) => {
    const email = disposableEmail("device-session");
    const firstDeviceToken = `${randomUUID()}${randomUUID()}`;
    const secondDeviceToken = `${randomUUID()}${randomUUID()}`;
    let cleanupToken: string | undefined;

    try {
      const firstDevice = await createFirebaseAccount(
        request,
        email,
        originalPassword,
      );
      cleanupToken = firstDevice.idToken;
      await syncBackendSession(request, firstDevice.idToken, firstDeviceToken);

      const secondDevice = await signIn(request, email, originalPassword);
      await syncBackendSession(request, secondDevice.idToken, secondDeviceToken);

      const listing = await request.get(`${backendUrl}/auth/sessions`, {
        headers: {
          ...bearer(firstDevice.idToken),
          "X-Device-Session": firstDeviceToken,
        },
      });
      expect(listing.status()).toBe(200);
      const payload = (await listing.json()) as {
        sessions: Array<{ id: string; current: boolean }>;
      };
      const otherSession = payload.sessions.find((session) => !session.current);
      expect(otherSession).toBeTruthy();

      const revoke = await request.delete(
        `${backendUrl}/auth/sessions/${otherSession!.id}`,
        {
          headers: {
            ...bearer(firstDevice.idToken),
            "X-Device-Session": firstDeviceToken,
          },
        },
      );
      expect(revoke.status()).toBe(200);

      const rejectedApiCall = await request.get(`${backendUrl}/auth/me`, {
        headers: {
          ...bearer(secondDevice.idToken),
          "X-Device-Session": secondDeviceToken,
        },
      });
      expect(rejectedApiCall.status()).toBe(401);
      await expect(rejectedApiCall.json()).resolves.toMatchObject({
        error: { code: "session_revoked" },
      });

      const rejectedRegistration = await request.post(`${backendUrl}/auth/session`, {
        headers: { "X-Device-Session": secondDeviceToken },
        data: { idToken: secondDevice.idToken },
      });
      expect(rejectedRegistration.status()).toBe(401);
      await expect(rejectedRegistration.json()).resolves.toMatchObject({
        error: { code: "recent_authentication_required" },
      });
    } finally {
      await bestEffortDeleteFirebaseUser(request, cleanupToken);
      await runProbe("cleanup-user", email);
    }
  });

  test("2. email change notifies the old address and requires new-address confirmation", async ({
    request,
  }) => {
    const oldEmail = disposableEmail("email-change");
    const newEmail = oldEmail.replace("@", "+new@");
    let cleanupToken: string | undefined;
    const requestedAt = new Date();

    try {
      const session = await createFirebaseAccount(
        request,
        oldEmail,
        originalPassword,
      );
      cleanupToken = session.idToken;
      await syncBackendSession(request, session.idToken);

      const changeRequest = await request.post(
        `${backendUrl}/auth/email-change`,
        {
          headers: bearer(session.idToken),
          data: { newEmail },
        },
      );
      expect(changeRequest.status()).toBe(202);

      const securityEmail = await runProbe<{ count: number }>(
        "security-email",
        oldEmail,
        requestedAt.toISOString(),
      );
      expect(securityEmail.count).toBeGreaterThan(0);

      const code = await latestEmailChangeCode(request, oldEmail, newEmail);
      const confirmation = await firebasePost(request, "accounts:update", {
        oobCode: code,
      });
      expect(confirmation.status()).toBe(200);

      const oldEmailLogin = await signInResponse(
        request,
        oldEmail,
        originalPassword,
      );
      expect(oldEmailLogin.status()).toBeGreaterThanOrEqual(400);

      const newSession = await signIn(request, newEmail, originalPassword);
      cleanupToken = newSession.idToken;
      const synced = await syncBackendSession(request, newSession.idToken);
      expect(synced.email).toBe(newEmail);

      const oldApiToken = await request.get(`${backendUrl}/auth/me`, {
        headers: bearer(session.idToken),
      });
      expect(oldApiToken.status()).toBe(401);
    } finally {
      await bestEffortDeleteFirebaseUser(request, cleanupToken);
      await runProbe("cleanup-user", oldEmail);
      await runProbe("cleanup-user", newEmail);
    }
  });

  test("3. old email remains usable until the pending email change is confirmed", async ({
    request,
  }) => {
    const oldEmail = disposableEmail("pending-email");
    const newEmail = oldEmail.replace("@", "+pending@");
    let cleanupToken: string | undefined;

    try {
      const session = await createFirebaseAccount(
        request,
        oldEmail,
        originalPassword,
      );
      cleanupToken = session.idToken;
      await syncBackendSession(request, session.idToken);

      const changeRequest = await request.post(
        `${backendUrl}/auth/email-change`,
        {
          headers: bearer(session.idToken),
          data: { newEmail },
        },
      );
      expect(changeRequest.status()).toBe(202);

      const oldEmailLogin = await signInResponse(
        request,
        oldEmail,
        originalPassword,
      );
      expect(oldEmailLogin.status()).toBe(200);

      const prematureNewEmailLogin = await signInResponse(
        request,
        newEmail,
        originalPassword,
      );
      expect(prematureNewEmailLogin.status()).toBeGreaterThanOrEqual(400);
    } finally {
      await bestEffortDeleteFirebaseUser(request, cleanupToken);
      await runProbe("cleanup-user", oldEmail);
      await runProbe("cleanup-user", newEmail);
    }
  });

  test("4. account deletion is blocked while an order is active", async ({
    request,
  }) => {
    const runId = randomUUID();
    let fixture: CheckoutFixture | undefined;
    let session: FirebaseSession | undefined;
    let orderId: string | undefined;

    try {
      fixture = await setupCheckoutFixture("cod", runId);
      session = await createFirebaseAccount(
        request,
        fixture.email,
        originalPassword,
      );
      await syncBackendSession(request, session.idToken);
      orderId = await createCodOrder(request, session.idToken, fixture);

      const deletion = await request.delete(`${backendUrl}/auth/account`, {
        headers: bearer(session.idToken),
        data: { confirmation: "DELETE" },
      });
      expect(deletion.status()).toBe(409);
      await expect(deletion.json()).resolves.toMatchObject({
        error: { code: "active_orders_exist" },
      });

      const accountStillWorks = await request.get(`${backendUrl}/auth/me`, {
        headers: bearer(session.idToken),
      });
      expect(accountStillWorks.status()).toBe(200);

      const orderStillBelongsToUser = await request.get(
        `${backendUrl}/orders/${orderId}`,
        { headers: bearer(session.idToken) },
      );
      expect(orderStillBelongsToUser.status()).toBe(200);
    } finally {
      await bestEffortDeleteFirebaseUser(request, session?.idToken);
      if (orderId) await runProbe("cleanup-order", orderId);
      if (fixture) await cleanupCheckoutFixture("cod", runId);
    }
  });

  test("5. deletion hides the user and reviews, clears account data, and retains an anonymized order", async ({
    request,
  }) => {
    const runId = randomUUID();
    let fixture: CheckoutFixture | undefined;
    let session: FirebaseSession | undefined;
    let user: SyncedUser | undefined;
    let orderId: string | undefined;

    try {
      fixture = await setupCheckoutFixture("cod", runId);
      session = await createFirebaseAccount(
        request,
        fixture.email,
        originalPassword,
      );
      user = await syncBackendSession(request, session.idToken);
      orderId = await createCodOrder(request, session.idToken, fixture);
      await runProbe(
        "seed-review",
        user.id,
        fixture.productId,
        orderId,
      );

      const deletion = await request.delete(`${backendUrl}/auth/account`, {
        headers: bearer(session.idToken),
        data: { confirmation: "DELETE" },
      });
      expect([202, 204]).toContain(deletion.status());

      const inspection = await runProbe<{
        userCount: number;
        reviewCount: number;
        wishlistCount: number;
        addressCount: number;
        stockAlertCount: number;
        subscriptionCount: number;
        serviceAreaPiiCount: number;
        cartKeyCount: number;
        order: {
          id: string;
          userId: string | null;
          contactEmail: string;
          addressSnapshot: unknown;
        } | null;
        product: { ratingAvg: number; ratingCount: number } | null;
      }>(
        "inspect-deletion",
        user.id,
        session.localId,
        fixture.email,
        orderId,
        fixture.productId,
      );

      expect(inspection).toMatchObject({
        userCount: 0,
        reviewCount: 0,
        wishlistCount: 0,
        addressCount: 0,
        stockAlertCount: 0,
        subscriptionCount: 0,
        serviceAreaPiiCount: 0,
        cartKeyCount: 0,
        order: { id: orderId, userId: null },
        product: { ratingAvg: 0, ratingCount: 0 },
      });
      expect(inspection.order).not.toBeNull();
      expect(inspection.order?.contactEmail).not.toBe(fixture.email);

      const retainedAddress = JSON.stringify(
        inspection.order?.addressSnapshot,
      ).toLowerCase();
      expect(retainedAddress).not.toContain("account lifecycle customer");
      expect(retainedAddress).not.toContain("9999999999");
      expect(retainedAddress).not.toContain("account lifecycle test address");

      const reviewListing = await request.get(
        `${backendUrl}/reviews/products/${fixture.productSlug}`,
      );
      expect(reviewListing.status()).toBe(200);
      expect(JSON.stringify(await reviewListing.json())).not.toContain(
        "Account lifecycle fixture",
      );

      const deletedLogin = await signInResponse(
        request,
        fixture.email,
        originalPassword,
      );
      expect(deletedLogin.status()).toBeGreaterThanOrEqual(400);
    } finally {
      await bestEffortDeleteFirebaseUser(request, session?.idToken);
      if (orderId) await runProbe("cleanup-order", orderId);
      if (fixture) await cleanupCheckoutFixture("cod", runId);
    }
  });
});

function disposableEmail(label: string) {
  return `e2e-${label}-${randomUUID()}@example.test`;
}

function bearer(idToken: string, explicitDeviceToken?: string) {
  const deviceToken = explicitDeviceToken ?? deviceSessionsByIdToken.get(idToken);
  return {
    Authorization: `Bearer ${idToken}`,
    ...(deviceToken
      ? { "X-Device-Session": deviceToken }
      : {}),
  };
}

async function firebasePost(
  request: APIRequestContext,
  operation: string,
  data: Record<string, unknown>,
) {
  return request.post(
    `${firebaseAuthEmulatorUrl}/identitytoolkit.googleapis.com/v1/${operation}?key=${firebaseApiKey}`,
    { data },
  );
}

async function createFirebaseAccount(
  request: APIRequestContext,
  email: string,
  password: string,
): Promise<FirebaseSession> {
  const response = await firebasePost(request, "accounts:signUp", {
    email,
    password,
    returnSecureToken: true,
  });
  expect(response.status()).toBe(200);
  return (await response.json()) as FirebaseSession;
}

async function signInResponse(
  request: APIRequestContext,
  email: string,
  password: string,
) {
  return firebasePost(request, "accounts:signInWithPassword", {
    email,
    password,
    returnSecureToken: true,
  });
}

async function signIn(
  request: APIRequestContext,
  email: string,
  password: string,
): Promise<FirebaseSession> {
  const response = await signInResponse(request, email, password);
  expect(response.status()).toBe(200);
  return (await response.json()) as FirebaseSession;
}

async function refreshIdToken(
  request: APIRequestContext,
  refreshToken: string,
) {
  return request.post(
    `${firebaseAuthEmulatorUrl}/securetoken.googleapis.com/v1/token?key=${firebaseApiKey}`,
    {
      form: {
        grant_type: "refresh_token",
        refresh_token: refreshToken,
      },
    },
  );
}

async function syncBackendSession(
  request: APIRequestContext,
  idToken: string,
  deviceToken = `${randomUUID()}${randomUUID()}`,
): Promise<SyncedUser> {
  deviceSessionsByIdToken.set(idToken, deviceToken);
  const response = await request.post(`${backendUrl}/auth/session`, {
    headers: deviceToken
      ? { "X-Device-Session": deviceToken }
      : undefined,
    data: { idToken },
  });
  expect(response.status()).toBe(200);
  const payload = (await response.json()) as { user: SyncedUser };
  return payload.user;
}

async function latestEmailChangeCode(
  request: APIRequestContext,
  oldEmail: string,
  newEmail: string,
) {
  const response = await request.get(
    `${firebaseAuthEmulatorUrl}/emulator/v1/projects/${firebaseProjectId}/oobCodes`,
  );
  expect(response.status()).toBe(200);
  const payload = (await response.json()) as { oobCodes?: OobCode[] };
  const candidate = payload.oobCodes
    ?.filter(
      (code) =>
        code.oobCode &&
        code.email === oldEmail &&
        code.newEmail === newEmail &&
        ["VERIFY_BEFORE_UPDATE_EMAIL", "VERIFY_AND_CHANGE_EMAIL"].includes(
          code.requestType ?? "",
        ),
    )
    .at(-1);
  expect(
    candidate?.oobCode,
    `No pending email-change code was emitted for ${oldEmail}`,
  ).toBeTruthy();
  return candidate!.oobCode!;
}

async function createCodOrder(
  request: APIRequestContext,
  idToken: string,
  fixture: CheckoutFixture,
) {
  const addItem = await request.post(`${backendUrl}/cart/items`, {
    headers: bearer(idToken),
    data: { variantId: fixture.variantId, quantity: 1 },
  });
  expect(addItem.status()).toBe(201);

  const checkout = await request.post(`${backendUrl}/checkout/session`, {
    headers: {
      ...bearer(idToken),
      "Idempotency-Key": `account-lifecycle-${randomUUID()}`,
    },
    data: {
      paymentMethod: "COD",
      address: {
        fullName: "Account Lifecycle Customer",
        phone: "9999999999",
        line1: "Account lifecycle test address",
        city: fixture.city,
        state: "Uttar Pradesh",
        pincode: fixture.pincode,
        country: "IN",
      },
    },
  });
  expect(checkout.status()).toBe(201);
  const payload = (await checkout.json()) as {
    orderId: string;
    paymentMethod: string;
  };
  expect(payload.paymentMethod).toBe("COD");
  return payload.orderId;
}

async function bestEffortDeleteFirebaseUser(
  request: APIRequestContext,
  idToken: string | undefined,
) {
  if (!idToken) return;
  try {
    await firebasePost(request, "accounts:delete", { idToken });
  } catch {
    // The account may already have been removed by the deletion workflow.
  }
}

async function runProbe<T = { ok: true }>(
  command: string,
  ...args: string[]
): Promise<T> {
  const probe = path.join(
    backendDirectory,
    "scripts",
    "e2e",
    "auth",
    "accountLifecycleProbe.ts",
  );
  const result = await execFileAsync(
    process.execPath,
    [tsxCli, probe, command, ...args],
    {
      cwd: backendDirectory,
      env: { ...process.env, E2E_FIXTURE_MODE: "1" },
      timeout: 30_000,
    },
  );
  const jsonLine = result.stdout
    .trim()
    .split(/\r?\n/)
    .findLast((line) => line.trim().startsWith("{"));
  if (!jsonLine) throw new Error(`Account lifecycle probe ${command} returned no JSON`);
  return JSON.parse(jsonLine) as T;
}
