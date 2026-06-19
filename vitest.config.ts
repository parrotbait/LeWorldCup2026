import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import dotenv from "dotenv";

// Tests touch modules that import `lib/env.ts`, which zod-validates env at
// module load. Mirror what scripts/_load-env.ts does so vitest starts with
// the same env Next would have in dev.
const here = fileURLToPath(new URL("./", import.meta.url));
dotenv.config({ path: resolve(here, ".env.local") });
dotenv.config({ path: resolve(here, ".env") });

export default defineConfig({
    resolve: {
        alias: {
            "@": here,
        },
    },
});
