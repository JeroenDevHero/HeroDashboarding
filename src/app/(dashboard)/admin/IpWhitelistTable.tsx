"use client";

import { useState, useTransition } from "react";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import {
  addIpWhitelistEntry,
  deleteIpWhitelistEntry,
  type DisplayIpWhitelistEntry,
} from "@/lib/actions/display";

interface IpWhitelistTableProps {
  entries: DisplayIpWhitelistEntry[];
  currentIp?: string | null;
}

export default function IpWhitelistTable({
  entries,
  currentIp,
}: IpWhitelistTableProps) {
  const [label, setLabel] = useState("");
  const [range, setRange] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [deletingId, setDeletingId] = useState<string | null>(null);

  function handleAdd(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const form = new FormData();
    form.set("label", label);
    form.set("ip_range", range);

    startTransition(async () => {
      try {
        await addIpWhitelistEntry(form);
        setLabel("");
        setRange("");
      } catch (err) {
        setError(err instanceof Error ? err.message : "Fout bij toevoegen");
      }
    });
  }

  function handleUseCurrent() {
    if (currentIp) setRange(currentIp);
  }

  function handleDelete(id: string) {
    setDeletingId(id);
    startTransition(async () => {
      try {
        await deleteIpWhitelistEntry(id);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Fout bij verwijderen");
      } finally {
        setDeletingId(null);
      }
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <p className="text-xs text-hero-grey-regular">
        Schermen op deze IP-adressen (of CIDR-ranges) kunnen dashboards
        direct tonen zonder Microsoft-login. Bezoekers buiten deze lijst
        moeten eerst inloggen.
      </p>

      <form onSubmit={handleAdd} className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
        <Input
          label="Locatie / label"
          placeholder="Kantoor Alkmaar – lobby"
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          required
        />
        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-medium text-hero-grey-black">
            IP-adres of CIDR
          </label>
          <div className="flex gap-2">
            <input
              value={range}
              onChange={(e) => setRange(e.target.value)}
              placeholder="10.0.0.0/24 of 1.2.3.4"
              required
              className="h-9 flex-1 rounded-[var(--radius-input)] border border-hero-grey-light bg-white px-3 text-sm text-hero-grey-black placeholder:text-hero-grey-regular focus:border-hero-blue-medium focus:outline-none focus:ring-2 focus:ring-hero-blue-medium/30"
            />
            {currentIp && (
              <button
                type="button"
                onClick={handleUseCurrent}
                className="shrink-0 rounded-[var(--radius-button)] border border-hero-grey-light bg-white px-2 text-[11px] text-hero-grey-regular hover:bg-hero-blue-hairline"
                title={`Gebruik huidig IP (${currentIp})`}
              >
                Mijn IP
              </button>
            )}
          </div>
        </div>
        <Button
          type="submit"
          variant="primary"
          size="sm"
          icon="add"
          loading={pending && !deletingId}
        >
          Toevoegen
        </Button>
      </form>

      {error && (
        <div className="rounded-[var(--radius-input)] border border-red-200 bg-red-50 p-2 text-xs text-red-700">
          {error}
        </div>
      )}

      {entries.length === 0 ? (
        <div className="rounded-[var(--radius-input)] border border-dashed border-hero-grey-light p-4 text-center text-xs text-hero-grey-regular">
          Nog geen IP-adressen op de whitelist.
        </div>
      ) : (
        <div className="overflow-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-hero-grey-light">
                <th className="py-2 pr-4 text-left text-xs font-medium text-hero-grey-regular">
                  Locatie
                </th>
                <th className="py-2 pr-4 text-left text-xs font-medium text-hero-grey-regular">
                  IP-adres / CIDR
                </th>
                <th className="py-2 pr-4 text-left text-xs font-medium text-hero-grey-regular">
                  Toegevoegd
                </th>
                <th className="py-2 text-right text-xs font-medium text-hero-grey-regular">
                  Acties
                </th>
              </tr>
            </thead>
            <tbody>
              {entries.map((entry) => (
                <tr
                  key={entry.id}
                  className="border-b border-hero-grey-light/50 last:border-0"
                >
                  <td className="py-3 pr-4 font-medium text-hero-grey-black">
                    {entry.label}
                  </td>
                  <td className="py-3 pr-4 font-mono text-xs text-hero-grey-regular">
                    {entry.ip_range}
                  </td>
                  <td className="py-3 pr-4 text-xs text-hero-grey-regular">
                    {new Date(entry.created_at).toLocaleDateString("nl-NL")}
                  </td>
                  <td className="py-3 text-right">
                    <Button
                      variant="ghost"
                      size="sm"
                      icon="delete"
                      loading={deletingId === entry.id}
                      onClick={() => handleDelete(entry.id)}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
