"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import Card from "@/components/ui/Card";
import { createDataSource } from "@/lib/actions/datasource";

const datasourceTypes = [
  {
    value: "supabase-bc",
    label: "Business Central (Supabase)",
    icon: "hub",
    description: "Business Central-data gesynchroniseerd naar Supabase",
  },
  {
    value: "postgresql",
    label: "PostgreSQL",
    icon: "storage",
    description: "Verbind met een PostgreSQL database",
  },
  {
    value: "databricks",
    label: "Databricks",
    icon: "storage",
    description: "Verbind met een Databricks SQL warehouse",
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
      const name = formData.get("name") as string;
      const description = formData.get("description") as string | null;
      const connection_config = parseConfigFromForm(selectedType, formData);
      await createDataSource({
        name,
        type_id: selectedType,
        description: description || undefined,
        connection_config,
      });
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

            {selectedType === "supabase-bc" && <SupabaseBcFields />}
            {selectedType === "postgresql" && <PostgresqlFields />}
            {selectedType === "rest_api" && <RestApiFields />}
            {selectedType === "google_sheets" && <GoogleSheetsFields />}
            {selectedType === "csv" && <CsvFields />}
            {selectedType === "databricks" && <DatabricksFields />}

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

function SupabaseBcFields() {
  return (
    <>
      <div className="rounded-md bg-hero-blue-hairline/50 p-3 text-xs text-hero-grey-regular">
        <p className="mb-1 font-medium text-hero-grey-black">
          Tip: gebruik een dedicated read-only gebruiker
        </p>
        <p>
          Maak in de BC-Supabase een aparte Postgres-rol aan met alleen{" "}
          <code>SELECT</code>-rechten op de schema&apos;s die je wilt
          analyseren. Zo kan de dashboarding-tool nooit per ongeluk data
          overschrijven.
        </p>
      </div>
      <Input
        label="Connection string (aanbevolen)"
        name="connection_string"
        type="password"
        placeholder="postgres://readonly:password@db.xxx.supabase.co:5432/postgres"
        autoComplete="off"
      />
      <p className="-mt-2 text-xs text-hero-grey-regular">
        Gebruik bij voorkeur de Supabase{" "}
        <span className="font-medium">connection pooler</span> URL (poort 6543)
        voor betere prestaties.
      </p>
      <Input
        label="Schema (optioneel)"
        name="schema"
        placeholder="public"
        defaultValue="public"
      />
      <details className="rounded-md border border-hero-grey-light p-3">
        <summary className="cursor-pointer text-xs font-medium text-hero-grey-black">
          Of configureer handmatig (host, poort, ...)
        </summary>
        <div className="mt-3 space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Input label="Host" name="host" placeholder="db.xxx.supabase.co" />
            <Input
              label="Poort"
              name="port"
              type="number"
              placeholder="5432"
              defaultValue="5432"
            />
          </div>
          <Input label="Database" name="database" placeholder="postgres" />
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Input label="Gebruikersnaam" name="username" placeholder="postgres" />
            <Input
              label="Wachtwoord"
              name="password"
              type="password"
              autoComplete="off"
            />
          </div>
        </div>
      </details>
      <label className="flex items-center gap-2 text-sm text-hero-grey-black">
        <input
          type="checkbox"
          name="ssl"
          value="true"
          defaultChecked
          className="h-4 w-4 rounded border-hero-grey-light"
        />
        SSL gebruiken (aangeraden)
      </label>
    </>
  );
}

function PostgresqlFields() {
  return (
    <>
      <Input
        label="Connection string (optioneel)"
        name="connection_string"
        type="password"
        placeholder="postgres://user:password@host:5432/database"
        autoComplete="off"
      />
      <p className="-mt-2 text-xs text-hero-grey-regular">
        Laat leeg om met host/poort/wachtwoord te configureren.
      </p>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Input label="Host" name="host" placeholder="localhost" />
        <Input
          label="Poort"
          name="port"
          type="number"
          placeholder="5432"
          defaultValue="5432"
        />
      </div>
      <Input label="Database" name="database" placeholder="my_database" />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Input
          label="Gebruikersnaam"
          name="username"
          placeholder="postgres"
        />
        <Input
          label="Wachtwoord"
          name="password"
          type="password"
          autoComplete="off"
        />
      </div>
      <Input
        label="Schema (optioneel)"
        name="schema"
        placeholder="public"
        defaultValue="public"
      />
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

function DatabricksFields() {
  return (
    <>
      <Input
        label="Server Hostname"
        name="server_hostname"
        placeholder="adb-1234567890.1.azuredatabricks.net"
        required
      />
      <Input
        label="HTTP Pad"
        name="http_path"
        placeholder="/sql/1.0/warehouses/abc123"
        required
      />
      <Input
        label="Access Token"
        name="access_token"
        type="password"
        required
      />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Input
          label="Catalogus"
          name="catalog"
          placeholder="main"
        />
        <Input
          label="Schema"
          name="schema"
          placeholder="default"
        />
      </div>
    </>
  );
}

function parseJsonField(value: string | null): unknown {
  if (!value) return null;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function parseConfigFromForm(
  type: string,
  formData: FormData
): Record<string, unknown> {
  switch (type) {
    case "postgresql":
    case "supabase-bc":
    case "mysql": {
      const connectionString =
        (formData.get("connection_string") as string | null)?.trim() || "";
      const base: Record<string, unknown> = {
        ssl: formData.get("ssl") === "true",
        schema: (formData.get("schema") as string) || "public",
      };
      if (connectionString) {
        base.connection_string = connectionString;
      } else {
        base.host = (formData.get("host") as string) || "";
        base.port =
          Number(formData.get("port")) || (type === "mysql" ? 3306 : 5432);
        base.database = (formData.get("database") as string) || "";
        base.username = (formData.get("username") as string) || "";
        base.password = (formData.get("password") as string) || "";
      }
      return base;
    }
    case "rest_api":
      return {
        base_url: formData.get("base_url") as string,
        auth_type: formData.get("auth_type") as string,
        api_key: formData.get("api_key") as string | null,
        headers: parseJsonField(formData.get("headers") as string),
      };
    case "google_sheets":
      return {
        spreadsheet_id: formData.get("spreadsheet_id") as string,
        sheet_name: formData.get("sheet_name") as string | null,
        credentials: parseJsonField(formData.get("credentials") as string),
      };
    case "csv":
      return {
        url: formData.get("url") as string | null,
        delimiter: (formData.get("delimiter") as string) || ",",
      };
    case "databricks":
      return {
        server_hostname: formData.get("server_hostname") as string,
        http_path: formData.get("http_path") as string,
        access_token: formData.get("access_token") as string,
        catalog: (formData.get("catalog") as string) || "main",
        schema: (formData.get("schema") as string) || "default",
      };
    default:
      return {};
  }
}
