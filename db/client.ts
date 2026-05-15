import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { env } from "@/lib/env";
import * as schema from "./schema";

// Reuse the connection across hot-reloads in development.
const globalForDb = globalThis as unknown as {
    pg?: ReturnType<typeof postgres>;
};

const queryClient =
    globalForDb.pg ??
    postgres(env.POSTGRES_URL, {
        max: 5,
        prepare: false,
    });

if (process.env.NODE_ENV !== "production") {
    globalForDb.pg = queryClient;
}

export const db = drizzle(queryClient, { schema });
export { schema };
