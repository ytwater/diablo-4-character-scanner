import type { Href } from "expo-router";
import { Link } from "expo-router";

// "/scan" isn't in the generated cross-platform Href union (see
// scan-link.native.tsx for the same issue on native).
const SCAN_HREF = "/scan" as Href;

export function ScanLink() {
  return (
    <Link
      href={SCAN_HREF}
      className="py-2 text-center"
      style={{ color: "#ec4899" }}
    >
      Scan character sheet
    </Link>
  );
}
