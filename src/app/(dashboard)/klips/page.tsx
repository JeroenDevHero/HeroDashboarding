import Link from "next/link";
import { getKlips } from "@/lib/actions/klip";
import KlipCard from "@/components/klip/KlipCard";
import EmptyState from "@/components/ui/EmptyState";
import Button from "@/components/ui/Button";
import Card from "@/components/ui/Card";

export default async function KlipsPage() {
  const klips = await getKlips();

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-xl font-semibold text-hero-grey-black">Klips</h1>
        <Link href="/ai">
          <Button icon="smart_toy">Nieuwe klip via AI</Button>
        </Link>
      </div>

      {klips.length === 0 ? (
        <Card>
          <EmptyState
            icon="bar_chart"
            title="Nog geen klips"
            description="Gebruik de AI Assistent om je eerste klip te maken."
            action={
              <Link href="/ai">
                <Button variant="secondary" icon="smart_toy">
                  Naar AI Assistent
                </Button>
              </Link>
            }
          />
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {klips.map((klip) => (
            <Link key={klip.id} href={`/klips/${klip.id}`} className="block">
              <KlipCard klip={klip} />
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
