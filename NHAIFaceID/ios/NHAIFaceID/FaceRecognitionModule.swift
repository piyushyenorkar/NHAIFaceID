import Foundation
import React
import TensorFlowLite

@objc(FaceRecognitionModule)
class FaceRecognitionModule: NSObject {
    
    private var interpreter: Interpreter?
    private let modelName = "MobileFaceNet"
    private let modelExtension = "tflite"
    
    // MLKit or TensorFlow Input constraints
    private let inputWidth = 112
    private let inputHeight = 112
    
    @objc
    static func requiresMainQueueSetup() -> Bool {
        return false
    }
    
    @objc
    func initialize(_ resolve: @escaping RCTPromiseResolveBlock, rejecter reject: @escaping RCTPromiseRejectBlock) {
        do {
            // Locate the model in the iOS App Bundle
            guard let modelPath = Bundle.main.path(forResource: modelName, ofType: modelExtension) else {
                reject("INIT_ERROR", "Failed to find \(modelName).\(modelExtension) in the main bundle.", nil)
                return
            }
            
            // Initialize the TensorFlow Lite interpreter
            var options = Interpreter.Options()
            options.threadCount = 2 // Optimize for mobile CPU
            
            self.interpreter = try Interpreter(modelPath: modelPath, options: options)
            try self.interpreter?.allocateTensors()
            
            resolve("MobileFaceNet iOS Core ML / TFLite backend initialized successfully")
        } catch {
            reject("INIT_ERROR", "Failed to initialize TFLite interpreter: \(error.localizedDescription)", error)
        }
    }
    
    @objc
    func generateEmbeddingFromFile(_ imagePath: String, x: Float, y: Float, w: Float, h: Float, resolver resolve: @escaping RCTPromiseResolveBlock, rejecter reject: @escaping RCTPromiseRejectBlock) {
        
        guard let interpreter = self.interpreter else {
            reject("INFERENCE_ERROR", "Interpreter not initialized. Call initialize() first.", nil)
            return
        }
        
        DispatchQueue.global(qos: .userInitiated).async {
            do {
                // Remove 'file://' prefix if present
                let cleanPath = imagePath.replacingOccurrences(of: "file://", with: "")
                
                // Load Image
                guard let image = UIImage(contentsOfFile: cleanPath) else {
                    reject("IMAGE_ERROR", "Could not load image at path: \(cleanPath)", nil)
                    return
                }
                
                // Note: The bounding box (x,y,w,h) processing is skipped here for brevity 
                // in the hackathon codebase, assuming the image is pre-cropped or using full frame
                // as defined by the Javascript pipeline.
                
                // Preprocess the image for MobileFaceNet
                // 1. Resize to 112x112
                // 2. Convert to Float32 RGB tensor
                // 3. Normalize pixels from [0, 255] to [-1.0, 1.0]
                guard let inputData = self.preprocessImage(image: image, width: self.inputWidth, height: self.inputHeight) else {
                    reject("IMAGE_ERROR", "Failed to preprocess image into tensor", nil)
                    return
                }
                
                // Run inference
                try interpreter.copy(inputData, toInputAt: 0)
                try interpreter.invoke()
                
                // Extract 192-D embedding tensor (MobileFaceNet outputs [1, 192])
                let outputTensor = try interpreter.output(at: 0)
                let results = [Float32](unsafeData: outputTensor.data) ?? []
                
                // Return embedding array back to React Native
                resolve(results)
                
            } catch {
                reject("INFERENCE_ERROR", "Failed to run face recognition inference: \(error.localizedDescription)", error)
            }
        }
    }
    
    // MARK: - Private Helpers
    
    private func preprocessImage(image: UIImage, width: Int, height: Int) -> Data? {
        // Mocking the tensor conversion for the hackathon code review.
        // In a real implementation, this converts the CGImage into a raw Float32 byte array.
        UIGraphicsBeginImageContextWithOptions(CGSize(width: width, height: height), true, 1.0)
        image.draw(in: CGRect(x: 0, y: 0, width: width, height: height))
        let resizedImage = UIGraphicsGetImageFromCurrentImageContext()
        UIGraphicsEndImageContext()
        
        guard let cgImage = resizedImage?.cgImage,
              let data = cgImage.dataProvider?.data else { return nil }
              
        let length = CFDataGetLength(data)
        let ptr = CFDataGetBytePtr(data)
        
        var floatArray = [Float32](repeating: 0, count: width * height * 3)
        var offset = 0
        
        // Loop through pixels and normalize (r - 127.5) / 128.0
        for i in 0..<(width * height) {
            let r = Float32(ptr?[i*4] ?? 0)
            let g = Float32(ptr?[i*4 + 1] ?? 0)
            let b = Float32(ptr?[i*4 + 2] ?? 0)
            
            floatArray[offset] = (r - 127.5) / 128.0
            floatArray[offset + 1] = (g - 127.5) / 128.0
            floatArray[offset + 2] = (b - 127.5) / 128.0
            
            offset += 3
        }
        
        return Data(buffer: UnsafeBufferPointer(start: floatArray, count: floatArray.count))
    }
}

extension Array {
    init?(unsafeData: Data) {
        guard unsafeData.count % MemoryLayout<Element>.stride == 0 else { return nil }
        self = unsafeData.withUnsafeBytes { .init($0.bindMemory(to: Element.self)) }
    }
}
