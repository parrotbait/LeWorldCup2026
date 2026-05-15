"use client";

import { useActionState } from "react";
import { adminLoginAction, type ActionResult } from "@/app/actions/auth";

export function AdminLoginForm() {
    const [state, formAction, pending] = useActionState<ActionResult | undefined, FormData>(
        adminLoginAction,
        undefined,
    );
    return (
        <form action={formAction} className="flex flex-col gap-3">
            <label className="flex flex-col gap-1.5">
                <span className="font-display text-xs uppercase tracking-widest opacity-70">
                    Admin password
                </span>
                <input
                    type="password"
                    name="password"
                    required
                    className="rounded border border-ink/30 bg-paper px-3 py-2 text-base focus:border-tournament focus:outline-none"
                />
            </label>
            {state?.error !== undefined ? (
                <p className="text-sm text-tournament">{state.error}</p>
            ) : null}
            <button
                type="submit"
                disabled={pending}
                className="rounded bg-ink px-4 py-2.5 font-display text-sm uppercase tracking-widest text-paper hover:bg-ink/90 disabled:opacity-50"
            >
                {pending ? "Signing in…" : "Sign in"}
            </button>
        </form>
    );
}
