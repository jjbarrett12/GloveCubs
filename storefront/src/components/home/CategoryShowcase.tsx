import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ArrowRight } from "lucide-react";

const CATEGORIES: { title: string; line: string }[] = [
  { title: "Nitrile Gloves", line: "High-turnover disposable barrier for exams, prep, and cleaning." },
  { title: "Latex Gloves", line: "Traditional fit and elasticity where latex is approved." },
  { title: "Vinyl Gloves", line: "Economical frequent-change tasks and light-duty barriers." },
  { title: "Poly Gloves", line: "Quick food-handling and light-duty coverage." },
  { title: "Cut Resistant", line: "ANSI-rated options for sharp handling and assembly." },
  { title: "Chemical Resistant", line: "Task-matched protection for cleaners and industrial fluids." },
];

export function CategoryShowcase() {
  return (
    <section className="py-10">
      <h2 className="text-xl sm:text-2xl font-semibold text-white mb-2 text-center">Shop by category</h2>
      <p className="text-white/55 text-sm text-center mb-8 max-w-2xl mx-auto">
        Browse the catalog and build a quote cart—sold by the case for businesses.
      </p>
      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {CATEGORIES.map((c) => (
          <Card key={c.title} className="rounded-2xl border-white/10 bg-white/[0.04] flex flex-col">
            <CardHeader className="pb-2">
              <CardTitle className="text-white text-lg">{c.title}</CardTitle>
              <CardDescription className="text-white/65 text-sm">{c.line}</CardDescription>
            </CardHeader>
            <CardContent className="pt-0 mt-auto">
              <Button asChild variant="outline" size="sm" className="border-white/20 text-white hover:bg-white/10">
                <Link href="/store">
                  Browse catalog <ArrowRight className="ml-1 h-4 w-4" />
                </Link>
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>
    </section>
  );
}
