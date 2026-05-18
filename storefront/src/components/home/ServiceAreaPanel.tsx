import { MapPin } from "lucide-react";
import { getHomeMapEmbedSrc, isHomeMapEmbedDisabled } from "@/config/expressHomeMap";
import { ProcurementSectionShell } from "@/components/procurement";

const MAPS_LINK_HREF =
  "https://www.google.com/maps/search/?api=1&query=Salt+Lake+City+Utah+glove+distributor";

export function ServiceAreaPanel() {
  const embedSrc = getHomeMapEmbedSrc();
  const showIframe = embedSrc.length > 0;

  return (
    <ProcurementSectionShell tone="light-alt" headingId="map-heading" ariaLabel="Distribution and service area">
      <div className="mx-auto max-w-[1200px]">
        <h2 id="map-heading" className="proc-h2-light mb-3 text-center">
          Built here, servicing everywhere
        </h2>
        <p className="proc-body-light mx-auto mb-8 max-w-2xl text-center">
          Our headquarters in Salt Lake City, UT serves as the foundation of our operations. From this central location, we
          efficiently distribute quality gloves to businesses across the United States and beyond.
        </p>

        <div className="overflow-hidden rounded-xl border border-border-light bg-white shadow-proc-light-md">
          {showIframe ? (
            <>
              <div className="relative min-h-[400px] w-full bg-[#111111]">
                <iframe
                  src={embedSrc}
                  width="100%"
                  height="400"
                  className="block h-[400px] w-full min-h-[400px] border-0"
                  allowFullScreen
                  loading="lazy"
                  referrerPolicy="no-referrer-when-downgrade"
                  title="Glovecubs headquarters region — Salt Lake City, UT"
                />
              </div>
              <p className="border-t border-border-light px-4 py-3 text-center text-sm text-text-muted-light">
                Map not loading?{" "}
                <a
                  href={MAPS_LINK_HREF}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-medium text-brand hover:underline"
                >
                  Open in Google Maps
                </a>
              </p>
            </>
          ) : (
            <div className="flex min-h-[320px] flex-col items-center justify-center gap-4 bg-[#111111] px-6 py-16 text-center">
              <MapPin className="h-12 w-12 text-brand" aria-hidden />
              <p className="max-w-md text-base font-medium text-white/90">
                Map preview is turned off in this environment, or no embed URL is configured.
              </p>
              <p className="max-w-lg text-sm text-white/60">
                Set{" "}
                <code className="rounded bg-white/10 px-1.5 py-0.5 text-xs text-white/90">NEXT_PUBLIC_HOME_MAP_EMBED_URL</code> to a
                Google Maps embed link, or clear{" "}
                <code className="rounded bg-white/10 px-1.5 py-0.5 text-xs">NEXT_PUBLIC_HOME_MAP_DISABLED</code> to use the default
                embed.
              </p>
              <a
                href={MAPS_LINK_HREF}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-2 inline-flex items-center gap-2 rounded-lg bg-brand px-6 py-3 text-sm font-bold text-white transition hover:bg-brand-hover"
              >
                Open map — Salt Lake City, UT
              </a>
            </div>
          )}
        </div>
      </div>
    </ProcurementSectionShell>
  );
}
