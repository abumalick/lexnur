import Foundation
import CryptoKit
import libzstd

public enum PackageError: Error {
    case checksum(String), network(String), decompress(String), io(String), noSpace, cancelled

    public var code: String {
        switch self {
        case .checksum: return "checksum"
        case .network: return "network"
        case .decompress: return "decompress"
        case .io, .cancelled: return "io"
        case .noSpace: return "no_space"
        }
    }
}

public enum PackageFinalizer {
    static let chunk = 1 << 20

    public static func sha256Hex(of url: URL, cancelled: () -> Bool = { false }) throws -> String {
        let h = try FileHandle(forReadingFrom: url)
        defer { try? h.close() }
        var hasher = SHA256()
        // The pool keeps the 1 MiB chunks from piling up until the loop ends.
        while try autoreleasepool(invoking: { () throws -> Bool in
            if cancelled() { throw PackageError.cancelled }
            guard let data = try h.read(upToCount: chunk), !data.isEmpty else { return false }
            hasher.update(data: data)
            return true
        }) {}
        return hasher.finalize().map { String(format: "%02x", $0) }.joined()
    }

    public static func verify(zst: URL, expectedSha256: String, expectedSize: Int64, cancelled: () -> Bool = { false }) throws {
        let size = ((try? FileManager.default.attributesOfItem(atPath: zst.path))?[.size] as? NSNumber)?.int64Value ?? -1
        guard size == expectedSize else { try? FileManager.default.removeItem(at: zst); throw PackageError.network("size \(size)") }
        let actual: String
        do { actual = try sha256Hex(of: zst, cancelled: cancelled) } catch let e as PackageError { throw e } catch { throw PackageError.io("\(error)") }
        guard actual == expectedSha256.lowercased() else { try? FileManager.default.removeItem(at: zst); throw PackageError.checksum(actual) }
    }

    public static func install(zst: URL, final: URL, cancelled: () -> Bool = { false }) throws {
        let tmp = final.deletingLastPathComponent().appendingPathComponent(final.lastPathComponent + ".tmp")
        try? FileManager.default.removeItem(at: tmp)
        try decompress(zst, to: tmp, cancelled: cancelled)
        if rename(tmp.path, final.path) != 0 {
            let err = errno
            try? FileManager.default.removeItem(at: tmp)
            throw err == ENOSPC ? PackageError.noSpace : PackageError.io("rename: errno \(err)")
        }
        try? FileManager.default.removeItem(at: zst)
    }

    private static func mapWriteError(_ error: Error) -> PackageError {
        let ns = error as NSError
        if (ns.domain == NSPOSIXErrorDomain && ns.code == Int(ENOSPC))
            || (ns.domain == NSCocoaErrorDomain && ns.code == NSFileWriteOutOfSpaceError) {
            return .noSpace
        }
        return .io("\(error)")
    }

    static func decompress(_ src: URL, to dst: URL, cancelled: () -> Bool = { false }) throws {
        guard FileManager.default.createFile(atPath: dst.path, contents: nil) else { throw PackageError.io("create \(dst.lastPathComponent)") }
        var ok = false
        defer { if !ok { try? FileManager.default.removeItem(at: dst) } }
        let input: FileHandle, output: FileHandle
        do {
            input = try FileHandle(forReadingFrom: src)
            output = try FileHandle(forWritingTo: dst)
        } catch { throw PackageError.io("\(error)") }
        defer {
            try? input.close()
            try? output.close()
        }
        guard let ds = ZSTD_createDStream() else { throw PackageError.decompress("create stream") }
        defer { ZSTD_freeDStream(ds) }
        let outCap = ZSTD_DStreamOutSize()
        let inCap = ZSTD_DStreamInSize()
        var outBuf = [UInt8](repeating: 0, count: outCap)
        var lastHint = 1
        while try autoreleasepool(invoking: { () throws -> Bool in
            if cancelled() { throw PackageError.cancelled }
            let data: Data?
            do { data = try input.read(upToCount: inCap) } catch { throw PackageError.io("\(error)") }
            guard let data, !data.isEmpty else { return false }
            try data.withUnsafeBytes { (raw: UnsafeRawBufferPointer) in
                var inb = ZSTD_inBuffer(src: raw.baseAddress, size: raw.count, pos: 0)
                var produced = 0
                repeat {
                    produced = try outBuf.withUnsafeMutableBytes { ob -> Int in
                        var outb = ZSTD_outBuffer(dst: ob.baseAddress, size: outCap, pos: 0)
                        let r = ZSTD_decompressStream(ds, &outb, &inb)
                        if ZSTD_isError(r) != 0 { throw PackageError.decompress(String(cString: ZSTD_getErrorName(r))) }
                        lastHint = Int(r)
                        return outb.pos
                    }
                    if produced > 0 {
                        do { try output.write(contentsOf: Data(outBuf[0..<produced])) }
                        catch { throw mapWriteError(error) }
                    }
                    // Remaining input starts the next frame (concatenated frames); an exactly full output buffer
                    // only needs another drain call while the current frame is unfinished, because a drain call
                    // after the frame ended would report the next frame's hint and mask completion.
                } while inb.pos < inb.size || (lastHint != 0 && produced == outCap)
            }
            return true
        }) {}
        guard lastHint == 0 else { throw PackageError.decompress("truncated frame") }
        do {
            if fcntl(output.fileDescriptor, F_FULLFSYNC) == -1 { try output.synchronize() }
        } catch { throw mapWriteError(error) }
        ok = true
    }
}
