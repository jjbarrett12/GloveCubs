import { redirect } from "next/navigation";

/** Imports live under the Products module. */
export default function AdminImportsRedirectPage() {
  redirect("/admin/products/import");
}
