import { getExpressCommerceApiOrigin } from "@/lib/api";

export type AdminHealthStatus =
  | "healthy"
  | "degraded"
  | "setup_required"
  | "unavailable"
  | "production_blocking";

export type AdminHealthSeverity = "info" | "warning" | "critical";

export type AdminHealthIntegrationId =
  | "supabase"
  | "express_api_origin"
  | "express_jwt_signing"
  | "catalogos"
  | "import_internal_key";

export type AdminModuleId =
  | "purchase-orders"
  | "inventory"
  | "users"
  | "net-terms"
  | "products"
  | "orders"
  | "customers"
  | "messages"
  | "dashboard"
  | "settings";

export type AdminHealthIssue = {
  id: string;
  integrationId: AdminHealthIntegrationId;
  status: AdminHealthStatus;
  severity: AdminHealthSeverity;
  title: string;
  message: string;
  moduleIds: AdminModuleId[];
  settingsOnlyDetails?: string;
};

export type AdminHealthIntegration = {
  id: AdminHealthIntegrationId;
  label: string;
  status: AdminHealthStatus;
  severity: AdminHealthSeverity;
  configured: boolean;
  moduleIds: AdminModuleId[];
  description: string;
  settingsEnvHint?: string;
};

export type AdminHealthSummary = {
  status: AdminHealthStatus;
  severity: AdminHealthSeverity;
  deployEnv: string;
  isProduction: boolean;
  issues: AdminHealthIssue[];
  integrations: AdminHealthIntegration[];
};

export type AdminModuleAvailability = {
  available: boolean;
  status: AdminHealthStatus;
  reason?: "setup_required" | "unavailable" | "production_blocking" | "degraded";
};

export const EXPRESS_ADMIN_MODULE_IDS: AdminModuleId[] = [
  "purchase-orders",
  "inventory",
  "users",
  "net-terms",
];

export const MODULE_UNAVAILABLE_COPY: Record<
  AdminModuleId,
  { title: string; description: string }
> = {
  "purchase-orders": {
    title: "Purchase orders are unavailable in this environment",
    description:
      "This module needs the fulfillment API bridge before purchase orders can be loaded or managed.",
  },
  inventory: {
    title: "Inventory is unavailable in this environment",
    description:
      "This module needs the fulfillment API bridge before stock positions can be viewed or adjusted.",
  },
  users: {
    title: "Buyer users are unavailable in this environment",
    description:
      "This module needs the fulfillment API bridge before buyer accounts can be reviewed or approved.",
  },
  "net-terms": {
    title: "Net terms are unavailable in this environment",
    description:
      "This module needs the fulfillment API bridge before net terms applications can be reviewed.",
  },
  products: {
    title: "Products are unavailable in this environment",
    description: "This module needs database access before catalog operations can run.",
  },
  orders: {
    title: "Order records are unavailable in this environment",
    description: "This module needs database access before order records can be loaded.",
  },
  customers: {
    title: "Customers are unavailable in this environment",
    description: "This module needs database access before customer accounts can be loaded.",
  },
  messages: {
    title: "Messages are unavailable in this environment",
    description: "This module needs database access before contact submissions can be loaded.",
  },
  dashboard: {
    title: "Dashboard is unavailable in this environment",
    description: "This module needs database access before operator metrics can be loaded.",
  },
  settings: {
    title: "Settings",
    description: "Review system configuration on this page.",
  },
};

const SUPABASE_MODULE_IDS: AdminModuleId[] = [
  "dashboard",
  "orders",
  "customers",
  "messages",
  "products",
  "settings",
];

const STATUS_RANK: Record<AdminHealthStatus, number> = {
  healthy: 0,
  degraded: 1,
  setup_required: 2,
  unavailable: 3,
  production_blocking: 4,
};

const SEVERITY_RANK: Record<AdminHealthSeverity, number> = {
  info: 0,
  warning: 1,
  critical: 2,
};

