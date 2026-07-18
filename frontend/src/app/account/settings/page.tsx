"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { sendPasswordResetEmail, updateProfile } from "firebase/auth";
import { ChevronLeft, Save } from "lucide-react";
import { RequireAuth } from "@/features/auth/RequireAuth";
import { authApi } from "@/lib/authApi";
import { getFirebaseAuth } from "@/lib/firebase";
import { useAppDispatch, useAppSelector } from "@/lib/hooks";
import { setAuthenticated } from "@/features/auth/authSlice";

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
  const [resetLoading, setResetLoading] = useState(false);

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

  async function sendResetLink() {
    if (!user?.email) return;
    setResetLoading(true);
    setMessage(null);
    setError(null);
    try {
      await sendPasswordResetEmail(getFirebaseAuth(), user.email);
      setMessage("A password reset link was sent to your email.");
    } catch {
      setError("We could not send a password reset link. Please try again.");
    } finally {
      setResetLoading(false);
    }
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
          <span className="mt-1 block text-xs text-muted-foreground">Email changes are handled by the authentication provider.</span>
        </label>
        {(error || message) && (
          <p role={error ? "alert" : "status"} className={error ? "mt-4 rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700" : "mt-4 rounded-lg bg-emerald-500/10 px-3 py-2 text-sm text-emerald-700"}>
            {error ?? message}
          </p>
        )}
        <button type="submit" disabled={saving} className="mt-5 inline-flex h-11 items-center gap-2 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground hover:brightness-95 disabled:opacity-60">
          <Save className="h-4 w-4" /> {saving ? "Saving…" : "Save changes"}
        </button>
      </form>

      <section className="mt-6 rounded-xl border border-border p-6">
        <h2 className="font-semibold">Password</h2>
        <p className="mt-2 text-sm text-muted-foreground">We will email a secure password reset link to {user?.email}.</p>
        <button type="button" onClick={sendResetLink} disabled={resetLoading} className="mt-5 rounded-lg border border-border px-4 py-2.5 text-sm font-semibold hover:bg-muted disabled:opacity-60">
          {resetLoading ? "Sending…" : "Email password reset link"}
        </button>
      </section>
    </main>
  );
}
