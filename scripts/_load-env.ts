/**
 * Boot env loading for CLI scripts.
 *
 * Next.js loads `.env.local` automatically; tsx-driven scripts (sim, seed,
 * snapshot, restore, drizzle-kit) don't, so we do it explicitly here.
 *
 * `.env.local` takes priority over `.env` to mirror Next's resolution order.
 */
import dotenv from "dotenv";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "..");

dotenv.config({ path: resolve(root, ".env.local") });
dotenv.config({ path: resolve(root, ".env") });
