// Approximate Arial/Helvetica advance widths, used so the layout engine can wrap text and reserve
// the right height before anything is drawn. Browser-measured bounds from analyze_figure_layout
// remain authoritative; this only has to be close enough to choose line breaks.
const NARROW = "ijlt.,:;'`|!/\\()[]{}fr ";
const WIDE = 'mwMW@%';
const UPPER = /[A-ZÀ-ÞĞİŞÇÖÜ]/;

/** Advance width of one character as a fraction of the font size. */
function advance(character: string) {
    if (character === ' ') return 0.278;
    if (character === 'i' || character === 'l' || character === 'I' || character === 'j') return 0.23;
    if (NARROW.includes(character)) return 0.3;
    if (WIDE.includes(character)) return 0.84;
    if (character >= '0' && character <= '9') return 0.556;
    if (UPPER.test(character)) return 0.695;
    // Slightly generous, so wrapped text never renders wider than the box it was measured for.
    return 0.545;
}

export function measureText(text: string, fontSize: number) {
    let total = 0;
    for (const character of text) total += advance(character);
    return total * fontSize;
}

export const LINE_HEIGHT = 1.3;

/** Greedy word wrap. Words longer than maxWidth are kept whole rather than broken mid-token. */
export function wrapText(text: string, fontSize: number, maxWidth: number): string[] {
    const lines: string[] = [];
    for (const paragraph of text.split('\n')) {
        let line = '';
        for (const word of paragraph.split(/\s+/).filter(Boolean)) {
            const candidate = line ? `${line} ${word}` : word;
            if (line && measureText(candidate, fontSize) > maxWidth) { lines.push(line); line = word; }
            else line = candidate;
        }
        lines.push(line);
    }
    return lines.length ? lines : [''];
}

/** Wrapped text as a single value for a text node, plus the height it will occupy. */
export function layoutText(text: string, fontSize: number, maxWidth: number) {
    const lines = wrapText(text, fontSize, maxWidth);
    return {
        text: lines.join('\n'),
        lines: lines.length,
        width: Math.min(maxWidth, Math.max(...lines.map(line => measureText(line, fontSize)))),
        height: fontSize * (1 + (lines.length - 1) * LINE_HEIGHT) * 1.08,
    };
}
