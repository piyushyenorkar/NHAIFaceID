/**
 * vectorMath.js
 * Contains mathematical operations for comparing high-dimensional embeddings.
 */

/**
 * Calculates the dot product of two arrays of numbers.
 * @param {number[]} a - First vector
 * @param {number[]} b - Second vector
 * @returns {number} Dot product
 */
export function dotProduct(a, b) {
  if (a.length !== b.length) {
    throw new Error('Vectors must be of the same length to compute dot product.');
  }
  let sum = 0;
  for (let i = 0; i < a.length; i++) {
    sum += a[i] * b[i];
  }
  return sum;
}

/**
 * Calculates the magnitude (length) of a vector.
 * @param {number[]} v - The vector
 * @returns {number} Magnitude
 */
export function magnitude(v) {
  let sum = 0;
  for (let i = 0; i < v.length; i++) {
    sum += v[i] * v[i];
  }
  return Math.sqrt(sum);
}

/**
 * Calculates the cosine similarity between two vectors.
 * Returns a value between -1 and 1. Higher means more similar.
 * 
 * Formula: dot(A, B) / (|A| * |B|)
 * 
 * @param {number[]} vecA - First vector (e.g. 192-d embedding)
 * @param {number[]} vecB - Second vector (e.g. 192-d embedding)
 * @returns {number} Cosine similarity score (1.0 = identical)
 */
export function cosineSimilarity(vecA, vecB) {
  if (vecA.length !== vecB.length) {
    throw new Error('Vectors must be of the same length to compute cosine similarity.');
  }
  
  const dot = dotProduct(vecA, vecB);
  const magA = magnitude(vecA);
  const magB = magnitude(vecB);
  
  if (magA === 0 || magB === 0) {
    return 0; // Avoid division by zero
  }
  
  return dot / (magA * magB);
}
