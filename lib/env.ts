import { z } from "zod";

const envSchema = z.object({
    POSTGRES_URL: z.string().min(1),
    AUTH_SECRET: z.string().min(32, "AUTH_SECRET must be at least 32 chars"),
    INVITE_CODE: z.string().min(1),
    ADMIN_PASSWORD_HASH: z.string().min(1),
    CRON_SECRET: z.string().min(1),
    FOOTBALL_DATA_TOKEN: z.string().optional().default(""),
    NEXT_PUBLIC_APP_URL: z.string().url().default("http://localhost:3000"),
});

export const env = envSchema.parse({
    POSTGRES_URL: process.env.POSTGRES_URL,
    AUTH_SECRET: process.env.AUTH_SECRET,
    INVITE_CODE: process.env.INVITE_CODE,
    ADMIN_PASSWORD_HASH: process.env.ADMIN_PASSWORD_HASH,
    CRON_SECRET: process.env.CRON_SECRET,
    FOOTBALL_DATA_TOKEN: process.env.FOOTBALL_DATA_TOKEN,
    NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
});
