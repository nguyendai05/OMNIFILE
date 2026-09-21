import { registerPlugin } from "@/core/registries";
import { pdfParser } from "./pdf";
import { csvParser, xlsxParser } from "./spreadsheet";
import { textParser } from "./text";
import { imageParser } from "./image";
import { gzipParser, zipParser } from "./archive";
import { jsonParser, xmlParser, yamlParser } from "./structured";
import { binaryParser } from "./binary";
import { audioParser, videoParser } from "./media";
import { docxParser, pptxParser } from "./office";

let registered = false;

export function registerParsers() {
  if (registered) return;
  registered = true;
  registerPlugin({
    id: "omnifile.parsers",
    version: "1.0.0",
    label: "Core parsers",
    parsers: [
      pdfParser,
      csvParser,
      xlsxParser,
      textParser,
      imageParser,
      zipParser,
      gzipParser,
      jsonParser,
      yamlParser,
      xmlParser,
      binaryParser,
      audioParser,
      videoParser,
      docxParser,
      pptxParser,
    ],
  });
}
