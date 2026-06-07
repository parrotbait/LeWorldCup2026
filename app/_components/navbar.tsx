import Image from "next/image";
import Link from "next/link";
import { logoutAction } from "@/app/actions/auth";
import { requireSession } from "@/lib/auth";

export async function NavBar() {
    const session = await requireSession();
    return (
        <header className="border-b border-rule">
            <div className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-6 py-3">
                <Link
                    href="/leaderboard"
                    className="flex shrink-0 items-center gap-2 font-display text-xs uppercase tracking-[0.3em]"
                >
                    <Image
                        src="/world-cup-logo.png"
                        alt="FIFA World Cup 2026"
                        width={28}
                        height={36}
                        priority
                        className="h-9 w-auto"
                    />
                    <span>
                        <span className="text-tournament">LeWorldCup</span> 2026
                    </span>
                </Link>
                <nav className="flex flex-wrap items-center gap-x-5 gap-y-2 text-sm">
                    <Link href="/leaderboard" className="hover:text-tournament">leaderboard</Link>
                    <Link href="/today" className="hover:text-tournament">today</Link>
                    <Link href="/predictions" className="hover:text-tournament">predictions</Link>
                    <Link href="/bonuses" className="hover:text-tournament">bonuses</Link>
                    <Link href="/matches" className="hover:text-tournament">matches</Link>
                    <Link href="/stats" className="hover:text-tournament">stats</Link>
                    <Link href="/me" className="hover:text-tournament">me</Link>
                    <Link href="/rules" className="hover:text-tournament">rules</Link>
                    <span className="hidden text-xs text-ink-muted sm:inline">{session.displayName}</span>
                    <form action={logoutAction}>
                        <button type="submit" className="text-xs text-ink-muted hover:text-tournament">
                            log out
                        </button>
                    </form>
                </nav>
            </div>
        </header>
    );
}
