import Link from "next/link";
import { logoutAction } from "@/app/actions/auth";
import { requireSession } from "@/lib/auth";

export async function NavBar() {
    const session = await requireSession();
    return (
        <header className="border-b border-ink/15">
            <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-3">
                <Link href="/leaderboard" className="font-display text-xs uppercase tracking-[0.3em]">
                    <span className="text-tournament">LeWorldCup</span> 2026
                </Link>
                <nav className="flex flex-wrap items-center gap-x-5 gap-y-2 text-sm">
                    <Link href="/leaderboard" className="hover:text-tournament">leaderboard</Link>
                    <Link href="/predictions" className="hover:text-tournament">predictions</Link>
                    <Link href="/bonuses" className="hover:text-tournament">bonuses</Link>
                    <Link href="/matches" className="hover:text-tournament">matches</Link>
                    <Link href="/me" className="hover:text-tournament">me</Link>
                    <Link href="/rules" className="hover:text-tournament">rules</Link>
                    <span className="hidden text-xs opacity-60 sm:inline">{session.displayName}</span>
                    <form action={logoutAction}>
                        <button type="submit" className="text-xs opacity-60 hover:text-tournament">
                            log out
                        </button>
                    </form>
                </nav>
            </div>
        </header>
    );
}
