"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { signInWithEmailAndPassword } from "firebase/auth";
import { getFirebaseAuth } from "@/lib/firebase";
import { useAppSelector } from "@/lib/hooks";
import { useEffect } from "react";

export default function LoginPage() {
  const router = useRouter();
  const { status } = useAppSelector((s) => s.auth);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [nextPath, setNextPath] = useState("/account");

  useEffect(() => {
    const requested = new URLSearchParams(window.location.search).get("next");
    if (requested?.startsWith("/") && !requested.startsWith("//")) {
      setNextPath(requested);
    }
  }, []);

  useEffect(() => {
    if (status === "authenticated") router.replace(nextPath);
  }, [status, nextPath, router]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await signInWithEmailAndPassword(getFirebaseAuth(), email, password);
    } catch (err) {
      const message =
        err instanceof Error ? mapFirebaseError(err) : "Login failed";
      setError(message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div>
      <h1 className="text-2xl font-semibold">Welcome back</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Log in to your beFitBeStrong account.
      </p>

      <form onSubmit={onSubmit} className="mt-8 space-y-4">
        <Field
          label="Email"
          type="email"
          value={email}
          onChange={setEmail}
          autoComplete="email"
          required
        />
        <Field
          label="Password"
          type="password"
          value={password}
          onChange={setPassword}
          autoComplete="current-password"
          required
        />
        <div className="-mt-2 text-right">
          <Link
            href="/forgot-password"
            className="text-xs font-medium text-muted-foreground underline underline-offset-4 hover:text-foreground"
          >
            Forgot password?
          </Link>
        </div>

        {error && (
          <div className="rounded-md border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </div>
        )}

        <button
          type="submit"
          disabled={loading}
          className="w-full rounded-md bg-primary px-4 py-2 text-primary-foreground disabled:opacity-60"
        >
          {loading ? "Logging in…" : "Log in"}
        </button>
      </form>

      <p className="mt-6 text-center text-sm text-muted-foreground">
        No account yet?{" "}
        <Link href="/signup" className="text-foreground underline">
          Sign up
        </Link>
      </p>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  type,
  autoComplete,
  required,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type: string;
  autoComplete?: string;
  required?: boolean;
}) {
  return (
    <label className="block">
      <span className="text-sm font-medium">{label}</span>
      <input
        className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 outline-none focus:ring-2 focus:ring-primary/30"
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        autoComplete={autoComplete}
        required={required}
      />
    </label>
  );
}

function mapFirebaseError(err: Error): string {
  const msg = err.message;
  if (msg.includes("auth/invalid-credential")) return "Invalid email or password.";
  if (msg.includes("auth/too-many-requests"))
    return "Too many attempts. Please try again in a minute.";
  if (msg.includes("Firebase env vars are missing"))
    return "Firebase is not configured yet. Fill NEXT_PUBLIC_FIREBASE_* in .env.local.";
  return msg;
}
