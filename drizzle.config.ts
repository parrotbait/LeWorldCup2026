import "./scripts/_load-env";
import { defineConfig } from "drizzle-kit";

export default defineConfig({
    schema: "./db/schema.ts",
    out: "./db/migrations",
    dialect: "postgresql",
    dbCredentials: {
        url: process.env.POSTGRES_URL ?? "postgres://postgres:postgres@localhost:5432/leworldcup",
    },
    strict: true,
    verbose: true,
});
