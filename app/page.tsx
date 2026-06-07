import Image from "next/image";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { AuthForm } from "./_components/auth-form";

interface PageProps {
    searchParams: Promise<{ reset?: string }>;
}

export default async function LandingPage({ searchParams }: PageProps) {
    const session = await getSession();
    if (session !== null) {
        redirect("/leaderboard");
    }
    const params = await searchParams;
    const resetOk = params.reset === "ok";

    return (
        <main className="mx-auto max-w-md px-6 pt-12 pb-24">
            <header className="mb-10 flex items-start gap-5">
                <Image
                    src="/world-cup-logo.png"
                    alt="FIFA World Cup 2026"
                    width={120}
                    height={156}
                    priority
                    className="h-32 w-auto shrink-0"
                />
                <div className="flex-1 pt-1">
                    <p className="font-display text-xs uppercase tracking-[0.3em] text-tournament">
                        LeWorldCup
                    </p>
                    <h1 className="mt-1 text-5xl font-bold leading-none">2026</h1>
                    <p className="mt-3 text-sm text-ink-muted">
                        Private pick&apos;em for the FIFA World Cup 2026. Predict every match,
                        lock in your bonuses, and try not to embarrass yourself.
                    </p>
                </div>
            </header>

            <div className="dashed-rule mb-8" />

            {resetOk ? (
                <p className="mb-6 rounded border border-pitch/40 bg-pitch/10 p-3 text-sm">
                    Password updated. Log in with your new one.
                </p>
            ) : null}

            <AuthForm />

            <div className="mt-10 text-xs text-ink-muted">
                <Link href="/rules" className="underline-offset-2 hover:underline">
                    Read the rules first →
                </Link>
            </div>
        </main>
    );
}
