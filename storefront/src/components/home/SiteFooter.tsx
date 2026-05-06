import Link from "next/link";
import { Facebook, Twitter, Linkedin, Instagram, Phone, Mail, MapPin, Clock } from "lucide-react";
import {
  FOOTER_CONTACT_LINKS,
  FOOTER_QUICK_LINKS,
  FOOTER_SOCIAL_LINKS,
  FOOTER_TAGLINE,
  FOOTER_TOP_BRANDS,
} from "@/config/footerLinks";
import { getBrandLogoPath } from "@/config/homeBrands";
import { GloveCubsWordmark } from "@/components/home/GloveCubsWordmark";

const iconForSocial = (label: string) => {
  switch (label) {
    case "Facebook":
      return <Facebook className="h-[18px] w-[18px]" strokeWidth={2} />;
    case "Twitter":
      return <Twitter className="h-[18px] w-[18px]" strokeWidth={2} />;
    case "LinkedIn":
      return <Linkedin className="h-[18px] w-[18px]" strokeWidth={2} />;
    case "Instagram":
      return <Instagram className="h-[18px] w-[18px]" strokeWidth={2} />;
    default:
      return null;
  }
};

export function SiteFooter() {
  return (
    <footer className="mt-[72px] border-t border-white/10 bg-[#141414] pb-2 pt-16 text-white sm:pt-20">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 gap-10 border-b border-white/10 pb-10 sm:grid-cols-2 lg:grid-cols-[1.5fr_1fr_1fr_1fr] lg:gap-x-12 lg:gap-y-8">
          <div>
            <div className="mb-[18px]">
              <Link href="/" className="-m-1 inline-block rounded-lg p-1 hover:opacity-95">
                <span className="sr-only">GloveCubs home</span>
                <GloveCubsWordmark variant="footer" className="max-w-full" />
              </Link>
            </div>
            <p className="mb-3 max-w-md text-sm leading-relaxed text-white/75">{FOOTER_TAGLINE}</p>
            <div className="mt-5 flex gap-3">
              {FOOTER_SOCIAL_LINKS.map((s) => (
                <a
                  key={s.label}
                  href={s.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={s.label}
                  className="flex h-11 min-h-11 w-11 min-w-11 items-center justify-center rounded-full border border-white/15 bg-white/[0.07] text-white/90 shadow-sm transition hover:-translate-y-0.5 hover:border-[#FF7A00]/35 hover:bg-[#FF7A00]/18 hover:text-white"
                >
                  {iconForSocial(s.label)}
                </a>
              ))}
            </div>
          </div>

          <div className="min-w-0 sm:min-w-[180px]">
            <h4 className="mb-4 text-[11px] font-bold uppercase tracking-[0.12em] text-[#FF7A00]">Quick Links</h4>
            <ul className="flex list-none flex-col gap-1 p-0">
              {FOOTER_QUICK_LINKS.map((link) => (
                <li key={link.label}>
                  <Link
                    href={link.href}
                    className="inline-block rounded px-0 py-2 text-sm font-medium text-white/75 transition hover:translate-x-[3px] hover:text-white"
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <h4 className="mb-4 text-[11px] font-bold uppercase tracking-[0.12em] text-[#FF7A00]">Top Brands</h4>
            <div className="grid grid-cols-2 gap-3">
              {FOOTER_TOP_BRANDS.map((b) => {
                const logo = getBrandLogoPath(b.name);
                return (
                  <Link
                    key={b.slug}
                    href={b.href}
                    title={b.name}
                    className="flex min-h-[60px] items-center justify-center rounded-lg border border-white/12 bg-white/[0.05] p-2.5 text-center shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] transition hover:-translate-y-0.5 hover:border-[#FF7A00]/35 hover:bg-white/[0.09]"
                  >
                    <span className="flex flex-col items-center gap-1">
                      {logo ? (
                        <img src={logo} alt="" className="max-h-7 max-w-[80px] object-contain" loading="lazy" />
                      ) : null}
                      <span className="text-center text-[11px] font-semibold leading-tight text-white/90">{b.name}</span>
                    </span>
                  </Link>
                );
              })}
            </div>
          </div>

          <div>
            <h4 className="mb-4 text-[11px] font-bold uppercase tracking-[0.12em] text-[#FF7A00]">Contact Us</h4>
            <ul className="contact-info flex list-none flex-col gap-0 p-0">
              {FOOTER_CONTACT_LINKS.map((c) => {
                const icon =
                  c.type === "phone" ? (
                    <Phone className="h-[13px] w-5 shrink-0 text-[#FF7A00]" />
                  ) : c.type === "email" ? (
                    <Mail className="h-[13px] w-5 shrink-0 text-[#FF7A00]" />
                  ) : c.type === "address" ? (
                    <MapPin className="h-[13px] w-5 shrink-0 text-[#FF7A00]" />
                  ) : (
                    <Clock className="h-[13px] w-5 shrink-0 text-[#FF7A00]" />
                  );
                return (
                  <li key={c.label} className="flex items-center gap-2.5 py-2 text-sm text-white/75">
                    {icon}
                    {c.href ? (
                      <a
                        href={c.href}
                        target={c.external ? "_blank" : undefined}
                        rel={c.external ? "noopener noreferrer" : undefined}
                        className="py-0.5 hover:text-white"
                      >
                        {c.label}
                      </a>
                    ) : (
                      <span>{c.label}</span>
                    )}
                  </li>
                );
              })}
            </ul>
          </div>
        </div>

        <div className="flex flex-col items-center justify-between gap-6 border-t border-white/5 py-8 text-center sm:flex-row sm:gap-8 sm:text-left">
          <p className="m-0 text-sm font-medium text-white/50">
            &copy; {new Date().getFullYear()} Glovecubs. All rights reserved.
          </p>
          <div
            className="flex flex-wrap justify-center gap-x-5 gap-y-2 sm:justify-end"
            aria-label="Accepted payment methods"
          >
            <span className="text-[11px] font-bold uppercase tracking-[0.2em] text-white/35">Visa</span>
            <span className="text-[11px] font-bold uppercase tracking-[0.2em] text-white/35">Mastercard</span>
            <span className="text-[11px] font-bold uppercase tracking-[0.2em] text-white/35">Amex</span>
            <span className="text-[11px] font-bold uppercase tracking-[0.2em] text-white/35">Discover</span>
            <span className="text-[11px] font-bold uppercase tracking-[0.2em] text-white/35">PayPal</span>
          </div>
        </div>
      </div>
    </footer>
  );
}
