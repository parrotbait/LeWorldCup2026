/**
 * Parse the FIFA WC2026 official squad lists PDF into a canonical JSON.
 *
 * Reads `data/SquadLists-English.pdf`, shells out to `pdftotext -layout`, and
 * writes `data/wc2026-players.json` with one entry per player and team. That
 * file is the source of truth for the Top Scorer bonus typeahead and for
 * server-side validation of TOP_SCORER picks.
 *
 *   pnpm tsx scripts/parse-squads.ts
 *
 * Re-run any time FIFA publishes an updated PDF (player swaps before the
 * tournament, etc.). The output is committed.
 */

import "./_load-env";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const PDF_PATH = resolve(process.cwd(), "data/SquadLists-English.pdf");
const OUT_PATH = resolve(process.cwd(), "data/wc2026-players.json");

interface SquadPlayer {
    shirtNumber: number;
    position: string;
    displayName: string;
    firstName: string;
    lastName: string;
    nameOnShirt: string;
    club: string;
}

interface Squad {
    teamCode: string;
    teamName: string;
    players: SquadPlayer[];
}

function shellPdfToText(): string {
    const tmp = mkdtempSync(join(tmpdir(), "lwc-squads-"));
    const txt = join(tmp, "squads.txt");
    try {
        execFileSync("pdftotext", ["-layout", PDF_PATH, txt], { stdio: "ignore" });
        return readFileSync(txt, "utf8");
    } finally {
        rmSync(tmp, { recursive: true, force: true });
    }
}

function parse(text: string): Squad[] {
    const lines = text.split("\n");
    const squads: Squad[] = [];
    let current: Squad | null = null;

    // Match e.g. "        Argentina (ARG)"
    const teamHeader = /^\s*(.+?)\s+\(([A-Z]{3})\)\s*$/;
    // Match a player row: starts with #, position, then layout-spaced columns.
    // pdftotext -layout emits 2+ spaces between columns; single spaces stay
    // inside multi-word names ("MAC ALLISTER Alexis", "DE PAUL Rodrigo").
    const playerRow = /^\s*(\d{1,2})\s{2,}([A-Z]{2})\s{2,}/;

    for (const raw of lines) {
        const headerMatch = teamHeader.exec(raw);
        if (headerMatch !== null) {
            // Filter out non-team headers that match the same pattern
            // (coach/role lines etc. stay null on the country side).
            const name = headerMatch[1]!.trim();
            const code = headerMatch[2]!;
            // Skip the global header repeated on every page.
            if (name.toUpperCase() === "FIFA WORLD CUP 2026") {
                continue;
            }
            current = { teamCode: code, teamName: name, players: [] };
            squads.push(current);
            continue;
        }

        if (current === null || !playerRow.test(raw)) {
            continue;
        }

        // Split the row on 2+ whitespace. Yields 9 fields:
        //   [#, POS, PLAYER NAME, FIRST NAMES, LAST NAMES, NAME ON SHIRT, DOB, CLUB, HEIGHT]
        const cols = raw.trim().split(/\s{2,}/);
        if (cols.length < 8) {
            continue;
        }

        const [num, pos, displayName, firstName, lastName, nameOnShirt, _dob, club] = cols;
        if (num === undefined || pos === undefined || displayName === undefined) {
            continue;
        }
        // Skip the table header row itself (POS column literally reads "POS").
        if (pos === "PO") {
            continue;
        }

        current.players.push({
            shirtNumber: Number(num),
            position: pos,
            displayName: displayName.trim(),
            firstName: (firstName ?? "").trim(),
            lastName: (lastName ?? "").trim(),
            nameOnShirt: (nameOnShirt ?? "").trim(),
            club: (club ?? "").trim(),
        });
    }

    // Sanity check: every team should have ~26 players.
    for (const s of squads) {
        if (s.players.length < 20 || s.players.length > 30) {
            console.warn(
                `⚠ ${s.teamName} (${s.teamCode}): parsed ${s.players.length} players — check the source PDF`,
            );
        }
    }

    return squads;
}

function main(): void {
    const text = shellPdfToText();
    const teams = parse(text);
    if (teams.length !== 48) {
        console.warn(`⚠ parsed ${teams.length} teams; expected 48`);
    }
    const totalPlayers = teams.reduce((acc, t) => acc + t.players.length, 0);

    const out = {
        capturedAt: new Date().toISOString().slice(0, 10),
        source: "data/SquadLists-English.pdf (FIFA WC2026 official squads)",
        teams,
    };
    writeFileSync(OUT_PATH, JSON.stringify(out, null, 2) + "\n");
    console.log(
        `✓ squads: ${teams.length} teams, ${totalPlayers} players → ${OUT_PATH.replace(process.cwd() + "/", "")}`,
    );
}

main();
