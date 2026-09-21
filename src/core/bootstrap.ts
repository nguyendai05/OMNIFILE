import { registerParsers } from "@/parsers";
import { registerActions } from "@/actions";
import { registerExporters } from "@/exporters";

let ready = false;

export function bootstrapRegistries() {
  if (ready) return;
  ready = true;
  registerParsers();
  registerActions();
  registerExporters();
}
