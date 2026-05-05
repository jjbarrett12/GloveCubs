import Link from "next/link";
import type { Metadata } from "next";
import { RequestPricingForm } from "@/components/request-pricing/RequestPricingForm";

export const metadata: Metadata = {
  title: "Contact GloveCubs | Inquiry",
  description:
    "Request pricing, ask about bulk orders, or get help choosing gloves. We respond to every serious inquiry from operators and buyers.",
};

export default function RequestPricingPage() {
  return (
    <div className="min-h-screen bg-[hsl(var(--background))]">
      <header className="border-b border-white/10">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex items-center justify-between gap-4">
          <Link href="/" className="text-xl font-semibold text-white shrink-0">
            GloveCubs
          </Link>
          <Link href="/" className="text-sm text-white/70 hover:text-white">
            ← Home
          </Link>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-10 pb-20">
        <h1 className="text-3xl sm:text-4xl font-bold text-white tracking-tight mb-2">Send us an inquiry</h1>
        <p className="text-white/65 mb-10 text-sm sm:text-base max-w-2xl">
          Whether you need distributor pricing, a bulk order, or help picking the right glove program—tell us what you are
          trying to solve. We review each submission and follow up by email or phone.
        </p>
        <RequestPricingForm />
      </main>
    </div>
  );
}
