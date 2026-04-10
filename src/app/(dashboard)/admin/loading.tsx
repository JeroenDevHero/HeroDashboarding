import Spinner from "@/components/ui/Spinner";

export default function AdminLoading() {
  return (
    <div className="flex items-center justify-center py-24">
      <Spinner size="lg" />
    </div>
  );
}
