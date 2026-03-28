import { redirect } from "next/navigation";

import { AppShell } from "@/components/shell/app-shell";
import { getCurrentUserContext } from "@/lib/auth/session";

export default async function AppLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  const context = await getCurrentUserContext();

  if (!context) {
    redirect("/login");
  }

  return <AppShell context={context}>{children}</AppShell>;
}

