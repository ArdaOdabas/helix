import React from 'react';
import { builtinIcons } from '../core/icons.ts';

export function IconPreview({ icon }: { icon: { id: string } }) {
    const builtin = builtinIcons.find(i => i.id === icon.id);
    return builtin?.svg
        ? <svg viewBox={builtin.viewBox} dangerouslySetInnerHTML={{ __html: builtin.svg.replace(/<\/?svg[^>]*>/g, '') }}/>
        : <img loading="lazy" decoding="async" src={'/api/icons/' + encodeURIComponent(icon.id) + '?thumbnail=1'} alt=""/>;
}
