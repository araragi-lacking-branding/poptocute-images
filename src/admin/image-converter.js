// src/admin/image-converter.js
// WebP conversion utility for Cloudflare Workers
// Uses @jsquash/webp which works in Workers runtime

import { encode } from '@jsquash/webp';
import { decode } from '@jsquash/png';

/**
 * Convert image buffer to WebP format
 * @param {ArrayBuffer} imageBuffer - Original image data (PNG, JPEG, etc)
 * @param {number} quality - WebP quality (0-100), default 85
 * @returns {Promise<Uint8Array>} - WebP encoded image
 */
export async function convertToWebP(imageBuffer, quality = 85) {
  try {
    // First, decode the image to raw pixel data
    // @jsquash/png can decode PNG, JPEG, etc.
    const imageData = await decode(new Uint8Array(imageBuffer));
    
    // Encode to WebP
    const webpBuffer = await encode(imageData, { quality });
    
    return webpBuffer;
  } catch (error) {
    console.error('WebP conversion error:', error);
    throw new Error('Failed to convert image to WebP: ' + error.message);
  }
}

/**
 * Get image dimensions from PNG/JPEG buffer
 * Works without browser APIs - parses file headers directly
 * @param {ArrayBuffer} buffer - Image buffer
 * @returns {Promise<{width: number, height: number}>}
 */
export async function getImageDimensions(buffer) {
  try {
    const view = new DataView(buffer);
    
    // Check if PNG (starts with 0x89504E47)
    if (view.getUint32(0) === 0x89504E47) {
      // PNG: width and height are at bytes 16-23
      const width = view.getUint32(16);
      const height = view.getUint32(20);
      return { width, height };
    }
    
    // Check if JPEG (starts with 0xFFD8)
    if (view.getUint16(0) === 0xFFD8) {
      // JPEG: parse markers to find SOF (Start of Frame)
      let offset = 2;
      while (offset < view.byteLength) {
        if (view.getUint8(offset) !== 0xFF) break;
        
        const marker = view.getUint8(offset + 1);
        const size = view.getUint16(offset + 2);
        
        // SOF markers: 0xC0-0xCF (except 0xC4, 0xC8, 0xCC)
        if (marker >= 0xC0 && marker <= 0xCF && 
            marker !== 0xC4 && marker !== 0xC8 && marker !== 0xCC) {
          const height = view.getUint16(offset + 5);
          const width = view.getUint16(offset + 7);
          return { width, height };
        }
        
        offset += 2 + size;
      }
    }
    
    // If we can't parse headers, use decode to get dimensions
    try {
      const imageData = await decode(new Uint8Array(buffer));
      return { width: imageData.width, height: imageData.height };
    } catch (e) {
      console.error('Could not determine dimensions:', e);
      return { width: 0, height: 0 };
    }
  } catch (error) {
    console.error('Failed to get image dimensions:', error);
    return { width: 0, height: 0 };
  }
}

/**
 * Calculate estimated size reduction
 * @param {number} originalSize - Original file size in bytes
 * @param {number} webpSize - WebP file size in bytes
 * @returns {number} - Percentage saved (0-100)
 */
export function calculateSavings(originalSize, webpSize) {
  if (originalSize === 0) return 0;
  return Math.round((1 - webpSize / originalSize) * 100);
}
