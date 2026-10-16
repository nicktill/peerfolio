// swift-tools-version: 5.10
import PackageDescription

// Foundation-only core of the Peerfolio iOS app: models that mirror the web API, the API client with token
// refresh, and the assistant's NDJSON stream parser. It builds and tests on Linux and macOS, so the logic that
// matters can be verified without Xcode. All UI lives in the app target (apps/ios/Peerfolio).
let package = Package(
    name: "PeerfolioKit",
    platforms: [.iOS(.v17), .macOS(.v14)],
    products: [
        .library(name: "PeerfolioKit", targets: ["PeerfolioKit"]),
    ],
    targets: [
        .target(name: "PeerfolioKit"),
        .testTarget(name: "PeerfolioKitTests", dependencies: ["PeerfolioKit"]),
    ]
)
