'use client';

import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import Modal from '@/components/ui/Modal';
import Button from '@/components/ui/Button';
import { updateDashboard } from '@/lib/actions/dashboard';

interface Dashboard {
  id: string;
  name: string;
  description?: string;
}

interface EditDashboardModalProps {
  open: boolean;
  onClose: () => void;
  dashboard: Dashboard;
}

export default function EditDashboardModal({
  open,
  onClose,
  dashboard,
}: EditDashboardModalProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const handleSubmit = (formData: FormData) => {
    startTransition(async () => {
      await updateDashboard(dashboard.id, formData);
      onClose();
      router.refresh();
    });
  };

  return (
    <Modal open={open} onClose={onClose} title="Dashboard bewerken" size="md">
      <form action={handleSubmit} className="flex flex-col gap-5">
        {/* Name */}
        <div className="flex flex-col gap-1.5">
          <label
            htmlFor="edit-name"
            className="text-xs font-medium text-hero-grey-black"
          >
            Naam <span className="text-red-500">*</span>
          </label>
          <input
            id="edit-name"
            name="name"
            type="text"
            required
            defaultValue={dashboard.name}
            className="h-9 px-3 text-sm text-hero-grey-black bg-white border border-hero-grey-light rounded-[var(--radius-input)] placeholder:text-hero-grey-regular focus:outline-none focus:ring-2 focus:ring-hero-blue-medium/30 focus:border-hero-blue-medium transition-colors"
          />
        </div>

        {/* Description */}
        <div className="flex flex-col gap-1.5">
          <label
            htmlFor="edit-description"
            className="text-xs font-medium text-hero-grey-black"
          >
            Beschrijving
          </label>
          <textarea
            id="edit-description"
            name="description"
            rows={3}
            defaultValue={dashboard.description ?? ''}
            placeholder="Optionele beschrijving"
            className="px-3 py-2 text-sm text-hero-grey-black bg-white border border-hero-grey-light rounded-[var(--radius-input)] placeholder:text-hero-grey-regular focus:outline-none focus:ring-2 focus:ring-hero-blue-medium/30 focus:border-hero-blue-medium transition-colors resize-none"
          />
        </div>

        {/* Actions */}
        <div className="flex items-center justify-end gap-3 pt-2">
          <Button variant="ghost" size="sm" type="button" onClick={onClose}>
            Annuleren
          </Button>
          <Button
            variant="primary"
            size="sm"
            icon="save"
            type="submit"
            loading={isPending}
          >
            Opslaan
          </Button>
        </div>
      </form>
    </Modal>
  );
}