function deployEnvLabel(): string {
  return (
    process.env.VERCEL_ENV?.trim() ||
    (process.env.NODE_ENV === "production" ? "production" : "development")
  );
}

function isProductionDeploy(): boolean {
  return deployEnvLabel() === "production";
}

function worstStatus(a: AdminHealthStatus, b: AdminHealthStatus): AdminHealthStatus {
  return STATUS_RANK[a] >= STATUS_RANK[b] ? a : b;
}

function worstSeverity(a: AdminHealthSeverity, b: AdminHealthSeverity): AdminHealthSeverity {
  return SEVERITY_RANK[a] >= SEVERITY_RANK[b] ? a : b;
}

function missingIntegrationStatus(): AdminHealthStatus {
  return isProductionDeploy() ? "production_blocking" : "setup_required";
}

function missingIntegrationSeverity(): AdminHealthSeverity {
  return isProductionDeploy() ? "critical" : "warning";
}

export function isSupabasePublicConfigured(): boolean {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim(),
  );
}

export function isSupabaseServiceConfigured(): boolean {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() && process.env.SUPABASE_SERVICE_ROLE_KEY?.trim(),
  );
}

export function isExpressApiOriginConfigured(): boolean {
  const origin = getExpressCommerceApiOrigin();
  return origin.startsWith("http://") || origin.startsWith("https://");
}

export function isExpressJwtSigningConfigured(): boolean {
  return Boolean(process.env.JWT_SECRET?.trim());
}

export function isExpressBridgeConfigured(summary?: AdminHealthSummary): boolean {
  const s = summary ?? resolveAdminHealth();
  const origin = s.integrations.find((i) => i.id === "express_api_origin");
  const jwt = s.integrations.find((i) => i.id === "express_jwt_signing");
  return Boolean(origin?.configured && jwt?.configured);
}

