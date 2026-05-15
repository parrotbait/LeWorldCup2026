import { hashPassword } from "../lib/password";

const password = process.argv[2];
if (password === undefined || password.length === 0) {
    console.error("Usage: pnpm tsx scripts/hash-admin-password.ts <password>");
    process.exit(1);
}

hashPassword(password).then((hash) => {
    console.log(hash);
});
