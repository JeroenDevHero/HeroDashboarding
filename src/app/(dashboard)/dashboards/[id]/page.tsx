import { getDashboard } from '@/lib/actions/dashboard';
import { getKlips } from '@/lib/actions/klip';
import DashboardEditor from './DashboardEditor';

export default async function DashboardDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [dashboard, allKlips] = await Promise.all([
    getDashboard(id),
    getKlips(),
  ]);

  return <DashboardEditor dashboard={dashboard} allKlips={allKlips} />;
}
