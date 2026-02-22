import type { Metadata } from "next";
import { catalog } from "@/agent/catalog";
import { localDay } from "@/airline/dates";
import { Gallery } from "@/components/Gallery";
import { examples } from "@/widgets/examples";

export const metadata: Metadata = {
  title: "Components",
  description: "Every component the desk can build a reply from, each with a worked example and its schema.",
};

// The examples are dated from today, so the page is made afresh for each
// visit and never shows last month's flights.
export const dynamic = "force-dynamic";

export default function GalleryPage() {
  const now = new Date();
  return <Gallery examples={examples(localDay(now), now)} widgets={catalog().widgets} />;
}
