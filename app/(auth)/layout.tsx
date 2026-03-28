import { redirect } from "next/navigation";

import { AuthPanel } from "@/components/auth/auth-panel";
import { getServerSessionUser } from "@/lib/auth/session";

export default async function AuthLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  const user = await getServerSessionUser();

  if (user) {
    redirect("/dashboard");
  }

  return (
    <main className="flex min-h-screen items-center justify-center px-4 py-10">
      <div className="grid w-full max-w-5xl gap-6 lg:grid-cols-[1.2fr_0.8fr]">
        <AuthPanel />
        <section className="rounded-[28px] border bg-card/95 p-6 shadow-panel sm:p-8">
          {children}
        </section>
      </div>
    </main>
  );
}

