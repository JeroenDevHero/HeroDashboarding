import Link from 'next/link';
import { createDashboard } from '@/lib/actions/dashboard';
import Card from '@/components/ui/Card';

export default function NewDashboardPage() {
  return (
    <div className="flex justify-center">
      <div className="w-full max-w-lg">
        <div className="mb-6">
          <h1 className="text-xl font-semibold text-hero-grey-black">
            Nieuw dashboard
          </h1>
          <p className="mt-1 text-sm text-hero-grey-regular">
            Maak een nieuw dashboard aan om je klips te organiseren.
          </p>
        </div>

        <Card>
          <form action={createDashboard} className="flex flex-col gap-5">
            {/* Title */}
            <div className="flex flex-col gap-1.5">
              <label
                htmlFor="title"
                className="text-xs font-medium text-hero-grey-black"
              >
                Titel <span className="text-red-500">*</span>
              </label>
              <input
                id="title"
                name="title"
                type="text"
                required
                placeholder="Bijv. Verkoop overzicht"
                className="h-9 px-3 text-sm text-hero-grey-black bg-white border border-hero-grey-light rounded-[var(--radius-input)] placeholder:text-hero-grey-regular focus:outline-none focus:ring-2 focus:ring-hero-blue-medium/30 focus:border-hero-blue-medium transition-colors"
              />
            </div>

            {/* Description */}
            <div className="flex flex-col gap-1.5">
              <label
                htmlFor="description"
                className="text-xs font-medium text-hero-grey-black"
              >
                Beschrijving
              </label>
              <textarea
                id="description"
                name="description"
                rows={3}
                placeholder="Optionele beschrijving van dit dashboard"
                className="px-3 py-2 text-sm text-hero-grey-black bg-white border border-hero-grey-light rounded-[var(--radius-input)] placeholder:text-hero-grey-regular focus:outline-none focus:ring-2 focus:ring-hero-blue-medium/30 focus:border-hero-blue-medium transition-colors resize-none"
              />
            </div>

            {/* Public toggle */}
            <div className="flex items-center gap-3">
              <input
                id="is_public"
                name="is_public"
                type="checkbox"
                value="true"
                className="h-4 w-4 rounded border-hero-grey-light text-hero-orange focus:ring-hero-orange/30 cursor-pointer"
              />
              <label
                htmlFor="is_public"
                className="text-xs font-medium text-hero-grey-black cursor-pointer"
              >
                Publiek zichtbaar
              </label>
            </div>

            {/* Actions */}
            <div className="flex items-center justify-end gap-3 pt-2">
              <Link
                href="/dashboards"
                className="inline-flex items-center justify-center h-9 px-4 text-sm font-medium text-hero-grey-regular hover:bg-hero-blue-hairline rounded-[var(--radius-button)] transition-colors"
              >
                Annuleren
              </Link>
              <button
                type="submit"
                className="inline-flex items-center justify-center gap-1.5 h-9 px-4 text-sm font-medium text-white bg-hero-orange rounded-[var(--radius-button)] hover:bg-hero-orange/90 active:bg-hero-orange/80 transition-colors cursor-pointer"
              >
                <span className="material-symbols-rounded text-[18px]">add</span>
                Aanmaken
              </button>
            </div>
          </form>
        </Card>
      </div>
    </div>
  );
}
