// Deterministic hidden child email derived from the parent's email + a
// per-child label. The label lets one parent have multiple children (each
// with their own name/password). Leaving the label empty preserves the
// original single-child derivation for backwards compatibility.
export async function childEmailFor(parentEmail: string, label = ""): Promise<string> {
  const parentNorm = parentEmail.trim().toLowerCase();
  const labelNorm = label.trim().toLowerCase();
  const seed = labelNorm
    ? `trustshield-child:${parentNorm}::${labelNorm}`
    : `trustshield-child:${parentNorm}`;
  const bytes = new TextEncoder().encode(seed);
  const hashBuf = await crypto.subtle.digest("SHA-256", bytes);
  const hex = Array.from(new Uint8Array(hashBuf))
    .slice(0, 8)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  return `ts-child-${hex}@trustshield.family`;
}

// Slugify a child's name for the label used in email derivation.
export function childLabelSlug(label: string): string {
  return label
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 32);
}