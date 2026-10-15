import XCTest
@testable import LexnurNativePlugin

final class PackagePathsTests: XCTestCase {
    func testPackagesDirIsExcludedFromBackup() throws {
        let base = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        let dir = try PackagePaths.packagesDir(base: base)
        XCTAssertEqual(dir.lastPathComponent, "packages")
        XCTAssertEqual(try dir.resourceValues(forKeys: [.isExcludedFromBackupKey]).isExcludedFromBackup, true)
    }

    func testResolveRejectsEscapes() throws {
        let dir = URL(fileURLWithPath: "/tmp/x/packages")
        XCTAssertNil(PackagePaths.resolve("../etc/passwd", in: dir))
        XCTAssertNil(PackagePaths.resolve("/etc/passwd", in: dir))
        XCTAssertEqual(PackagePaths.resolve("oewn-2025/20261011.1.sqlite", in: dir)?.lastPathComponent, "20261011.1.sqlite")
    }
}
