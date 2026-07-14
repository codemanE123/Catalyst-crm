import { z } from "zod";

export type OutputSchemaDefinition = {
  version: string;
  prompt_key: string;
  description: string;
  schema: z.ZodTypeAny;
};

export type SchemaValidationResult =
  | { ok: true; data: unknown }
  | { ok: false; error: string; issues: string[] };
