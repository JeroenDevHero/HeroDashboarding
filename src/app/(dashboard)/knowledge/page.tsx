import Link from "next/link";
import { getKnowledgeEntries } from "@/lib/actions/knowledge";
import Button from "@/components/ui/Button";
import Card from "@/components/ui/Card";
import EmptyState from "@/components/ui/EmptyState";
import KnowledgeList from "./KnowledgeList";

export default async function KnowledgePage() {
  const entries = await getKnowledgeEntries();

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-xl font-semibold text-hero-grey-black">
          Kennisbank
        </h1>
        <Link href="/knowledge/new">
          <Button icon="add">Kennis toevoegen</Button>
        </Link>
      </div>

      {entries.length === 0 ? (
        <Card>
          <EmptyState
            icon="library_books"
            title="Nog geen kennis opgeslagen"
            description="Voeg bedrijfskennis toe zodat de AI assistent betere en nauwkeurigere analyses kan maken."
            action={
              <Link href="/knowledge/new">
                <Button variant="secondary" icon="add">
                  Kennis toevoegen
                </Button>
              </Link>
            }
          />
        </Card>
      ) : (
        <KnowledgeList entries={entries} />
      )}
    </div>
  );
}
