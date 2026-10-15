import Foundation

public enum PackagePaths {
    public static func packagesDir(base: URL? = nil) throws -> URL {
        let root = try base ?? FileManager.default.url(for: .applicationSupportDirectory, in: .userDomainMask, appropriateFor: nil, create: true)
        var dir = root.appendingPathComponent("packages", isDirectory: true)
        try FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
        var values = URLResourceValues()
        values.isExcludedFromBackup = true
        try dir.setResourceValues(values)
        return dir
    }

    public static func freeBytes(at dir: URL) throws -> Int64 {
        let v = try dir.resourceValues(forKeys: [.volumeAvailableCapacityForImportantUsageKey])
        return v.volumeAvailableCapacityForImportantUsage ?? 0
    }

    // Rejects "..", absolute paths and anything resolving outside packagesDir.
    public static func resolve(_ relativePath: String, in dir: URL) -> URL? {
        guard !relativePath.hasPrefix("/"), !relativePath.split(separator: "/").contains("..") else { return nil }
        let url = dir.appendingPathComponent(relativePath).standardizedFileURL
        return url.path.hasPrefix(dir.standardizedFileURL.path + "/") ? url : nil
    }
}
