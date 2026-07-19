import { redirect } from "next/navigation";

/**
 * Kept as a compatibility redirect for old admin bookmarks. Delivery is now
 * configured as a PAN-India policy; there is no editable city/PIN allow-list
 * or unsupported-area demand queue.
 */
export default function LegacyServiceAreasPage() {
  redirect("/admin");
}
