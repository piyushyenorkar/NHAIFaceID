#import <React/RCTBridgeModule.h>

@interface RCT_EXTERN_MODULE(FaceRecognitionModule, NSObject)

RCT_EXTERN_METHOD(initialize:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)

RCT_EXTERN_METHOD(generateEmbeddingFromFile:(NSString *)imagePath
                  x:(float)x
                  y:(float)y
                  w:(float)w
                  h:(float)h
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)

@end
