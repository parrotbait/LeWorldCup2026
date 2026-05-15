import { NavBar } from "@/app/_components/navbar";
import { requireSession } from "@/lib/auth";

export default async function MePage() {
    const session = await requireSession();
    return (
        <>
            <NavBar />
            <main className="mx-auto max-w-2xl px-6 py-8">
                <h1 className="font-display text-2xl uppercase tracking-widest">{session.displayName}</h1>
                <p className="mt-2 text-sm opacity-70">
                    Your prediction history, bonuses, and joker picks will appear here.
                </p>
                <p className="mt-6 text-xs opacity-60">
                    🚧 Picks UI is the next ticket. See <code>docs/requirements.md §4.2–4.3</code>.
                </p>
            </main>
        </>
    );
}
