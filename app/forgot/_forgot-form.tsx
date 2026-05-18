"use client";

import { useActionState } from "react";
import { requestPasswordResetAction, type ActionResult } from "@/app/actions/auth";

export function ForgotForm() {
    const [state, formAction, pending] = useActionState<ActionResult | undefined, FormData>(
        requestPasswordResetAction,
        undefined,
    );
    return (
        <form action={formAction} className="flex flex-col gap-4">
            <label className="flex flex-col gap-1.5">
                <span className="font-display text-xs uppercase tracking-widest opacity-70">
                    Email
                </span>
                <input
                    name="email"
                    type="email"
                    required
                    autoComplete="email"
                    placeholder="you@example.com"
                    className="rounded border border-ink/30 bg-paper px-3 py-2 text-base focus:border-tournament focus:outline-none"
                />
            </label>
            {state?.error !== undefined ? (
                <p className="text-sm text-tournament">{state.error}</p>
            ) : null}
            {state?.info !== undefined ? (
                <p className="text-sm text-pitch">{state.info}</p>
            ) : null}
            <button
                type="submit"
                disabled={pending}
                className="mt-2 rounded bg-tournament px-4 py-2.5 font-display text-sm uppercase tracking-widest text-paper transition hover:bg-tournament/90 disabled:opacity-50"
            >
                {pending ? "Sending…" : "Send reset link"}
            </button>
        </form>
    );
}
