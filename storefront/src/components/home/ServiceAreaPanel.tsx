import { EXPRESS_HOME_MAP_IFRAME_SRC } from "@/config/expressHomeMap";

export function ServiceAreaPanel() {
  return (
    <section className="border-t border-white/5 bg-[#0c0c0c] py-24" aria-labelledby="map-heading">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-[1200px]">
          <div className="rounded-2xl border border-white/10 bg-white/[0.05] p-10 shadow-xl sm:p-12">
            <h3 id="map-heading" className="mb-4 text-center text-[32px] font-bold text-[#FF7A00]">
              Built Here, Servicing Everywhere
            </h3>
            <p className="mb-8 text-center text-base leading-relaxed text-white/90">
              Our headquarters in Salt Lake City, UT serves as the foundation of our operations. From this central location, we efficiently distribute quality gloves to businesses across the United States and beyond. Whether you&apos;re on the East Coast, West Coast, or anywhere in between, we&apos;re here to serve you.
            </p>
            <div className="h-[400px] w-full overflow-hidden rounded-xl shadow-2xl">
              <iframe
                src={EXPRESS_HOME_MAP_IFRAME_SRC}
                width="100%"
                height="400"
                className="h-[400px] w-full border-0"
                allowFullScreen
                loading="lazy"
                referrerPolicy="no-referrer-when-downgrade"
                title="Glovecubs Headquarters - Salt Lake City, UT"
              />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