export function resolveAdminHealth(): AdminHealthSummary {
  const deployEnv = deployEnvLabel();
  const isProduction = isProductionDeploy();

  const supabasePublic = isSupabasePublicConfigured();
  const supabaseService = isSupabaseServiceConfigured();
  const expressOrigin = isExpressApiOriginConfigured();
  const expressJwt = isExpressJwtSigningConfigured();
  const catalogosInternal = Boolean(process.env.CATALOGOS_INTERNAL_URL?.trim());
  const catalogosPublic = Boolean(process.env.NEXT_PUBLIC_CATALOGOS_URL?.trim());
  const catalogosConfigured = catalogosInternal || catalogosPublic;
  const importKey = Boolean(process.env.INTERNAL_API_KEY?.trim());

  const integrations: AdminHealthIntegration[] = [
    {
      id: "supabase",
      label: "Supabase",
      configured: supabasePublic && supabaseService,
      status:
        supabasePublic && supabaseService
          ? "healthy"
          : missingIntegrationStatus(),
      severity:
        supabasePublic && supabaseService ? "info" : missingIntegrationSeverity(),
      moduleIds: SUPABASE_MODULE_IDS,
      description: "Database and auth for admin reads and catalog operations.",
      settingsEnvHint:
        "NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY",
    },
    {
      id: "express_api_origin",
      label: "Express API origin",
      configured: expressOrigin,
      status: expressOrigin ? "healthy" : missingIntegrationStatus(),
      severity: expressOrigin ? "info" : missingIntegrationSeverity(),
      moduleIds: EXPRESS_ADMIN_MODULE_IDS,
      description: "Fulfillment admin API host for purchase orders, inventory, users, and net terms.",
      settingsEnvHint: "NEXT_PUBLIC_GLOVECUBS_API",
    },
    {
      id: "express_jwt_signing",
      label: "Express JWT signing",
      configured: expressJwt,
      status: expressJwt ? "healthy" : missingIntegrationStatus(),
      severity: expressJwt ? "info" : missingIntegrationSeverity(),
      moduleIds: EXPRESS_ADMIN_MODULE_IDS,
      description: "Short-lived operator tokens for the fulfillment admin API bridge.",
      settingsEnvHint: "JWT_SECRET",
    },
    {
      id: "catalogos",
      label: "Catalog sync (CatalogOS)",
      configured: catalogosConfigured,
      status: catalogosConfigured ? "healthy" : "degraded",
      severity: catalogosConfigured ? "info" : "warning",
      moduleIds: ["products"],
      description: "Supplier URL import and catalog sync workflows.",
      settingsEnvHint: "CATALOGOS_INTERNAL_URL and/or NEXT_PUBLIC_CATALOGOS_URL",
    },
    {
      id: "import_internal_key",
      label: "Server import API key",
      configured: importKey,
      status: importKey ? "healthy" : "degraded",
      severity: importKey ? "info" : "warning",
      moduleIds: ["products"],
      description: "Protected server-to-server import and admin API workflows.",
      settingsEnvHint: "INTERNAL_API_KEY",
    },
  ];

  const issues: AdminHealthIssue[] = [];

  if (!supabasePublic || !supabaseService) {
    issues.push({
      id: "supabase-missing",
      integrationId: "supabase",
      status: missingIntegrationStatus(),
      severity: missingIntegrationSeverity(),
      title: "Database not fully configured",
      message: "Supabase credentials are required for most admin modules.",
      moduleIds: SUPABASE_MODULE_IDS,
      settingsOnlyDetails:
        "Set NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, and SUPABASE_SERVICE_ROLE_KEY.",
    });
  }

  if (!expressOrigin) {
    issues.push({
      id: "express-origin-missing",
      integrationId: "express_api_origin",
      status: missingIntegrationStatus(),
      severity: missingIntegrationSeverity(),
      title: "Express API origin not configured",
      message: "Fulfillment modules cannot reach the admin API without an Express API origin.",
      moduleIds: EXPRESS_ADMIN_MODULE_IDS,
      settingsOnlyDetails: "Set NEXT_PUBLIC_GLOVECUBS_API to your Express API host (see .env.example).",
    });
  }

  if (!expressJwt) {
    issues.push({
      id: "express-jwt-missing",
      integrationId: "express_jwt_signing",
      status: missingIntegrationStatus(),
      severity: missingIntegrationSeverity(),
      title: "Express JWT signing not configured",
      message: "Fulfillment modules cannot authenticate to the admin API without JWT signing.",
      moduleIds: EXPRESS_ADMIN_MODULE_IDS,
      settingsOnlyDetails:
        "Set JWT_SECRET on the storefront server to match the Express admin API (see .env.example).",
    });
  }

  if (!catalogosConfigured) {
    issues.push({
      id: "catalogos-missing",
      integrationId: "catalogos",
      status: "degraded",
      severity: "warning",
      title: "Catalog sync not configured",
      message: "URL import and catalog sync may be limited until CatalogOS URLs are set.",
      moduleIds: ["products"],
      settingsOnlyDetails: "Set CATALOGOS_INTERNAL_URL and/or NEXT_PUBLIC_CATALOGOS_URL.",
    });
  }

  if (!importKey) {
    issues.push({
      id: "import-key-missing",
      integrationId: "import_internal_key",
      status: "degraded",
      severity: "warning",
      title: "Server import API key not set",
      message: "Some protected import workflows may be unavailable.",
      moduleIds: ["products"],
      settingsOnlyDetails: "Set INTERNAL_API_KEY for server-to-server import routes.",
    });
  }

  let status: AdminHealthStatus = "healthy";
  let severity: AdminHealthSeverity = "info";
  for (const issue of issues) {
    status = worstStatus(status, issue.status);
    severity = worstSeverity(severity, issue.severity);
  }

  return {
    status,
    severity,
    deployEnv,
    isProduction,
    issues,
    integrations,
  };
}

