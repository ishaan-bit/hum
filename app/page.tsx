import AppShell from "@/components/app/AppShell";
import { redirect } from "next/navigation";

const isOpsMode = process.env.NEXT_PUBLIC_APP_MODE?.trim() === "ops" || process.env.APP_MODE?.trim() === "ops";

export default function Home() {
  if (isOpsMode) redirect("/ops");

  return <AppShell />;
}
