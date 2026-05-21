import Link from "next/link";
import { MapPin } from "lucide-react";
import { getHomeMapEmbedSrc } from "@/config/expressHomeMap";
import { ProcurementSectionShell } from "@/components/procurement";
import { HomeBridge, HomeSectionIntro } from "@/components/home/authority/HomeAuthorityPrimitives";

const MAPS_LINK_HREF =
  "https://www.google.com/maps/search/?api=1&query=Salt+Lake+City+Utah+glove+distributor";

export function HomeNationwideServiceSection() {
  const embedSrc = getHomeMapEmbedSrc();
  const showIframe = embedSrc.length > 0;

  return (
    <>
      <HomeBridge variant="gray-to-dark" />
      <ProcurementSectionShell
        tone="raised"
        borderTop={false}
        headingId="nationwide-service-heading"
        ariaLabel="Nationwide service from Salt Lake City"
        className="relative overflow-hidden !py-20 sm:!py-28"
      >
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_0%_50%,rgba(255,106,0,0.1)_0%,transparent_45%)]" />
        <div className="pointer-events-none absolute -right-20 top-1/2 h-[480px] w-[480px] -translate-y-1/2 rounded-full bg-[radial-gradient(circle,rgba(255,106,0,0.05)_0%,transparent_65%)]" />

        <div className="relative grid grid-cols-1 gap-12 lg:grid-cols-2 lg:items-center lg:gap-16">
          <div>
            <HomeSectionIntro
              headingId="nationwide-service-heading"
              eyebrow="National infrastructure"
              eyebrowIcon={MapPin}
              title="Built Here. Servicing everywhere."
              description="Headquarters anchors fulfillment intelligence and B2B glove programs reaching operators across the United States—from single sites to multi-location procurement."
              tone="dark"
              className="mb-0 sm:mb-0 lg:mb-0"
            />
            <p className="mt-6 max-w-md text-sm leading-relaxed text-white/48">
              Fulfillment scope is confirmed per quote and program—not implied as universal same-day coverage nationwide.
            </p>
          </div>

          <div className="home-panel-dark relative min-h-[340px] overflow-hidden sm:min-h-[400px]">
            {showIframe ? (
              <iframe
                src={embedSrc}
                width="100%"
                height="400"
                className="relative z-0 block min-h-[340px] w-full border-0 opacity-75 sm:min-h-[400px]"
                allowFullScreen
                loading="lazy"
                referrerPolicy="no-referrer-when-downgrade"
                title="GloveCubs headquarters — Salt Lake City, UT"
              />
            ) : (
              <div className="relative z-0 flex min-h-[340px] flex-col items-center justify-center gap-5 px-6 py-16 text-center sm:min-h-[400px]">
                <MapPin className="h-12 w-12 text-[var(--color-accent-orange)]" aria-hidden />
                <p className="max-w-xs text-lg font-semibold text-white/92">Salt Lake City, Utah — operations HQ</p>
                <Link
                  href={MAPS_LINK_HREF}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="home-cta-primary px-6 py-3 text-sm"
                >
                  Open in Google Maps
                </Link>
              </div>
            )}

            <div className="absolute bottom-4 right-4 z-[3] rounded-lg border border-white/10 bg-black/75 px-4 py-2.5 text-xs font-medium text-white/75 backdrop-blur-sm">
              Nationwide B2B programs
            </div>
          </div>
        </div>
      </ProcurementSectionShell>
      <HomeBridge variant="to-dark" />
    </>
  );
}
