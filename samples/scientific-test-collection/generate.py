"""Generate original schematic test vectors; no external files or network inputs."""
import json
from pathlib import Path
out = Path(__file__).parent

def p(id, d, fill='#dceee7', stroke='#346f61', sw=2):
    return f'<path id="{id}" d="{d}" fill="{fill}" stroke="{stroke}" stroke-width="{sw}" stroke-linecap="round" stroke-linejoin="round"/>'

def e(id, x, y, rx, ry, fill, stroke='#346f61', sw=2):
    return p(id, f'M{x-rx} {y}a{rx} {ry} 0 1 0 {2*rx} 0a{rx} {ry} 0 1 0 {-2*rx} 0Z', fill, stroke, sw)

def g(id, body, transform='translate(0 0)'):
    return f'<g id="{id}" transform="{transform}">{body}</g>'

b = {}
b['mammalian-cell'] = g('cell-body',
    p('plasma-boundary','M28 43C48 10 154 11 196 43C229 70 218 133 174 151C128 170 49 153 25 118C8 94 9 64 28 43Z','#e1f3e9')
    + e('nuclear-envelope',112,83,39,31,'#c8c3ed','#68619c')
    + e('nucleolus',119,83,12,10,'#8c81bd','#68619c')
    + e('mitochondrion-left',55,108,19,10,'#f2be89','#af794b')
    + e('mitochondrion-right',171,62,19,10,'#f2be89','#af794b')
    + p('internal-membranes','M150 110q25-18 39-3M149 119q27-16 40-3M148 128q26-13 40-3','none','#6f9e91',3))
b['cell-nucleus'] = g('nucleus',
    e('outer-envelope',120,88,77,61,'#e5e1f4','#68619c',3)
    + e('inner-envelope',120,88,69,53,'none','#9b91bd')
    + p('chromatin-a','M70 73q17-23 28 1t27 4t25-7t24 9','none','#9183b6',4)
    + p('chromatin-b','M70 110q21-27 36-3t28 7t25-9','none','#b4a0ce',4)
    + e('nucleolus',128,84,21,17,'#a595cb','#76659d')
    + p('nuclear-pores','M53 53l10 9M178 47l-9 10M50 121l12-6M183 122l-11-8','none','#4f4777',6))
b['mitochondrion'] = g('mitochondrion',
    p('outer-membrane','M30 64C46 24 121 23 164 43C213 65 225 114 190 137C153 162 78 151 44 126C19 108 16 86 30 64Z','#f8dfbf','#ad7545',3)
    + p('inner-membrane','M40 70C57 36 119 37 157 53C196 70 210 109 183 128C154 149 84 138 52 117C31 104 30 88 40 70Z','#f5bc84','#bd824d')
    + p('cristae-upper','M52 61q4 38 17 20t12-30M97 44q0 38 14 20t14-15M142 53q-4 33 11 25t15-12','none','#a96937',4)
    + p('cristae-lower','M65 124q1-37 14-20t15 31M116 139q0-41 14-22t17 16M165 133q-5-34 8-26t16 11','none','#a96937',4)
    + e('matrix-granule',113,94,5,5,'#fbecd5','#ad7545'))
b['endoplasmic-reticulum'] = g('reticulum',
    p('cisterna-upper','M32 49Q82 20 124 44T209 40L209 56Q161 78 120 57T32 64Z','#d6e8f6','#547e9c')
    + p('cisterna-middle','M25 80Q79 52 122 78T215 72L215 89Q165 109 119 93T25 96Z','#c3ddf0','#547e9c')
    + p('cisterna-lower','M35 115Q83 91 123 115T204 110L204 129Q159 148 119 131T35 132Z','#aecde4','#547e9c')
    + ''.join(e('ribosome-'+str(i),x,y,3,3,'#8e729e','#705880',1) for i,(x,y) in enumerate([(50,36),(79,31),(109,37),(150,52),(185,47),(48,69),(79,65),(113,72),(163,86),(194,79),(56,105),(90,103),(137,121),(180,122)])))
b['golgi-apparatus'] = g('golgi-stack', ''.join(
    p('cisterna-'+str(i), f'M55 {y}Q118 {y+30} 179 {y}L184 {y+10}Q119 {y+43} 50 {y+10}Z',c,'#a57266')
    for i,(y,c) in enumerate([(34,'#f2d0bd'),(59,'#ebbaa5'),(84,'#dfa38e'),(109,'#cf907d')])))
b['golgi-apparatus'] += g('transport-vesicles', e('vesicle-left',27,68,12,11,'#f1d6bc','#a57266') + e('vesicle-right',209,76,12,11,'#e9b6a0','#a57266') + e('vesicle-bottom',203,132,10,9,'#d79782','#a57266'))
b['plasma-membrane'] = g('lipid-bilayer', ''.join(
    e('head-upper-'+str(i),x,52,8,8,'#8fc8c0','#3f8279')
    + e('head-lower-'+str(i),x,125,8,8,'#8fc8c0','#3f8279')
    + p('tails-'+str(i),f'M{x-3} 61l-2 19l4 12M{x+3} 61l3 18l-2 14M{x-3} 116l-2-15l4-9M{x+3} 116l3-15l-2-8','none','#70998f')
    for i,x in enumerate([25,48,71,94,163,186,209])))
