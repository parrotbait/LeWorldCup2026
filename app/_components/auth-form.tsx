"use client";

import { useActionState, useState } from "react";
import { logInAction, signUpAction, type ActionResult } from "@/app/actions/auth";

type Mode = "login" | "signup";

export function AuthForm() {
    const [mode, setMode] = useState<Mode>("login");
    return (
        <div>
            <div role="tablist" className="mb-6 flex gap-2 border-b border-ink/20">
                <TabButton active={mode === "login"} onClick={() => setMode("login")}>
                    Log in
                </TabButton>
                <TabButton active={mode === "signup"} onClick={() => setMode("signup")}>
                    First time? Sign up
                </TabButton>
            </div>
            {mode === "login" ? <LogInForm /> : <SignUpForm />}
        </div>
    );
}

function TabButton({
    active,
    onClick,
    children,
}: {
    active: boolean;
    onClick: () => void;
    children: React.ReactNode;
}) {
    return (
        <button
            type="button"
            role="tab"
            onClick={onClick}
            className={`-mb-px border-b-2 px-3 py-2 font-display text-xs uppercase tracking-widest transition ${
                active
                    ? "border-tournament text-tournament"
                    : "border-transparent opacity-60 hover:opacity-100"
            }`}
        >
            {children}
        </button>
    );
}

function LogInForm() {
    const [state, formAction, pending] = useActionState<ActionResult | undefined, FormData>(
        logInAction,
        undefined,
    );

    return (
        <form action={formAction} className="flex flex-col gap-4">
            <Field label="Display name" name="displayName" placeholder="The Pelé Mayor" />
            <Field label="Password" name="password" type="password" />
            {state?.error !== undefined ? (
                <p className="text-sm text-tournament">{state.error}</p>
            ) : null}
            <SubmitButton pending={pending} idle="Log in" busy="Signing in…" />
        </form>
    );
}

function SignUpForm() {
    const [state, formAction, pending] = useActionState<ActionResult | undefined, FormData>(
        signUpAction,
        undefined,
    );

    return (
        <form action={formAction} className="flex flex-col gap-4">
            <Field label="Invite code" name="inviteCode" placeholder="goal-2026" />
            <Field
                label="Display name"
                name="displayName"
                placeholder="The Pelé Mayor"
                minLength={2}
                maxLength={24}
            />
            <Field
                label="Password"
                name="password"
                type="password"
                minLength={6}
                hint="At least 6 characters. Pick something memorable — there's no reset email."
            />
            {state?.error !== undefined ? (
                <p className="text-sm text-tournament">{state.error}</p>
            ) : null}
            <SubmitButton pending={pending} idle="Create account" busy="Creating…" />
        </form>
    );
}

function Field({
    label,
    name,
    type = "text",
    placeholder,
    minLength,
    maxLength,
    hint,
}: {
    label: string;
    name: string;
    type?: "text" | "password";
    placeholder?: string;
    minLength?: number;
    maxLength?: number;
    hint?: string;
}) {
    return (
        <label className="flex flex-col gap-1.5">
            <span className="font-display text-xs uppercase tracking-widest opacity-70">
                {label}
            </span>
            <input
                name={name}
                type={type}
                required
                autoComplete={type === "password" ? "current-password" : "off"}
                minLength={minLength}
                maxLength={maxLength}
                placeholder={placeholder}
                className="rounded border border-ink/30 bg-paper px-3 py-2 text-base focus:border-tournament focus:outline-none"
            />
            {hint !== undefined ? <span className="text-xs opacity-60">{hint}</span> : null}
        </label>
    );
}

function SubmitButton({
    pending,
    idle,
    busy,
}: {
    pending: boolean;
    idle: string;
    busy: string;
}) {
    return (
        <button
            type="submit"
            disabled={pending}
            className="mt-2 rounded bg-tournament px-4 py-2.5 font-display text-sm uppercase tracking-widest text-paper transition hover:bg-tournament/90 disabled:opacity-50"
        >
            {pending ? busy : idle}
        </button>
    );
}
