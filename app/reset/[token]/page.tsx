import Link from "next/link";
import { ResetForm } from "./_reset-form";

interface PageProps {
    params: Promise<{ token: string }>;
}

export default async function ResetPage({ params }: PageProps) {
    const { token } = await params;
    return (
        <main className="mx-auto max-w-md px-6 pt-16 pb-24">
            <header className="mb-6">
                <p className="font-display text-xs uppercase tracking-[0.3em] text-tournament">
                    LeWorldCup
                </p>
                <h1 className="mt-1 font-display text-3xl">Set a new password</h1>
                <p className="mt-3 text-sm opacity-70">
                    This link is single-use. After saving, log in with your new password.
                </p>
            </header>

            <div className="dashed-rule mb-8" />

            <ResetForm token={token} />

            <p className="mt-8 text-center text-xs opacity-60">
                <Link href="/" className="hover:text-tournament">
                    ← back to login
                </Link>
            </p>
        </main>
    );
}
