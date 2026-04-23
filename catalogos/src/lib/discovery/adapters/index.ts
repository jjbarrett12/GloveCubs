/**
 * Discovery adapters registry. Add search adapter when a real source is implemented.
 */

import type { DiscoveryAdapter, DiscoveryAdapterRegistry } from "./types";
import { manualAdapter } from "./manual-adapter";
import { csvAdapter } from "./csv-adapter";

export type { DiscoveryAdapter, DiscoveryAdapterContext, DiscoveryAdapterRegistry } from "./types";
export { manualAdapter } from "./manual-adapter";
export { csvAdapter } from "./csv-adapter";

const registry: DiscoveryAdapterRegistry = new Map<string, DiscoveryAdapter>([
  [manualAdapter.name, manualAdapter],
  [csvAdapter.name, csvAdapter],
]);

export function getAdapter(name: string): DiscoveryAdapter | undefined {
  return registry.get(name);
}

export function listAdapters(): { name: string }[] {
  return Array.from(registry.values()).map((a) => ({ name: a.name }));
}
