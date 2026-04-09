export default function AIPage() {
  return (
    <div className="flex h-full flex-col">
      <div className="mb-6">
        <h1 className="text-xl font-semibold text-hero-grey-black">
          AI Assistent
        </h1>
        <p className="mt-1 text-sm text-hero-grey-regular">
          Beschrijf wat je wilt zien en ik maak de visualisatie voor je.
        </p>
      </div>
      <div className="flex flex-1 gap-6">
        {/* Chat Panel */}
        <div className="flex w-1/2 flex-col rounded-[var(--radius-card)] bg-white shadow-[0_1px_3px_rgba(7,56,137,0.08)]">
          <div className="flex-1 p-4">
            <div className="flex h-full items-center justify-center text-sm text-hero-grey-regular">
              Start een gesprek om een klip te maken.
            </div>
          </div>
          <div className="border-t border-hero-grey-light p-4">
            <div className="flex gap-2">
              <input
                type="text"
                placeholder="Beschrijf je klip..."
                className="flex-1 rounded-[var(--radius-input)] border border-hero-grey-light px-3 py-2 text-sm outline-none transition-colors focus:border-hero-blue-bold"
                disabled
              />
              <button
                disabled
                className="rounded-[var(--radius-button)] bg-hero-orange px-4 py-2 text-sm font-medium text-white opacity-50"
              >
                <span className="material-symbols-rounded text-[18px]">
                  send
                </span>
              </button>
            </div>
          </div>
        </div>
        {/* Preview Panel */}
        <div className="flex w-1/2 items-center justify-center rounded-[var(--radius-card)] bg-white shadow-[0_1px_3px_rgba(7,56,137,0.08)]">
          <div className="text-center">
            <span className="material-symbols-rounded text-[48px] text-hero-grey-light">
              preview
            </span>
            <p className="mt-3 text-sm text-hero-grey-regular">
              Klip preview verschijnt hier.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
