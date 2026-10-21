// 작동 과정 영상(~/Gorani/promo_export/gorani_web_flow_1080x1350.mp4) → 웹용 assets/demo.mp4. 설치 없이 macOS 기본(AVFoundation)
// swiftc -O -o /tmp/web_video tools/web_video.swift && /tmp/web_video <in.mp4> assets/demo.mp4 0 1224 720 816 1300000
// 인자: 자를 위 y, 자를 높이(아래 단계 라벨 빼기), 출력 폭·높이, 비트레이트, [끝 초]. 자막·장면은 site.js CAPTIONS와 data-at
import AVFoundation; import CoreImage
let a = CommandLine.arguments
let asset = AVURLAsset(url: URL(fileURLWithPath: a[1])), out = URL(fileURLWithPath: a[2])
let cy = CGFloat(Double(a[3])!), ch = CGFloat(Double(a[4])!), ow = Int(a[5])!, oh = Int(a[6])!, br = Int(a[7])!
let track = asset.tracks(withMediaType: .video)[0]
let fps = track.nominalFrameRate, size = track.naturalSize
let reader = try! AVAssetReader(asset: asset)
let ro = AVAssetReaderTrackOutput(track: track, outputSettings: [kCVPixelBufferPixelFormatTypeKey as String: kCVPixelFormatType_32BGRA])
reader.add(ro)
try? FileManager.default.removeItem(at: out)
let writer = try! AVAssetWriter(outputURL: out, fileType: .mp4)
writer.shouldOptimizeForNetworkUse = true
let input = AVAssetWriterInput(mediaType: .video, outputSettings: [
  AVVideoCodecKey: AVVideoCodecType.h264, AVVideoWidthKey: ow, AVVideoHeightKey: oh,
  AVVideoCompressionPropertiesKey: [AVVideoAverageBitRateKey: br, AVVideoProfileLevelKey: AVVideoProfileLevelH264HighAutoLevel,
    AVVideoMaxKeyFrameIntervalKey: Int(fps.rounded()), AVVideoAllowFrameReorderingKey: true]])
input.expectsMediaDataInRealTime = false
let ad = AVAssetWriterInputPixelBufferAdaptor(assetWriterInput: input, sourcePixelBufferAttributes: [
  kCVPixelBufferPixelFormatTypeKey as String: kCVPixelFormatType_32BGRA, kCVPixelBufferWidthKey as String: ow, kCVPixelBufferHeightKey as String: oh])
writer.add(input); reader.startReading(); writer.startWriting(); writer.startSession(atSourceTime: .zero)
let ctx = CIContext(options: [.workingColorSpace: NSNull()])
let s = CGFloat(ow) / size.width
var n = 0
let endT = CommandLine.arguments.count > 8 ? CMTime(seconds: Double(CommandLine.arguments[8])!, preferredTimescale: 600) : CMTime.positiveInfinity
while let sb = ro.copyNextSampleBuffer() {
  if CMSampleBufferGetPresentationTimeStamp(sb) >= endT { break }
  guard let pb = CMSampleBufferGetImageBuffer(sb) else { continue }
  let t = CMSampleBufferGetPresentationTimeStamp(sb)
  // CI 좌표는 아래가 0 — 위에서 cy만큼 자른 띠
  var img = CIImage(cvPixelBuffer: pb).cropped(to: CGRect(x: 0, y: size.height - cy - ch, width: size.width, height: ch))
  img = img.transformed(by: CGAffineTransform(translationX: 0, y: -(size.height - cy - ch)))
  img = img.applyingFilter("CILanczosScaleTransform", parameters: [kCIInputScaleKey: s, kCIInputAspectRatioKey: 1.0])
  while !input.isReadyForMoreMediaData { usleep(1000) }
  var o: CVPixelBuffer?; CVPixelBufferPoolCreatePixelBuffer(nil, ad.pixelBufferPool!, &o)
  ctx.render(img, to: o!, bounds: CGRect(x: 0, y: 0, width: ow, height: oh), colorSpace: nil)
  ad.append(o!, withPresentationTime: t); n += 1
}
input.markAsFinished()
let sem = DispatchSemaphore(value: 0); writer.finishWriting { sem.signal() }; sem.wait()
print("frames", n, "fps", fps, writer.status == .completed ? "ok" : "FAILED \(String(describing: writer.error))")
