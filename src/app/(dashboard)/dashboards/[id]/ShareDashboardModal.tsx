'use client';

import { useState, useTransition } from 'react';
import Modal from '@/components/ui/Modal';
import Button from '@/components/ui/Button';
import { regenerateShareToken } from '@/lib/actions/display';

interface ShareDashboardModalProps {
  open: boolean;
  onClose: () => void;
  dashboardId: string;
  initialToken: string;
}

export default function ShareDashboardModal({
  open,
  onClose,
  dashboardId,
  initialToken,
}: ShareDashboardModalProps) {
  const [token, setToken] = useState(initialToken);
  const [copied, setCopied] = useState(false);
  const [pending, startTransition] = useTransition();
  const [confirmingRegenerate, setConfirmingRegenerate] = useState(false);

  const displayUrl =
    typeof window !== 'undefined'
      ? `${window.location.origin}/display/${token}`
      : `/display/${token}`;

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(displayUrl);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      // clipboard may be blocked — fall back silently
    }
  }

  function handleRegenerate() {
    startTransition(async () => {
      const fresh = await regenerateShareToken(dashboardId);
      setToken(fresh);
      setConfirmingRegenerate(false);
    });
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Delen op scherm"
      size="md"
    >
      <div className="flex flex-col gap-4">
        <p className="text-sm text-hero-grey-regular">
          Met deze link kan dit dashboard op een scherm getoond worden.
          Op een toegestaan IP-adres opent het dashboard direct, anders moet
          er eerst met Microsoft worden ingelogd.
        </p>

        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-medium text-hero-grey-black">
            Scherm-URL
          </label>
          <div className="flex gap-2">
            <input
              readOnly
              value={displayUrl}
              className="h-9 flex-1 rounded-[var(--radius-input)] border border-hero-grey-light bg-hero-blue-hairline px-3 text-xs font-mono text-hero-grey-black focus:outline-none focus:ring-2 focus:ring-hero-blue-medium/30"
              onFocus={(e) => e.currentTarget.select()}
            />
            <Button
              variant="secondary"
              size="sm"
              icon={copied ? 'check' : 'content_copy'}
              onClick={handleCopy}
            >
              {copied ? 'Gekopieerd' : 'Kopieer'}
            </Button>
          </div>
        </div>

        <div className="rounded-[var(--radius-input)] border border-hero-grey-light bg-hero-blue-hairline/40 p-3">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-xs font-medium text-hero-grey-black">
                Link opnieuw genereren
              </p>
              <p className="mt-0.5 text-[11px] text-hero-grey-regular">
                De huidige link vervalt direct en moet opnieuw worden uitgedeeld.
              </p>
            </div>
            {confirmingRegenerate ? (
              <div className="flex shrink-0 gap-1.5">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setConfirmingRegenerate(false)}
                  disabled={pending}
                >
                  Annuleren
                </Button>
                <Button
                  variant="danger"
                  size="sm"
                  icon="refresh"
                  loading={pending}
                  onClick={handleRegenerate}
                >
                  Bevestig
                </Button>
              </div>
            ) : (
              <Button
                variant="secondary"
                size="sm"
                icon="refresh"
                onClick={() => setConfirmingRegenerate(true)}
              >
                Vernieuw
              </Button>
            )}
          </div>
        </div>

        <div className="flex justify-end">
          <Button variant="ghost" size="sm" onClick={onClose}>
            Sluiten
          </Button>
        </div>
      </div>
    </Modal>
  );
}
