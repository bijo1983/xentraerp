badmintonbooking_Updated
========================

## Brand assets

`index.html` expects the favicon and logo PNGs to exist under
`public/brand`. The repository keeps that directory empty (aside from a
`.gitkeep`) so binary assets do not end up in version control. Generate the
files locally with:

```
python tools/generate_brand_assets.py
```

The command above writes the resized PNGs plus a multi-size `favicon.ico`
directly to `public/brand`. To regenerate the set from a different square PNG,
provide the source path:

```
python tools/generate_brand_assets.py --source /path/to/new_logo.png
```

If you need a single archive to download or share, supply the optional
`--archive` flag. For example, this creates `tools/downloads/brand-assets.zip`
alongside the individual files:

```
python tools/generate_brand_assets.py --archive tools/downloads/brand-assets.zip
```
