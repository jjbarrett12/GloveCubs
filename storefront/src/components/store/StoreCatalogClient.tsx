"use client";

import * as React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  buildStoreCatalogHref,
  parseStoreCatalogParams,
  type StoreCatalogUrlState,
} from "@/lib/catalog/store-url";
import { getCanonicalStoreHrefIfNeeded } from "@/lib/catalog/store-legacy-url";
import { filterPublicCatalogClient } from "@/lib/catalog/filter-public-catalog-client";
import { StoreCatalogView, type StoreCatalogViewData } from "@/components/store/StoreCatalogView";

function searchParamsToRecord(sp: URLSearchParams): Record<string, string | string[] | undefined> {
  const out: Record<string, string | string[] | undefined> = {};
  for (const key of Array.from(new Set(Array.from(sp.keys())))) {
    const all = sp.getAll(key);
    out[key] = all.length <= 1 ? (all[0] ?? undefined) : all;
  }
  return out;
}

/** Module-level dedupe so React Strict Mode / remounts share one in-flight request. */
let publicCatalogInflight: Promise<StoreCatalogViewData> | null = null;

function loadPublicCatalogOnce(): Promise<StoreCatalogViewData> {
  if (!publicCatalogInflight) {
    publicCatalogInflight = fetch("/api/store/catalog", {
      headers: { Accept: "application/json" },
    })
      .then(async (res) => {
        if (!res.ok) throw new Error(`catalog_api_${res.status}`);
        const json = (await res.json()) as StoreCatalogViewData & { generatedAt?: string };
        return {
          products: json.products ?? [],
          total: json.total ?? 0,
          limit: json.limit ?? 24,
          brands: json.brands ?? [],
          facetCounts: json.facetCounts ?? {},
          facetMeta: json.facetMeta ?? {},
          catalogUnavailable: Boolean(json.catalogUnavailable),
        };
      })
      .catch((err) => {
        publicCatalogInflight = null;
        throw err;
      });
  }
  return publicCatalogInflight;
}

type Props = {
  initialData: StoreCatalogViewData;
  initialUrlState: StoreCatalogUrlState;
};

/**
 * URL filters stay on /store (SEO + shareable). Catalog data comes from ONE canonical
 * cached API (or the ISR-embedded initialData) and is filtered locally — no per-query
 * serverless catalog fan-out.
 */
export function StoreCatalogClient({ initialData, initialUrlState }: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const record = React.useMemo(() => searchParamsToRecord(searchParams), [searchParams]);
  const urlState = React.useMemo(() => parseStoreCatalogParams(record), [record]);
  const queryKey = searchParams.toString();
  const needsFilteredView = queryKey.length > 0;

  const [snapshot, setSnapshot] = React.useState<StoreCatalogViewData>(initialData);
  const [snapshotReady, setSnapshotReady] = React.useState(
    Boolean(initialData.catalogUnavailable) || !needsFilteredView,
  );
  const [loading, setLoading] = React.useState(false);

  React.useEffect(() => {
    const canonical = getCanonicalStoreHrefIfNeeded(record);
    if (!canonical) return;
    const current = queryKey ? `/store?${queryKey}` : "/store";
    if (canonical !== current) {
      router.replace(canonical);
    }
  }, [record, router, queryKey]);

  React.useEffect(() => {
    // Bare /store: ISR shell data only — no API call.
    if (!needsFilteredView) {
      setSnapshot(initialData);
      setSnapshotReady(true);
      setLoading(false);
      return;
    }

    // Kill-switch / unavailable shell: do not fan out to the API.
    if (initialData.catalogUnavailable) {
      setSnapshot(initialData);
      setSnapshotReady(true);
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);
    loadPublicCatalogOnce()
      .then((data) => {
        if (!cancelled) {
          setSnapshot(data);
          setSnapshotReady(true);
        }
      })
      .catch((err) => {
        console.error("[store-catalog-client]", err);
        if (!cancelled) {
          setSnapshot({
            ...initialData,
            products: [],
            total: 0,
            catalogUnavailable: true,
          });
          setSnapshotReady(true);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [needsFilteredView, initialData]);

  const viewData = React.useMemo(() => {
    if (!needsFilteredView) return initialData;
    if (!snapshotReady) return initialData;
    return filterPublicCatalogClient(snapshot, urlState);
  }, [needsFilteredView, snapshotReady, snapshot, urlState, initialData]);

  return (
    <StoreCatalogView
      urlState={needsFilteredView ? urlState : initialUrlState}
      data={viewData}
      loading={loading && needsFilteredView}
    />
  );
}

/** Test helper — canonical API href never includes filter query strings. */
export function publicCatalogApiHref(): string {
  return "/api/store/catalog";
}

/** Test helper — store page href remains the shareable filter URL. */
export function storeFilterHref(state: Partial<StoreCatalogUrlState>): string {
  return buildStoreCatalogHref(state);
}
