"use client";

import { useActionState } from "react";
import { joinAction, type ActionResult } from "@/app/actions/auth";

export function JoinForm() {
    const [state, formAction, pending] = useActionState<ActionResult | undefined, FormData>(
        joinAction,
        undefined,
    );

    return (
        <form action={formAction} className="flex flex-col gap-4">
            <label className="flex flex-col gap-1.5">
                <span className="font-display text-xs uppercase tracking-widest opacity-70">
                    Invite code
                </span>
                <input
                    name="inviteCode"
                    required
                    autoComplete="off"
                    className="rounded border border-ink/30 bg-paper px-3 py-2 text-base focus:border-tournament focus:outline-none"
                    placeholder="goal-2026"
                />
            </label>

            <label className="flex flex-col gap-1.5">
                <span className="font-display text-xs uppercase tracking-widest opacity-70">
                    Display name
                </span>
                <input
                    name="displayName"
                    required
                    autoComplete="off"
                    className="rounded border border-ink/30 bg-paper px-3 py-2 text-base focus:border-tournament focus:outline-none"
                    placeholder="The Pelé Mayor"
                    minLength={2}
                    maxLength={24}
                />
            </label>

            {state?.error !== undefined ? (
                <p className="text-sm text-tournament">{state.error}</p>
            ) : null}

            <button
                type="submit"
                disabled={pending}
                className="mt-2 rounded bg-tournament px-4 py-2.5 font-display text-sm uppercase tracking-widest text-paper transition hover:bg-tournament/90 disabled:opacity-50"
            >
                {pending ? "Joining…" : "Let me in"}
            </button>
        </form>
    );
}
