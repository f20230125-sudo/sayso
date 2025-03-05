import { z } from "zod";
import { WIDGETS, type WidgetType } from "@/widgets/specs";
import type { Json } from "./reference";
import { TOOLS } from "./tools";
import { JOURNEY_NAMES, type JourneyName, type ToolName } from "./types";

// Everything the desk is able to do, as data: the journeys it offers, the
// components a reply may be built from, and the calls a plan may make. The
// schemas are written out as JSON Schema straight from the Zod definitions
// the code itself checks against, so this list cannot say one thing while the
// code does another.

function jsonSchema(schema: z.ZodType): Json {
  // A few checks, such as "is a real calendar date", have no JSON Schema form. They are left out, not guessed at.
  return z.toJSONSchema(schema, { unrepresentable: "any" }) as Json;
}

export type Catalog = {
  journeys: { name: JourneyName; title: string }[];
  widgets: { type: WidgetType; title: string; description: string; props: Json; answer: Json | null }[];
  tools: { name: ToolName; description: string; args: Json }[];
};

export function catalog(): Catalog {
  return {
    journeys: (Object.keys(JOURNEY_NAMES) as JourneyName[]).map((name) => ({ name, title: JOURNEY_NAMES[name] })),
    widgets: (Object.keys(WIDGETS) as WidgetType[]).map((type) => {
      const spec = WIDGETS[type];
      return { type, title: spec.title, description: spec.description, props: jsonSchema(spec.props), answer: spec.answer ? jsonSchema(spec.answer) : null };
    }),
    tools: (Object.keys(TOOLS) as ToolName[]).map((name) => ({ name, description: TOOLS[name].description, args: jsonSchema(TOOLS[name].args) })),
  };
}
