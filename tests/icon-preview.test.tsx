import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { builtinIcons } from '../src/core/icons.ts';
import { IconPreview } from '../src/ui/IconPreview.tsx';

describe('catalog icon previews', () => {
    it.each(builtinIcons)('renders builtin $id from metadata without inline SVG', ({ svg, ...metadata }) => {
        const markup = renderToStaticMarkup(<IconPreview icon={metadata}/>);
        expect(markup).toBe(svg.replace(' xmlns="http://www.w3.org/2000/svg"', ''));
        expect(markup).not.toContain('<img');
    });

    it('uses the image endpoint for non-builtin metadata', () => {
        const markup = renderToStaticMarkup(<IconPreview icon={{ id: 'imported/icon' }}/>);
        expect(markup).toContain('src="/api/icons/imported%2Ficon?thumbnail=1"');
        expect(markup).not.toContain('<svg');
    });
});
