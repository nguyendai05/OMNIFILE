import { createSHA256 } from "hash-wasm";
import { throwIfAborted } from "./errors";

export async function sha256Blob(blob: Blob, signal?: AbortSignal): Promise<string> {
  const hasher = await createSHA256();
  hasher.init();
  const reader = blob.stream().getReader();
  try {
    while (true) {
      throwIfAborted(signal);
      const { done, value } = await reader.read();
      if (done) break;
      if (value) hasher.update(value);
    }
  } finally {
    reader.releaseLock();
  }
  return hasher.digest("hex");
}

export async function sha256Bytes(bytes: Uint8Array): Promise<string> {
  const hasher = await createSHA256();
  hasher.init();
  hasher.update(bytes);
  return hasher.digest("hex");
}
