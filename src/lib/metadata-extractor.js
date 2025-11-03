// src/lib/metadata-extractor.js
// Comprehensive image metadata extraction following EXIF/MediaInfo standards
// Used by: upload.js, backfill scripts, metadata sync jobs

/**
 * Extract complete metadata from image buffer
 * @param {ArrayBuffer} buffer - Image file buffer
 * @param {string} mimeType - MIME type (image/jpeg, image/png, etc.)
 * @param {string} filename - Original filename
 * @returns {Object} Complete metadata object
 */
export function extractImageMetadata(buffer, mimeType, filename = '') {
  const metadata = {
    // Basic technical data
    width: null,
    height: null,
    format: getFormatFromMime(mimeType),
    mimeType: mimeType,
    
    // Color and depth
    colorSpace: null,
    bitDepth: null,
    hasAlpha: false,
    
    // Animation
    isAnimated: false,
    frameCount: 1,
    
    // Orientation
    orientation: 1,
    
    // Computed
    aspectRatio: null,
    
    // EXIF (if available)
    dateTaken: null,
    exifData: null,
    
    // DPI
    dpiX: null,
    dpiY: null
  };
  
  try {
    const view = new DataView(buffer);
    
    // Route to format-specific parser
    if (mimeType === 'image/png' || metadata.format === 'PNG') {
      return parsePNG(buffer, view, metadata);
    } else if (mimeType === 'image/jpeg' || metadata.format === 'JPEG') {
      return parseJPEG(buffer, view, metadata);
    } else if (mimeType === 'image/gif' || metadata.format === 'GIF') {
      return parseGIF(buffer, view, metadata);
    } else if (mimeType === 'image/webp' || metadata.format === 'WebP') {
      return parseWebP(buffer, view, metadata);
    }
    
    return metadata;
  } catch (error) {
    console.error('Metadata extraction error:', error);
    return metadata;
  }
}

/**
 * Get format name from MIME type
 */
function getFormatFromMime(mimeType) {
  const formats = {
    'image/jpeg': 'JPEG',
    'image/png': 'PNG',
    'image/gif': 'GIF',
    'image/webp': 'WebP',
    'image/avif': 'AVIF',
    'image/svg+xml': 'SVG'
  };
  return formats[mimeType] || 'Unknown';
}

/**
 * Parse PNG metadata
 */
function parsePNG(buffer, view, metadata) {
  // PNG signature check
  if (view.getUint32(0, false) !== 0x89504E47) {
    return metadata;
  }
  
  // IHDR chunk contains dimensions and color info
  metadata.width = view.getUint32(16, false);
  metadata.height = view.getUint32(20, false);
  metadata.aspectRatio = metadata.width / metadata.height;
  
  const bitDepth = view.getUint8(24);
  const colorType = view.getUint8(25);
  
  metadata.bitDepth = bitDepth;
  
  // Color type: 0=grayscale, 2=RGB, 3=indexed, 4=gray+alpha, 6=RGBA
  metadata.hasAlpha = (colorType === 4 || colorType === 6);
  
  // Determine color space
  if (colorType === 0 || colorType === 4) {
    metadata.colorSpace = 'Grayscale';
  } else if (colorType === 2 || colorType === 6) {
    metadata.colorSpace = 'RGB';
  } else if (colorType === 3) {
    metadata.colorSpace = 'Indexed';
  }
  
  // Check for sRGB chunk or other color space chunks
  let offset = 33; // After IHDR
  while (offset < buffer.byteLength - 8) {
    const chunkLength = view.getUint32(offset, false);
    const chunkType = String.fromCharCode(
      view.getUint8(offset + 4),
      view.getUint8(offset + 5),
      view.getUint8(offset + 6),
      view.getUint8(offset + 7)
    );
    
    if (chunkType === 'sRGB') {
      metadata.colorSpace = 'sRGB';
    } else if (chunkType === 'pHYs') {
      // Physical pixel dimensions (DPI)
      const pixelsPerUnitX = view.getUint32(offset + 8, false);
      const pixelsPerUnitY = view.getUint32(offset + 12, false);
      const unit = view.getUint8(offset + 16);
      
      if (unit === 1) { // Meters
        metadata.dpiX = Math.round(pixelsPerUnitX * 0.0254);
        metadata.dpiY = Math.round(pixelsPerUnitY * 0.0254);
      }
    } else if (chunkType === 'acTL') {
      // Animated PNG
      metadata.isAnimated = true;
      metadata.frameCount = view.getUint32(offset + 8, false);
    } else if (chunkType === 'IEND') {
      break;
    }
    
    offset += 12 + chunkLength; // chunk length + type + CRC
  }
  
  return metadata;
}

/**
 * Parse JPEG metadata including EXIF
 */
