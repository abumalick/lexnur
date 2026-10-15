import Foundation

/// URLSession resume data carries the request it was created with, including its network policy. Rewriting the
/// saved requests lets a download continue under a new policy ("Download now" on a job waiting for Wi-Fi) from the
/// bytes it already has, as Android does with its .part file, instead of starting again from zero.
enum ResumeData {
    static let requestKeys = ["NSURLSessionResumeCurrentRequest", "NSURLSessionResumeOriginalRequest"]
    // The system archives under the literal key, archivedData(withRootObject:) under NSKeyedArchiveRootObjectKey.
    private static let rootKeys = ["NSKeyedArchiveRootObjectKey", NSKeyedArchiveRootObjectKey]

    /// Picks the resume data to continue a download under `allowCellular`, from the data saved under that policy
    /// (`matching`) or under the other one. It is rewritten to the policy; data that cannot be rewritten is used as is
    /// only when it already carries the policy, since a request still limited to Wi-Fi would wait for Wi-Fi forever.
    /// nil means the download starts again.
    static func forPolicy(matching: Data?, other: Data?, allowCellular: Bool) -> Data? {
        guard let saved = matching ?? other else { return nil }
        return retargeted(saved, allowCellular: allowCellular) ?? matching
    }

    /// Returns `data` with every saved request set to `allowCellular`: unchanged when they already are, rewritten
    /// otherwise, or nil when its format is not understood.
    static func retargeted(_ data: Data, allowCellular: Bool) -> Data? {
        if let root = unarchive(data) {
            guard let dict = root.object as? [String: Any], let out = retarget(dict, allowCellular: allowCellular) else { return nil }
            return out.changed ? archive(out.dict, key: root.key) : data
        }
        guard let dict = (try? PropertyListSerialization.propertyList(from: data, format: nil)) as? [String: Any],
              let out = retarget(dict, allowCellular: allowCellular) else { return nil }
        if !out.changed { return data }
        return try? PropertyListSerialization.data(fromPropertyList: out.dict, format: .binary, options: 0)
    }

    private static func retarget(_ dict: [String: Any], allowCellular: Bool) -> (dict: [String: Any], changed: Bool)? {
        var out = dict
        var found = false
        var changed = false
        for key in requestKeys {
            guard let value = dict[key] else { continue }
            let archived = value as? Data
            let root = archived.flatMap { unarchiveRequest($0) }
            guard let request = (root?.object ?? value) as? NSURLRequest else { return nil }
            found = true
            if request.allowsCellularAccess == allowCellular && request.allowsExpensiveNetworkAccess == allowCellular { continue }
            guard let copy = request.mutableCopy() as? NSMutableURLRequest else { return nil }
            copy.allowsCellularAccess = allowCellular
            copy.allowsExpensiveNetworkAccess = allowCellular
            guard let rewritten = copy.copy() as? NSURLRequest else { return nil }
            if let root { out[key] = archive(rewritten, key: root.key, secure: root.secure) } else { out[key] = rewritten }
            changed = true
        }
        return found ? (out, changed) : nil
    }

    private static func unarchive(_ data: Data) -> (object: Any, key: String)? {
        guard let unarchiver = try? NSKeyedUnarchiver(forReadingFrom: data) else { return nil }
        unarchiver.requiresSecureCoding = false
        defer { unarchiver.finishDecoding() }
        for key in rootKeys {
            if let object = unarchiver.decodeObject(forKey: key) { return (object, key) }
        }
        return nil
    }

    /// NSURLRequest archives differently with and without secure coding, and each form decodes only in its own mode.
    /// The system uses secure coding, so that is tried first, and the rewritten request is archived the same way.
    private static func unarchiveRequest(_ data: Data) -> (object: Any, key: String, secure: Bool)? {
        if let unarchiver = try? NSKeyedUnarchiver(forReadingFrom: data) {
            defer { unarchiver.finishDecoding() }
            for key in rootKeys {
                if let request = unarchiver.decodeObject(of: NSURLRequest.self, forKey: key) { return (request, key, true) }
            }
        }
        return unarchive(data).map { ($0.object, $0.key, false) }
    }

    private static func archive(_ object: Any, key: String, secure: Bool = false) -> Data {
        let archiver = NSKeyedArchiver(requiringSecureCoding: secure)
        archiver.encode(object, forKey: key)
        archiver.finishEncoding()
        return archiver.encodedData
    }
}
