import Spinner from '@/components/ui/Spinner';

export default function DashboardsLoading() {
  return (
    <div className="flex items-center justify-center py-24">
      <div className="flex flex-col items-center gap-3">
        <Spinner size="lg" />
        <p className="text-sm text-hero-grey-regular">Laden...</p>
      </div>
    </div>
  );
}
