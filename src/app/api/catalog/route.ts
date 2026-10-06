import { catalog } from "@/agent/catalog";

/**
 * GET /api/catalog: everything the desk can do, as data. The journeys it
 * offers, the components a reply may be built from and the calls a plan may
 * make, each with its JSON Schema.
 */
export async function GET() {
  return Response.json(catalog(), { headers: { "Cache-Control": "public, max-age=300" } });
}
