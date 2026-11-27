import type { ExecArgs } from "@medusajs/framework/types";
import { describeRuntimeProviders } from "../utils/runtime-providers";

/**
 * Print the effective session, event bus, workflow engine and locking
 * providers as one JSON line. The line holds names only, never credentials.
 *
 *   pnpm medusa exec ./src/scripts/inspect-runtime-providers.ts
 */
export default async function inspectRuntimeProviders({ container }: ExecArgs) {
  console.log(`RUNTIME_PROVIDERS ${JSON.stringify(describeRuntimeProviders(container))}`);
}
