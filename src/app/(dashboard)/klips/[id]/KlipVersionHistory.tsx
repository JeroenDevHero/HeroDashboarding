"use client";

import { useState, useEffect } from "react";
import Button from "@/components/ui/Button";
import Modal from "@/components/ui/Modal";
import { getKlipVersions, restoreKlipVersion } from "@/lib/actions/klip";

interface KlipVersion {
  id: string;
  klip_id: string;
  version_number: number;
  version_data: {
    name?: string;
    type?: string;
    description?: string;
    config?: Record<string, unknown>;
  };
  created_at: string;
}

interface KlipVersionHistoryProps {
  klipId: string;
}

export default function KlipVersionHistory({ klipId }: KlipVersionHistoryProps) {
  const [versions, setVersions] = useState<KlipVersion[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [restoring, setRestoring] = useState<string | null>(null);

  useEffect(() => {
    loadVersions();
  }, [klipId]);

  async function loadVersions() {
    try {
      const data = await getKlipVersions(klipId);
      setVersions(data as KlipVersion[]);
    } catch (err) {
      console.error("Fout bij laden versies:", err);
    } finally {
      setLoading(false);
    }
  }

  async function handleRestore(versionId: string) {
    setRestoring(versionId);
    try {
      await restoreKlipVersion(klipId, versionId);
      setShowModal(false);
      // Page will revalidate via server action
      window.location.reload();
    } catch (err) {
      console.error("Fout bij herstellen versie:", err);
      setRestoring(null);
    }
  }

  if (loading) return null;
  if (versions.length === 0) return null;

  return (
    <>
      <Button
        variant="ghost"
        icon="history"
        onClick={() => setShowModal(true)}
        className="text-xs"
      >
        {versions.length} {versions.length === 1 ? "versie" : "versies"}
      </Button>

      <Modal
        open={showModal}
        onClose={() => setShowModal(false)}
        title="Versiegeschiedenis"
        size="lg"
      >
        <div className="max-h-[400px] overflow-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-hero-grey-light">
                <th className="py-2 px-3 text-left font-medium text-hero-grey-regular">Versie</th>
                <th className="py-2 px-3 text-left font-medium text-hero-grey-regular">Naam</th>
                <th className="py-2 px-3 text-left font-medium text-hero-grey-regular">Type</th>
                <th className="py-2 px-3 text-left font-medium text-hero-grey-regular">Datum</th>
                <th className="py-2 px-3 text-right font-medium text-hero-grey-regular">Actie</th>
              </tr>
            </thead>
            <tbody>
              {versions.map((v) => (
                <tr key={v.id} className="border-b border-hero-grey-light/50 last:border-0">
                  <td className="py-2 px-3 text-hero-grey-black font-mono">
                    v{v.version_number}
                  </td>
                  <td className="py-2 px-3 text-hero-grey-black">
                    {v.version_data.name || "-"}
                  </td>
                  <td className="py-2 px-3 text-hero-grey-regular">
                    {v.version_data.type || "-"}
                  </td>
                  <td className="py-2 px-3 text-hero-grey-regular">
                    {new Date(v.created_at).toLocaleString("nl-NL", {
                      day: "2-digit",
                      month: "2-digit",
                      year: "numeric",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </td>
                  <td className="py-2 px-3 text-right">
                    <Button
                      variant="ghost"
                      size="sm"
                      icon="restore"
                      onClick={() => handleRestore(v.id)}
                      loading={restoring === v.id}
                    >
                      Herstellen
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Modal>
    </>
  );
}
