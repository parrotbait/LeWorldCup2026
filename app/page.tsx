import Link from "next/link";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { AuthForm } from "./_components/auth-form";

export default async function LandingPage() {
    const session = await getSession();
    if (session !== null) {
        redirect("/leaderboard");
    }

    return (
        <main className="mx-auto max-w-md px-6 pt-16 pb-24">
            <header className="mb-10">
                <p className="font-display text-xs uppercase tracking-[0.3em] text-tournament">
                    LeWorldCup
                </p>
                <h1 className="mt-1 text-5xl font-bold leading-none">2026</h1>
                <p className="mt-3 text-sm opacity-70">
                    Private pick&apos;em for the FIFA World Cup 2026. Predict every match,
                    lock in your bonuses, and try not to embarrass yourself.
                </p>
            </header>

            <div className="dashed-rule mb-8" />

            <AuthForm />

            <div className="mt-10 text-xs opacity-60">
                <Link href="/rules" className="underline-offset-2 hover:underline">
                    Read the rules first →
                </Link>
            </div>
        </main>
    );
}
