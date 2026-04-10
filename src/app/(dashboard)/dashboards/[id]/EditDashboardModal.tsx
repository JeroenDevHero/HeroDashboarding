'use client';

import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import Modal from '@/components/ui/Modal';
import Button from '@/components/ui/Button';
import { updateDashboard } from '@/lib/actions/dashboard';

interface Dashboard {
  id: string;
  title: string;
  description?: string;
  is_public: boolean;
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
        {/* Title */}
        <div className="flex flex-col gap-1.5">
          <label
            htmlFor="edit-title"
            className="text-xs font-medium text-hero-grey-black"
          >
            Titel <span className="text-red-500">*</span>
          </label>
          <input
            id="edit-title"
            name="title"
            type="text"
            required
            defaultValue={dashboard.title}
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

        {/* Public toggle */}
        <div className="flex items-center gap-3">
          <input
            id="edit-is_public"
            name="is_public"
            type="checkbox"
            value="true"
            defaultChecked={dashboard.is_public}
            className="h-4 w-4 rounded border-hero-grey-light text-hero-orange focus:ring-hero-orange/30 cursor-pointer"
          />
          <label
            htmlFor="edit-is_public"
            className="text-xs font-medium text-hero-grey-black cursor-pointer"
          >
            Publiek zichtbaar
          </label>
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
