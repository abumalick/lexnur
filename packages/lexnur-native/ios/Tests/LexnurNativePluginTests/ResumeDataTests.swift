import XCTest
@testable import LexnurNativePlugin

final class ResumeDataTests: XCTestCase {
    private let url = URL(string: "https://dl.lexnur.com/catalog/packages/oewn-2025.sqlite.zst")!

    private func request(cellular: Bool) -> NSURLRequest {
        let r = NSMutableURLRequest(url: url)
        r.allowsCellularAccess = cellular
        r.allowsExpensiveNetworkAccess = cellular
        r.setValue("bytes=1234-", forHTTPHeaderField: "Range")
        return r.copy() as! NSURLRequest
    }

    private func archive(_ object: Any, key: String = NSKeyedArchiveRootObjectKey) -> Data {
        let a = NSKeyedArchiver(requiringSecureCoding: false)
        a.encode(object, forKey: key)
        a.finishEncoding()
        return a.encodedData
    }

    private func unarchive(_ data: Data, key: String = NSKeyedArchiveRootObjectKey) -> Any? {
        guard let u = try? NSKeyedUnarchiver(forReadingFrom: data) else { return nil }
        u.requiresSecureCoding = false
        defer { u.finishDecoding() }
        return u.decodeObject(forKey: key)
    }

    private func assertPolicy(_ value: Any?, cellular: Bool, file: StaticString = #filePath, line: UInt = #line) {
        let r = ((value as? Data).flatMap { unarchive($0) } ?? value) as? NSURLRequest
        XCTAssertNotNil(r, file: file, line: line)
        XCTAssertEqual(r?.allowsCellularAccess, cellular, file: file, line: line)
        XCTAssertEqual(r?.allowsExpensiveNetworkAccess, cellular, file: file, line: line)
        XCTAssertEqual(r?.url, url, file: file, line: line)
        XCTAssertEqual(r?.value(forHTTPHeaderField: "Range"), "bytes=1234-", file: file, line: line)
    }

    func testRewritesBothRequestsInAPropertyListContainer() throws {
        let dict: [String: Any] = [
            "NSURLSessionResumeCurrentRequest": archive(request(cellular: false)),
            "NSURLSessionResumeOriginalRequest": archive(request(cellular: false)),
            "NSURLSessionResumeBytesReceived": 1234,
        ]
        let data = try PropertyListSerialization.data(fromPropertyList: dict, format: .binary, options: 0)
        let out = try XCTUnwrap(ResumeData.retargeted(data, allowCellular: true))
        let decoded = try XCTUnwrap(PropertyListSerialization.propertyList(from: out, format: nil) as? [String: Any])
        assertPolicy(decoded["NSURLSessionResumeCurrentRequest"], cellular: true)
        assertPolicy(decoded["NSURLSessionResumeOriginalRequest"], cellular: true)
        XCTAssertEqual(decoded["NSURLSessionResumeBytesReceived"] as? Int, 1234)
    }

    func testRewritesRequestsInAKeyedArchiveContainerUnderTheSystemRootKey() throws {
        let key = "NSKeyedArchiveRootObjectKey"
        let dict: [String: Any] = [
            "NSURLSessionResumeCurrentRequest": request(cellular: false),
            "NSURLSessionResumeOriginalRequest": archive(request(cellular: false)),
            "NSURLSessionResumeBytesReceived": 1234,
        ]
        let out = try XCTUnwrap(ResumeData.retargeted(archive(dict, key: key), allowCellular: true))
        let decoded = try XCTUnwrap(unarchive(out, key: key) as? [String: Any])
        assertPolicy(decoded["NSURLSessionResumeCurrentRequest"], cellular: true)
        assertPolicy(decoded["NSURLSessionResumeOriginalRequest"], cellular: true)
        XCTAssertEqual(decoded["NSURLSessionResumeBytesReceived"] as? Int, 1234)
    }

    func testRewritesRequestsArchivedWithSecureCodingAsTheSystemDoes() throws {
        let key = "NSKeyedArchiveRootObjectKey"
        let secure = { (r: NSURLRequest) -> Data in
            let a = NSKeyedArchiver(requiringSecureCoding: true)
            a.encode(r, forKey: key)
            a.finishEncoding()
            return a.encodedData
        }
        let dict: [String: Any] = [
            "NSURLSessionResumeCurrentRequest": secure(request(cellular: false)),
            "NSURLSessionResumeOriginalRequest": secure(request(cellular: false)),
            "NSURLSessionResumeBytesReceived": 1234,
        ]
        let out = try XCTUnwrap(ResumeData.retargeted(archive(dict, key: key), allowCellular: true))
        let decoded = try XCTUnwrap(unarchive(out, key: key) as? [String: Any])
        for k in ResumeData.requestKeys {
            let data = try XCTUnwrap(decoded[k] as? Data)
            let u = try NSKeyedUnarchiver(forReadingFrom: data)
            let r = try XCTUnwrap(u.decodeObject(of: NSURLRequest.self, forKey: key))
            XCTAssertTrue(r.allowsCellularAccess)
            XCTAssertTrue(r.allowsExpensiveNetworkAccess)
            XCTAssertEqual(r.value(forHTTPHeaderField: "Range"), "bytes=1234-")
        }
    }

    func testReturnsDataAlreadyUnderThePolicyUnchanged() throws {
        let dict: [String: Any] = ["NSURLSessionResumeCurrentRequest": archive(request(cellular: true))]
        let data = try PropertyListSerialization.data(fromPropertyList: dict, format: .binary, options: 0)
        XCTAssertEqual(ResumeData.retargeted(data, allowCellular: true), data)
    }

    func testRejectsDataItDoesNotUnderstand() throws {
        XCTAssertNil(ResumeData.retargeted(Data("not resume data".utf8), allowCellular: true))
        let noRequest = try PropertyListSerialization.data(fromPropertyList: ["NSURLSessionResumeBytesReceived": 1], format: .binary, options: 0)
        XCTAssertNil(ResumeData.retargeted(noRequest, allowCellular: true))
        let badRequest = try PropertyListSerialization.data(fromPropertyList: ["NSURLSessionResumeCurrentRequest": Data([1, 2, 3])], format: .binary, options: 0)
        XCTAssertNil(ResumeData.retargeted(badRequest, allowCellular: true))
    }

    func testForPolicyRewritesDataSavedUnderTheOtherPolicy() throws {
        let other = try PropertyListSerialization.data(
            fromPropertyList: ["NSURLSessionResumeCurrentRequest": archive(request(cellular: false))], format: .binary, options: 0)
        let out = try XCTUnwrap(ResumeData.forPolicy(matching: nil, other: other, allowCellular: true))
        let decoded = try XCTUnwrap(PropertyListSerialization.propertyList(from: out, format: nil) as? [String: Any])
        assertPolicy(decoded["NSURLSessionResumeCurrentRequest"], cellular: true)
    }

    func testForPolicyUsesUnreadableDataOnlyWhenSavedUnderThePolicy() {
        let unreadable = Data("not resume data".utf8)
        XCTAssertEqual(ResumeData.forPolicy(matching: unreadable, other: nil, allowCellular: true), unreadable)
        XCTAssertNil(ResumeData.forPolicy(matching: nil, other: unreadable, allowCellular: true))
        XCTAssertNil(ResumeData.forPolicy(matching: nil, other: nil, allowCellular: true))
    }
}
