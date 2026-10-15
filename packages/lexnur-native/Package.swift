// swift-tools-version: 5.9
import PackageDescription

let package = Package(
    name: "LexnurNative",
    platforms: [.iOS(.v15)],
    products: [.library(name: "LexnurNative", targets: ["LexnurNativePlugin"])],
    dependencies: [
        .package(url: "https://github.com/ionic-team/capacitor-swift-pm.git", from: "8.0.0"),
        .package(url: "https://github.com/facebook/zstd.git", exact: "1.5.7")
    ],
    targets: [
        .target(
            name: "LexnurNativePlugin",
            dependencies: [
                .product(name: "Capacitor", package: "capacitor-swift-pm"),
                .product(name: "Cordova", package: "capacitor-swift-pm"),
                .product(name: "libzstd", package: "zstd")
            ],
            path: "ios/Sources/LexnurNativePlugin"),
        .testTarget(
            name: "LexnurNativePluginTests",
            dependencies: [
                "LexnurNativePlugin",
                .product(name: "libzstd", package: "zstd")
            ],
            path: "ios/Tests/LexnurNativePluginTests")
    ]
)
