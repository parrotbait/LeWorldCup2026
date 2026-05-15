import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
    return twMerge(clsx(inputs));
}

// ISO-3 country code → flag emoji. Falls back to the code itself.
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

export function formatKickoff(d: Date | string): string {
    const date = typeof d === "string" ? new Date(d) : d;
    return date.toLocaleString("en-IE", {
        weekday: "short",
        day: "2-digit",
        month: "short",
        hour: "2-digit",
        minute: "2-digit",
    });
}
