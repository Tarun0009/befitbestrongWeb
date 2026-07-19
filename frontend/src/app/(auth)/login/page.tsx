"use client";

import { useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { signInWithEmailAndPassword } from "firebase/auth";
import { LockKeyhole } from "lucide-react";
import { PasswordField } from "@/features/auth/PasswordField";
import { getFirebaseAuth } from "@/lib/firebase";
import { useAppSelector } from "@/lib/hooks";

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

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await signInWithEmailAndPassword(getFirebaseAuth(), email.trim(), password);
    } catch (caught) {
      setError(
        caught instanceof Error ? mapFirebaseError(caught) : "Login failed",
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <div>
      <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.18em] text-muted-foreground">
        <span className="grid h-8 w-8 place-items-center rounded-lg bg-primary text-primary-foreground">
          <LockKeyhole className="h-4 w-4" />
        </span>
        Member access
      </div>
      <h1 className="mt-7 text-3xl font-semibold tracking-tight sm:text-4xl">
        Welcome back
      </h1>
      <p className="mt-3 text-sm leading-6 text-muted-foreground">
        Sign in to manage your orders, wishlist, rewards, and subscriptions.
      </p>

      <form onSubmit={onSubmit} className="mt-8 space-y-5">
        <Field
          label="Email"
          type="email"
          value={email}
          onChange={setEmail}
          autoComplete="email"
          placeholder="you@example.com"
          required
        />
        <PasswordField
          label="Password"
          value={password}
          onChange={setPassword}
          autoComplete="current-password"
          required
        />
        <div className="-mt-1 text-right">
          <Link
            href="/forgot-password"
            className="text-xs font-semibold text-muted-foreground underline underline-offset-4 hover:text-foreground"
          >
            Forgot password?
          </Link>
        </div>

        {error && (
          <div
            role="alert"
            className="rounded-xl border border-red-300 bg-red-50 px-3.5 py-3 text-sm leading-5 text-red-700"
          >
            {error}
          </div>
        )}

        <button
          type="submit"
          disabled={loading}
          className="h-12 w-full rounded-xl bg-foreground px-4 text-sm font-semibold text-background transition hover:opacity-90 disabled:cursor-wait disabled:opacity-60"
        >
          {loading ? "Logging in…" : "Log in"}
        </button>
      </form>

      <p className="mt-8 text-center text-sm text-muted-foreground">
        No account yet?{" "}
        <Link
          href="/signup"
          className="font-semibold text-foreground underline underline-offset-4"
        >
          Create one
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
  placeholder,
  required,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type: "email" | "text";
  autoComplete?: string;
  placeholder?: string;
  required?: boolean;
}) {
  return (
    <label className="block">
      <span className="text-sm font-semibold text-foreground">{label}</span>
      <input
        className="mt-1.5 h-12 w-full rounded-xl border border-border bg-[#fcfbf8] px-3.5 text-sm outline-none transition placeholder:text-muted-foreground/70 focus:border-primary-emphasis focus:bg-background focus:ring-4 focus:ring-primary/15"
        type={type}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        autoComplete={autoComplete}
        placeholder={placeholder}
        required={required}
      />
    </label>
  );
}

function mapFirebaseError(error: Error): string {
  const message = error.message;
  if (message.includes("auth/invalid-credential")) {
    return "Invalid email or password.";
  }
  if (message.includes("auth/too-many-requests")) {
    return "Too many attempts. Please try again in a minute.";
  }
  if (message.includes("Firebase env vars are missing")) {
    return "Sign-in is temporarily unavailable. Please try again later.";
  }
  return "We couldn't sign you in. Please check your details and try again.";
}
