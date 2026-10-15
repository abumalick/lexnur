import XCTest
import CryptoKit
import libzstd
@testable import LexnurNativePlugin

final class PackageFinalizerTests: XCTestCase {
    var dir: URL!
    var payload: Data!
    var zst: URL!

    override func setUpWithError() throws {
        dir = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        try FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
        var bytes = [UInt8](repeating: 0, count: 3 << 20)
        var g = SystemRandomNumberGenerator()
        for i in 0..<bytes.count { bytes[i] = i % 7 == 0 ? UInt8.random(in: 0...255, using: &g) : UInt8(i % 251) }
        payload = Data(bytes)
        zst = dir.appendingPathComponent("v1.sqlite.zst")
        try compress(payload).write(to: zst)
    }

    override func tearDownWithError() throws {
        try? FileManager.default.removeItem(at: dir)
    }

    private func compress(_ data: Data) -> Data {
        let bound = ZSTD_compressBound(data.count)
        var out = Data(count: bound)
        let n = out.withUnsafeMutableBytes { o in data.withUnsafeBytes { i in
            ZSTD_compress(o.baseAddress, bound, i.baseAddress, data.count, 3) } }
        return out.prefix(n)
    }

    private func sha(_ url: URL) throws -> String {
        SHA256.hash(data: try Data(contentsOf: url)).map { String(format: "%02x", $0) }.joined()
    }

    private func size(_ url: URL) throws -> Int64 {
        (try FileManager.default.attributesOfItem(atPath: url.path)[.size] as! NSNumber).int64Value
    }

    func testVerifiesAndInstalls() throws {
        let final = dir.appendingPathComponent("v1.sqlite")
        try PackageFinalizer.verify(zst: zst, expectedSha256: try sha(zst), expectedSize: try size(zst))
        try PackageFinalizer.install(zst: zst, final: final)
        XCTAssertEqual(try Data(contentsOf: final), payload)
        XCTAssertFalse(FileManager.default.fileExists(atPath: zst.path))
        XCTAssertFalse(FileManager.default.fileExists(atPath: dir.appendingPathComponent("v1.sqlite.tmp").path))
    }

    func testChecksumMismatchDeletesDownload() throws {
        XCTAssertThrowsError(try PackageFinalizer.verify(zst: zst, expectedSha256: String(repeating: "0", count: 64), expectedSize: try size(zst))) {
            XCTAssertEqual(($0 as? PackageError)?.code, "checksum")
        }
        XCTAssertFalse(FileManager.default.fileExists(atPath: zst.path))
    }

    func testSizeMismatchIsNetworkError() throws {
        XCTAssertThrowsError(try PackageFinalizer.verify(zst: zst, expectedSha256: try sha(zst), expectedSize: 1)) {
            XCTAssertEqual(($0 as? PackageError)?.code, "network")
        }
    }

    func testCorruptStreamFailsWithoutLeavingTmp() throws {
        let bad = dir.appendingPathComponent("bad.sqlite.zst")
        try Data((0..<4096).map { _ in UInt8.random(in: 0...255) }).write(to: bad)
        let final = dir.appendingPathComponent("bad.sqlite")
        XCTAssertThrowsError(try PackageFinalizer.install(zst: bad, final: final)) {
            XCTAssertEqual(($0 as? PackageError)?.code, "decompress")
        }
        XCTAssertFalse(FileManager.default.fileExists(atPath: dir.appendingPathComponent("bad.sqlite.tmp").path))
        XCTAssertFalse(FileManager.default.fileExists(atPath: final.path))
    }

    func testRestartsAfterAKillLeftATmpFile() throws {
        let final = dir.appendingPathComponent("v1.sqlite")
        try Data([9, 9, 9]).write(to: dir.appendingPathComponent("v1.sqlite.tmp"))
        try PackageFinalizer.install(zst: zst, final: final)
        XCTAssertEqual(try Data(contentsOf: final), payload)
        XCTAssertFalse(FileManager.default.fileExists(atPath: dir.appendingPathComponent("v1.sqlite.tmp").path))
    }

    func testTruncatedFrameFails() throws {
        let cut = dir.appendingPathComponent("cut.sqlite.zst")
        try Data(contentsOf: zst).prefix(1000).write(to: cut)
        XCTAssertThrowsError(try PackageFinalizer.install(zst: cut, final: dir.appendingPathComponent("cut.sqlite"))) {
            XCTAssertEqual(($0 as? PackageError)?.code, "decompress")
        }
        XCTAssertFalse(FileManager.default.fileExists(atPath: dir.appendingPathComponent("cut.sqlite.tmp").path))
        XCTAssertFalse(FileManager.default.fileExists(atPath: dir.appendingPathComponent("cut.sqlite").path))
    }

    func testConcatenatedFramesAreAllDecompressed() throws {
        let second = Data((0..<500_000).map { UInt8($0 % 13) })
        let multi = dir.appendingPathComponent("multi.sqlite.zst")
        try (compress(payload) + compress(second)).write(to: multi)
        let final = dir.appendingPathComponent("multi.sqlite")
        try PackageFinalizer.install(zst: multi, final: final)
        XCTAssertEqual(try Data(contentsOf: final), payload + second)
    }

    func testCancelledInstallLeavesNoTmpAndKeepsTheDownload() throws {
        let final = dir.appendingPathComponent("v1.sqlite")
        XCTAssertThrowsError(try PackageFinalizer.install(zst: zst, final: final, cancelled: { true })) {
            guard case .cancelled? = $0 as? PackageError else { return XCTFail("expected cancelled, got \($0)") }
        }
        XCTAssertFalse(FileManager.default.fileExists(atPath: dir.appendingPathComponent("v1.sqlite.tmp").path))
        XCTAssertTrue(FileManager.default.fileExists(atPath: zst.path))
    }

    func testInstallReplacesAnExistingFinalFile() throws {
        let final = dir.appendingPathComponent("v1.sqlite")
        try Data([1, 2, 3]).write(to: final)
        try PackageFinalizer.install(zst: zst, final: final)
        XCTAssertEqual(try Data(contentsOf: final), payload)
    }
}
