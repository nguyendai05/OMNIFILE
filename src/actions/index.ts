import { registerPlugin } from "@/core/registries";
import { hashAction, metadataAction } from "./common";
import {
  extractPdfImagesAction,
  extractTablesAction,
  extractTextAction,
  mergePdfAction,
  splitPdfAction,
} from "./pdf";
import {
  dropDuplicatesAction,
  exportCsvAction,
  exportXlsxAction,
  fillMissingAction,
  jsonToTableAction,
  mergeTablesAction,
  normalizeHeadersAction,
  profileAction,
  removeEmptyRowsAction,
} from "./table";
import {
  compressImageAction,
  convertWebpAction,
  flipImageAction,
  ocrAction,
  resizeImageAction,
  rotateImageAction,
} from "./image";
import { cleanTextAction, formatJsonAction, minifyJsonAction, toMarkdownAction } from "./text";
import { extractArchiveAction } from "./archive";

let registered = false;

export function registerActions() {
  if (registered) return;
  registered = true;
  registerPlugin({
    id: "omnifile.actions",
    version: "1.0.0",
    label: "Core actions",
    actions: [
      hashAction,
      metadataAction,
      extractTextAction,
      extractTablesAction,
      splitPdfAction,
      mergePdfAction,
      extractPdfImagesAction,
      removeEmptyRowsAction,
      normalizeHeadersAction,
      dropDuplicatesAction,
      fillMissingAction,
      profileAction,
      exportCsvAction,
      exportXlsxAction,
      jsonToTableAction,
      mergeTablesAction,
      rotateImageAction,
      flipImageAction,
      resizeImageAction,
      compressImageAction,
      convertWebpAction,
      ocrAction,
      cleanTextAction,
      toMarkdownAction,
      formatJsonAction,
      minifyJsonAction,
      extractArchiveAction,
    ],
  });
}
