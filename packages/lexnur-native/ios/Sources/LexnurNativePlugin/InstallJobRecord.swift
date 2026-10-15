import Foundation

public struct InstallJobRecord: Codable, Equatable {
    public var id: String
    public var version: String
    public var url: String
    public var sha256: String
    public var sizeBytes: Int64
    public var installedSizeBytes: Int64
    public var allowCellular: Bool
    public var state: String
    public var bytesDownloaded: Int64 = 0
    public var relativePath: String? = nil
    public var error: String? = nil
    public var httpStatus: Int? = nil

    public var jsObject: [String: Any] {
        var o: [String: Any] = ["id": id, "version": version, "state": state, "bytesDownloaded": bytesDownloaded, "totalBytes": sizeBytes]
        if let relativePath { o["relativePath"] = relativePath }
        if let error { o["error"] = error }
        if let httpStatus, httpStatus != 0 { o["httpStatus"] = httpStatus }
        return o
    }
}
