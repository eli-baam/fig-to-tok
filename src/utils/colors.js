export const toHexByte = (n) => {
    const v = Math.round(n * 255);
    return v.toString(16).padStart(2, "0");
};
export const rgbaToHex = (c) => `#${toHexByte(c.r)}${toHexByte(c.g)}${toHexByte(c.b)}${c.a < 1 ? toHexByte(c.a) : ""}`;
