export default function DataSourcesPage() {
  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-xl font-semibold text-hero-grey-black">
          Databronnen
        </h1>
        <a
          href="/datasources/new"
          className="flex items-center gap-1 rounded-[var(--radius-button)] bg-hero-orange px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-hero-orange/90"
        >
          <span className="material-symbols-rounded text-[18px]">add</span>
          Databron toevoegen
        </a>
      </div>
      <div className="rounded-[var(--radius-card)] bg-white p-12 text-center shadow-[0_1px_3px_rgba(7,56,137,0.08)]">
        <span className="material-symbols-rounded text-[48px] text-hero-grey-light">
          database
        </span>
        <p className="mt-3 text-sm text-hero-grey-regular">
          Nog geen databronnen gekoppeld. Voeg je eerste databron toe.
        </p>
      </div>
    </div>
  );
}
