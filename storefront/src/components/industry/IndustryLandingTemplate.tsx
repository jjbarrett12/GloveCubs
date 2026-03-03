"use client";

import Link from "next/link";
import type { IndustryConfig } from "@/config/industries";
import { INDUSTRIES, INDUSTRY_KEYS } from "@/config/industries";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Separator } from "@/components/ui/separator";
import {
  Zap,
  Package,
  ShieldCheck,
  ListOrdered,
  UserCheck,
  FileText,
  ChevronRight,
} from "lucide-react";

interface IndustryLandingTemplateProps {
  config: IndustryConfig;
}

const PROCUREMENT_TABS = [
  {
    key: "reorder",
    label: "Fast Reorder",
    icon: Zap,
    bullets: [
      "Save your standard SKUs in a Quicklist and reorder in one click.",
      "Same products, same case pricing—no hunting through the catalog.",
      "Optional recurring orders so you never run out.",
    ],
  },
  {
    key: "case",
    label: "Buy by Case",
    icon: Package,
    bullets: [
      "Case pricing on all high-volume gloves and PPE.",
      "Predictable cost per case for budgeting and procurement.",
      "Ship to warehouse or direct to site.",
    ],
  },
  {
    key: "compliance",
    label: "Compliance",
    icon: ShieldCheck,
    bullets: [
      "Consistent SKUs and order history for audits and reporting.",
      "Choose options that match your safety and compliance requirements.",
      "Documentation and specs available per product.",
    ],
  },
];

const B2B_CARDS = [
  {
    title: "Quicklists",
    description: "Save your go-to cart and reorder in one click. Perfect for multi-site and recurring needs.",
    icon: ListOrdered,
  },
  {
    title: "Role-based purchasing",
    description: "Let managers and leads order within guardrails—approvals and limits when you need them.",
    icon: UserCheck,
  },
  {
    title: "Invoice-friendly checkout",
    description: "PO and net terms support so procurement and AP stay in sync.",
    icon: FileText,
  },
];