function parseJPEG(buffer, view, metadata) {
  // JPEG signature check
  if (view.getUint16(0, false) !== 0xFFD8) {
    return metadata;
  }
  
  metadata.colorSpace = 'YCbCr'; // JPEG default
  metadata.bitDepth = 8; // JPEG is always 8-bit per channel
  
  let offset = 2;
  let exifData = {};
  
  while (offset < buffer.byteLength - 8) {
    if (view.getUint8(offset) !== 0xFF) break;
    
    const marker = view.getUint8(offset + 1);
    const size = view.getUint16(offset + 2, false);
    
    // SOF (Start of Frame) markers - contain dimensions
    if (marker >= 0xC0 && marker <= 0xCF && 
        marker !== 0xC4 && marker !== 0xC8 && marker !== 0xCC) {
      metadata.height = view.getUint16(offset + 5, false);
      metadata.width = view.getUint16(offset + 7, false);
      metadata.aspectRatio = metadata.width / metadata.height;
      
      const components = view.getUint8(offset + 9);
      // 3 components = RGB, 4 = CMYK
      if (components === 4) {
        metadata.colorSpace = 'CMYK';
      } else if (components === 1) {
        metadata.colorSpace = 'Grayscale';
      }
    }
    
    // APP1 marker - contains EXIF data
    else if (marker === 0xE1) {
      const exifHeader = String.fromCharCode(
        view.getUint8(offset + 4),
        view.getUint8(offset + 5),
        view.getUint8(offset + 6),
        view.getUint8(offset + 7)
      );
      
      if (exifHeader === 'Exif') {
        exifData = parseExifData(buffer, offset + 10, size - 8);
        
        // Extract key EXIF fields
        if (exifData.Orientation) {
          metadata.orientation = exifData.Orientation;
        }
        if (exifData.DateTimeOriginal) {
          metadata.dateTaken = exifData.DateTimeOriginal;
        }
        if (exifData.XResolution && exifData.YResolution) {
          metadata.dpiX = exifData.XResolution;
          metadata.dpiY = exifData.YResolution;
        }
        
        // Store full EXIF as JSON
        metadata.exifData = exifData;
      }
    }
    
    offset += 2 + size;
  }
  
  return metadata;
}

/**
 * Parse GIF metadata
 */
function parseGIF(buffer, view, metadata) {
  const gifHeader = new Uint8Array(buffer, 0, 6);
  const gifString = String.fromCharCode(...gifHeader);
  
  if (!gifString.startsWith('GIF')) {
    return metadata;
  }
  
  metadata.width = view.getUint16(6, true);
  metadata.height = view.getUint16(8, true);
  metadata.aspectRatio = metadata.width / metadata.height;
  
  const packed = view.getUint8(10);
  metadata.bitDepth = (packed & 0x07) + 1;
  metadata.colorSpace = 'Indexed'; // GIF uses indexed color
  
  // Check for animation
  const animationInfo = checkGifAnimation(buffer, view);
  metadata.isAnimated = animationInfo.isAnimated;
  metadata.frameCount = animationInfo.frameCount;
  
  return metadata;
}

/**
 * Check if GIF is animated and count frames
 */
function checkGifAnimation(buffer, view) {
  let frameCount = 0;
  let offset = 13; // Skip header and logical screen descriptor
  
  try {
    while (offset < buffer.byteLength - 1) {
      const block = view.getUint8(offset);
      
      // Image descriptor (0x2C)
      if (block === 0x2C) {
        frameCount++;
        offset += 10; // Skip image descriptor
        
        // Skip local color table if present
        const packed = view.getUint8(offset - 1);
        if (packed & 0x80) {
          const localColorTableSize = 2 << (packed & 0x07);
          offset += localColorTableSize * 3;
        }
        
        // Skip LZW minimum code size
        offset += 1;
        
        // Skip data sub-blocks
        let blockSize = view.getUint8(offset);
        while (blockSize > 0 && offset < buffer.byteLength) {
          offset += blockSize + 1;
          blockSize = view.getUint8(offset);
        }
        offset++;
      }
      // Extension block (0x21)
      else if (block === 0x21) {
        offset += 2;
        let blockSize = view.getUint8(offset);
        while (blockSize > 0 && offset < buffer.byteLength) {
          offset += blockSize + 1;
          blockSize = view.getUint8(offset);
        }
        offset++;
      }
      // Trailer (0x3B)
      else if (block === 0x3B) {
        break;
      }
      else {
        offset++;
      }
    }
  } catch (e) {
    console.error('GIF animation check error:', e);
  }
  
  return {
    isAnimated: frameCount > 1,
    frameCount: Math.max(frameCount, 1)
  };
}

/**
 * Parse WebP metadata
 */
