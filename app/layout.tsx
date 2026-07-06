import { requireUser } from "@/lib/supabaseServer";
import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  title: "Catalyst CRM",
  description: "First-version school outreach dashboard"
};

export default async function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  const user = await requireUser();

  return (
    <html lang="en">
      <body>
        <header className="border-b border-slate-200 bg-white px-6 py-3">
          <div className="mx-auto flex max-w-7xl items-center justify-between">
            <Link className="font-semibold text-slate-950" href="/" prefetch={false}>
              Catalyst CRM
            </Link>
            {user ? (
              <a
                className="text-sm text-slate-600 hover:text-slate-950"
                href="/logout"
              >
                Sign out
              </a>
            ) : (
              <Link
                className="text-sm text-slate-600 hover:text-slate-950"
                href="/login"
                prefetch={false}
              >
                Sign in
              </Link>
            )}
          </div>
        </header>
        {children}
      </body>
    </html>
  );
}
