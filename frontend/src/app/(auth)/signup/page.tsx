"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  createUserWithEmailAndPassword,
  updateProfile,
} from "firebase/auth";
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

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (password.length < 6) {
      setError("Password must be at least 6 characters.");
      return;
    }
    setError(null);
    setLoading(true);
    try {
      const cred = await createUserWithEmailAndPassword(
        getFirebaseAuth(),
        email,
        password,
      );
      if (name) {
        await updateProfile(cred.user, { displayName: name });
      }
    } catch (err) {
      const message =
        err instanceof Error ? mapFirebaseError(err) : "Signup failed";
      setError(message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div>
      <h1 className="text-2xl font-semibold">Create an account</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Join beFitBeStrong — takes 20 seconds.
      </p>

      <form onSubmit={onSubmit} className="mt-8 space-y-4">
        <Field
          label="Name"
          type="text"
          value={name}
          onChange={setName}
          autoComplete="name"
        />
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
          autoComplete="new-password"
          required
        />

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
          {loading ? "Creating account…" : "Create account"}
        </button>
      </form>

      <p className="mt-6 text-center text-sm text-muted-foreground">
        Already have an account?{" "}
        <Link href="/login" className="text-foreground underline">
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
  if (msg.includes("auth/email-already-in-use"))
    return "That email is already registered.";
  if (msg.includes("auth/invalid-email")) return "That email looks invalid.";
  if (msg.includes("auth/weak-password"))
    return "Password is too weak — try at least 8 characters.";
  if (msg.includes("Firebase env vars are missing"))
    return "Firebase is not configured yet. Fill NEXT_PUBLIC_FIREBASE_* in .env.local.";
  return msg;
}
