// Style harmonization: remaps an imported illustration's own colours onto one figure hue while keeping
// its internal lightness order, so assets drawn by different providers read as a single set.
// Only colours are changed; geometry, structure and licensing metadata are untouched, and the result is
// an ordinary colorMap the user can still edit or clear.
const NAMED: Record<string, string> = {
    black: '#000000', white: '#ffffff', gray: '#808080', grey: '#808080', silver: '#c0c0c0',
    red: '#ff0000', green: '#008000', blue: '#0000ff', yellow: '#ffff00', orange: '#ffa500',
    purple: '#800080', brown: '#a52a2a', pink: '#ffc0cb', cyan: '#00ffff', magenta: '#ff00ff',
};
const SKIP = /^(none|inherit|transparent|currentcolor|url\()/i;

export type Hsl = { h: number; s: number; l: number };

export function parseColor(value: string): { hex: string } & Hsl | null {
    const raw = value.trim().toLowerCase();
    if (SKIP.test(raw)) return null;
    let hex = NAMED[raw] ?? raw;
    const match = /^#([0-9a-f]{3,8})$/.exec(hex);
    if (!match) return null;
    let digits = match[1];
    if (digits.length === 3 || digits.length === 4) digits = [...digits.slice(0, 3)].map(c => c + c).join('');
    else if (digits.length === 8) digits = digits.slice(0, 6);
    else if (digits.length !== 6) return null;
    const r = parseInt(digits.slice(0, 2), 16) / 255, g = parseInt(digits.slice(2, 4), 16) / 255, b = parseInt(digits.slice(4, 6), 16) / 255;
    const max = Math.max(r, g, b), min = Math.min(r, g, b), l = (max + min) / 2, d = max - min;
    let h = 0, s = 0;
    if (d > 1e-6) {
        s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
        h = max === r ? ((g - b) / d + (g < b ? 6 : 0)) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
        h *= 60;
    }
    return { hex: `#${digits}`, h, s, l };
}

export function toHex({ h, s, l }: Hsl) {
    const c = (1 - Math.abs(2 * l - 1)) * s, x = c * (1 - Math.abs(((h / 60) % 2) - 1)), m = l - c / 2;
    const [r, g, b] = h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x] : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x];
    const channel = (v: number) => Math.round(Math.min(1, Math.max(0, v + m)) * 255).toString(16).padStart(2, '0');
    return `#${channel(r)}${channel(g)}${channel(b)}`;
}

const PAINT = /\b(?:fill|stroke|stop-color|color)="([^"]*)"/g;

/** Distinct paint values in an asset, with how often each is used. */
export function extractAssetPalette(svg: string) {
    const counts = new Map<string, number>();
    for (const [, value] of svg.matchAll(PAINT)) counts.set(value, (counts.get(value) ?? 0) + 1);
    return [...counts].flatMap(([value, count]) => {
        const parsed = parseColor(value);
        return parsed ? [{ value, count, ...parsed }] : [];
    }).sort((a, b) => a.l - b.l);
}

export type HarmonizeOptions = {
    /** Lightest and darkest the remapped ramp may become. */
    darkest?: number;
    lightest?: number;
    /** Keep near-white as highlight and near-black as outline instead of pulling them into the ramp. */
    preserveExtremes?: boolean;
    /** 0 keeps the asset fully neutral in the target hue, 1 follows its own saturation closely. */
    saturation?: number;
};

/**
 * Builds a colorMap that moves every paint value of `svg` into the hue of `target`.
 * Relative lightness order is preserved, so internal structure stays readable.
 */
export function harmonizeColorMap(svg: string, target: string, options: HarmonizeOptions = {}): Record<string, string> {
    const goal = parseColor(target);
    if (!goal) throw new Error(`Target colour must be a hex value, got ${target}`);
    const { darkest = 0.24, lightest = 0.82, preserveExtremes = true, saturation = 0.85 } = options;
    const palette = extractAssetPalette(svg);
    if (!palette.length) return {};

    const isHighlight = (l: number) => preserveExtremes && l >= 0.93;
    const isOutline = (l: number) => preserveExtremes && l <= 0.16;
    const ramped = palette.filter(c => !isHighlight(c.l) && !isOutline(c.l));
    const low = ramped.length ? Math.min(...ramped.map(c => c.l)) : 0;
    const high = ramped.length ? Math.max(...ramped.map(c => c.l)) : 1;
    const spread = high - low;

    const map: Record<string, string> = {};
    for (const colour of palette) {
        let next: Hsl;
        if (isHighlight(colour.l)) next = { h: goal.h, s: Math.min(goal.s * 0.14, 0.18), l: 0.965 };
        else if (isOutline(colour.l)) next = { h: goal.h, s: Math.min(goal.s * 0.42, 0.4), l: 0.19 };
        else {
            // Single-colour assets (silhouettes) have no spread to preserve; place them mid-ramp.
            const position = spread > 0.02 ? (colour.l - low) / spread : 0.55;
            const neutral = colour.s < 0.08 ? 0.3 : 1;
            next = {
                h: goal.h,
                s: Math.max(0.05, Math.min(0.92, goal.s * saturation * neutral * (0.6 + 0.4 * Math.min(1, colour.s * 2)))),
                l: darkest + position * (lightest - darkest),
            };
        }
        const hex = toHex(next);
        if (hex !== colour.hex || colour.value !== colour.hex) map[colour.value] = hex;
    }
    return map;
}
