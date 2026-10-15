// swift-tools-version: 5.9
import PackageDescription

// DO NOT MODIFY THIS FILE - managed by Capacitor CLI commands
let package = Package(
    name: "CapApp-SPM",
    platforms: [.iOS(.v15)],
    products: [
        .library(
            name: "CapApp-SPM",
            targets: ["CapApp-SPM"])
    ],
    dependencies: [
        .package(url: "https://github.com/ionic-team/capacitor-swift-pm.git", exact: "8.5.3"),
        .package(name: "CapacitorCommunitySqlite", path: "../../../../node_modules/.pnpm/@capacitor-community+sqlite@8.1.1_patch_hash=da509fc7ee5689e1299e3e8b8d00ea2fb3587f3e3a_5bd4fbb67f5cb9aece0c118a3041e068/node_modules/@capacitor-community/sqlite"),
        .package(name: "CapacitorApp", path: "../../../../node_modules/.pnpm/@capacitor+app@8.1.2_@capacitor+core@8.5.3/node_modules/@capacitor/app"),
        .package(name: "CapacitorClipboard", path: "../../../../node_modules/.pnpm/@capacitor+clipboard@8.0.1_@capacitor+core@8.5.3/node_modules/@capacitor/clipboard"),
        .package(name: "CapacitorDevice", path: "../../../../node_modules/.pnpm/@capacitor+device@8.0.3_@capacitor+core@8.5.3/node_modules/@capacitor/device"),
        .package(name: "CapacitorFilesystem", path: "../../../../node_modules/.pnpm/@capacitor+filesystem@8.1.4_@capacitor+core@8.5.3/node_modules/@capacitor/filesystem"),
        .package(name: "CapacitorHaptics", path: "../../../../node_modules/.pnpm/@capacitor+haptics@8.0.2_@capacitor+core@8.5.3/node_modules/@capacitor/haptics"),
        .package(name: "CapacitorKeyboard", path: "../../../../node_modules/.pnpm/@capacitor+keyboard@8.0.6_@capacitor+core@8.5.3/node_modules/@capacitor/keyboard"),
        .package(name: "CapacitorNetwork", path: "../../../../node_modules/.pnpm/@capacitor+network@8.0.1_@capacitor+core@8.5.3/node_modules/@capacitor/network"),
        .package(name: "CapacitorPreferences", path: "../../../../node_modules/.pnpm/@capacitor+preferences@8.0.1_@capacitor+core@8.5.3/node_modules/@capacitor/preferences"),
        .package(name: "CapacitorScreenReader", path: "../../../../node_modules/.pnpm/@capacitor+screen-reader@8.0.1_@capacitor+core@8.5.3/node_modules/@capacitor/screen-reader"),
        .package(name: "CapacitorShare", path: "../../../../node_modules/.pnpm/@capacitor+share@8.0.3_@capacitor+core@8.5.3/node_modules/@capacitor/share"),
        .package(name: "CapacitorTextZoom", path: "../../../../node_modules/.pnpm/@capacitor+text-zoom@8.0.1_@capacitor+core@8.5.3/node_modules/@capacitor/text-zoom"),
        .package(name: "LexnurNative", path: "../../../node_modules/@lexnur/native")
    ],
    targets: [
        .target(
            name: "CapApp-SPM",
            dependencies: [
                .product(name: "Capacitor", package: "capacitor-swift-pm"),
                .product(name: "Cordova", package: "capacitor-swift-pm"),
                .product(name: "CapacitorCommunitySqlite", package: "CapacitorCommunitySqlite"),
                .product(name: "CapacitorApp", package: "CapacitorApp"),
                .product(name: "CapacitorClipboard", package: "CapacitorClipboard"),
                .product(name: "CapacitorDevice", package: "CapacitorDevice"),
                .product(name: "CapacitorFilesystem", package: "CapacitorFilesystem"),
                .product(name: "CapacitorHaptics", package: "CapacitorHaptics"),
                .product(name: "CapacitorKeyboard", package: "CapacitorKeyboard"),
                .product(name: "CapacitorNetwork", package: "CapacitorNetwork"),
                .product(name: "CapacitorPreferences", package: "CapacitorPreferences"),
                .product(name: "CapacitorScreenReader", package: "CapacitorScreenReader"),
                .product(name: "CapacitorShare", package: "CapacitorShare"),
                .product(name: "CapacitorTextZoom", package: "CapacitorTextZoom"),
                .product(name: "LexnurNative", package: "LexnurNative")
            ]
        )
    ]
)
