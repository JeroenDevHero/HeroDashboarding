import { redirect } from "next/navigation";
import { getCurrentProfile, getAllProfiles } from "@/lib/actions/profile";
import { createClient } from "@/lib/supabase/server";
import Card from "@/components/ui/Card";
import AdminUserTable from "./AdminUserTable";

export default async function AdminPage() {
  const profile = await getCurrentProfile();

  if (profile.role !== "admin") {
    redirect("/dashboards");
  }

  const profiles = await getAllProfiles();

  // Fetch stats
  const supabase = await createClient();
  const [dashboardsRes, klipsRes, datasourcesRes] = await Promise.all([
    supabase.from("dashboards").select("id", { count: "exact", head: true }),
    supabase.from("klips").select("id", { count: "exact", head: true }),
    supabase.from("data_sources").select("id", { count: "exact", head: true }),
  ]);

  const stats = [
    {
      label: "Dashboards",
      value: dashboardsRes.count ?? 0,
      icon: "grid_view",
    },
    {
      label: "Klips",
      value: klipsRes.count ?? 0,
      icon: "bar_chart",
    },
    {
      label: "Databronnen",
      value: datasourcesRes.count ?? 0,
      icon: "database",
    },
    {
      label: "Gebruikers",
      value: profiles.length,
      icon: "group",
    },
  ];

  return (
    <div>
      <h1 className="mb-6 text-xl font-semibold text-hero-grey-black">
        Beheer
      </h1>

      {/* Stats cards */}
      <div className="mb-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {stats.map((stat) => (
          <Card key={stat.label}>
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-hero-blue-hairline">
                <span className="material-symbols-rounded text-[20px] text-hero-blue-medium">
                  {stat.icon}
                </span>
              </div>
              <div>
                <p className="text-2xl font-bold text-hero-grey-black">
                  {stat.value}
                </p>
                <p className="text-xs text-hero-grey-regular">{stat.label}</p>
              </div>
            </div>
          </Card>
        ))}
      </div>

      {/* User management */}
      <Card title="Gebruikersbeheer" subtitle="Beheer rollen en rechten van gebruikers">
        <AdminUserTable profiles={profiles} currentUserId={profile.id} />
      </Card>
    </div>
  );
}
