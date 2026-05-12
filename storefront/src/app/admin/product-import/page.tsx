import { redirect } from "next/navigation";

/** Legacy path — canonical import entry is `/admin/products/import`. */
export default function AdminProductImportRedirectPage() {
  redirect("/admin/products/import");
}
