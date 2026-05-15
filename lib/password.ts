import "server-only";
import { randomBytes, scrypt as scryptCb, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

/**
 * Password hashing using Node's built-in scrypt.
 *
 * Why scrypt and not bcrypt: zero dependencies, FIPS-aligned via OpenSSL,
 * and memory-hard in a way bcrypt isn't. Comparable to bcrypt for our threat
 * model (one admin password, used at login only).
 *
 * Format on disk: `scrypt$<N>$<saltHex>$<hashHex>` so we can rotate cost later.
 */

const scrypt = promisify(scryptCb) as (
    password: string | Buffer,
    salt: string | Buffer,
    keylen: number,
) => Promise<Buffer>;

const KEY_LEN = 64;
const SALT_LEN = 16;
const N = 16384; // cost; bumpable later without breaking old hashes.

export async function hashPassword(plain: string): Promise<string> {
    const salt = randomBytes(SALT_LEN);
    const derived = await scrypt(plain, salt, KEY_LEN);
    return `scrypt$${N}$${salt.toString("hex")}$${derived.toString("hex")}`;
}

export async function verifyPassword(plain: string, stored: string): Promise<boolean> {
    const parts = stored.split("$");
    if (parts.length !== 4 || parts[0] !== "scrypt") {
        return false;
    }
    const [, , saltHex, hashHex] = parts;
    if (saltHex === undefined || hashHex === undefined) {
        return false;
    }
    const salt = Buffer.from(saltHex, "hex");
    const expected = Buffer.from(hashHex, "hex");
    const derived = await scrypt(plain, salt, expected.length);
    if (derived.length !== expected.length) {
        return false;
    }
    return timingSafeEqual(derived, expected);
}
