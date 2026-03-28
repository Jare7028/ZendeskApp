import { redirect } from "next/navigation";

import { getServerSessionUser } from "@/lib/auth/session";

export default async function HomePage() {
  const user = await getServerSessionUser();

  if (user) {
    redirect("/dashboard");
  }

  redirect("/login");
}

