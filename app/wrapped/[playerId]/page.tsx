import { notFound } from "next/navigation";
import { isAdmin, requireSession } from "@/lib/auth";
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

    // Preview bypass (ignore the unlock gate, render any player) is allowed in
    // dev for everyone, and for admins in any environment — so the admin index
    // at /admin/wrapped can preview each player. Guarded like lib/bonus-lock.ts.
    const previewAllowed =
        preview === "1" && (process.env.NODE_ENV !== "production" || (await isAdmin()));
    const data = previewAllowed
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

