// Colour science for the figure engine: every hue is expanded into a coherent tonal family so that
// fills, outlines, highlights and text derived from one accent always agree with each other.

export type RGB = { r: number; g: number; b: number };
export type HSL = { h: number; s: number; l: number };

export function hexToRgb(hex: string): RGB {
    let h = hex.replace('#', '');
    if (h.length === 3 || h.length === 4) h = h.slice(0, 3).split('').map(c => c + c).join('');
    const n = parseInt(h.slice(0, 6), 16);
    return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}
export function rgbToHex({ r, g, b }: RGB) {
    const c = (v: number) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0');
    return `#${c(r)}${c(g)}${c(b)}`;
}
export function rgbToHsl({ r, g, b }: RGB): HSL {
    r /= 255; g /= 255; b /= 255;
    const max = Math.max(r, g, b), min = Math.min(r, g, b), l = (max + min) / 2;
    if (max === min) return { h: 0, s: 0, l };
    const d = max - min, s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    let h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
    return { h: h * 60, s, l };
}
export function hslToRgb({ h, s, l }: HSL): RGB {
    h = ((h % 360) + 360) % 360 / 360;
    if (s === 0) return { r: l * 255, g: l * 255, b: l * 255 };
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s, p = 2 * l - q;
    const f = (t: number) => { t = (t + 1) % 1; return t < 1 / 6 ? p + (q - p) * 6 * t : t < 1 / 2 ? q : t < 2 / 3 ? p + (q - p) * (2 / 3 - t) * 6 : p; };
    return { r: f(h + 1 / 3) * 255, g: f(h) * 255, b: f(h - 1 / 3) * 255 };
}
export const hexToHsl = (hex: string) => rgbToHsl(hexToRgb(hex));
export const hslToHex = (hsl: HSL) => rgbToHex(hslToRgb(hsl));
const clamp = (v: number, a = 0, b = 1) => Math.max(a, Math.min(b, v));

export function mix(a: string, b: string, t: number) {
    const x = hexToRgb(a), y = hexToRgb(b);
    return rgbToHex({ r: x.r + (y.r - x.r) * t, g: x.g + (y.g - x.g) * t, b: x.b + (y.b - x.b) * t });
}
export function shade(hex: string, dl: number, ds = 0) {
    const c = hexToHsl(hex);
    return hslToHex({ h: c.h, s: clamp(c.s + ds), l: clamp(c.l + dl) });
}
export function withLightness(hex: string, l: number, s?: number) {
    const c = hexToHsl(hex);
    return hslToHex({ h: c.h, s: s ?? c.s, l });
}
export function luminance(hex: string) {
    const { r, g, b } = hexToRgb(hex);
    const f = (v: number) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
    return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}

/** A tonal family derived from one base colour. */
export type Tone = {
    base: string;      // the main fill
    light: string;     // gradient highlight / large-area fill
    pale: string;      // background washes
    stroke: string;    // outlines
    dark: string;      // deep accents, text on pale backgrounds
    shadow: string;    // gradient shadow side
};
export function tone(base: string): Tone {
    const c = hexToHsl(base);
    const s = c.s;
    return {
        base,
        light: hslToHex({ h: c.h, s: clamp(s * 0.95), l: clamp(c.l + (1 - c.l) * 0.55) }),
        pale: hslToHex({ h: c.h, s: clamp(s * 0.7), l: 0.955 }),
        stroke: hslToHex({ h: c.h, s: clamp(s * 0.85 + 0.05), l: clamp(c.l * 0.62) }),
        dark: hslToHex({ h: c.h, s: clamp(s * 0.8 + 0.05), l: clamp(Math.min(0.3, c.l * 0.45)) }),
        shadow: hslToHex({ h: c.h, s: clamp(s * 1.02), l: clamp(c.l * 0.86) }),
    };
}

/** Curated base colours. Mid-lightness, moderately saturated: the "illustration pastel" look. */
export const HUES: Record<string, string> = {
    blue: '#6EA6E0',
    sky: '#7CC6EE',
    navy: '#4E6FA8',
    teal: '#4FBFB0',
    cyan: '#5BC8D6',
    green: '#86C77A',
    lime: '#B5D66B',
    olive: '#A3A85A',
    yellow: '#F5CF5C',
    gold: '#E8B54A',
    orange: '#F2A15A',
    coral: '#F08A76',
    red: '#E3645E',
    crimson: '#C9475A',
    pink: '#EE90B8',
    magenta: '#D16BB0',
    purple: '#9C83D4',
    lavender: '#B9A6E6',
    indigo: '#6C74C9',
    brown: '#C0956A',
    tan: '#D9BC92',
    gray: '#AEB6C1',
    slate: '#7D8896',
    peach: '#F6B89A',
    flesh: '#F3C3A8',
    white: '#F4F6F8',
};

export function resolveColor(c: string | undefined, fallback: string): string {
    if (!c) return fallback;
    if (c.startsWith('#')) return c.length === 4 || c.length === 7 ? c : fallback;
    return HUES[c.toLowerCase()] ?? fallback;
}
