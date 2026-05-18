import Link from "next/link";
import { passwordResetEnabled } from "@/lib/env";
import { ForgotForm } from "./_forgot-form";

export default function ForgotPage() {
    return (
        <main className="mx-auto max-w-md px-6 pt-16 pb-24">
            <header className="mb-6">
                <p className="font-display text-xs uppercase tracking-[0.3em] text-tournament">
                    LeWorldCup
                </p>
                <h1 className="mt-1 font-display text-3xl">Forgot password</h1>
                <p className="mt-3 text-sm opacity-70">
                    Enter the email you signed up with and we&apos;ll mail you a link to set a new
                    password. Link is good for 60 minutes and only works once.
                </p>
            </header>

            <div className="dashed-rule mb-8" />

            {passwordResetEnabled ? (
                <ForgotForm />
            ) : (
                <p className="rounded border border-tournament/40 bg-tournament/10 p-4 text-sm">
                    Password reset by email isn&apos;t configured on this deployment. Ask the admin
                    to clear your account so you can sign up again.
                </p>
            )}

            <p className="mt-8 text-center text-xs opacity-60">
                <Link href="/" className="hover:text-tournament">
                    ← back to login
                </Link>
            </p>
        </main>
    );
}
