"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { sendPasswordResetEmail } from "firebase/auth";
import { ArrowLeft, MailCheck } from "lucide-react";
import { getFirebaseAuth } from "@/lib/firebase";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const cleanEmail = email.trim();
      await sendPasswordResetEmail(getFirebaseAuth(), cleanEmail);
      setSentTo(cleanEmail);
    } catch (caught) {
      setError(
        caught instanceof Error
          ? mapFirebaseError(caught)
          : "We could not send the reset email. Please try again.",
      );
    } finally {
      setLoading(false);
    }
  }

  if (sentTo) {
    return (
      <div className="rounded-2xl border border-border bg-background p-6 shadow-sm sm:p-8">
        <span className="grid h-12 w-12 place-items-center rounded-xl bg-primary text-primary-foreground">
          <MailCheck className="h-6 w-6" />
        </span>
        <h1 className="mt-5 text-2xl font-semibold">Check your inbox</h1>
        <p className="mt-3 text-sm leading-6 text-muted-foreground">
          If an account exists for <span className="font-medium text-foreground">{sentTo}</span>,
          we’ve sent a password-reset link.
        </p>
        <p className="mt-3 text-xs leading-5 text-muted-foreground">
          Check your spam folder if it does not arrive within a few minutes.
        </p>
        <div className="mt-7 grid gap-2">
          <Link
            href="/login"
            className="inline-flex h-11 items-center justify-center rounded-lg bg-foreground text-sm font-semibold text-background hover:opacity-90"
          >
            Return to login
          </Link>
          <button
            type="button"
            onClick={() => setSentTo(null)}
            className="h-11 rounded-lg border border-border text-sm font-semibold hover:bg-muted"
          >
            Try another email
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-border bg-background p-6 shadow-sm sm:p-8">
      <Link
        href="/login"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to login
      </Link>

      <h1 className="mt-6 text-2xl font-semibold">Reset your password</h1>
      <p className="mt-2 text-sm leading-6 text-muted-foreground">
        Enter the email used for your account and we will send you a secure reset link.
      </p>

      <form onSubmit={onSubmit} className="mt-7 space-y-4">
        <label className="block">
          <span className="text-sm font-medium">Email</span>
          <input
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            autoComplete="email"
            required
            autoFocus
            placeholder="you@example.com"
            className="mt-1.5 h-11 w-full rounded-lg border border-border bg-background px-3 text-sm outline-none placeholder:text-muted-foreground focus:ring-2 focus:ring-primary/30"
          />
        </label>

        {error && (
          <div className="rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </div>
        )}

        <button
          type="submit"
          disabled={loading}
          className="h-11 w-full rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground hover:brightness-95 disabled:opacity-60"
        >
          {loading ? "Sending reset link…" : "Send reset link"}
        </button>
      </form>
    </div>
  );
}

function mapFirebaseError(error: Error): string {
  const message = error.message;
  if (message.includes("auth/invalid-email")) {
    return "Enter a valid email address.";
  }
  if (message.includes("auth/too-many-requests")) {
    return "Too many attempts. Please wait a moment and try again.";
  }
  if (message.includes("Firebase env vars are missing")) {
    return "Password recovery is temporarily unavailable. Please try again later.";
  }
  return "We could not send the reset email. Please try again.";
}
