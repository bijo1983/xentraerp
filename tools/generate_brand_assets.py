#!/usr/bin/env python3
"""Generate resized logo and favicon assets from the brand artwork.

This script avoids external dependencies so it can run in restricted
environments. It implements a minimal PNG decoder/encoder that supports
24-bit (RGB) and 32-bit (RGBA) images with the standard PNG filters, then
performs bilinear interpolation to resize the source image to the required
square dimensions. The outputs include PNG assets for the application and a
multi-size ICO file suitable for favicons. A baked-in base64 copy of the
official artwork is provided so the script can run without needing the user
upload that originally seeded the assets, but a different source image can be
supplied via the ``--source`` flag when regeneration is required. The CLI can
also bundle the generated files into a ZIP archive for manual distribution.
"""
from __future__ import annotations

import argparse
import base64
import math
import struct
import zipfile
import zlib
from dataclasses import dataclass
from pathlib import Path
from typing import List

from brand_image_base64 import BRAND_IMAGE_BASE64

PNG_SIGNATURE = b"\x89PNG\r\n\x1a\n"


@dataclass
class PngImage:
    width: int
    height: int
    rows: List[bytearray]  # RGBA rows


class PngError(RuntimeError):
    pass


def _read_chunks(data: bytes):
    idx = 8  # skip signature
    while idx < len(data):
        length = struct.unpack_from(">I", data, idx)[0]
        idx += 4
        chunk_type = data[idx : idx + 4]
        idx += 4
        chunk_data = data[idx : idx + length]
        idx += length
        idx += 4  # skip CRC
        yield chunk_type, chunk_data
        if chunk_type == b"IEND":
            break


