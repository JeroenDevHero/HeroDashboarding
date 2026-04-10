"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import Card from "@/components/ui/Card";
import { createDatasource } from "@/lib/actions/datasource";

const datasourceTypes = [
  {
    value: "postgresql",
    label: "PostgreSQL",
    icon: "storage",
    description: "Verbind met een PostgreSQL database",
  },
  {
    value: "rest_api",
    label: "REST API",
    icon: "api",
    description: "Haal data op via een REST API endpoint",
  },
  {
    value: "google_sheets",
    label: "Google Sheets",
    icon: "table_chart",
    description: "Importeer data vanuit Google Sheets",
  },
  {
    value: "csv",
    label: "CSV",
    icon: "description",
    description: "Upload of link naar een CSV bestand",
  },
];

export default function NewDatasourcePage() {
  const router = useRouter();
  const [selectedType, setSelectedType] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!selectedType) return;

    setSaving(true);
    setError(null);

    try {
      const formData = new FormData(e.currentTarget);
      formData.set("type", selectedType);
      await createDatasource(formData);
      router.push("/datasources");
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Er ging iets mis bij het opslaan."
      );
      setSaving(false);
    }
  }

  return (
    <div>
      {/* Back navigation */}
      <div className="mb-4">
        <Link
          href="/datasources"
          className="inline-flex items-center gap-1 text-sm text-hero-grey-regular hover:text-hero-grey-black transition-colors"
        >
          <span className="material-symbols-rounded text-[18px]">
            arrow_back
          </span>
          Terug naar databronnen
        </Link>
      </div>

      <h1 className="mb-6 text-xl font-semibold text-hero-grey-black">
        Databron toevoegen
      </h1>

      {/* Step 1: Choose type */}
      {!selectedType && (
        <div>
          <p className="mb-4 text-sm text-hero-grey-regular">
            Kies het type databron dat je wilt toevoegen.
          </p>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {datasourceTypes.map((type) => (
              <button
                key={type.value}
                onClick={() => setSelectedType(type.value)}
                className="flex flex-col items-center gap-2 rounded-[var(--radius-card)] border-2 border-transparent bg-white p-6 text-center shadow-[0_1px_3px_rgba(7,56,137,0.08)] transition-all hover:border-hero-blue-medium hover:shadow-md cursor-pointer"
              >
                <span className="material-symbols-rounded text-[32px] text-hero-blue">
                  {type.icon}
                </span>
                <span className="text-sm font-semibold text-hero-grey-black">
                  {type.label}
                </span>
                <span className="text-xs text-hero-grey-regular">
                  {type.description}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Step 2: Type-specific form */}
      {selectedType && (
        <Card>
          <div className="mb-4 flex items-center gap-2">
            <button
              onClick={() => {
                setSelectedType(null);
                setError(null);
              }}
              className="text-hero-grey-regular hover:text-hero-grey-black transition-colors cursor-pointer"
            >
              <span className="material-symbols-rounded text-[20px]">
                arrow_back
              </span>
            </button>
            <span className="text-sm font-semibold text-hero-grey-black">
              {datasourceTypes.find((t) => t.value === selectedType)?.label}
              {" "}configureren
            </span>
          </div>

          {error && (
            <div className="mb-4 rounded-md bg-red-50 p-3 text-sm text-red-600">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <Input
              label="Naam"
              name="name"
              placeholder="Bijv. Productie Database"
              required
            />

            <Input
              label="Beschrijving (optioneel)"
              name="description"
              placeholder="Korte beschrijving van deze databron"
            />

            {selectedType === "postgresql" && <PostgresqlFields />}
            {selectedType === "rest_api" && <RestApiFields />}
            {selectedType === "google_sheets" && <GoogleSheetsFields />}
            {selectedType === "csv" && <CsvFields />}

            <div className="flex justify-end gap-2 pt-2">
              <Button
                variant="ghost"
                type="button"
                onClick={() => router.push("/datasources")}
              >
                Annuleren
              </Button>
              <Button type="submit" icon="save" loading={saving}>
                Opslaan
              </Button>
            </div>
          </form>
        </Card>
      )}
    </div>
  );
}

function PostgresqlFields() {
  return (
    <>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Input
          label="Host"
          name="host"
          placeholder="localhost"
          required
        />
        <Input
          label="Poort"
          name="port"
          type="number"
          placeholder="5432"
          defaultValue="5432"
        />
      </div>
      <Input
        label="Database"
        name="database"
        placeholder="my_database"
        required
      />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Input
          label="Gebruikersnaam"
          name="username"
          placeholder="postgres"
          required
        />
        <Input
          label="Wachtwoord"
          name="password"
          type="password"
          placeholder="Wachtwoord"
          required
        />
      </div>
      <label className="flex items-center gap-2 text-sm text-hero-grey-black">
        <input
          type="checkbox"
          name="ssl"
          value="true"
          className="h-4 w-4 rounded border-hero-grey-light"
        />
        SSL gebruiken
      </label>
    </>
  );
}

function RestApiFields() {
  return (
    <>
      <Input
        label="Base URL"
        name="base_url"
        placeholder="https://api.example.com/v1"
        required
      />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Input
          label="Authenticatie type"
          name="auth_type"
          placeholder="bearer, api_key, none"
          defaultValue="none"
        />
        <Input
          label="API Key (optioneel)"
          name="api_key"
          placeholder="Je API key"
        />
      </div>
      <Input
        label="Extra headers (JSON, optioneel)"
        name="headers"
        placeholder='{"Authorization": "Bearer ..."}'
      />
    </>
  );
}

function GoogleSheetsFields() {
  return (
    <>
      <Input
        label="Spreadsheet ID"
        name="spreadsheet_id"
        placeholder="1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgVE2upms"
        required
      />
      <Input
        label="Tabblad naam (optioneel)"
        name="sheet_name"
        placeholder="Sheet1"
      />
      <Input
        label="Service Account credentials (JSON)"
        name="credentials"
        placeholder='{"type": "service_account", ...}'
      />
    </>
  );
}

function CsvFields() {
  return (
    <>
      <Input
        label="CSV URL (optioneel)"
        name="url"
        placeholder="https://example.com/data.csv"
      />
      <Input
        label="Scheidingsteken"
        name="delimiter"
        placeholder=","
        defaultValue=","
      />
    </>
  );
}
