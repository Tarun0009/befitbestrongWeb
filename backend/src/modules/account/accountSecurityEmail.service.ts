import type { EmailOutboxTx } from "../notifications/emailOutbox.service.js";
import { enqueueEmail } from "../notifications/emailOutbox.service.js";

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function emailFrame(title: string, body: string, action?: { label: string; url: string }) {
  const actionHtml = action
    ? "<p style='margin:24px 0'><a href='" +
      escapeHtml(action.url) +
      "' style='display:inline-block;background:#1f1b14;color:#fff;padding:12px 18px;text-decoration:none;border-radius:6px'>" +
      escapeHtml(action.label) +
      "</a></p>"
    : "";
  return (
    "<div style='font-family:Arial,sans-serif;max-width:600px;margin:auto;color:#1f1b14'>" +
    "<div style='background:#f5b800;padding:18px 24px;font-weight:700'>beFitBeStrong</div>" +
    "<div style='padding:24px;border:1px solid #e5e0d7'>" +
    "<h1 style='font-size:24px;margin:0 0 12px'>" +
    escapeHtml(title) +
    "</h1><p style='line-height:1.6'>" +
    escapeHtml(body) +
    "</p>" +
    actionHtml +
    "<p style='color:#6f675d;font-size:13px'>If this was not you, change your password and contact support immediately.</p>" +
    "</div></div>"
  );
}

export function queueAccountSecurityEmail(
  tx: EmailOutboxTx,
  input: {
    userId: string;
    eventId: string;
    recipientEmail: string;
    subject: string;
    title: string;
    message: string;
  },
) {
  return enqueueEmail(tx, {
    idempotencyKey: `account-security/${input.userId}/${input.eventId}`,
    template: "ACCOUNT_SECURITY",
    recipientEmail: input.recipientEmail,
    subject: input.subject,
    html: emailFrame(input.title, input.message),
    referenceType: "User",
    referenceId: input.userId,
    referenceVersion: input.eventId,
  });
}

export function queueEmailChangeConfirmation(
  tx: EmailOutboxTx,
  input: {
    userId: string;
    eventId: string;
    recipientEmail: string;
    verificationLink: string;
    expiresInMinutes: number;
  },
) {
  return enqueueEmail(tx, {
    idempotencyKey: `email-change-confirmation/${input.userId}/${input.eventId}`,
    template: "EMAIL_CHANGE_CONFIRMATION",
    recipientEmail: input.recipientEmail,
    subject: "Confirm your new beFitBeStrong email",
    html: emailFrame(
      "Confirm your new email",
      `Use the secure link below within ${input.expiresInMinutes} minutes. Your current email remains active until you confirm this change.`,
      { label: "Confirm email change", url: input.verificationLink },
    ),
    referenceType: "User",
    referenceId: input.userId,
    referenceVersion: input.eventId,
  });
}
