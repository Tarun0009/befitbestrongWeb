"use client";

import { useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createUserWithEmailAndPassword, updateProfile } from "firebase/auth";
import { Dumbbell } from "lucide-react";
import { PasswordField } from "@/features/auth/PasswordField";
import { getFirebaseAuth } from "@/lib/firebase";
import { useAppSelector } from "@/lib/hooks";

export default function SignupPage() {
  const router = useRouter();
  const { status } = useAppSelector((s) => s.auth);
  const [name, setName] = useState("");
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
    if (password.length < 6) {
      setError("Password must be at least 6 characters.");
      return;
    }
    setError(null);
    setLoading(true);
    try {
      const credential = await createUserWithEmailAndPassword(
        getFirebaseAuth(),
        email.trim(),
        password,
      );
      const cleanName = name.trim();
      if (cleanName) {
        await updateProfile(credential.user, { displayName: cleanName });
      }
    } catch (caught) {
      setError(
        caught instanceof Error ? mapFirebaseError(caught) : "Signup failed",
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <div>
      <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.18em] text-muted-foreground">
        <span className="grid h-8 w-8 place-items-center rounded-lg bg-primary text-primary-foreground">
          <Dumbbell className="h-4 w-4" />
        </span>
        Start your account
      </div>
      <h1 className="mt-7 text-3xl font-semibold tracking-tight sm:text-4xl">
        Build your routine
      </h1>
      <p className="mt-3 text-sm leading-6 text-muted-foreground">
        Save your favorites, track every order, and get more from every session.
      </p>

      <form onSubmit={onSubmit} className="mt-8 space-y-5">
        <Field
          label="Name"
          type="text"
          value={name}
          onChange={setName}
          autoComplete="name"
          placeholder="Your name"
        />
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
          autoComplete="new-password"
          required
          minLength={6}
          helperText="Use at least 6 characters."
        />

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
          {loading ? "Creating account…" : "Create account"}
        </button>
      </form>

      <p className="mt-8 text-center text-sm text-muted-foreground">
        Already have an account?{" "}
        <Link
          href="/login"
          className="font-semibold text-foreground underline underline-offset-4"
        >
          Log in
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
  if (message.includes("auth/email-already-in-use")) {
    return "That email is already registered.";
  }
  if (message.includes("auth/invalid-email")) return "That email looks invalid.";
  if (message.includes("auth/weak-password")) {
    return "Password is too weak — try at least 6 characters.";
  }
  if (message.includes("Firebase env vars are missing")) {
    return "Account creation is temporarily unavailable. Please try again later.";
  }
  return "We couldn't create your account. Please try again.";
}
