// src/admin/image-converter.js
// WebP conversion utility using WebAssembly

import { encode } from '@jsquash/webp';

/**
 * Convert image buffer to WebP format
 * @param {ArrayBuffer} imageBuffer - Original image data (PNG, JPEG, etc)
 * @param {number} quality - WebP quality (0-100), default 80
 * @returns {Promise<Uint8Array>} - WebP encoded image
 */
export async function convertToWebP(imageBuffer, quality = 80) {
  try {
    // Decode the original image to ImageData
    const imageData = await decodeImage(imageBuffer);
    
    // Encode to WebP
    const webpBuffer = await encode(imageData, { quality });
    
    return webpBuffer;
  } catch (error) {
    console.error('WebP conversion error:', error);
    throw new Error('Failed to convert image to WebP: ' + error.message);
  }
}

/**
 * Decode image buffer to ImageData (required by @jsquash/webp)
 * Uses browser-compatible APIs available in Workers
 */
async function decodeImage(buffer) {
  // Create a Blob from the buffer
  const blob = new Blob([buffer]);
  
  // Use Workers' native image decoding
  const image = await createImageBitmap(blob);
  
  // Create canvas and extract ImageData
  const canvas = new OffscreenCanvas(image.width, image.height);
  const ctx = canvas.getContext('2d');
  ctx.drawImage(image, 0, 0);
  
  return ctx.getImageData(0, 0, image.width, image.height);
}

/**
 * Get image dimensions without full decode
 * @param {ArrayBuffer} buffer - Image buffer
 * @returns {Promise<{width: number, height: number}>}
 */
export async function getImageDimensions(buffer) {
  try {
    const blob = new Blob([buffer]);
    const image = await createImageBitmap(blob);
    return {
      width: image.width,
      height: image.height
    };
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
  return Math.round((1 - webpSize / originalSize) * 100);
}
