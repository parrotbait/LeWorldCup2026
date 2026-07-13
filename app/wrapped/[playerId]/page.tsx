import { notFound } from "next/navigation";
import { requireSession } from "@/lib/auth";
import { getFrozenWrapped } from "@/lib/wrapped-store";
import { buildWrappedForPreview } from "@/lib/wrapped-store-preview";
import { WrappedModalClient } from "@/app/leaderboard/_components/WrappedModalClient";

interface PageProps {
    params: Promise<{ playerId: string }>;
    searchParams: Promise<{ preview?: string }>;
}

export default async function WrappedPage({ params, searchParams }: PageProps) {
    await requireSession();
    const { playerId: raw } = await params;
    const { preview } = await searchParams;
    const playerId = Number(raw);
    if (!Number.isFinite(playerId)) {
        notFound();
    }

    // Dev-only bypass so any player's Wrapped can be previewed without waiting
    // for the unlock gate. Guarded like lib/bonus-lock.ts's override.
    const isDevPreview = preview === "1" && process.env.NODE_ENV !== "production";
    const data = isDevPreview
        ? await buildWrappedForPreview(playerId)
        : await getFrozenWrapped(playerId);

    if (data === null) {
        notFound();
    }

    // Reuse the same modal; autoOpen false so the preview never consumes the seen flag.
    return (
        <main className="min-h-screen bg-paper">
            <WrappedModalClient data={data} autoOpen={false} />
        </main>
    );
}
