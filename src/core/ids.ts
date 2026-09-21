export type IdPrefix =
  | "fl"
  | "dm"
  | "jb"
  | "pl"
  | "nd"
  | "eg"
  | "op"
  | "ln"
  | "nt"
  | "fd"
  | "tb";

export function makeId(prefix: IdPrefix): string {
  const bytes = new Uint8Array(12);
  crypto.getRandomValues(bytes);
  let hex = "";
  for (const b of bytes) hex += b.toString(16).padStart(2, "0");
  return `${prefix}_${hex}`;
}
