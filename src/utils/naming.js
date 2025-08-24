export const pathify = (name) => name.split("/").map(s => s.trim()).filter(Boolean).join(".");
export const kebab = (s) => s.trim().replace(/\s+/g, "-").toLowerCase();
