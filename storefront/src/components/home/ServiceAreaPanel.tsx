import Link from "next/link";
import { MapPin } from "lucide-react";
import { getHomeMapEmbedSrc, isHomeMapEmbedDisabled } from "@/config/expressHomeMap";

const MAPS_LINK_HREF =
  "https://www.google.com/maps/search/?api=1&query=Salt+Lake+City+Utah+glove+distributor";

export function ServiceAreaPanel() {
  const embedSrc = getHomeMapEmbedSrc();
  const showIframe = embedSrc.length > 0;

  return (
    <section className="border-t border-white/5 bg-[#0c0c0c] py-24" aria-labelledby="map-heading">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-[1200px]">
          <div className="rounded-2xl border border-white/10 bg-white/[0.05] p-10 shadow-xl sm:p-12">
            <h3 id="map-heading" className="mb-4 text-center text-[32px] font-bold text-[#FF7A00]">
              Built Here, Servicing Everywhere
            </h3>
            <p className="mb-8 text-center text-base leading-relaxed text-white/90">
              Our headquarters in Salt Lake City, UT serves as the foundation of our operations. From this central
              location, we efficiently distribute quality gloves to businesses across the United States and beyond.
              Whether you&apos;re on the East Coast, West Coast, or anywhere in between, we&apos;re here to serve you.
            </p>

            {showIframe ? (
              <div className="relative min-h-[400px] w-full overflow-hidden rounded-xl bg-black/40 shadow-2xl ring-1 ring-white/10">
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
                <p className="mt-3 text-center text-sm text-white/55">
                  Map not loading?{" "}
                  <Link href={MAPS_LINK_HREF} className="font-medium text-[#FF7A00] underline-offset-2 hover:underline">
                    Open in Google Maps
                  </Link>
                </p>
              </div>
            ) : (
              <div className="flex min-h-[320px] flex-col items-center justify-center gap-4 rounded-xl border border-dashed border-white/20 bg-gradient-to-b from-[#1a1a1a] to-[#111] px-6 py-16 text-center shadow-inner">
                <MapPin className="h-12 w-12 text-[#FF7A00]" aria-hidden />
                <p className="max-w-md text-base font-medium text-white/90">
                  Map preview is turned off in this environment, or no embed URL is configured.
                </p>
                <p className="max-w-lg text-sm text-white/60">
                  Set <code className="rounded bg-white/10 px-1.5 py-0.5 text-xs text-white/90">NEXT_PUBLIC_HOME_MAP_EMBED_URL</code>{" "}
                  to a Google Maps embed link, or clear <code className="rounded bg-white/10 px-1.5 py-0.5 text-xs">NEXT_PUBLIC_HOME_MAP_DISABLED</code>{" "}
                  to use the default embed.
                </p>
                <Link
                  href={MAPS_LINK_HREF}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-2 inline-flex items-center gap-2 rounded-xl bg-[#FF7A00] px-6 py-3 text-sm font-bold text-white shadow-lg shadow-[#FF7A00]/25 transition hover:bg-[#e56e00]"
                >
                  Open map — Salt Lake City, UT
                </Link>
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
