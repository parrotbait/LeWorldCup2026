import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
    return twMerge(clsx(inputs));
}

/**
 * Predictions lock this many ms before each match's kickoff. Gives a small
 * fairness margin for clock skew and for late-running data sources.
 */
export const PICK_LOCK_BUFFER_MS = 15 * 60_000;

/** Effective lock time for a match — kickoff minus the buffer. */
export function pickLockTime(kickoff: Date): number {
    return kickoff.getTime() - PICK_LOCK_BUFFER_MS;
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

// FIFA / IOC 3-letter codes → ISO 3166-1 alpha-2 (used to derive the flag emoji).
// Special-cased for the four UK constituent flags (England, Scotland, Wales,
// Northern Ireland) which need the "subdivision tag" emoji sequence rather than
// a regional-indicator pair. Teams that share an ISO-2 code but use a different
// 3-letter code (e.g. KSA → SA, RSA → ZA) are mapped explicitly here.
const TLA_TO_ISO2: Record<string, string> = {
    // 2026 World Cup teams
    MEX: "MX", RSA: "ZA", KOR: "KR", CZE: "CZ",
    CAN: "CA", QAT: "QA", SUI: "CH", BIH: "BA",
    BRA: "BR", HAI: "HT", MAR: "MA", SCO: "GB-SCT",
    USA: "US", AUS: "AU", PAR: "PY", TUR: "TR",
    ECU: "EC", GER: "DE", CIV: "CI", CUW: "CW", CUR: "CW",
    JPN: "JP", NED: "NL", SWE: "SE", TUN: "TN",
    BEL: "BE", EGY: "EG", IRN: "IR", NZL: "NZ",
    ESP: "ES", URU: "UY", URY: "UY", CPV: "CV", KSA: "SA", SAU: "SA",
    FRA: "FR", IRQ: "IQ", NOR: "NO", SEN: "SN",
    ARG: "AR", ALG: "DZ", AUT: "AT", JOR: "JO",
    COL: "CO", COD: "CD", POR: "PT", UZB: "UZ",
    CRO: "HR", ENG: "GB-ENG", GHA: "GH", PAN: "PA",
    WAL: "GB-WLS", NIR: "GB-NIR",
    // Common past WC entrants and other UEFA / CONMEBOL / AFC sides
    ITA: "IT", DEN: "DK", POL: "PL", CRC: "CR", IRL: "IE",
    JAM: "JM", PER: "PE", VEN: "VE", CHI: "CL", NGA: "NG",
    SRB: "RS", UKR: "UA", ROU: "RO", SVK: "SK", SVN: "SI",
    HUN: "HU", BUL: "BG", FIN: "FI", ISL: "IS",
    PRK: "KP", CHN: "CN", THA: "TH", VIE: "VN", IDN: "ID",
    UAE: "AE", LBN: "LB", PSE: "PS", SYR: "SY", OMA: "OM",
    LBY: "LY", SDN: "SD", CMR: "CM", BDI: "BI",
    HON: "HN", SLV: "SV", GUA: "GT", DOM: "DO", CUB: "CU", TRI: "TT",
    BOL: "BO",
};

function iso2ToFlag(iso2: string): string {
    if (iso2.startsWith("GB-")) {
        const subdivision: Record<string, string> = {
            "GB-ENG": "\u{1F3F4}\u{E0067}\u{E0062}\u{E0065}\u{E006E}\u{E0067}\u{E007F}",
            "GB-SCT": "\u{1F3F4}\u{E0067}\u{E0062}\u{E0073}\u{E0063}\u{E0074}\u{E007F}",
            "GB-WLS": "\u{1F3F4}\u{E0067}\u{E0062}\u{E0077}\u{E006C}\u{E0073}\u{E007F}",
            "GB-NIR": "\u{1F3F3}\u{FE0F}", // no standard subdivision flag; use white
        };
        return subdivision[iso2] ?? "\u{1F3F3}";
    }
    if (iso2.length !== 2) {
        return iso2;
    }
    // Each ASCII letter A–Z maps to a regional-indicator codepoint at 0x1F1E6.
    const codes = [...iso2.toUpperCase()].map((c) => 0x1f1e6 - 65 + c.charCodeAt(0));
    return String.fromCodePoint(...codes);
}

// FIFA / IOC 3-letter code → flag emoji. Falls back to the code if unknown.
export function flag(code: string): string {
    const iso2 = TLA_TO_ISO2[code.toUpperCase()];
    if (iso2 === undefined) {
        return code;
    }
    return iso2ToFlag(iso2);
}
