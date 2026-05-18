import { env, passwordResetEnabled } from "./env";

/**
 * Tiny Resend client.
 *
 * Resend's HTTP API is one POST per email — no SDK needed. Free tier is
 * 3000 sends/month / 100/day, plenty for password resets in a 12-friend pool.
 *
 * If RESEND_API_KEY isn't configured we no-op and return success: callers
 * surface a generic "if that email exists we've sent a link" so users can't
 * tell the difference between "not configured" and "address not found".
 */

interface SendArgs {
    to: string;
    subject: string;
    text: string;
    html?: string;
}

interface ResendResponse {
    id?: string;
    message?: string;
    name?: string;
}

export async function sendEmail({ to, subject, text, html }: SendArgs): Promise<{
    sent: boolean;
    error?: string;
}> {
    if (!passwordResetEnabled) {
        // Don't crash. Log so the operator knows nothing went out.
        console.warn(`[email] RESEND_API_KEY not set — skipped sending '${subject}' to ${to}`);
        return { sent: false, error: "email-not-configured" };
    }
    try {
        const res = await fetch("https://api.resend.com/emails", {
            method: "POST",
            headers: {
                Authorization: `Bearer ${env.RESEND_API_KEY}`,
                "Content-Type": "application/json",
            },
            body: JSON.stringify({
                from: env.RESET_FROM_EMAIL,
                to: [to],
                subject,
                text,
                html: html ?? text,
            }),
        });
        if (!res.ok) {
            const body = (await res.json().catch(() => ({}))) as ResendResponse;
            const msg = body.message ?? `${res.status} ${res.statusText}`;
            console.error(`[email] resend failed: ${msg}`);
            return { sent: false, error: msg };
        }
        return { sent: true };
    } catch (e) {
        console.error("[email] network error", e);
        return { sent: false, error: (e as Error).message };
    }
}

export function passwordResetEmail(opts: {
    displayName: string;
    resetUrl: string;
    expiresMinutes: number;
}): { subject: string; text: string; html: string } {
    const { displayName, resetUrl, expiresMinutes } = opts;
    const subject = "Reset your LeWorldCup 2026 password";
    const text = `Hi ${displayName},

Someone (hopefully you) asked to reset your LeWorldCup 2026 password. Click the link below to set a new one:

${resetUrl}

The link expires in ${expiresMinutes} minutes and can only be used once. If you didn't request this, you can safely ignore this email — your password won't change.

— LeWorldCup 2026
`;
    const html = `<!doctype html>
<html><body style="font-family:system-ui,-apple-system,Inter,sans-serif;color:#1B2A41;background:#F4ECD8;padding:24px">
  <p>Hi <strong>${escapeHtml(displayName)}</strong>,</p>
  <p>Someone (hopefully you) asked to reset your LeWorldCup 2026 password.</p>
  <p>
    <a href="${escapeHtml(resetUrl)}"
       style="display:inline-block;background:#C03221;color:#F4ECD8;padding:10px 18px;border-radius:4px;text-decoration:none;font-weight:600">
      Reset your password
    </a>
  </p>
  <p style="color:#1B2A41;opacity:.7;font-size:14px">
    Or paste this link into your browser:<br>
    <code style="word-break:break-all">${escapeHtml(resetUrl)}</code>
  </p>
  <p style="color:#1B2A41;opacity:.7;font-size:14px">
    The link expires in ${expiresMinutes} minutes and can only be used once. If you didn't request this, you can ignore this email — your password won't change.
  </p>
  <p style="color:#1B2A41;opacity:.5;font-size:12px;margin-top:32px">— LeWorldCup 2026</p>
</body></html>`;
    return { subject, text, html };
}

function escapeHtml(s: string): string {
    return s
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
}
