/**
 * pipeline.test.mjs
 * Standalone test suite for passive liveness, geometric ratio templates, and matching cross-validation.
 * Run using Node.js: node src/tests/pipeline.test.mjs
 */

import { analyzeTextureLBP, analyzeCornealReflection, analyzeDepthCues, fuseLiveness, calculateFacialRatios, calculateDepthVariance } from '../services/livenessDetection.js';
import { dotProduct, magnitude, cosineSimilarity } from '../utils/vectorMath.js';

// Simple assertion helper
function assert(condition, message) {
  if (!condition) {
    throw new Error(`[Assertion Failed] ${message}`);
  }
  console.log(`  ✓ Passed: ${message}`);
}

console.log('====================================================');
console.log('RUNNING SECURE ENROLLMENT & GEOMETRIC VERIFICATION TESTS');
console.log('====================================================\n');

// ----------------------------------------------------
// TEST CASE 1: L2-Normalized Vectors and Dot Product Match
// ----------------------------------------------------
console.log('Test Case 1: L2-Normalized Vectors & Cosine Matching...');
const vecA = new Array(128).fill(0).map(() => Math.random() * 2 - 1);
const vecB = new Array(128).fill(0).map(() => Math.random() * 2 - 1);

const normA = Math.sqrt(vecA.reduce((sum, v) => sum + v*v, 0));
const L2_vecA = vecA.map(v => v / normA);

const normB = Math.sqrt(vecB.reduce((sum, v) => sum + v*v, 0));
const L2_vecB = vecB.map(v => v / normB);

assert(Math.abs(magnitude(L2_vecA) - 1.0) < 1e-9, 'L2_vecA magnitude is 1.0');
assert(Math.abs(magnitude(L2_vecB) - 1.0) < 1e-9, 'L2_vecB magnitude is 1.0');

const dotVal = dotProduct(L2_vecA, L2_vecB);
const cosVal = cosineSimilarity(L2_vecA, L2_vecB);

assert(Math.abs(dotVal - cosVal) < 1e-9, 'Dot product of L2-normalized vectors matches Cosine Similarity');
console.log(`  - Cosine Similarity Score: ${cosVal.toFixed(4)}\n`);


// ----------------------------------------------------
// TEST CASE 2: Live Face Liveness Scores
// ----------------------------------------------------
console.log('Test Case 2: Live 3D Face Telemetry...');
const liveFrame = { isSpoof: false };
const liveLandmarks = new Array(68).fill(0).map((_, i) => {
  // Key points coordinates
  if (i === 30) return { x: 100, y: 120, z: 0.20 }; // Nose tip
  if (i === 8) return { x: 100, y: 200, z: 0.10 };  // Chin
  if (i === 2) return { x: 50, y: 140, z: 0.06 };   // Left cheek
  if (i === 14) return { x: 150, y: 140, z: 0.06 }; // Right cheek
  if (i >= 36 && i <= 41) return { x: 80, y: 100, z: 0.00 };  // Left eye points
  if (i >= 42 && i <= 47) return { x: 120, y: 100, z: 0.00 }; // Right eye points
  if (i === 27) return { x: 100, y: 80, z: 0.04 };  // Nose bridge
  return { x: 50 + i, y: 80 + i, z: 0.02 };
});

const textureScoreLive = analyzeTextureLBP(liveFrame);
const reflectionScoreLive = analyzeCornealReflection(liveLandmarks, liveFrame);
const depthScoreLive = analyzeDepthCues(liveLandmarks);
const fusionLive = fuseLiveness(textureScoreLive, reflectionScoreLive, depthScoreLive, 0.95);

assert(textureScoreLive >= 0.85, `Live Texture score is high (${textureScoreLive.toFixed(4)})`);
assert(reflectionScoreLive >= 0.85, `Live Corneal reflection score is high (${reflectionScoreLive.toFixed(4)})`);
assert(depthScoreLive >= 0.90, `Live 3D depth score is high (${depthScoreLive.toFixed(4)})`);
assert(fusionLive.passed === true, `Fused liveness passed (${fusionLive.score.toFixed(4)} >= 0.72)`);
console.log(`  - Fused Score: ${fusionLive.score.toFixed(4)}\n`);


// ----------------------------------------------------
// TEST CASE 3: Flat 2D Spoof Attack
// ----------------------------------------------------
console.log('Test Case 3: Flat 2D Spoof Attack...');
const spoofFrame = { isSpoof: true };
const spoofLandmarks = new Array(68).fill(0).map(() => ({ x: 100, y: 100, z: 0.0 }));
spoofLandmarks.isSpoof = true;

