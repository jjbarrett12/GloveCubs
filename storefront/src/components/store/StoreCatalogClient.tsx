"use client";

import * as React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  buildStoreCatalogHref,
  parseStoreCatalogParams,
  type StoreCatalogUrlState,
} from "@/lib/catalog/store-url";
import { getCanonicalStoreHrefIfNeeded } from "@/lib/catalog/store-legacy-url";
import { StoreCatalogView, type StoreCatalogViewData } from "@/components/store/StoreCatalogView";

function searchParamsToRecord(sp: URLSearchParams): Record<string, string | string[] | undefined> {
  const out: Record<string, string | string[] | undefined> = {};
  for (const key of Array.from(new Set(Array.from(sp.keys())))) {
    const all = sp.getAll(key);
    out[key] = all.length <= 1 ? (all[0] ?? undefined) : all;
  }
  return out;
}

function catalogApiHref(urlState: StoreCatalogUrlState): string {
  const pageHref = buildStoreCatalogHref(urlState);
  if (pageHref === "/store") return "/api/store/catalog";
  return `/api/store/catalog?${pageHref.slice("/store?".length)}`;
}

type Props = {
  initialData: StoreCatalogViewData;
  initialUrlState: StoreCatalogUrlState;
};

/**
 * Reads /store query state in the browser and hydrates filtered results from the
 * cacheable catalog API — keeps the RSC page force-static / ISR.
 */
export function StoreCatalogClient({ initialData, initialUrlState }: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const record = React.useMemo(() => searchParamsToRecord(searchParams), [searchParams]);
  const urlState = React.useMemo(() => parseStoreCatalogParams(record), [record]);
  /** Any query string (filters, sort, page) hydrates via API; bare /store uses ISR shell data. */
  const queryKey = searchParams.toString();
  const needsClientFetch = queryKey.length > 0;

  const [data, setData] = React.useState<StoreCatalogViewData>(initialData);
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
    if (!needsClientFetch) {
      setData(initialData);
      setLoading(false);
      return;
    }

    let cancelled = false;
    const ctrl = new AbortController();
    setLoading(true);

    fetch(catalogApiHref(urlState), {
      signal: ctrl.signal,
      headers: { Accept: "application/json" },
    })
      .then(async (res) => {
        if (!res.ok) throw new Error(`catalog_api_${res.status}`);
        return res.json() as Promise<StoreCatalogViewData>;
      })
      .then((json) => {
        if (!cancelled) {
          setData({
            products: json.products ?? [],
            total: json.total ?? 0,
            limit: json.limit ?? urlState.limit ?? 24,
            brands: json.brands ?? [],
            facetCounts: json.facetCounts ?? {},
            facetMeta: json.facetMeta ?? {},
            catalogUnavailable: Boolean(json.catalogUnavailable),
          });
        }
      })
      .catch((err) => {
        if (cancelled || ctrl.signal.aborted) return;
        console.error("[store-catalog-client]", err);
        if (!cancelled) {
          setData({
            ...initialData,
            products: [],
            total: 0,
            catalogUnavailable: true,
          });
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
      ctrl.abort();
    };
    // Refetch only when the URL query string changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queryKey, needsClientFetch]);

  return (
    <StoreCatalogView
      urlState={needsClientFetch ? urlState : initialUrlState}
      data={needsClientFetch ? data : initialData}
      loading={loading}
    />
  );
}
