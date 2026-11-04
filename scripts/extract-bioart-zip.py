"""Safely extract SVG members from an official UI-generated per-entry archive."""
import json, pathlib, sys, zipfile
archive, output = map(pathlib.Path, sys.argv[1:3])
output.mkdir(parents=True, exist_ok=True)
with zipfile.ZipFile(archive) as z:
    svg = [i for i in z.infolist() if not i.is_dir() and i.filename.lower().endswith('.svg')]
    if len(svg) > 1000 or sum(i.file_size for i in svg) > 512 * 1024 * 1024:
        raise ValueError('Archive SVG size/count limit exceeded')
    records = []
    for index, info in enumerate(svg):
        name = pathlib.PurePosixPath(info.filename)
        if name.is_absolute() or '..' in name.parts or '\\' in info.filename:
            raise ValueError('Unsafe ZIP member path')
        # Flatten to controlled filenames, retain the official basename separately.
        target = output / (str(index) + '.svg')
        with z.open(info) as source, target.open('wb') as dest:
            while chunk := source.read(1024 * 1024):
                dest.write(chunk)
        records.append({'path': str(target), 'originalFilename': name.name, 'archiveMember': info.filename})
print(json.dumps(records))