def decode_png(raw: bytes) -> PngImage:
    if not raw.startswith(PNG_SIGNATURE):
        raise PngError("Not a PNG file")

    width = height = bit_depth = color_type = None
    idat = bytearray()

    for chunk_type, chunk_data in _read_chunks(raw):
        if chunk_type == b"IHDR":
            width, height, bit_depth, color_type, _, _, _ = struct.unpack(
                ">IIBBBBB", chunk_data
            )
        elif chunk_type == b"IDAT":
            idat.extend(chunk_data)
        elif chunk_type == b"IEND":
            break

    if width is None or height is None:
        raise PngError("Missing IHDR chunk")
    if bit_depth != 8 or color_type not in (2, 6):
        raise PngError("Unsupported PNG format")

    decompressed = zlib.decompress(bytes(idat))
    bytes_per_pixel = 4 if color_type == 6 else 3
    stride = width * bytes_per_pixel
    rows: List[bytearray] = []
    prev = bytearray(stride)
    idx = 0

    for _ in range(height):
        filter_type = decompressed[idx]
        idx += 1
        scan = bytearray(decompressed[idx : idx + stride])
        idx += stride

        if filter_type == 1:  # Sub
            for i in range(bytes_per_pixel, stride):
                scan[i] = (scan[i] + scan[i - bytes_per_pixel]) & 0xFF
        elif filter_type == 2:  # Up
            for i in range(stride):
                scan[i] = (scan[i] + prev[i]) & 0xFF
        elif filter_type == 3:  # Average
            for i in range(stride):
                left = scan[i - bytes_per_pixel] if i >= bytes_per_pixel else 0
                up = prev[i]
                scan[i] = (scan[i] + ((left + up) // 2)) & 0xFF
        elif filter_type == 4:  # Paeth
            for i in range(stride):
                left = scan[i - bytes_per_pixel] if i >= bytes_per_pixel else 0
                up = prev[i]
                upleft = prev[i - bytes_per_pixel] if i >= bytes_per_pixel else 0
                p = left + up - upleft
                pa = abs(p - left)
                pb = abs(p - up)
                pc = abs(p - upleft)
                if pa <= pb and pa <= pc:
                    predictor = left
                elif pb <= pc:
                    predictor = up
                else:
                    predictor = upleft
                scan[i] = (scan[i] + predictor) & 0xFF
        elif filter_type != 0:
            raise PngError(f"Unsupported PNG filter: {filter_type}")

        if color_type == 6:
            rows.append(scan)
        else:
            rgba = bytearray()
            for i in range(0, len(scan), 3):
                rgba.extend(scan[i : i + 3])
                rgba.append(255)
            rows.append(rgba)
        prev = scan

    return PngImage(width, height, rows)


def load_png(path: Path) -> PngImage:
    return decode_png(path.read_bytes())


def save_png(path: Path, image: PngImage) -> None:
    def chunk(chunk_type: bytes, payload: bytes) -> bytes:
        length = struct.pack(">I", len(payload))
        crc = zlib.crc32(chunk_type)
        crc = zlib.crc32(payload, crc) & 0xFFFFFFFF
        return length + chunk_type + payload + struct.pack(">I", crc)

    raw = bytearray()
    for row in image.rows:
        raw.append(0)
        raw.extend(row)

    payload = zlib.compress(bytes(raw), level=9)
    with path.open("wb") as f:
        f.write(PNG_SIGNATURE)
        ihdr = struct.pack(">IIBBBBB", image.width, image.height, 8, 6, 0, 0, 0)
        f.write(chunk(b"IHDR", ihdr))
        f.write(chunk(b"IDAT", payload))
        f.write(chunk(b"IEND", b""))


def resize_bilinear(image: PngImage, size: int) -> PngImage:
    src_w, src_h = image.width, image.height
    dst_rows = [bytearray(size * 4) for _ in range(size)]

    for y in range(size):
        sy = (y + 0.5) * src_h / size - 0.5
        sy = min(max(sy, 0.0), src_h - 1.0)
        y0 = int(math.floor(sy))
        y1 = min(y0 + 1, src_h - 1)
        wy1 = sy - y0
        wy0 = 1.0 - wy1
        row0 = image.rows[y0]
        row1 = image.rows[y1]

        for x in range(size):
            sx = (x + 0.5) * src_w / size - 0.5
            sx = min(max(sx, 0.0), src_w - 1.0)
            x0 = int(math.floor(sx))
            x1 = min(x0 + 1, src_w - 1)
            wx1 = sx - x0
            wx0 = 1.0 - wx1

            for c in range(4):
                p00 = row0[x0 * 4 + c]
                p10 = row0[x1 * 4 + c]
                p01 = row1[x0 * 4 + c]
                p11 = row1[x1 * 4 + c]
                v0 = p00 * wx0 + p10 * wx1
                v1 = p01 * wx0 + p11 * wx1
                value = v0 * wy0 + v1 * wy1
                dst_rows[y][x * 4 + c] = int(round(value))

    return PngImage(size, size, dst_rows)


def _ico_entry(size: int, data: bytes, offset: int) -> bytes:
    width = size if size < 256 else 0
    height = size if size < 256 else 0
    return struct.pack(
        "<BBBBHHII",
        width,
        height,
        0,  # palette
        0,
        1,
        32,
        len(data),
        offset,
    )


def _encode_ico(images: list[PngImage]) -> bytes:
    entries = []
    image_datas = []
    offset = 6 + 16 * len(images)

    for image in images:
        size = image.width
        row_stride = ((size * 32 + 31) // 32) * 4
        pixel_data = bytearray()
        for row in reversed(image.rows):
            for x in range(size):
                idx = x * 4
                r = row[idx]
                g = row[idx + 1]
                b = row[idx + 2]
                a = row[idx + 3]
                pixel_data.extend((b, g, r, a))
            pad = row_stride - size * 4
            if pad:
                pixel_data.extend(b"\x00" * pad)

        # AND mask (1 bit per pixel, padded to 32 bits per row)
        mask_stride = ((size + 31) // 32) * 4
        and_mask = b"\x00" * (mask_stride * size)

        header = struct.pack("<IIIHHIIII", 40, size, size * 2, 1, 32, 0, len(pixel_data) + len(and_mask), 0, 0)
        image_blob = header + pixel_data + and_mask
        entries.append(_ico_entry(size, image_blob, offset))
        image_datas.append(image_blob)
        offset += len(image_blob)

    header = struct.pack("<HHH", 0, 1, len(images))
    return header + b"".join(entries) + b"".join(image_datas)


def _load_source(source_path: Path | None) -> PngImage:
    if source_path is not None:
        return load_png(source_path)

    data = base64.b64decode("".join(BRAND_IMAGE_BASE64))
    return decode_png(data)


def generate_assets(
    source_path: Path | None = None,
    output_dir: Path | None = None,
    archive_path: Path | None = None,
) -> None:
    project_root = Path(__file__).resolve().parents[1]
    original = _load_source(source_path)

    public_dir = (output_dir or (project_root / "public" / "brand")).resolve()
    public_dir.mkdir(parents=True, exist_ok=True)

    targets = {
        "logo-1024.png": 1024,
        "logo-512.png": 512,
        "logo-256.png": 256,
        "logo-192.png": 192,
        "apple-touch-icon-180.png": 180,
        "favicon-48.png": 48,
        "favicon-32.png": 32,
        "favicon-16.png": 16,
    }

    generated: list[PngImage] = []
    written: list[Path] = []
    for filename, size in targets.items():
        resized = resize_bilinear(original, size)
        out_path = public_dir / filename
        save_png(out_path, resized)
        written.append(out_path)
        if size in (16, 32, 48):
            generated.append(resized)

    ico_bytes = _encode_ico(generated)
    ico_path = public_dir / "favicon.ico"
    ico_path.write_bytes(ico_bytes)
    written.append(ico_path)

    # Store the original in the source assets directory for reuse in the app
    asset_dir = project_root / "src" / "assets" / "logos"
    asset_dir.mkdir(parents=True, exist_ok=True)
    save_png(asset_dir / "train-play-compete.png", original)

    if archive_path is not None:
        archive_path = archive_path.resolve()
        archive_path.parent.mkdir(parents=True, exist_ok=True)
        with zipfile.ZipFile(archive_path, "w", compression=zipfile.ZIP_DEFLATED) as archive:
            for path in written:
                archive.write(path, arcname=path.name)


def main() -> None:
    parser = argparse.ArgumentParser(description="Generate brand assets from the logo artwork.")
    parser.add_argument(
        "--source",
        type=Path,
        help="Optional path to a PNG file. When omitted the baked-in artwork is used.",
    )
    parser.add_argument(
        "--output-dir",
        type=Path,
        help="Directory to write the PNG/ICO assets (defaults to public/brand).",
    )
    parser.add_argument(
        "--archive",
        type=Path,
        help="Optional path to a ZIP file bundling the generated assets for manual download.",
    )
    args = parser.parse_args()

    generate_assets(args.source, args.output_dir, args.archive)


if __name__ == "__main__":
    main()