export function IndustryLandingTemplate({ config }: IndustryLandingTemplateProps) {
  const storeHref = `/store?industry=${config.key}`;
  const industryName = config.name;

  return (
    <div className="min-h-screen bg-[hsl(var(--background))]">
      <header className="border-b border-white/10 sticky top-0 z-40 bg-[hsl(var(--background))]/90 backdrop-blur">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3 flex items-center justify-between">
          <Link href="/" className="text-lg font-semibold text-white">
            GloveCubs
          </Link>
          <nav className="flex items-center gap-4 text-sm">
            {INDUSTRY_KEYS.map((k) => (
              <Link
                key={k}
                href={`/industries/${k}`}
                className={`text-white/70 hover:text-white ${k === config.key ? "text-white font-medium" : ""}`}
              >
                {INDUSTRIES[k].name.split(" ")[0]}
              </Link>
            ))}
            <Link href={storeHref} className="text-white/80 hover:text-white">
              Store
            </Link>
          </nav>
        </div>
      </header>
      {/* 1) Hero — above the fold on laptop */}
      <section className="relative overflow-hidden border-b border-white/10">
        <div
          className={`absolute inset-0 bg-gradient-to-br ${config.primaryGradientClass} opacity-60 pointer-events-none`}
          aria-hidden
        />
        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12 lg:py-16">
          <div className="grid lg:grid-cols-2 gap-12 lg:gap-16 items-center">
            <div className="space-y-8">
              <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold tracking-tight text-white">
                {industryName}
              </h1>
              <p className="text-xl sm:text-2xl text-white/90 font-medium">
                {config.tagline}
              </p>
              <p className="text-lg text-white/70 max-w-xl">
                {config.subtagline}
              </p>
              <ul className="space-y-3 text-white/80">
                {config.heroBullets.map((bullet, i) => (
                  <li key={i} className="flex items-start gap-2">
                    <span className="text-white/50 mt-1">•</span>
                    <span>{bullet}</span>
                  </li>
                ))}
              </ul>
              <div className="flex flex-wrap gap-4">
                <Button asChild size="lg" variant="default">
                  <Link href={storeHref}>Shop {industryName}</Link>
                </Button>
                {/* TODO: auth gating — if not authed, link to /login; else /account/quicklists */}
                <Button asChild size="lg" variant="secondary">
                  <Link href="/account/quicklists">Build a Quicklist</Link>
                </Button>
              </div>
            </div>
            <div className="flex justify-center lg:justify-end">
              <Card className={`w-full max-w-md rounded-2xl border border-white/10 bg-white/[0.06] backdrop-blur-md shadow-xl ${config.accentClass}`}>
                <CardHeader>
                  <CardTitle className="text-white text-lg">Procurement Panel</CardTitle>
                  <CardDescription>Order the way your team works</CardDescription>
                </CardHeader>
                <CardContent>
                  <Tabs defaultValue="reorder" className="w-full">
                    <TabsList className="w-full grid grid-cols-3">
                      <TabsTrigger value="reorder">Fast Reorder</TabsTrigger>
                      <TabsTrigger value="case">Buy by Case</TabsTrigger>
                      <TabsTrigger value="compliance">Compliance</TabsTrigger>
                    </TabsList>
                    {PROCUREMENT_TABS.map((tab) => {
                      const Icon = tab.icon;
                      return (
                        <TabsContent key={tab.key} value={tab.key} className="space-y-4">
                          <ul className="space-y-2 text-sm text-white/80">
                            {tab.bullets.map((b, i) => (
                              <li key={i} className="flex gap-2">
                                <Icon className="h-4 w-4 shrink-0 text-white/50 mt-0.5" />
                                <span>{b}</span>
                              </li>
                            ))}
                          </ul>
                          <Button asChild variant="outline" size="sm" className={config.accentClass}>
                            <Link href={storeHref}>Shop with filters</Link>
                          </Button>
                        </TabsContent>
                      );
                    })}
                  </Tabs>
                </CardContent>
              </Card>
            </div>
          </div>
        </div>
      </section>

      {/* 2) Proof strip */}
      <section className="border-b border-white/10 py-8">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-6">
            {config.proofStats.map((stat, i) => (
              <div key={i} className="text-center">
                <p className="text-2xl sm:text-3xl font-bold text-white">{stat.value}</p>
                <p className="text-sm text-white/60 mt-1">{stat.label}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* 3) Featured Collections */}
      <section className="py-16 lg:py-20 border-b border-white/10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <h2 className="text-3xl font-bold text-white mb-10">Featured Collections</h2>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {config.featuredCollections.map((col, i) => (
              <Card key={i} className={`rounded-2xl border border-white/10 hover:border-white/20 transition-colors ${config.accentClass}`}>
                <CardHeader className="flex flex-row items-start justify-between gap-2">
                  <CardTitle className="text-white text-base">{col.title}</CardTitle>
                  {col.badge && (
                    <Badge variant="secondary" className="shrink-0">{col.badge}</Badge>
                  )}
                </CardHeader>
                <CardContent className="pt-0">
                  <CardDescription className="text-white/70">{col.description}</CardDescription>
                  <Button asChild variant="ghost" size="sm" className="mt-4 p-0 h-auto text-white/90 hover:text-white">
                    <Link href={col.storeHref}>
                      Shop <ChevronRight className="h-4 w-4 inline" />
                    </Link>
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* 4) Buy the way your team buys */}
      <section className="py-16 lg:py-20 border-b border-white/10">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <h2 className="text-3xl font-bold text-white mb-4">Buy the way your team buys</h2>
          <p className="text-white/70 mb-10 max-w-2xl">
            B2B ordering that fits your workflow—Quicklists, role-based purchasing, and invoice-friendly checkout.
          </p>
          <div className="grid md:grid-cols-3 gap-6">
            {B2B_CARDS.map((item, i) => {
              const Icon = item.icon;
              return (
                <Card key={i} className={`rounded-2xl border border-white/10 hover:border-white/20 transition-colors ${config.accentClass}`}>
                  <CardHeader>
                    <Icon className="h-8 w-8 text-white/80 mb-2" />
                    <CardTitle className="text-white text-lg">{item.title}</CardTitle>
                    <CardDescription className="text-white/70">{item.description}</CardDescription>
                  </CardHeader>
                </Card>
              );
            })}
          </div>
        </div>
      </section>

      {/* 5) Top Categories */}
      <section className="py-12 border-b border-white/10">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <h2 className="text-2xl font-bold text-white mb-6">Top Categories</h2>
          <div className="flex flex-wrap gap-3">
            {config.topCategories.map((cat, i) => (
              <Button key={i} asChild variant="outline" size="sm" className={config.accentClass}>
                <Link href={cat.storeHref}>{cat.label}</Link>
              </Button>
            ))}
          </div>
        </div>
      </section>

      {/* 6) Use Cases */}
      <section className="py-16 lg:py-20 border-b border-white/10">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <h2 className="text-3xl font-bold text-white mb-10">Use Cases</h2>
          <div className="grid sm:grid-cols-2 gap-6">
            {config.useCases.map((uc, i) => (
              <Card key={i} className={`rounded-2xl border border-white/10 hover:border-white/20 transition-colors ${config.accentClass}`}>
                <CardHeader>
                  <CardTitle className="text-white text-lg">{uc.title}</CardTitle>
                  <CardDescription className="text-white/70">{uc.description}</CardDescription>
                </CardHeader>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* 7) FAQ */}
      <section className="py-16 lg:py-20 border-b border-white/10">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">
          <h2 className="text-3xl font-bold text-white mb-10">Frequently asked questions</h2>
          <Accordion type="single">
            {config.faq.map((item, i) => (
              <AccordionItem key={i} value={`faq-${i}`}>
                <AccordionTrigger value={`faq-${i}`} className="text-white hover:no-underline">
                  {item.q}
                </AccordionTrigger>
                <AccordionContent value={`faq-${i}`}>{item.a}</AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </div>
      </section>

      {/* 8) Bottom CTA band */}
      <section className={`py-16 lg:py-20 bg-gradient-to-br ${config.primaryGradientClass}`}>
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h2 className="text-2xl sm:text-3xl font-bold text-white mb-4">
            Get set up for B2B ordering in 2 minutes
          </h2>
          <p className="text-white/80 mb-8">
            Create an account or go straight to the store with filters applied.
          </p>
          <div className="flex flex-wrap justify-center gap-4">
            {/* TODO: auth gating — Create account vs Dashboard */}
            <Button asChild size="lg" variant="default">
              <Link href="/login">Create account</Link>
            </Button>
            <Button asChild size="lg" variant="secondary">
              <Link href={storeHref}>Shop {industryName}</Link>
            </Button>
          </div>
        </div>
      </section>

      {config.complianceNotes && config.complianceNotes.length > 0 && (
        <section className="py-6 border-t border-white/10">
          <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
            <p className="text-xs text-white/50">
              {config.complianceNotes.join(" ")}
            </p>
          </div>
        </section>
      )}
    </div>
  );
}
