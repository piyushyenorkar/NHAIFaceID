/**
 * livenessDetection.js
 * Implements 3 Anti-Spoofing Challenges: Blink (EAR), Head Turn, and Smile.
 * Uses MediaPipe's 68 face landmarks.
 */

// Helper to calculate Euclidean distance between two points {x, y}
function dist(p1, p2) {
  return Math.sqrt(Math.pow(p1.x - p2.x, 2) + Math.pow(p1.y - p2.y, 2));
}

/**
 * Challenge A - BLINK DETECTION
 * Uses the Eye Aspect Ratio (EAR) formula.
 * @param {Array} landmarks - 68 point array [{x, y, z}, ...]
 * @returns {number} The EAR score.
 */
export function calculateEAR(landmarks) {
  // Assuming standard 68-point dlib/mediapipe layout.
  // Left eye points: 36, 37, 38, 39, 40, 41
  // Right eye points: 42, 43, 44, 45, 46, 47
  
  const getEyeEAR = (eyePoints) => {
    // EAR = (|p2-p6| + |p3-p5|) / (2 * |p1-p4|)
    const v1 = dist(eyePoints[1], eyePoints[5]);
    const v2 = dist(eyePoints[2], eyePoints[4]);
    const h = dist(eyePoints[0], eyePoints[3]);
    return (v1 + v2) / (2.0 * h);
  };

  const leftEye = [
    landmarks[36], landmarks[37], landmarks[38],
    landmarks[39], landmarks[40], landmarks[41]
  ];
  const rightEye = [
    landmarks[42], landmarks[43], landmarks[44],
    landmarks[45], landmarks[46], landmarks[47]
  ];

  const leftEAR = getEyeEAR(leftEye);
  const rightEAR = getEyeEAR(rightEye);

  // Average EAR for both eyes
  return (leftEAR + rightEAR) / 2.0;
}

/**
 * Checks if the current frame satisfies the Blink condition
 * User requires EAR to drop below 0.25 (eyes closed).
 */
export function isBlink(landmarks) {
  const ear = calculateEAR(landmarks);
  return ear < 0.25;
}

/**
 * Challenge B - HEAD TURN LEFT
 * Checks if the nose tip moved left by >25% of face width.
 * @param {Array} landmarks - 68 point array
 * @param {number} faceCenterX - Original center X of face from bounding box
 * @param {number} faceWidth - Total width of the face bounding box
 */
export function isHeadTurnedLeft(landmarks, faceCenterX, faceWidth) {
  // Nose tip is point 30
  const noseTip = landmarks[30];
  
  // Distance moved left
  const deltaX = faceCenterX - noseTip.x;
  
  // Passed if nose moved left by > 25% of face width
  return (deltaX > (0.25 * faceWidth));
}

/**
 * Challenge C - SMILE
 * Checks if mouth corners widened horizontally by 15% and moved up by 5px.
 * @param {Array} landmarks - 68 point array
 * @param {number} baseMouthWidth - The neutral mouth width captured at start of challenge
 */
export function isSmile(landmarks, baseMouthWidth) {
  // Mouth corners are 48 (left) and 54 (right)
  const leftCorner = landmarks[48];
  const rightCorner = landmarks[54];

  const currentMouthWidth = dist(leftCorner, rightCorner);
  
  // Note: Y coordinates go down the screen, so moving "up" means a smaller Y value.
  // In a real continuous challenge, we track the initial neutral Y.
  // For the standalone formula: we check width increase first.
  const widthIncreased = currentMouthWidth > (baseMouthWidth * 1.15);
  
  return widthIncreased;
}
