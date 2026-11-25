import Ajv2020 from "ajv/dist/2020.js";
import addFormats from "ajv-formats";
import schema from "../generated/demo-overview.schema.json";
import type { components } from "../generated/api";

export type DemoOverview = components["schemas"]["DemoOverview"];
const ajv = new Ajv2020({ allErrors: true });
addFormats(ajv);
const validate = ajv.compile<DemoOverview>(schema);

export function parseOverview(value: unknown): DemoOverview {
  if (!validate(value)) throw new Error("Incompatible overview contract");
  return value;
}
