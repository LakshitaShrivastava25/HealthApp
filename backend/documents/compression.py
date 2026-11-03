"""
Server-side image compression for uploaded medical documents.

Text in reports and prescriptions must stay readable, so quality stays
at 83 % and images are never resized below 1920 px on their longest side.
"""

import io
import logging

from PIL import Image

logger = logging.getLogger(__name__)

MAX_DIMENSION = 1920
JPEG_QUALITY = 83

IMAGE_CONTENT_TYPES = {'image/jpeg', 'image/png', 'image/jpg'}


def compress_uploaded_image(file_obj, content_type: str) -> tuple[bytes, str, int, int]:
    """
    Compress an uploaded image file, returning (compressed_bytes,
    new_content_type, original_size, compressed_size).

    Returns the original bytes unchanged if the file is not an image or
    compression would increase the size.
    """
    original_bytes = file_obj.read()
    file_obj.seek(0)
    original_size = len(original_bytes)

    if content_type not in IMAGE_CONTENT_TYPES:
        return original_bytes, content_type, original_size, original_size

    try:
        img = Image.open(io.BytesIO(original_bytes))
    except Exception:
        logger.warning('Could not open image for compression, keeping original')
        return original_bytes, content_type, original_size, original_size

    has_alpha = img.mode in ('RGBA', 'LA', 'PA')

    width, height = img.size
    if width > MAX_DIMENSION or height > MAX_DIMENSION:
        if width >= height:
            new_width = MAX_DIMENSION
            new_height = int(height * MAX_DIMENSION / width)
        else:
            new_height = MAX_DIMENSION
            new_width = int(width * MAX_DIMENSION / height)
        img = img.resize((new_width, new_height), Image.LANCZOS)

    buf = io.BytesIO()
    if has_alpha:
        img.save(buf, format='PNG', optimize=True)
        out_content_type = 'image/png'
    else:
        if img.mode != 'RGB':
            img = img.convert('RGB')
        img.save(buf, format='JPEG', quality=JPEG_QUALITY, optimize=True)
        out_content_type = 'image/jpeg'

    compressed_bytes = buf.getvalue()
    compressed_size = len(compressed_bytes)

    if compressed_size >= original_size:
        return original_bytes, content_type, original_size, original_size

    return compressed_bytes, out_content_type, original_size, compressed_size
