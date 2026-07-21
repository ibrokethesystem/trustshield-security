// Deterministic hidden child email derived from the parent's email.
// Lets a child sign in using only the parent's email + a password the parent chose.
export async function childEmailFor(parentEmail: string): Promise<string> {
  const norm = parentEmail.trim().toLowerCase();
  const bytes = new TextEncoder().encode(`trustshield-child:${norm}`);
  const hashBuf = await crypto.subtle.digest("SHA-256", bytes);
  const hex = Array.from(new Uint8Array(hashBuf))
    .slice(0, 8)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  return `ts-child-${hex}@trustshield.family`;
}