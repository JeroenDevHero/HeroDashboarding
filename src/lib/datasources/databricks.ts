import { DBSQLClient } from "@databricks/sql";

export interface DatabricksConfig {
  server_hostname: string;
  http_path: string;
  access_token: string;
  catalog?: string;
  schema?: string;
}

/**
 * Test a Databricks connection by running `SELECT 1`.
 */
export async function testDatabricksConnection(
  config: DatabricksConfig
): Promise<{ success: boolean; message: string }> {
  const client = new DBSQLClient();

  try {
    await client.connect({
      host: config.server_hostname,
      path: config.http_path,
      token: config.access_token,
    });

    const session = await client.openSession({
      initialCatalog: config.catalog || "main",
      initialSchema: config.schema || "default",
    });

    const operation = await session.executeStatement("SELECT 1 AS test");
    await operation.fetchAll();
    await operation.close();
    await session.close();
    await client.close();

    return { success: true, message: "Verbinding succesvol" };
  } catch (error) {
    // Attempt cleanup
    try {
      await client.close();
    } catch {
      // ignore cleanup errors
    }

    const msg =
      error instanceof Error ? error.message : "Onbekende verbindingsfout";
    return { success: false, message: `Verbinding mislukt: ${msg}` };
  }
}

/**
 * Execute a SQL query against Databricks and return the result rows.
 */
export async function executeDatabricksQuery(
  config: DatabricksConfig,
  query: string,
  limit?: number
): Promise<Record<string, unknown>[]> {
  const client = new DBSQLClient();

  try {
    await client.connect({
      host: config.server_hostname,
      path: config.http_path,
      token: config.access_token,
    });

    const session = await client.openSession({
      initialCatalog: config.catalog || "main",
      initialSchema: config.schema || "default",
    });

    const maxRows = limit ?? 10000;
    const operation = await session.executeStatement(query, { maxRows });
    const rows = (await operation.fetchAll()) as Record<string, unknown>[];

    await operation.close();
    await session.close();
    await client.close();

    return rows;
  } catch (error) {
    // Attempt cleanup
    try {
      await client.close();
    } catch {
      // ignore cleanup errors
    }

    const msg =
      error instanceof Error ? error.message : "Onbekende query fout";
    throw new Error(`Databricks query mislukt: ${msg}`);
  }
}