b['plasma-membrane'] += g('membrane-protein', p('transmembrane-protein','M117 39Q105 55 114 74L111 116Q127 139 145 119L141 72Q151 48 137 37Z','#bcb4df','#74669f',3) + p('protein-channel','M127 49L126 115','none','#eee9fa',5))
b['dna-double-helix'] = g('base-pairs', ''.join(p('base-pair-'+str(i),f'M{x1} {y}H{x2}','none','#d9a365' if i%2 else '#8c91b8',4) for i,(y,x1,x2) in enumerate([(24,91,149),(40,101,139),(58,110,130),(77,96,144),(96,84,156),(115,93,147),(134,107,133),(153,101,139)])))
b['dna-double-helix'] += g('dna-backbones', p('strand-a','M83 12C184 51 56 112 151 166','none','#4c9689',7) + p('strand-b','M157 12C56 51 184 112 89 166','none','#7c70ac',7))
b['protein-complex'] = g('protein-subunits',
    p('subunit-alpha','M48 44Q54 14 87 31Q113 18 124 49L112 83Q91 99 66 84L42 70Z','#a9d7c8','#4c8e7d',3)
    + p('subunit-beta','M134 39Q160 20 181 47Q208 50 198 80L174 101Q143 101 129 76Z','#c3b9e4','#7b6b9f',3)
    + p('subunit-gamma','M75 99Q97 80 122 101Q147 80 171 103L180 128Q161 160 126 150Q91 161 69 134Z','#eac49d','#ad855c',3)
    + p('alpha-fold','M60 53q17-16 31 5t19 0','none','#4c8e7d',3)
    + p('beta-fold','M148 52q15 4 26 24','none','#7b6b9f',3)
    + p('gamma-fold','M89 123q34 17 62-3','none','#ad855c',3))
b['protein-complex'] += g('interface',p('binding-interface','M116 58L128 70M112 90L120 99M136 91L130 101','none','#615a4c',3))
b['cell-surface-receptor'] = g('membrane', p('outer-leaflet','M20 94H220','none','#b2d1c5',9) + p('inner-leaflet','M20 111H220','none','#b2d1c5',9))
b['cell-surface-receptor'] += g('receptor',p('extracellular-arms','M91 30V51L120 78L149 51V30','none','#8471ad',12) + p('transmembrane-domain','M120 78V126','none','#5d8f85',14) + p('intracellular-tail','M120 126Q147 132 136 154','none','#c3925c',9) + e('signaling-domain',138,155,12,9,'#e3b581','#a87745'))
b['cell-surface-receptor'] += g('ligand',p('ligand-binding-partner','M109 17L131 17L139 31L131 45H109L101 31Z','#d9a7b9','#a66e84'))
b['lipid-vesicle'] = g('vesicle-shell',e('outer-leaflet',120,88,68,65,'#a9d6cc','#4d9384',3) + e('inner-leaflet',120,88,55,52,'#edf7ef','#7bb2a2',3) + p('lipid-tails','M120 26V36M120 140V150M55 88H65M175 88H185M73 42L82 51M158 124L166 133M74 133L83 124M158 51L167 42','none','#568f7d',3))
b['lipid-vesicle'] += g('luminal-cargo',e('cargo-a',102,77,13,11,'#d9b1d0','#9b7495') + e('cargo-b',139,100,12,10,'#e4bb89','#ac8352') + p('cargo-c','M109 115L119 100L128 117Z','#9cbddc','#6286aa'))
metadata = [
 ('mammalian-cell','Mammalian cell','Cells',['mammalian','eukaryote','cytoplasm','cell'],'Schematic mammalian cell with nucleus, mitochondria and internal membranes.'),
 ('cell-nucleus','Cell nucleus','Organelles',['nucleus','nuclear','chromatin','nucleolus'],'Nuclear envelope, pores, chromatin fibers and nucleolus.'),
 ('mitochondrion','Mitochondrion','Organelles',['mitochondria','ATP','cristae','energy'],'Illustrative cross-section showing mitochondrial membranes and cristae.'),
 ('endoplasmic-reticulum','Endoplasmic reticulum','Organelles',['ER','rough','ribosome','reticulum'],'Folded rough endoplasmic reticulum with ribosome dots.'),
 ('golgi-apparatus','Golgi apparatus','Organelles',['golgi','cisternae','trafficking','secretion'],'Stacked Golgi cisternae and transport vesicles.'),
 ('plasma-membrane','Plasma membrane','Membranes',['bilayer','phospholipid','plasma','membrane'],'Phospholipid bilayer with polar heads, tails and a membrane protein.'),
 ('dna-double-helix','DNA double helix','Molecules',['DNA','helix','nucleic','base','genome'],'Two stylized DNA backbones and base-pair rungs; not an atomic model.'),
 ('protein-complex','Protein complex','Molecules',['protein','complex','subunit','assembly','binding'],'Illustrative multimeric complex with independently colored subunits.'),
 ('cell-surface-receptor','Cell surface receptor','Membranes',['receptor','ligand','signaling','surface','transmembrane'],'Ligand-binding receptor with membrane span and intracellular domain.'),
 ('lipid-vesicle','Lipid vesicle','Membranes',['vesicle','lipid','cargo','transport','bilayer'],'Vesicle cross-section with a bilayer shell and luminal cargo.')]
assets = {}
(out/'svg').mkdir(exist_ok=True)
for slug,title,subcategory,keywords,description in metadata:
    (out/'svg'/(slug+'.svg')).write_text(f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 240 180">\n<title>{title}</title>\n<desc>{description} Conceptual illustration, not to scale.</desc>\n{b[slug]}\n</svg>\n')
    assets[slug+'.svg'] = dict(name=title,subcategory=subcategory,keywords=keywords+['helix-original-test',slug],providerId='helix-test-'+slug,description=description)
manifest = dict(version=1,provider='Helix original test collection',license='CC0-1.0',licenseReference='Original vector illustrations authored locally for Helix test collection, 2026-11-02',attribution='Helix local scientific illustration test collection',defaults=dict(category='Helix original test collection'),assets=assets)
(out/'manifest.json').write_text(json.dumps(manifest,indent=2)+'\n')
print('Created 10 original SVGs and manifest')