function parseWebP(buffer, view, metadata) {
  const riffHeader = String.fromCharCode(...new Uint8Array(buffer, 0, 4));
  const webpHeader = String.fromCharCode(...new Uint8Array(buffer, 8, 4));
  
  if (riffHeader !== 'RIFF' || webpHeader !== 'WEBP') {
    return metadata;
  }
  
  // WebP format type
  const formatType = String.fromCharCode(...new Uint8Array(buffer, 12, 4));
  
  // VP8 (lossy)
  if (formatType === 'VP8 ') {
    metadata.width = view.getUint16(26, true) & 0x3FFF;
    metadata.height = view.getUint16(28, true) & 0x3FFF;
    metadata.colorSpace = 'YUV';
    metadata.bitDepth = 8;
  }
  // VP8L (lossless)
  else if (formatType === 'VP8L') {
    const bits = view.getUint32(21, true);
    metadata.width = (bits & 0x3FFF) + 1;
    metadata.height = ((bits >> 14) & 0x3FFF) + 1;
    metadata.hasAlpha = !!(bits >> 28 & 1);
    metadata.colorSpace = 'RGB';
    metadata.bitDepth = 8;
  }
  // VP8X (extended)
  else if (formatType === 'VP8X') {
    const flags = view.getUint8(20);
    metadata.hasAlpha = !!(flags & 0x10);
    metadata.isAnimated = !!(flags & 0x02);
    
    metadata.width = (view.getUint32(24, true) & 0xFFFFFF) + 1;
    metadata.height = (view.getUint32(27, true) & 0xFFFFFF) + 1;
    metadata.colorSpace = 'RGB';
    metadata.bitDepth = 8;
  }
  
  if (metadata.width && metadata.height) {
    metadata.aspectRatio = metadata.width / metadata.height;
  }
  
  return metadata;
}

/**
 * Parse EXIF data from JPEG APP1 marker
 * Simplified version - extracts key fields
 */
function parseExifData(buffer, exifOffset, exifLength) {
  const exifData = {};
  
  try {
    const view = new DataView(buffer);
    
    // Check byte order
    const byteOrder = view.getUint16(exifOffset, false);
    const littleEndian = byteOrder === 0x4949; // 'II'
    
    // Get IFD offset
    const ifdOffset = view.getUint32(exifOffset + 4, littleEndian);
    const ifdPosition = exifOffset + ifdOffset;
    
    // Read IFD entries
    const numEntries = view.getUint16(ifdPosition, littleEndian);
    
    for (let i = 0; i < numEntries; i++) {
      const entryOffset = ifdPosition + 2 + (i * 12);
      const tag = view.getUint16(entryOffset, littleEndian);
      const type = view.getUint16(entryOffset + 2, littleEndian);
      const count = view.getUint32(entryOffset + 4, littleEndian);
      const valueOffset = entryOffset + 8;
      
      // Key EXIF tags
      switch (tag) {
        case 0x0112: // Orientation
          exifData.Orientation = view.getUint16(valueOffset, littleEndian);
          break;
        case 0x9003: // DateTimeOriginal
          exifData.DateTimeOriginal = readExifString(view, valueOffset, count, littleEndian);
          break;
        case 0x011A: // XResolution
          exifData.XResolution = readExifRational(view, buffer, valueOffset, exifOffset, littleEndian);
          break;
        case 0x011B: // YResolution
          exifData.YResolution = readExifRational(view, buffer, valueOffset, exifOffset, littleEndian);
          break;
        case 0x010F: // Make
          exifData.Make = readExifString(view, valueOffset, count, littleEndian);
          break;
        case 0x0110: // Model
          exifData.Model = readExifString(view, valueOffset, count, littleEndian);
          break;
      }
    }
  } catch (e) {
    console.error('EXIF parsing error:', e);
  }
  
  return exifData;
}

function readExifString(view, offset, count, littleEndian) {
  let str = '';
  for (let i = 0; i < Math.min(count, 100); i++) {
    const char = view.getUint8(offset + i);
    if (char === 0) break;
    str += String.fromCharCode(char);
  }
  return str;
}

function readExifRational(view, buffer, offset, exifOffset, littleEndian) {
  const valueOffset = view.getUint32(offset, littleEndian);
  const position = exifOffset + valueOffset;
  const numerator = view.getUint32(position, littleEndian);
  const denominator = view.getUint32(position + 4, littleEndian);
  return denominator !== 0 ? numerator / denominator : 0;
}

/**
 * Validate and sanitize metadata before database storage
 */
export function sanitizeMetadata(metadata) {
  return {
    width: metadata.width || null,
    height: metadata.height || null,
    format: metadata.format || null,
    color_space: metadata.colorSpace || null,
    bit_depth: metadata.bitDepth || null,
    has_alpha: metadata.hasAlpha ? 1 : 0,
    is_animated: metadata.isAnimated ? 1 : 0,
    frame_count: metadata.frameCount || 1,
    orientation: metadata.orientation || 1,
    aspect_ratio: metadata.aspectRatio || null,
    date_taken: metadata.dateTaken || null,
    dpi_x: metadata.dpiX || null,
    dpi_y: metadata.dpiY || null,
    exif_data: metadata.exifData ? JSON.stringify(metadata.exifData) : null
  };
}
