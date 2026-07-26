"use client";

import { useEffect, type ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";
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
  const pathname = usePathname();

  useEffect(() => {
    if (status === "unauthenticated") {
      router.replace("/login");
    } else if (status === "authenticated" && role && user?.role !== role) {
      router.replace("/account");
    } else if (
      status === "authenticated" &&
      user?.accountStatus === "DELETION_PENDING" &&
      pathname !== "/account/settings"
    ) {
      router.replace("/account/settings");
    }
  }, [status, user, role, router, pathname]);

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
