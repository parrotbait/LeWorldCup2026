import { redirect } from "next/navigation";
import { isAdmin } from "@/lib/auth";
import { AdminLoginForm } from "./_login-form";

export default async function AdminLoginPage() {
    if (await isAdmin()) {
        redirect("/admin/dashboard");
    }
    return (
        <main className="mx-auto max-w-md px-6 pt-20 pb-24">
            <h1 className="font-display text-2xl uppercase tracking-widest">Admin</h1>
            <p className="mt-2 text-sm opacity-70">Owner-only area for overrides and sync.</p>
            <div className="mt-8">
                <AdminLoginForm />
            </div>
        </main>
    );
}