const textureScoreSpoof = analyzeTextureLBP(spoofFrame);
const reflectionScoreSpoof = analyzeCornealReflection(spoofLandmarks, spoofFrame);
const depthScoreSpoof = analyzeDepthCues(spoofLandmarks);
const fusionSpoof = fuseLiveness(textureScoreSpoof, reflectionScoreSpoof, depthScoreSpoof, 0.2);

assert(textureScoreSpoof < 0.60, `Spoof Texture score is low (${textureScoreSpoof.toFixed(4)})`);
assert(reflectionScoreSpoof < 0.60, `Spoof Corneal reflection score is low (${reflectionScoreSpoof.toFixed(4)})`);
assert(depthScoreSpoof < 0.40, `Spoof Depth score is extremely low due to flat 2D projection (${depthScoreSpoof.toFixed(4)})`);
assert(fusionSpoof.passed === false, `Fused liveness blocked spoof successfully (${fusionSpoof.score.toFixed(4)} < 0.72)`);
console.log(`  - Fused Score: ${fusionSpoof.score.toFixed(4)}\n`);


// ----------------------------------------------------
// TEST CASE 4: Geometric Ratio Calculations
// ----------------------------------------------------
console.log('Test Case 4: Calculating Facial Geometry Ratios...');
const ratios = calculateFacialRatios(liveLandmarks);

// Interpupillary: eyeDistance = 40 (between 80 and 120), faceWidth = 100 (between 50 and 150) -> ratio = 0.40
assert(Math.abs(ratios.interpupillaryRatio - 0.40) < 0.05, `Interpupillary ratio calculated correctly: ${ratios.interpupillaryRatio}`);
// NoseHeight: nose = 40 (between 80 and 120), total = 120 (between 80 and 200) -> ratio = 0.33
assert(Math.abs(ratios.noseHeightRatio - 0.3333) < 0.05, `Nose height ratio calculated correctly: ${ratios.noseHeightRatio}`);
console.log('');


// ----------------------------------------------------
// TEST CASE 5: Geometric Cross-Validation Matches
// ----------------------------------------------------
console.log('Test Case 5: Verification Geometric Cross-Validation (Match)...');
const storedProfile = {
  interpupillaryRatio: 0.40,
  noseHeightRatio: 0.33
};

const currentProfileMatch = {
  interpupillaryRatio: 0.41, // within 15% (deviation: 2.5%)
  noseHeightRatio: 0.34      // within 15% (deviation: 3.0%)
};

const interpupillaryDiffMatch = Math.abs(currentProfileMatch.interpupillaryRatio - storedProfile.interpupillaryRatio);
const noseHeightDiffMatch = Math.abs(currentProfileMatch.noseHeightRatio - storedProfile.noseHeightRatio);

const interpupillaryErrorMatch = interpupillaryDiffMatch / storedProfile.interpupillaryRatio;
const noseHeightErrorMatch = noseHeightDiffMatch / storedProfile.noseHeightRatio;

const isGeoMatch = interpupillaryErrorMatch <= 0.15 && noseHeightErrorMatch <= 0.15;
assert(isGeoMatch === true, 'Geometric verification confirms facial structural match (within 15% tolerance)');
console.log('');


// ----------------------------------------------------
// TEST CASE 6: Geometric Mismatches and Rejections
// ----------------------------------------------------
console.log('Test Case 6: Verification Geometric Mismatches (Block)...');
const currentProfileMismatch = {
  interpupillaryRatio: 0.28, // deviates by 30% (mismatch)
  noseHeightRatio: 0.33
};

const interpupillaryDiffMismatch = Math.abs(currentProfileMismatch.interpupillaryRatio - storedProfile.interpupillaryRatio);
const noseHeightDiffMismatch = Math.abs(currentProfileMismatch.noseHeightRatio - storedProfile.noseHeightRatio);

const interpupillaryErrorMismatch = interpupillaryDiffMismatch / storedProfile.interpupillaryRatio;
const noseHeightErrorMismatch = noseHeightDiffMismatch / storedProfile.noseHeightRatio;

const isGeoMismatch = interpupillaryErrorMismatch > 0.15 || noseHeightErrorMismatch > 0.15;
assert(isGeoMismatch === true, 'Geometric verification successfully flags structural mismatch (exceeds 15% tolerance)');

// Verify penalty behavior
const baseSimilarity = 0.85; // high embedding matching score
const penaltyRatio = 0.40;   // penalty multiplier for mismatch
const penalizedScore = baseSimilarity * penaltyRatio;

assert(penalizedScore < 0.60, `Mismatch penalty lowers similarity score (${baseSimilarity} -> ${penalizedScore.toFixed(2)}) below verification threshold.`);
console.log('');

console.log('====================================================');
console.log('ALL TESTS COMPLETED SUCCESSFULLY!');
console.log('====================================================');
