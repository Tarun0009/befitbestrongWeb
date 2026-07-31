"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Banknote, Bell, CheckCheck, CreditCard, X } from "lucide-react";
import {
  useGetAdminNotificationsQuery,
  useMarkAdminNotificationReadMutation,
  useMarkAllAdminNotificationsReadMutation,
} from "./adminNotificationsApi";

export function AdminNotificationBell() {
  const [open, setOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const { data, isFetching } = useGetAdminNotificationsQuery(
    { limit: 20 },
    {
      pollingInterval: 15_000,
      refetchOnFocus: true,
      refetchOnReconnect: true,
    },
  );
  const [markRead, { isLoading: markingRead }] = useMarkAdminNotificationReadMutation();
  const [markAll, { isLoading: markingAll }] =
    useMarkAllAdminNotificationsReadMutation();

  useEffect(() => {
    if (!open) return;
    function closeOnOutsideClick(event: MouseEvent) {
      if (
        event.target instanceof Node &&
        !panelRef.current?.contains(event.target)
      ) {
        setOpen(false);
      }
    }
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", closeOnOutsideClick);
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("mousedown", closeOnOutsideClick);
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [open]);

  const unread = data?.unreadCount ?? 0;

  return (
    <div ref={panelRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        aria-label={
          unread
            ? "Admin notifications, " + unread + " unread"
            : "Admin notifications"
        }
        aria-expanded={open}
        className="relative grid h-10 w-10 place-items-center rounded-xl border border-black/10 bg-white shadow-sm transition hover:bg-black/[0.03]"
      >
        <Bell className="h-4 w-4" />
        {unread > 0 && (
          <span className="absolute -right-1.5 -top-1.5 min-w-5 rounded-full bg-red-600 px-1.5 py-0.5 text-center text-[9px] font-bold text-white ring-2 ring-[#f4f3ef]">
            {unread > 99 ? "99+" : unread}
          </span>
        )}
      </button>

      {open && (
        <section className="fixed inset-x-3 top-20 z-50 overflow-hidden rounded-2xl border border-black/10 bg-white shadow-2xl sm:absolute sm:inset-auto sm:right-0 sm:top-12 sm:w-[25rem]">
          <header className="flex items-center justify-between border-b border-black/[0.06] px-4 py-3">
            <div>
              <h2 className="text-sm font-semibold">Order notifications</h2>
              <p className="mt-0.5 text-[11px] text-muted-foreground">
                {unread ? unread + " unread" : "You are all caught up"}
                {isFetching ? " · updating" : ""}
              </p>
            </div>
            <div className="flex items-center gap-1">
              {unread > 0 && (
                <button
                  type="button"
                  onClick={() => markAll()}
                  disabled={markingAll}
                  className="inline-flex h-8 items-center gap-1.5 rounded-lg px-2 text-[11px] font-semibold text-muted-foreground hover:bg-muted"
                >
                  <CheckCheck className="h-3.5 w-3.5" />
                  Read all
                </button>
              )}
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Close notifications"
                className="grid h-8 w-8 place-items-center rounded-lg hover:bg-muted"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </header>

          <div className="max-h-[min(65vh,32rem)] overflow-y-auto">
            {!data?.items.length ? (
              <div className="px-6 py-12 text-center">
                <Bell className="mx-auto h-6 w-6 text-muted-foreground" />
                <p className="mt-3 text-sm font-semibold">No notifications yet</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Captured prepaid orders will appear here.
                </p>
              </div>
            ) : (
              <ul>
                {data.items.map((notification) => {
                  const isCod = notification.type === "ORDER_COD_PLACED";
                  const Icon = isCod ? Banknote : CreditCard;
                  return (
                    <li
                      key={notification.id}
                      className={
                        "border-b border-black/[0.055] last:border-0 " +
                        (notification.readAt ? "bg-white" : "bg-amber-50/70")
                      }
                    >
                      <Link
                        href={"/admin/orders/" + notification.orderId}
                        onClick={() => {
                          if (!notification.readAt && !markingRead) {
                            void markRead(notification.id);
                          }
                          setOpen(false);
                        }}
                        className="flex gap-3 px-4 py-4 hover:bg-black/[0.025]"
                      >
                        <span
                          className={
                            "grid h-9 w-9 shrink-0 place-items-center rounded-xl " +
                            (isCod
                              ? "bg-orange-100 text-orange-700"
                              : "bg-emerald-100 text-emerald-700")
                          }
                        >
                          <Icon className="h-4 w-4" />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="flex items-center gap-2">
                            <span className="text-xs font-semibold">
                              {notification.title}
                            </span>
                            {!notification.readAt && (
                              <span className="h-1.5 w-1.5 rounded-full bg-red-600" />
                            )}
                          </span>
                          <span className="mt-1 block text-[11px] leading-5 text-muted-foreground">
                            {notification.message}
                          </span>
                          <span className="mt-1.5 block text-[10px] font-medium text-muted-foreground">
                            {relativeTime(notification.createdAt)}
                          </span>
                        </span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
          <footer className="border-t border-black/[0.06] bg-[#faf9f6] p-3">
            <Link
              href="/admin/orders"
              onClick={() => setOpen(false)}
              className="flex h-9 items-center justify-center rounded-lg border border-black/10 bg-white text-xs font-semibold hover:bg-black/[0.03]"
            >
              View all orders
            </Link>
          </footer>
        </section>
      )}
    </div>
  );
}

function relativeTime(value: string) {
  const seconds = Math.max(
    1,
    Math.floor((Date.now() - new Date(value).getTime()) / 1000),
  );
  if (seconds < 60) return "Just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return minutes + "m ago";
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return hours + "h ago";
  return Math.floor(hours / 24) + "d ago";
}