export function getAdminModuleAvailability(
  health: AdminHealthSummary,
  moduleId: AdminModuleId,
): AdminModuleAvailability {
  if (moduleId === "settings") {
    return { available: true, status: "healthy" };
  }

  if (EXPRESS_ADMIN_MODULE_IDS.includes(moduleId)) {
    if (!isExpressBridgeConfigured(health)) {
      const reason = health.isProduction ? "production_blocking" : "setup_required";
      return {
        available: false,
        status: health.isProduction ? "production_blocking" : "setup_required",
        reason,
      };
    }
    return { available: true, status: "healthy" };
  }

  if (SUPABASE_MODULE_IDS.includes(moduleId)) {
    const supabase = health.integrations.find((i) => i.id === "supabase");
    if (!supabase?.configured) {
      const reason = health.isProduction ? "production_blocking" : "setup_required";
      return {
        available: false,
        status: health.isProduction ? "production_blocking" : "setup_required",
        reason,
      };
    }

    if (moduleId === "products") {
      const catalogos = health.integrations.find((i) => i.id === "catalogos");
      const importKey = health.integrations.find((i) => i.id === "import_internal_key");
      if (!catalogos?.configured || !importKey?.configured) {
        return { available: true, status: "degraded", reason: "degraded" };
      }
    }

    return { available: true, status: "healthy" };
  }

  return { available: true, status: "healthy" };
}

/** Module-safe runtime error copy — never surfaces env var names. */
export function sanitizeExpressModuleRuntimeError(error: string | null, httpStatus?: number): string {
  if (!error?.trim()) {
    return "This module could not be loaded. Try again in a moment.";
  }
  const lower = error.toLowerCase();
  if (
    httpStatus === 503 ||
    lower.includes("jwt_secret") ||
    lower.includes("next_public_glovecubs_api") ||
    lower.includes("not configured")
  ) {
    return "This module is temporarily unavailable. Review Admin Health for configuration status.";
  }
  if (httpStatus === 502) {
    return "The fulfillment API is unreachable. Try again in a moment.";
  }
  if (error.length > 220) {
    return `${error.slice(0, 220)}…`;
  }
  return error;
}

export const MODULE_IMPACT_ROWS: { moduleId: AdminModuleId; label: string; requires: string }[] = [
  {
    moduleId: "purchase-orders",
    label: "Purchase orders",
    requires: "Express API origin + Express JWT signing",
  },
  {
    moduleId: "inventory",
    label: "Inventory",
    requires: "Express API origin + Express JWT signing",
  },
  { moduleId: "users", label: "Users", requires: "Express API origin + Express JWT signing" },
  {
    moduleId: "net-terms",
    label: "Net terms",
    requires: "Express API origin + Express JWT signing",
  },
  {
    moduleId: "products",
    label: "Products",
    requires: "Supabase + CatalogOS/import dependencies for URL import",
  },
  { moduleId: "orders", label: "Order records", requires: "Supabase" },
  { moduleId: "customers", label: "Customers", requires: "Supabase" },
  { moduleId: "messages", label: "Messages", requires: "Supabase" },
  { moduleId: "dashboard", label: "Dashboard", requires: "Supabase" },
];

export type AdminHealthShellTone = "success" | "warning" | "critical";

export function getAdminHealthShellDisplay(health: {
  status: AdminHealthStatus;
  severity: AdminHealthSeverity;
  issues: AdminHealthIssue[];
}): { pillLabel: string; pillTone: AdminHealthShellTone; showStrip: boolean } {
  if (health.status === "healthy" && health.issues.length === 0) {
    return { pillLabel: "All systems", pillTone: "success", showStrip: false };
  }
  if (health.severity === "critical" || health.status === "production_blocking") {
    return { pillLabel: "Action required", pillTone: "critical", showStrip: true };
  }
  const count = health.issues.length;
  if (count > 0) {
    return {
      pillLabel: count === 1 ? "1 issue" : `${count} issues`,
      pillTone: "warning",
      showStrip: true,
    };
  }
  return { pillLabel: "Needs setup", pillTone: "warning", showStrip: true };
}
