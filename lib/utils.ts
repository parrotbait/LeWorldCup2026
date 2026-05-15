import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
    return twMerge(clsx(inputs));
}

/**
 * The display timezone for every kickoff and lock countdown in the UI.
 *
 * We're all in GMT/BST so render uniformly in Europe/London regardless of
 * where the server runs (Vercel functions are UTC by default). `Intl` handles
 * the BST switch automatically based on the date.
 */
export const TIMEZONE = "Europe/London";
const LOCALE = "en-IE";

const DATE_TIME = new Intl.DateTimeFormat(LOCALE, {
    weekday: "short",
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: TIMEZONE,
});
const TIME = new Intl.DateTimeFormat(LOCALE, {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: TIMEZONE,
});
const DATE_LONG = new Intl.DateTimeFormat(LOCALE, {
    weekday: "long",
    day: "2-digit",
    month: "long",
    timeZone: TIMEZONE,
});
const DATE_TIME_LONG = new Intl.DateTimeFormat(LOCALE, {
    weekday: "long",
    day: "2-digit",
    month: "long",
    hour: "2-digit",
    minute: "2-digit",
    timeZoneName: "short",
    timeZone: TIMEZONE,
});

const toDate = (d: Date | string): Date => (typeof d === "string" ? new Date(d) : d);

/** Compact "Mon 11 Jun 21:00" */
export function formatKickoff(d: Date | string): string {
    return DATE_TIME.format(toDate(d));
}

/** "21:00" */
export function formatTime(d: Date | string): string {
    return TIME.format(toDate(d));
}

/** "Monday 11 June" */
export function formatDayLong(d: Date | string): string {
    return DATE_LONG.format(toDate(d));
}

/** "Monday 11 June 21:00 BST" — for headers / detail pages */
export function formatKickoffLong(d: Date | string): string {
    return DATE_TIME_LONG.format(toDate(d));
}

// ISO 3-letter country code → flag emoji. Falls back to the code itself.
export function flag(code: string): string {
    const map: Record<string, string> = {
        ARG: "🇦🇷", AUS: "🇦🇺", AUT: "🇦🇹", BEL: "🇧🇪", BRA: "🇧🇷",
        CAN: "🇨🇦", CHN: "🇨🇳", COL: "🇨🇴", CRC: "🇨🇷", CRO: "🇭🇷",
        DEN: "🇩🇰", ECU: "🇪🇨", EGY: "🇪🇬", ENG: "🏴\u{E0067}\u{E0062}\u{E0065}\u{E006E}\u{E0067}\u{E007F}",
        ESP: "🇪🇸", FRA: "🇫🇷", GER: "🇩🇪", GHA: "🇬🇭", IRN: "🇮🇷",
        ITA: "🇮🇹", JPN: "🇯🇵", KOR: "🇰🇷", MAR: "🇲🇦", MEX: "🇲🇽",
        NED: "🇳🇱", NOR: "🇳🇴", NZL: "🇳🇿", PAR: "🇵🇾", POL: "🇵🇱",
        POR: "🇵🇹", QAT: "🇶🇦", SAU: "🇸🇦", SEN: "🇸🇳", SRB: "🇷🇸",
        SUI: "🇨🇭", TUN: "🇹🇳", URU: "🇺🇾", USA: "🇺🇸", WAL: "🏴\u{E0067}\u{E0062}\u{E0077}\u{E006C}\u{E0073}\u{E007F}",
    };
    return map[code] ?? code;
}
