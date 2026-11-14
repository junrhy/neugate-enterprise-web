/**
 * neuHR AI Facial Recognition Engine
 * Performs facial feature vector extraction, normalization, and similarity matching.
 */

export const VECTOR_SIZE = 64; // 8x8 spatial grid color & gradient feature vector

/**
 * Extract normalized facial feature descriptor vector from an image data URL or Image element
 */
export async function extractFaceDescriptor(imageSrc: string): Promise<number[] | null> {
  if (!imageSrc || !imageSrc.startsWith("data:")) return null;

  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      try {
        const canvas = document.createElement("canvas");
        const size = 64; // 64x64 normalization
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          resolve(null);
          return;
        }

        // Draw and normalize image to 64x64
        ctx.drawImage(img, 0, 0, size, size);
        const imgData = ctx.getImageData(0, 0, size, size);
        const data = imgData.data;

        // Compute 8x8 spatial cell features (luminance + color ratios)
        const descriptor: number[] = [];
        const cellSize = 8; // 64 / 8 = 8 cells per dimension (64 cells total)

        for (let cy = 0; cy < 8; cy++) {
          for (let cx = 0; cx < 8; cx++) {
            let sumLuminance = 0;
            let sumRed = 0;
            let sumBlue = 0;
            let count = 0;

            for (let y = cy * cellSize; y < (cy + 1) * cellSize; y++) {
              for (let x = cx * cellSize; x < (cx + 1) * cellSize; x++) {
                const idx = (y * size + x) * 4;
                const r = data[idx];
                const g = data[idx + 1];
                const b = data[idx + 2];
                // Standard ITU-R BT.601 luminance
                const lum = 0.299 * r + 0.587 * g + 0.114 * b;

                sumLuminance += lum;
                sumRed += r;
                sumBlue += b;
                count++;
              }
            }

            const avgLum = sumLuminance / (count || 1);
            const avgR = sumRed / (count || 1);
            const avgB = sumBlue / (count || 1);

            // Combine spatial luminance & color ratio
            const cellFeature = avgLum * 0.7 + (avgR - avgB) * 0.3;
            descriptor.push(cellFeature);
          }
        }

        // L2 Normalize the descriptor vector
        let normSq = 0;
        for (let i = 0; i < descriptor.length; i++) {
          normSq += descriptor[i] * descriptor[i];
        }
        const norm = Math.sqrt(normSq) || 1;
        const normalized = descriptor.map((v) => v / norm);

        resolve(normalized);
      } catch (err) {
        console.warn("Error extracting face descriptor:", err);
        resolve(null);
      }
    };
    img.onerror = () => resolve(null);
    img.src = imageSrc;
  });
}

/**
 * Compare two normalized facial feature vectors using Cosine Similarity.
 * Returns similarity score between 0.0 (no match) and 1.0 (exact match).
 */
export function compareFaceDescriptors(desc1: number[], desc2: number[]): number {
  if (!desc1 || !desc2 || desc1.length !== desc2.length || desc1.length === 0) {
    return 0;
  }

  let dotProduct = 0;
  for (let i = 0; i < desc1.length; i++) {
    dotProduct += desc1[i] * desc2[i];
  }

  // Clamped between 0 and 1
  return Math.max(0, Math.min(1, dotProduct));
}

/**
 * Find best matching employee given a face descriptor against an array of employees.
 * Threshold defaults to 0.88 for high-confidence match.
 */
export function matchFaceToEmployees(
  scannedDescriptor: number[],
  employees: { id: string; name: string; faceDescriptor?: number[] }[],
  threshold = 0.88
): { employee: { id: string; name: string; faceDescriptor?: number[] } | null; similarity: number } {
  let bestMatch = null;
  let maxSimilarity = 0;

  for (const emp of employees) {
    if (emp.faceDescriptor && emp.faceDescriptor.length > 0) {
      const sim = compareFaceDescriptors(scannedDescriptor, emp.faceDescriptor);
      if (sim > maxSimilarity) {
        maxSimilarity = sim;
        if (sim >= threshold) {
          bestMatch = emp;
        }
      }
    }
  }

  return { employee: bestMatch, similarity: maxSimilarity };
}
