"use client";

import { useActionState } from "react";
import { resetPasswordAction, type ActionResult } from "@/app/actions/auth";

export function ResetForm({ token }: { token: string }) {
    const [state, formAction, pending] = useActionState<ActionResult | undefined, FormData>(
        resetPasswordAction,
        undefined,
    );
    return (
        <form action={formAction} className="flex flex-col gap-4">
            <input type="hidden" name="token" value={token} />
            <label className="flex flex-col gap-1.5">
                <span className="font-display text-xs uppercase tracking-widest opacity-70">
                    New password
                </span>
                <input
                    name="password"
                    type="password"
                    required
                    minLength={6}
                    autoComplete="new-password"
                    className="rounded border border-ink/30 bg-paper px-3 py-2 text-base focus:border-tournament focus:outline-none"
                />
                <span className="text-xs opacity-60">At least 6 characters.</span>
            </label>
            {state?.error !== undefined ? (
                <p className="text-sm text-tournament">{state.error}</p>
            ) : null}
            <button
                type="submit"
                disabled={pending}
                className="mt-2 rounded bg-tournament px-4 py-2.5 font-display text-sm uppercase tracking-widest text-paper transition hover:bg-tournament/90 disabled:opacity-50"
            >
                {pending ? "Saving…" : "Set new password"}
            </button>
        </form>
    );
}
