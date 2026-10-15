import XCTest
@testable import LexnurNativePlugin

final class JobStoreTests: XCTestCase {
    func record(_ id: String, _ state: String) -> InstallJobRecord {
        InstallJobRecord(id: id, version: "20261011.1", url: "https://dl.lexnur.com/x", sha256: "ab",
                         sizeBytes: 10, installedSizeBytes: 20, allowCellular: true, state: state)
    }

    private func makeDir() throws -> URL {
        let dir = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        try FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
        return dir
    }

    func testPutGetRemovePersist() throws {
        let dir = try makeDir()
        let a = JobStore(dir: dir)
        a.put(record("oewn-2025", "queued"))
        a.put(record("wiktionary-en", "downloading"))
        XCTAssertEqual(JobStore(dir: dir).all().count, 2)
        a.remove("oewn-2025")
        XCTAssertNil(JobStore(dir: dir).get("oewn-2025"))
        XCTAssertEqual(JobStore(dir: dir).get("wiktionary-en")?.state, "downloading")
    }

    func testCorruptFileReadsAsEmpty() throws {
        let dir = try makeDir()
        try Data("{nope".utf8).write(to: dir.appendingPathComponent("jobs.json"))
        XCTAssertTrue(JobStore(dir: dir).all().isEmpty)
    }

    func testUpdateWritesOnlyWhenTheMutatorAccepts() throws {
        let store = JobStore(dir: try makeDir())
        store.put(record("a", "queued"))
        XCTAssertNil(store.update("a") { _ in false })
        XCTAssertEqual(store.get("a")?.state, "queued")
        XCTAssertEqual(store.update("a") { $0.state = "downloading"; return true }?.state, "downloading")
        XCTAssertEqual(store.get("a")?.state, "downloading")
        XCTAssertNil(store.update("missing") { _ in true })
    }

    func testConcurrentUpdatesDoNotLoseWrites() throws {
        let store = JobStore(dir: try makeDir())
        store.put(record("a", "queued"))
        DispatchQueue.concurrentPerform(iterations: 50) { _ in
            _ = store.update("a") { $0.bytesDownloaded += 1; return true }
        }
        XCTAssertEqual(store.get("a")?.bytesDownloaded, 50)
    }

    func testJsObjectShape() {
        var r = record("a", "done")
        r.relativePath = "a/20261011.1.sqlite"
        r.bytesDownloaded = 10
        let o = r.jsObject
        XCTAssertEqual(o["totalBytes"] as? Int64, 10)
        XCTAssertEqual(o["relativePath"] as? String, "a/20261011.1.sqlite")
        XCTAssertNil(o["error"])
        XCTAssertNil(o["httpStatus"])
    }
}
