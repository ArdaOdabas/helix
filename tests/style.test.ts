import { describe, it } from 'vitest';
import assert from 'node:assert/strict';
import { harmonizeColorMap, extractAssetPalette, parseColor, toHex } from '../src/core/style.ts';

const asset = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10">
    <path fill="#ffffff" d="M0 0h1v1H0z"/>
    <path fill="#d94f3d" stroke="#111111" d="M1 1h1v1H1z"/>
    <path fill="#f3b8ae" d="M2 2h1v1H2z"/>
    <circle fill="none" stroke="currentColor" r="1"/>
    <rect fill="url(#grad)"/>
</svg>`;

describe('style harmonization', () => {
    it('reads only the real paint values, skipping none, gradients and currentColor', () => {
        assert.deepEqual(extractAssetPalette(asset).map(c => c.value), ['#111111', '#d94f3d', '#f3b8ae', '#ffffff']);
    });

    it('moves every colour into the target hue', () => {
        const map = harmonizeColorMap(asset, '#2f6f5e');
        const targetHue = parseColor('#2f6f5e')!.h;
        for (const value of Object.values(map)) {
            const colour = parseColor(value)!;
            // 8-bit hex quantisation shifts the hue slightly, more so at low saturation.
            if (colour.s > 0.1) assert.ok(Math.abs(colour.h - targetHue) < 8, `${value} kept a foreign hue`);
        }
        assert.ok(!('none' in map) && !('currentColor' in map) && !('url(#grad)' in map));
    });

    it('preserves lightness order so internal structure stays readable', () => {
        const map = harmonizeColorMap(asset, '#2f6f5e');
        const light = (v: string) => parseColor(map[v] ?? v)!.l;
        assert.ok(light('#111111') < light('#d94f3d'), 'outline must stay darker than the body');
        assert.ok(light('#d94f3d') < light('#f3b8ae'), 'body must stay darker than the highlight');
        assert.ok(light('#f3b8ae') < light('#ffffff'));
    });

    it('keeps near-white highlights and near-black outlines at the extremes', () => {
        const map = harmonizeColorMap(asset, '#2f6f5e');
        assert.ok(parseColor(map['#ffffff'])!.l > 0.9);
        assert.ok(parseColor(map['#111111'])!.l < 0.25);
    });

    it('places a single-colour silhouette mid-ramp instead of dividing by zero', () => {
        const map = harmonizeColorMap('<svg><path fill="#444444"/></svg>', '#8c7fbe');
        const colour = parseColor(map['#444444'])!;
        assert.ok(colour.l > 0.3 && colour.l < 0.8, `unexpected lightness ${colour.l}`);
    });

    it('round-trips hex through HSL and rejects a non-colour target', () => {
        assert.equal(toHex(parseColor('#3f9d7a')!), '#3f9d7a');
        assert.throws(() => harmonizeColorMap(asset, 'teal-ish'));
    });
});
