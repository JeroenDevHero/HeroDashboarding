"use client";

import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";

export default function Header() {
  const supabase = createClient();
  const router = useRouter();

  async function handleSignOut() {
    await supabase.auth.signOut();
    router.push("/login");
  }

  return (
    <header className="flex h-14 items-center justify-between border-b border-hero-grey-light bg-white px-6">
      <div className="flex items-center gap-2">
        <h2 className="text-sm font-medium text-hero-grey-regular">
          Hero Dashboards
        </h2>
      </div>
      <div className="flex items-center gap-3">
        <button
          onClick={handleSignOut}
          className="flex items-center gap-1 rounded-[var(--radius-button)] px-3 py-1.5 text-sm text-hero-grey-regular transition-colors hover:bg-hero-blue-hairline hover:text-hero-grey-black"
        >
          <span className="material-symbols-rounded text-[18px]">logout</span>
          Uitloggen
        </button>
      </div>
    </header>
  );
}
