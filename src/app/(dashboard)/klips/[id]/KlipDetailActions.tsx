"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import Button from "@/components/ui/Button";
import Modal from "@/components/ui/Modal";
import { deleteKlip, duplicateKlip } from "@/lib/actions/klip";

interface KlipDetailActionsProps {
  klipId: string;
}

export default function KlipDetailActions({ klipId }: KlipDetailActionsProps) {
  const router = useRouter();
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [duplicating, setDuplicating] = useState(false);

  async function handleDelete() {
    setDeleting(true);
    try {
      await deleteKlip(klipId);
      router.push("/klips");
    } catch {
      setDeleting(false);
    }
  }

  async function handleDuplicate() {
    setDuplicating(true);
    try {
      const duplicate = await duplicateKlip(klipId);
      router.push(`/klips/${duplicate.id}`);
    } catch {
      setDuplicating(false);
    }
  }

  return (
    <>
      <div className="flex items-center gap-2">
        <Button
          variant="secondary"
          icon="content_copy"
          onClick={handleDuplicate}
          loading={duplicating}
        >
          Dupliceren
        </Button>
        <Button variant="danger" icon="delete" onClick={() => setShowDeleteModal(true)}>
          Verwijderen
        </Button>
      </div>

      <Modal
        open={showDeleteModal}
        onClose={() => setShowDeleteModal(false)}
        title="Klip verwijderen"
        size="sm"
      >
        <p className="mb-4 text-sm text-hero-grey-regular">
          Weet je zeker dat je deze klip wilt verwijderen? Dit kan niet ongedaan
          worden gemaakt.
        </p>
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={() => setShowDeleteModal(false)}>
            Annuleren
          </Button>
          <Button
            variant="danger"
            onClick={handleDelete}
            loading={deleting}
          >
            Verwijderen
          </Button>
        </div>
      </Modal>
    </>
  );
}
