import type { Href } from "expo-router";
import { Link } from "expo-router";

// "/scan" only exists as a route on native (scan.native.tsx has no web
// counterpart yet), so it's outside the generated cross-platform Href union.
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
