import Link from 'next/link';
import { getDashboards } from '@/lib/actions/dashboard';
import Card from '@/components/ui/Card';
import Badge from '@/components/ui/Badge';
import EmptyState from '@/components/ui/EmptyState';

export default async function DashboardsPage() {
  const dashboards = await getDashboards();

  return (
    <div>
      {/* Header */}
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-xl font-semibold text-hero-grey-black">
          Dashboards
        </h1>
        <Link
          href="/dashboards/new"
          className="inline-flex items-center gap-1.5 rounded-[var(--radius-button)] bg-hero-orange px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-hero-orange/90"
        >
          <span className="material-symbols-rounded text-[18px]">add</span>
          Nieuw dashboard
        </Link>
      </div>

      {/* Dashboard grid or empty state */}
      {dashboards.length === 0 ? (
        <Card>
          <EmptyState
            icon="grid_view"
            title="Geen dashboards"
            description="Je hebt nog geen dashboards aangemaakt. Maak je eerste dashboard aan om te beginnen."
            action={
              <Link
                href="/dashboards/new"
                className="inline-flex items-center gap-1.5 rounded-[var(--radius-button)] bg-hero-orange px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-hero-orange/90"
              >
                <span className="material-symbols-rounded text-[18px]">add</span>
                Nieuw dashboard
              </Link>
            }
          />
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          {dashboards.map((dashboard) => {
            const updatedAt = new Date(dashboard.updated_at);
            const formattedDate = updatedAt.toLocaleDateString('nl-NL', {
              day: 'numeric',
              month: 'short',
              year: 'numeric',
            });

            return (
              <Link key={dashboard.id} href={`/dashboards/${dashboard.id}`}>
                <Card
                  className="h-full hover:shadow-md transition-shadow cursor-pointer"
                >
                  <div className="flex flex-col gap-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <h3 className="text-sm font-semibold text-hero-grey-black truncate">
                          {dashboard.title}
                        </h3>
                        {dashboard.description && (
                          <p className="mt-1 text-xs text-hero-grey-regular line-clamp-2">
                            {dashboard.description}
                          </p>
                        )}
                      </div>
                      {dashboard.is_public && (
                        <Badge variant="success">Publiek</Badge>
                      )}
                    </div>

                    <div className="flex items-center justify-between text-[11px] text-hero-grey-regular">
                      <span>Bijgewerkt {formattedDate}</span>
                      <span className="inline-flex items-center gap-1">
                        <span className="material-symbols-rounded text-[14px]">
                          widgets
                        </span>
                        {dashboard.klip_count ?? 0} klips
                      </span>
                    </div>
                  </div>
                </Card>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
