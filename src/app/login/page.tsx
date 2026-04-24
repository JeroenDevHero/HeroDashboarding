"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

function LoginInner() {
  const params = useSearchParams();
  const next = params.get("next") ?? "/dashboards";

  async function handleLogin() {
    const supabase = createClient();
    const callback = new URL(
      "/api/auth/callback",
      window.location.origin
    );
    // Pass the post-login destination through the OAuth state via URL param.
    callback.searchParams.set("next", next);

    await supabase.auth.signInWithOAuth({
      provider: "azure",
      options: {
        scopes: "email profile",
        redirectTo: callback.toString(),
      },
    });
  }

  return (
    <div className="flex h-full items-center justify-center bg-hero-blue">
      <div className="w-full max-w-sm rounded-[var(--radius-card)] bg-white p-8 shadow-[0_1px_3px_rgba(7,56,137,0.08)]">
        <div className="mb-8 text-center">
          <h1 className="text-2xl font-semibold text-hero-blue">
            Hero Dashboards
          </h1>
          <p className="mt-2 text-sm text-hero-grey-regular">
            Log in met je Hero account
          </p>
        </div>
        <button
          onClick={handleLogin}
          className="flex w-full items-center justify-center gap-2 rounded-[var(--radius-button)] bg-hero-orange px-4 py-3 text-sm font-medium text-white transition-colors hover:bg-hero-orange/90"
        >
          <span className="material-symbols-rounded text-[20px]">login</span>
          Inloggen met Microsoft
        </button>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginInner />
    </Suspense>
  );
}
