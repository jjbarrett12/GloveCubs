import { redirect } from "next/navigation";

/** Legacy path — canonical Imports module is `/admin/imports`. */
export default function AdminProductImportRedirectPage() {
  redirect("/admin/imports");
}
