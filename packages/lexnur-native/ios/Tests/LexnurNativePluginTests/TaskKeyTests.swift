import XCTest
@testable import LexnurNativePlugin

final class TaskKeyTests: XCTestCase {
    func testParsesAJobTaskDescription() throws {
        let k = try XCTUnwrap(DownloadManager.taskKey("oewn|2025.1"))
        XCTAssertEqual(k.id, "oewn")
        XCTAssertEqual(k.version, "2025.1")
    }

    func testRejectsAReplacedTaskAndMalformedDescriptions() {
        XCTAssertNil(DownloadManager.taskKey("oewn|2025.1|\(DownloadManager.replacedSuffix)"))
        XCTAssertNil(DownloadManager.taskKey(nil))
        XCTAssertNil(DownloadManager.taskKey("oewn"))
        XCTAssertNil(DownloadManager.taskKey("oewn|"))
        XCTAssertNil(DownloadManager.taskKey("|2025.1"))
    }
}
