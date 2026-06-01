# NHAIFaceID - Presentation Script
*This is your script to present alongside your PowerPoint slides to the NHAI Evaluation Committee.*

## Slide 1: Introduction (The Problem)
**You:** "Good morning Judges. NHAI manages massive highway constructions across India. Your thousands of field engineers work in remote locations—mountains, rural highways, jungles—where there is zero internet connection. Tracking authentic attendance in these zero-network zones is currently impossible and prone to buddy-punching or fraud. You need a system that proves who is standing there, proves they are alive, and does it completely offline. That is why we built **NHAIFaceID**."

## Slide 2: The Solution & Technical Architecture
**You:** "NHAIFaceID is a lightweight React Native SDK designed to drop perfectly into your existing Datalake 3.0 app. It does exactly three things:
1. Detects a face and tracks 68 facial landmarks.
2. Mathematically proves the person is a live 3D human using randomized challenges.
3. Extracts a 128-dimensional embedding to verify their identity against a local offline SQLite database."

## Slide 3: Crushing the Constraints (Benchmarks)
**You:** "The biggest constraint you gave us was keeping the AI models under 20MB so the Datalake app doesn't become bloated. We utilized **MobileFaceNet** for recognition and **MediaPipe** for tracking. Our total bundled footprint is exactly **7.8 Megabytes**. We completely crushed the 20MB limit. Furthermore, our entire processing pipeline runs in **under 600 milliseconds** on standard mid-range Android devices, passing your 1-second speed requirement easily."

## Slide 4: Defeating Video Fraud (Liveness)
**You:** "How do we stop someone from just holding up a recorded video of their friend? Standard corporate systems use heavy 100MB+ models to detect screen glare. Because of our strict offline size limits, we engineered a **Randomized Challenge-Response** system. The app randomly asks the user to either Blink, Turn their Head, or Smile in a 15-second countdown. A fraudster with a video cannot guess the random sequence, meaning we achieve maximum anti-spoofing security using 0MB of extra storage space."

## Slide 5: The Offline-to-Cloud Sync
**You:** "Finally, the field engineer logs their attendance deep in the jungle. They get in their truck and drive back to the city. The absolute second their phone connects to 4G or Wi-Fi, our background listener wakes up. It silently scoops all the encrypted logs from the SQLite database, blasts them securely to the NHAI AWS servers, and then immediately purges the local data to save storage space. Zero friction, zero buttons to press."

## Slide 6: Conclusion
**You:** "We have packaged this all into a clean SDK with just 5 lines of code required for the Datalake team to integrate. It is lightweight, hyper-fast, highly secure, and built exclusively on open-source technologies with zero paid licenses. Thank you."
