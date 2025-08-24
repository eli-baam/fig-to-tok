export const pathify = (name: string) =>
  name.split("/").map(s => s.trim()).filter(Boolean).join(".");
export const kebab = (s: string) => s.trim().replace(/\s+/g, "-").toLowerCase();
