export type OmniErrorCode =
  | "UnsupportedFormat"
  | "ParserFailure"
  | "OutOfMemory"
  | "PermissionDenied"
  | "ResourceLimit"
  | "CorruptedFile"
  | "Cancelled"
  | "ExportFailure"
  | "InvalidConnection"
  | "ActionUnavailable"
  | "StorageFailure"
  | "NotFound";

export class OmniError extends Error {
  readonly code: OmniErrorCode;
  readonly causeError?: unknown;
  readonly details?: Record<string, unknown>;

  constructor(
    code: OmniErrorCode,
    message: string,
    opts?: { cause?: unknown; details?: Record<string, unknown> },
  ) {
    super(message);
    this.name = "OmniError";
    this.code = code;
    this.causeError = opts?.cause;
    this.details = opts?.details;
  }
}

export function isCancelled(err: unknown): boolean {
  if (err instanceof OmniError && err.code === "Cancelled") return true;
  if (err instanceof DOMException && err.name === "AbortError") return true;
  return false;
}

export function errorMessage(err: unknown): string {
  if (err instanceof OmniError) return err.message;
  if (err instanceof Error) return err.message;
  if (typeof err === "string") return err;
  return "Lỗi không xác định";
}

export function throwIfAborted(signal?: AbortSignal) {
  if (signal?.aborted) {
    throw new OmniError("Cancelled", "Đã hủy thao tác");
  }
}
