import { redirect } from "next/navigation";

/**
 * Find My Glove: permanent alias to the glove-finder experience (no client flash).
 */
export default function FindMyGlovePage() {
  redirect("/glove-finder");
}
