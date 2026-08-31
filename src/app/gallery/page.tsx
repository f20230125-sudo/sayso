import type { Metadata } from "next";
import { catalog } from "@/agent/catalog";
import { localDay } from "@/airline/dates";
import { Gallery } from "@/components/Gallery";
import { examples } from "@/widgets/examples";

const DESCRIPTION = "Every component the desk can build a reply from, each with a worked example and its schema.";

export const metadata: Metadata = {
  title: "Components",
  description: DESCRIPTION,
  // A page's own openGraph replaces the site's, so it names its own title and description.
  openGraph: { title: "Components · Sayso", description: DESCRIPTION, type: "website", siteName: "Sayso" },
  twitter: { card: "summary_large_image", title: "Components · Sayso", description: DESCRIPTION },
};

// The examples are dated from today, so the page is made afresh for each
// visit and never shows last month's flights.
export const dynamic = "force-dynamic";

export default function GalleryPage() {
  const now = new Date();
  // The schemas are handed to the browser as plain data, which is all they are.
  const widgets = JSON.parse(JSON.stringify(catalog().widgets)) as ReturnType<typeof catalog>["widgets"];
  return <Gallery examples={examples(localDay(now), now)} widgets={widgets} />;
}
