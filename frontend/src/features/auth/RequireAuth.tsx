"use client";

import { useEffect, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { useAppSelector } from "@/lib/hooks";
import type { UserRole } from "./authSlice";

export function RequireAuth({
  children,
  role,
}: {
  children: ReactNode;
  role?: UserRole;
}) {
  const { user, status } = useAppSelector((s) => s.auth);
  const router = useRouter();

  useEffect(() => {
    if (status === "unauthenticated") {
      router.replace("/login");
    } else if (status === "authenticated" && role && user?.role !== role) {
      router.replace("/account");
    }
  }, [status, user, role, router]);

  if (status !== "authenticated" || !user) {
    return (
      <div className="mx-auto max-w-5xl px-6 py-16 text-sm text-muted-foreground">
        Loading…
      </div>
    );
  }
  if (role && user.role !== role) return null;
  return <>{children}</>;
}
