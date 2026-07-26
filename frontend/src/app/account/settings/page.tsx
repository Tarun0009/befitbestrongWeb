"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  EmailAuthProvider,
  reauthenticateWithCredential,
  signOut,
  updatePassword,
  updateProfile,
} from "firebase/auth";
import { AlertTriangle, ChevronLeft, KeyRound, Mail, MonitorSmartphone, RotateCcw, Save, Trash2 } from "lucide-react";
import { RequireAuth } from "@/features/auth/RequireAuth";
import { PasswordField } from "@/features/auth/PasswordField";
import {
  authApi,
  useRevokeSessionMutation,
  useSessionsQuery,
} from "@/lib/authApi";
import { getFirebaseAuth } from "@/lib/firebase";
import { useAppDispatch, useAppSelector } from "@/lib/hooks";
import { clearDeviceSessionToken } from "@/features/auth/deviceSession";
import { setAuthenticated, setUnauthenticated } from "@/features/auth/authSlice";

export default function AccountSettingsPage() {
  return (
    <RequireAuth>
      <SettingsBody />
    </RequireAuth>
  );
}

function SettingsBody() {
  const dispatch = useAppDispatch();
  const { user, idToken } = useAppSelector((state) => state.auth);
  const [name, setName] = useState(user?.name ?? "");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();
  const [newEmail, setNewEmail] = useState("");
  const [emailPassword, setEmailPassword] = useState("");
  const [emailLoading, setEmailLoading] = useState(false);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordLoading, setPasswordLoading] = useState(false);
  const [deletePassword, setDeletePassword] = useState("");
  const [deleteConfirmation, setDeleteConfirmation] = useState("");
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [restoreLoading, setRestoreLoading] = useState(false);
  const { data: sessionsData, isLoading: sessionsLoading } = useSessionsQuery(undefined, {
    skip: user?.accountStatus === "DELETION_PENDING",
  });
  const [revokeDeviceSession] = useRevokeSessionMutation();
  const [revokingSessionId, setRevokingSessionId] = useState<string | null>(null);


  async function saveProfile(event: FormEvent) {
    event.preventDefault();
    if (!user || !idToken) return;
    const cleanName = name.trim();
    if (cleanName.length > 80) {
      setError("Use a name shorter than 80 characters.");
      return;
    }
    setSaving(true);
    setMessage(null);
    setError(null);
    try {
      const firebaseUser = getFirebaseAuth().currentUser;
      if (!firebaseUser) throw new Error("Your session has expired. Please log in again.");
      await updateProfile(firebaseUser, { displayName: cleanName || null });
      const freshToken = await firebaseUser.getIdToken(true);
      await dispatch(authApi.endpoints.createSession.initiate({ idToken: freshToken })).unwrap();
      dispatch(setAuthenticated({
        user: { ...user, name: cleanName || null },
        idToken: freshToken,
      }));
      setMessage("Your profile has been updated.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not update your profile.");
    } finally {
      setSaving(false);
    }
  }


  async function requireRecentFirebaseSession(password: string) {
    const firebaseUser = getFirebaseAuth().currentUser;
    if (!firebaseUser?.email) {
      throw new Error("Your session has expired. Please log in again.");
    }
    await reauthenticateWithCredential(
      firebaseUser,
      EmailAuthProvider.credential(firebaseUser.email, password),
    );
    await firebaseUser.getIdToken(true);
    return firebaseUser;
  }

  async function submitEmailChange(event: FormEvent) {
    event.preventDefault();
    const cleanEmail = newEmail.trim().toLowerCase();
    if (!cleanEmail || cleanEmail === user?.email.toLowerCase()) {
      setError("Enter a different email address.");
      return;
    }
    setEmailLoading(true);
    setMessage(null);
    setError(null);
    try {
      await requireRecentFirebaseSession(emailPassword);
      await dispatch(
        authApi.endpoints.requestEmailChange.initiate({ newEmail: cleanEmail }),
      ).unwrap();
      setNewEmail("");
      setEmailPassword("");
      setMessage(`We sent a confirmation link to ${cleanEmail}. Your current email remains active until you confirm it.`);
    } catch (caught) {
      setError(apiMessage(caught, "Could not start the email change. Check your password and try again."));
    } finally {
      setEmailLoading(false);
    }
  }

  async function submitPasswordChange(event: FormEvent) {
    event.preventDefault();
    if (newPassword.length < 12) {
      setError("Use at least 12 characters for your new password.");
      return;
    }
    if (newPassword !== confirmPassword) {
      setError("The new passwords do not match.");
      return;
    }
    if (newPassword === currentPassword) {
      setError("Your new password must be different from the current password.");
      return;
    }
    setPasswordLoading(true);
    setMessage(null);
    setError(null);
    try {
      const firebaseUser = await requireRecentFirebaseSession(currentPassword);
      await updatePassword(firebaseUser, newPassword);
      await firebaseUser.getIdToken(true);
      await dispatch(authApi.endpoints.passwordChanged.initiate()).unwrap();
      clearDeviceSessionToken();
      await signOut(getFirebaseAuth());
      dispatch(setUnauthenticated());
      router.replace("/login?passwordChanged=1");
    } catch (caught) {
      setError(apiMessage(caught, "Could not change your password. Check the current password and try again."));
    } finally {
      setPasswordLoading(false);
    }
  }

  async function submitDeletion(event: FormEvent) {
    event.preventDefault();
    if (deleteConfirmation !== "DELETE") {
      setError("Type DELETE exactly to confirm this request.");
      return;
    }
    setDeleteLoading(true);
    setMessage(null);
    setError(null);
    try {
      await requireRecentFirebaseSession(deletePassword);
      await dispatch(
        authApi.endpoints.deleteAccount.initiate({ confirmation: "DELETE" }),
      ).unwrap();
      clearDeviceSessionToken();
      await signOut(getFirebaseAuth());
      dispatch(setUnauthenticated());
      router.replace("/login?deletionRequested=1");
    } catch (caught) {
      setError(apiMessage(caught, "Could not request account deletion."));
    } finally {
      setDeleteLoading(false);
    }
  }

  async function restorePendingAccount() {
    if (!user || !idToken) return;
    setRestoreLoading(true);
    setMessage(null);
    setError(null);
    try {
      await dispatch(authApi.endpoints.restoreAccount.initiate()).unwrap();
      dispatch(
        setAuthenticated({
          user: { ...user, accountStatus: "ACTIVE", deletionScheduledFor: null },
          idToken,
        }),
      );
      setMessage("Your account has been restored.");
    } catch (caught) {
      setError(apiMessage(caught, "Could not restore your account."));
    } finally {
      setRestoreLoading(false);
    }
  }

  async function removeDeviceSession(sessionId: string) {
    setRevokingSessionId(sessionId);
    setMessage(null);
    setError(null);
    try {
      const result = await revokeDeviceSession(sessionId).unwrap();
      if (result.current) {
        clearDeviceSessionToken();
        await signOut(getFirebaseAuth());
        dispatch(setUnauthenticated());
        router.replace("/login?signedOut=1");
        return;
      }
      setMessage("That device was signed out.");
    } catch (caught) {
      setError(apiMessage(caught, "Could not sign out that device."));
    } finally {
      setRevokingSessionId(null);
    }
  }

  if (user?.accountStatus === "DELETION_PENDING") {
    return (
      <main className="mx-auto max-w-3xl px-6 py-16">
        <div className="rounded-2xl border border-amber-300 bg-amber-50 p-6 sm:p-8">
          <div className="flex h-11 w-11 items-center justify-center rounded-full bg-amber-200 text-amber-900">
            <AlertTriangle className="h-5 w-5" />
          </div>
          <h1 className="mt-5 text-2xl font-semibold tracking-tight">Account deletion is pending</h1>
          <p className="mt-2 max-w-xl text-sm leading-6 text-amber-950/75">
            Your profile is hidden and normal account actions are paused. Restore it before
            {user.deletionScheduledFor
              ? ` ${new Date(user.deletionScheduledFor).toLocaleDateString("en-IN")}`
              : " the recovery period ends"}.
          </p>
          {(error || message) && <StatusMessage error={error} message={message} />}
          <button
            type="button"
            onClick={restorePendingAccount}
            disabled={restoreLoading}
            className="mt-6 inline-flex h-11 items-center gap-2 rounded-xl bg-foreground px-5 text-sm font-semibold text-background disabled:opacity-60"
          >
            <RotateCcw className="h-4 w-4" /> {restoreLoading ? "Restoring…" : "Restore my account"}
          </button>
        </div>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-3xl px-6 py-16">
      <Link href="/account" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ChevronLeft className="h-4 w-4" /> Account
      </Link>
      <header className="mt-6">
        <p className="text-sm uppercase tracking-widest text-muted-foreground">Account</p>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight">Account settings</h1>
        <p className="mt-2 text-sm text-muted-foreground">Keep your profile details and sign-in recovery options up to date.</p>
      </header>
      {(error || message) && <StatusMessage error={error} message={message} />}


      <form onSubmit={saveProfile} className="mt-8 rounded-xl border border-border p-6">
        <h2 className="font-semibold">Profile details</h2>
        <label className="mt-5 block">
          <span className="text-sm font-medium">Name</span>
          <input
            value={name}
            onChange={(event) => setName(event.target.value)}
            autoComplete="name"
            maxLength={80}
            className="mt-1.5 h-11 w-full rounded-lg border border-border bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-primary/30"
          />
        </label>
        <label className="mt-4 block">
          <span className="text-sm font-medium">Email</span>
          <input value={user?.email ?? ""} readOnly className="mt-1.5 h-11 w-full rounded-lg border border-border bg-muted px-3 text-sm text-muted-foreground" />
          <span className="mt-1 block text-xs text-muted-foreground">Use the verified email-change section below to update this address securely.</span>
        </label>
        <button type="submit" disabled={saving} className="mt-5 inline-flex h-11 items-center gap-2 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground hover:brightness-95 disabled:opacity-60">
          <Save className="h-4 w-4" /> {saving ? "Saving…" : "Save changes"}
        </button>
      </form>


      <form onSubmit={submitEmailChange} className="mt-6 rounded-2xl border border-border bg-background p-6">
        <div className="flex items-start gap-3">
          <div className="rounded-xl bg-primary/10 p-2.5 text-primary-emphasis"><Mail className="h-5 w-5" /></div>
          <div>
            <h2 className="font-semibold">Change sign-in email</h2>
            <p className="mt-1 text-sm text-muted-foreground">The new address becomes active only after you confirm its secure link.</p>
          </div>
        </div>
        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          <label className="block">
            <span className="text-sm font-semibold">New email</span>
            <input
              type="email"
              value={newEmail}
              onChange={(event) => setNewEmail(event.target.value)}
              autoComplete="email"
              required
              disabled={emailLoading}
              className="mt-1.5 h-12 w-full rounded-xl border border-border bg-[#fcfbf8] px-3.5 text-sm outline-none focus:ring-4 focus:ring-primary/15 disabled:opacity-60"
            />
          </label>
          <PasswordField
            label="Current password"
            value={emailPassword}
            onChange={setEmailPassword}
            autoComplete="current-password"
            required
            disabled={emailLoading}
          />
        </div>
        <button
          type="submit"
          disabled={emailLoading || !newEmail.trim() || !emailPassword}
          className="mt-5 inline-flex h-11 items-center rounded-xl border border-border px-4 text-sm font-semibold hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50"
        >
          {emailLoading ? "Sending confirmation…" : "Send confirmation link"}
        </button>
      </form>

      <form onSubmit={submitPasswordChange} className="mt-6 rounded-2xl border border-border bg-background p-6">
        <div className="flex items-start gap-3">
          <div className="rounded-xl bg-primary/10 p-2.5 text-primary-emphasis"><KeyRound className="h-5 w-5" /></div>
          <div>
            <h2 className="font-semibold">Change password</h2>
            <p className="mt-1 text-sm text-muted-foreground">All devices are signed out immediately after the password changes.</p>
          </div>
        </div>
        <div className="mt-5 grid gap-4">
          <PasswordField
            label="Current password"
            value={currentPassword}
            onChange={setCurrentPassword}
            autoComplete="current-password"
            required
            disabled={passwordLoading}
          />
          <div className="grid gap-4 sm:grid-cols-2">
            <PasswordField
              label="New password"
              value={newPassword}
              onChange={setNewPassword}
              autoComplete="new-password"
              required
              minLength={12}
              disabled={passwordLoading}
              helperText="Use at least 12 characters."
            />
            <PasswordField
              label="Confirm new password"
              value={confirmPassword}
              onChange={setConfirmPassword}
              autoComplete="new-password"
              required
              minLength={12}
              disabled={passwordLoading}
            />
          </div>
        </div>
        <button
          type="submit"
          disabled={passwordLoading || !currentPassword || !newPassword || !confirmPassword}
          className="mt-5 inline-flex h-11 items-center rounded-xl bg-foreground px-4 text-sm font-semibold text-background disabled:cursor-not-allowed disabled:opacity-50"
        >
          {passwordLoading ? "Changing password…" : "Change password and sign out devices"}
        </button>
      </form>


      <section className="mt-6 rounded-2xl border border-border bg-background p-6">
        <div className="flex items-start gap-3">
          <div className="rounded-xl bg-primary/10 p-2.5 text-primary-emphasis"><MonitorSmartphone className="h-5 w-5" /></div>
          <div>
            <h2 className="font-semibold">Signed-in devices</h2>
            <p className="mt-1 text-sm text-muted-foreground">Review active browser sessions and sign out any device you do not recognize.</p>
          </div>
        </div>
        <div className="mt-5 divide-y divide-border rounded-xl border border-border">
          {sessionsLoading ? (
            <div className="space-y-2 p-4" aria-label="Loading signed-in devices">
              <div className="h-4 w-40 animate-pulse rounded bg-muted" />
              <div className="h-3 w-56 animate-pulse rounded bg-muted" />
            </div>
          ) : sessionsData?.sessions.length ? (
            sessionsData.sessions.map((session) => (
              <div key={session.id} className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold">
                    {describeDevice(session.userAgent)} {session.current && <span className="ml-1 text-emerald-700">(this device)</span>}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Last active {new Date(session.lastSeenAt).toLocaleString("en-IN")}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => removeDeviceSession(session.id)}
                  disabled={revokingSessionId !== null}
                  className="h-9 shrink-0 rounded-lg border border-border px-3 text-xs font-semibold hover:bg-muted disabled:opacity-50"
                >
                  {revokingSessionId === session.id ? "Signing out…" : "Sign out"}
                </button>
              </div>
            ))
          ) : (
            <p className="p-4 text-sm text-muted-foreground">No active browser sessions were found.</p>
          )}
        </div>
      </section>
      <form onSubmit={submitDeletion} className="mt-6 rounded-2xl border border-red-200 bg-red-50/50 p-6">
        <div className="flex items-start gap-3">
          <div className="rounded-xl bg-red-100 p-2.5 text-red-700"><Trash2 className="h-5 w-5" /></div>
          <div>
            <h2 className="font-semibold text-red-950">Delete account</h2>
            <p className="mt-1 text-sm leading-6 text-red-900/70">Deletion is blocked while an order or refund is active. Otherwise, your account is hidden immediately and remains recoverable during the grace period. Financial order records are retained without your profile data.</p>
          </div>
        </div>
        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          <PasswordField
            label="Current password"
            value={deletePassword}
            onChange={setDeletePassword}
            autoComplete="current-password"
            required
            disabled={deleteLoading}
          />
          <label className="block">
            <span className="text-sm font-semibold text-red-950">Type DELETE to confirm</span>
            <input
              value={deleteConfirmation}
              onChange={(event) => setDeleteConfirmation(event.target.value)}
              autoComplete="off"
              required
              disabled={deleteLoading}
              className="mt-1.5 h-12 w-full rounded-xl border border-red-200 bg-white px-3.5 text-sm outline-none focus:ring-4 focus:ring-red-100 disabled:opacity-60"
            />
          </label>
        </div>
        <button
          type="submit"
          disabled={deleteLoading || !deletePassword || deleteConfirmation !== "DELETE"}
          className="mt-5 inline-flex h-11 items-center rounded-xl bg-red-700 px-4 text-sm font-semibold text-white hover:bg-red-800 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {deleteLoading ? "Checking account…" : "Request account deletion"}
        </button>
      </form>
    </main>
  );
}

function StatusMessage({ error, message }: { error: string | null; message: string | null }) {
  return (
    <p
      role={error ? "alert" : "status"}
      className={
        error
          ? "mt-6 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800"
          : "mt-6 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800"
      }
    >
      {error ?? message}
    </p>
  );
}

function apiMessage(caught: unknown, fallback: string) {
  const apiError = caught as { data?: { error?: { message?: string } } };
  return apiError.data?.error?.message ?? fallback;
}

function describeDevice(userAgent: string | null) {
  if (!userAgent) return "Browser session";
  const browser = userAgent.includes("Edg/")
    ? "Microsoft Edge"
    : userAgent.includes("Firefox/")
      ? "Firefox"
      : userAgent.includes("Chrome/") ? "Chrome" : userAgent.includes("Safari/") ? "Safari" : "Browser";
  return `${browser} on ${userAgent.includes("Windows") ? "Windows" : userAgent.includes("Android") ? "Android" : userAgent.includes("iPhone") || userAgent.includes("iPad") ? "iOS" : userAgent.includes("Mac OS") ? "macOS" : "another device"}`;
}
