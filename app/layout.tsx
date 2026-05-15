import type { Metadata } from "next";
import { DM_Mono, Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({
    subsets: ["latin"],
    variable: "--font-inter",
    display: "swap",
});

const dmMono = DM_Mono({
    subsets: ["latin"],
    weight: ["400", "500"],
    variable: "--font-dm-mono",
    display: "swap",
});

export const metadata: Metadata = {
    title: "Le World Cup 2026",
    description: "Private pick'em for the FIFA World Cup 2026. ~12 friends. No ads. No SSO.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
    return (
        <html lang="en" className={`${inter.variable} ${dmMono.variable}`}>
            <body>{children}</body>
        </html>
    );
}
