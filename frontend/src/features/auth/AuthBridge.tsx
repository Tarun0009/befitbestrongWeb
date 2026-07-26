"use client";

import { useEffect, useRef } from "react";
import { onIdTokenChanged, signOut } from "firebase/auth";
import { getFirebaseAuth } from "@/lib/firebase";
import { useAppDispatch } from "@/lib/hooks";
import {
  setAuthenticated,
  setAuthLoading,
  setUnauthenticated,
} from "./authSlice";
import { authApi } from "@/lib/authApi";
import { cartApi } from "@/lib/cartApi";
import { setMergeNotice } from "@/features/cart/cartSlice";

export function AuthBridge() {
  const dispatch = useAppDispatch();
  const syncedRef = useRef<string | null>(null);

  useEffect(() => {
    let auth;
    try {
      auth = getFirebaseAuth();
    } catch (err) {
      console.warn(
        "[AuthBridge] Firebase not configured yet — auth features disabled.",
        err,
      );
      dispatch(setUnauthenticated());
      return;
    }

    dispatch(setAuthLoading());

    const unsub = onIdTokenChanged(auth, async (fbUser) => {
      if (!fbUser) {
        syncedRef.current = null;
        dispatch(setUnauthenticated());
        return;
      }

      let idToken = await fbUser.getIdToken();
      let syncedUser: Awaited<ReturnType<typeof syncBackendUser>> | null = null;

      const firstSyncForUser = syncedRef.current !== fbUser.uid;
      try {
        syncedUser = await syncBackendUser(dispatch, idToken);
        idToken = await fbUser.getIdToken(true);
      } catch (err) {
        console.error("[AuthBridge] /auth/session sync failed", err);
        await signOut(auth);
        dispatch(setUnauthenticated());
        return;
      }

      if (firstSyncForUser && syncedUser?.accountStatus !== "DELETION_PENDING") {
        // Merge any guest cart into the user cart. Idempotent server-side;
        // safe even if there's no cookie or the guest cart was empty. When
        // the server reports actual merge activity, populate a toast so the
        // user isn't surprised by unexpected quantities in their cart.
        try {
          const mergeResult = await dispatch(
            cartApi.endpoints.mergeGuestCart.initiate(),
          ).unwrap();
          if (mergeResult.summary) {
            dispatch(setMergeNotice(mergeResult.summary));
          }
        } catch (err) {
          console.warn("[AuthBridge] cart merge failed", err);
        }
      }
      syncedRef.current = fbUser.uid;

      const result = await fbUser.getIdTokenResult();
      const role =
        (result.claims.role as "CUSTOMER" | "ADMIN" | undefined) ?? "CUSTOMER";

      dispatch(
        setAuthenticated({
          user: {
            uid: fbUser.uid,
            email: syncedUser?.email ?? fbUser.email ?? "",
            name: syncedUser?.name ?? fbUser.displayName,
            role: syncedUser?.role ?? role,
            accountStatus: syncedUser?.accountStatus ?? "ACTIVE",
            deletionScheduledFor: syncedUser?.deletionScheduledFor ?? null,
          },
          idToken,
        }),
      );
    });

    return () => unsub();
  }, [dispatch]);

  return null;
}

async function syncBackendUser(
  dispatch: ReturnType<typeof useAppDispatch>,
  idToken: string,
) {
  const response = await dispatch(
    authApi.endpoints.createSession.initiate({ idToken }),
  ).unwrap();
  return response.user;
}
