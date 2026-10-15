import Foundation

public final class JobStore {
    private static let lock = NSLock()
    private let file: URL

    public init(dir: URL) { file = dir.appendingPathComponent("jobs.json") }

    public func all() -> [InstallJobRecord] {
        Self.lock.lock(); defer { Self.lock.unlock() }
        return read()
    }

    public func get(_ id: String) -> InstallJobRecord? { all().first { $0.id == id } }

    public func put(_ job: InstallJobRecord) {
        Self.lock.lock(); defer { Self.lock.unlock() }
        var jobs = read().filter { $0.id != job.id }
        jobs.append(job)
        write(jobs)
    }

    /// Compare-and-set: re-reads the stored job under the lock and writes it back only if `mutate` returns true.
    /// Returns the written job, or nil when the job is missing or the mutation was declined.
    @discardableResult
    public func update(_ id: String, _ mutate: (inout InstallJobRecord) -> Bool) -> InstallJobRecord? {
        Self.lock.lock(); defer { Self.lock.unlock() }
        var jobs = read()
        guard let i = jobs.firstIndex(where: { $0.id == id }) else { return nil }
        guard mutate(&jobs[i]) else { return nil }
        write(jobs)
        return jobs[i]
    }

    public func remove(_ id: String) {
        Self.lock.lock(); defer { Self.lock.unlock() }
        write(read().filter { $0.id != id })
    }

    private func read() -> [InstallJobRecord] {
        guard let data = try? Data(contentsOf: file) else { return [] }
        return (try? JSONDecoder().decode([InstallJobRecord].self, from: data)) ?? []
    }

    private func write(_ jobs: [InstallJobRecord]) {
        if let data = try? JSONEncoder().encode(jobs) { try? data.write(to: file, options: .atomic) }
    }
}
