import Link from "next/link";
import { GloveFinder } from "./GloveFinder";

export default function StorefrontHomePage() {
  return (
    <div className="space-y-8">
      <section className="text-center">
        <h1 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
          The right gloves for your business
        </h1>
        <p className="mt-2 text-muted-foreground">
          Find the best disposable gloves in seconds, or browse the full catalog.
        </p>
      </section>

      <section className="mx-auto max-w-2xl">
        <GloveFinder />
      </section>

      <section className="flex justify-center">
        <Link
          href="/catalog/disposable_gloves"
          className="text-sm font-medium text-primary hover:underline"
        >
          Browse all disposable gloves →
        </Link>
      </section>
    </div>
  );
}
