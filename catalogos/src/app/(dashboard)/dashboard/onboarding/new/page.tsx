import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { OnboardingRequestForm } from "./OnboardingRequestForm";

export default function NewOnboardingPage() {
  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center gap-2">
        <Link href="/dashboard/onboarding" className="text-sm text-muted-foreground hover:text-foreground">
          ← Onboarding
        </Link>
      </div>
      <h1 className="text-2xl font-bold tracking-tight">New onboarding request</h1>
      <Card className="max-w-xl">
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Create request</CardTitle>
        </CardHeader>
        <CardContent>
          <OnboardingRequestForm />
        </CardContent>
      </Card>
    </div>
  );
}
