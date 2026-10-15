import Foundation
import Network
import UIKit

private final class CancelFlag {
    private let lock = NSLock()
    private var value = false
    var isSet: Bool { lock.lock(); defer { lock.unlock() }; return value }
    func set() { lock.lock(); value = true; lock.unlock() }
}

final class DownloadManager: NSObject, URLSessionDownloadDelegate, URLSessionTaskDelegate {
    static let shared = DownloadManager()
    static let sessionId = "com.lexnur.packages"
    static let spaceMargin: Int64 = 16 << 20
    static let retryDelay: TimeInterval = 10

    var backgroundCompletionHandler: (() -> Void)?
    var onJob: ((InstallJobRecord) -> Void)?

    let dir: URL
    let store: JobStore
    private let work = DispatchQueue(label: "com.lexnur.install")
    private let monitor = NWPathMonitor()
    private var _path: NWPath?
    private var lastEmit: [String: Date] = [:]
    private var finalizing = Set<String>()

    // Guards the fields below. A pause, or a policy change that replaces a live task, cancels the task asynchronously
    // to obtain resume data; a launch that arrives before the data is written waits for it, so it continues from the
    // saved offset instead of starting from zero. Each has its own set so one finishing does not release the other.
    // `launching` holds "id|version" from launch() entry until its task exists (or was decided against), so the
    // several triggers (load, foreground, path change, retries, status) never create two tasks for one job.
    private let pauseLock = NSLock()
    private var pausing = Set<String>()
    private var replacing = Set<String>()
    private var deferredLaunch: [String: InstallJobRecord] = [:]
    private var launching = Set<String>()
    private var retries: [String: Int] = [:]

    private var path: NWPath? {
        get { pauseLock.lock(); defer { pauseLock.unlock() }; return _path }
        set { pauseLock.lock(); _path = newValue; pauseLock.unlock() }
    }

    lazy var session: URLSession = {
        let c = URLSessionConfiguration.background(withIdentifier: Self.sessionId)
        c.isDiscretionary = false
        c.sessionSendsLaunchEvents = true
        c.httpAdditionalHeaders = ["Accept-Encoding": "identity"]
        return URLSession(configuration: c, delegate: self, delegateQueue: nil)
    }()

    private override init() {
        dir = (try? PackagePaths.packagesDir()) ?? FileManager.default.temporaryDirectory
        store = JobStore(dir: dir)
        super.init()
        _ = session
        monitor.pathUpdateHandler = { [weak self] in
            let wasUsable = self?.path?.status == .satisfied
            self?.path = $0
            if $0.status == .satisfied, !wasUsable { self?.recover(allowFinalize: false) }
        }
        monitor.start(queue: DispatchQueue(label: "com.lexnur.path"))
    }

    // MARK: files

    private func packageDir(_ id: String) -> URL { dir.appendingPathComponent(id, isDirectory: true) }
    private func resumeFile(_ job: InstallJobRecord, cellular: Bool) -> URL {
        packageDir(job.id).appendingPathComponent("\(job.version).resume-\(cellular ? "cell" : "wifi")")
    }
    private func zstFile(_ job: InstallJobRecord) -> URL { packageDir(job.id).appendingPathComponent("\(job.version).sqlite.zst") }
    private func finalFile(_ job: InstallJobRecord) -> URL { packageDir(job.id).appendingPathComponent("\(job.version).sqlite") }
    /// Resume data carries the policy of the request it came from, so it is filed under that policy, not the job's.
    private func resumeFile(_ job: InstallJobRecord, for task: URLSessionTask) -> URL {
        resumeFile(job, cellular: (task.currentRequest ?? task.originalRequest)?.allowsCellularAccess ?? job.allowCellular)
    }
    private func tmpFile(_ job: InstallJobRecord) -> URL { finalFile(job).appendingPathExtension("tmp") }

    func discardArtifacts(of job: InstallJobRecord) {
        for f in [resumeFile(job, cellular: true), resumeFile(job, cellular: false), zstFile(job), tmpFile(job)] {
            try? FileManager.default.removeItem(at: f)
        }
    }

    // MARK: state helpers

    private static func isTerminal(_ state: String) -> Bool { state == "done" || state == "failed" }

    func waitingState(allowCellular: Bool) -> String {
        guard let path else { return "queued" }
        let usable = path.status == .satisfied
        if !allowCellular && (!usable || path.isExpensive) { return "waiting_wifi" }
        return usable ? "queued" : "waiting_network"
    }

    private func canRun(_ job: InstallJobRecord) -> Bool {
        guard let path, path.status == .satisfied else { return false }
        return job.allowCellular || !path.isExpensive
    }

    private func emit(_ job: InstallJobRecord?) {
        if let job { onJob?(job) }
    }

    /// Applies `mutate` to the stored job only while it is still the same version and `allowed` accepts its state.
    /// A job that was cancelled (missing), replaced by another version, or paused is never resurrected.
    @discardableResult
    private func write(_ id: String, _ version: String, allowing allowed: (String) -> Bool,
                       _ mutate: (inout InstallJobRecord) -> Void) -> InstallJobRecord? {
        let updated = store.update(id) { job in
            guard job.version == version, allowed(job.state) else { return false }
            mutate(&job)
            return true
        }
        emit(updated)
        return updated
    }

    private static let running: (String) -> Bool = { !["paused", "done", "failed"].contains($0) }

    // MARK: commands

    /// Starts or continues the download of a job the caller has already stored.
    func launch(_ job: InstallJobRecord) {
        let key = "\(job.id)|\(job.version)"
        pauseLock.lock()
        if pausing.contains(job.id) || replacing.contains(job.id) { deferredLaunch[job.id] = job; pauseLock.unlock(); return }
        if !launching.insert(key).inserted { pauseLock.unlock(); return }
        pauseLock.unlock()
        // Runs once: a policy replacement releases the key early, before the getAllTasks closure returns.
        let released = CancelFlag()
        let finish = { [self] in
            if released.isSet { return }
            released.set()
            pauseLock.lock(); launching.remove(key); pauseLock.unlock()
        }

        if FileManager.default.fileExists(atPath: zstFile(job).path) {
            if let updated = write(job.id, job.version, allowing: Self.running, { $0.state = "installing"; $0.error = nil }) {
                runFinalize(updated)
            }
            finish()
            return
        }
        do {
            try FileManager.default.createDirectory(at: packageDir(job.id), withIntermediateDirectories: true)
            let need = max(job.sizeBytes - job.bytesDownloaded, 0) + job.installedSizeBytes + Self.spaceMargin
            guard try PackagePaths.freeBytes(at: dir) >= need else { throw PackageError.noSpace }
        } catch {
            let code = (error as? PackageError)?.code ?? "io"
            write(job.id, job.version, allowing: Self.running, { $0.state = "failed"; $0.error = code })
            finish()
            return
        }
        let requested = job
        session.getAllTasks { [self] tasks in
            defer { finish() }
            // A pause or cancel may have landed since launch() was called.
            guard let fresh = store.get(requested.id), fresh.version == requested.version, Self.running(fresh.state) else { return }
            let job = fresh
            let mine = tasks.filter { $0.taskDescription?.hasPrefix("\(job.id)|") == true && ($0.state == .running || $0.state == .suspended) }
            for t in mine where t.taskDescription != "\(job.id)|\(job.version)" { t.cancel() }
            if let live = mine.first(where: { $0.taskDescription == "\(job.id)|\(job.version)" }) {
                replaceIfPolicyChanged(live, job, release: finish)
                return
            }

            // Each resume file is named by the policy its data carries, which may differ from the job's current one.
            let matching = resumeFile(job, cellular: job.allowCellular), other = resumeFile(job, cellular: !job.allowCellular)
            let data = ResumeData.forPolicy(matching: try? Data(contentsOf: matching), other: try? Data(contentsOf: other),
                                            allowCellular: job.allowCellular)
            for f in [matching, other] { try? FileManager.default.removeItem(at: f) }
            let task: URLSessionDownloadTask
            if let data {
                task = session.downloadTask(withResumeData: data)
            } else {
                guard let url = URL(string: job.url) else {
                    write(job.id, job.version, allowing: Self.running, { $0.state = "failed"; $0.error = "io" })
                    return
                }
                var req = URLRequest(url: url)
                req.allowsCellularAccess = job.allowCellular
                req.allowsExpensiveNetworkAccess = job.allowCellular
                task = session.downloadTask(with: req)
            }
            task.taskDescription = "\(job.id)|\(job.version)"
            task.resume()
        }
    }

    /// A background task waiting for Wi-Fi does not fail when the job is allowed onto mobile data, it keeps waiting.
    /// It is replaced by a task under the new policy that continues from its resume data. While the cancel is in
    /// flight the job is in `replacing`, so other triggers defer to the relaunch at the end.
    /// `release` frees the caller's launch key once `replacing` holds the id, so the relaunch at the end cannot be
    /// refused by a key that is still taken.
    private func replaceIfPolicyChanged(_ live: URLSessionTask, _ job: InstallJobRecord, release: () -> Void) {
        guard let live = live as? URLSessionDownloadTask,
              let request = live.currentRequest ?? live.originalRequest,
              request.allowsCellularAccess != job.allowCellular else { return }
        pauseLock.lock(); replacing.insert(job.id); deferredLaunch[job.id] = job; pauseLock.unlock()
        release()
        // The new description matches no stored version, so the delegate ignores the old task from here on and its
        // cancellation cannot rewrite the job. If the app dies before the cancel lands, recover() cancels the old
        // task by this suffix, and launch(), pause() and cancel() find it by its "id|" prefix. Then, or if the old
        // task finishes just before the cancel, its partial data is lost: the job keeps its stored state and
        // recover() or the deferred launch starts it again from zero under the new policy.
        live.taskDescription = "\(job.id)|\(job.version)|\(Self.replacedSuffix)"
        let file = resumeFile(job, cellular: request.allowsCellularAccess)
        live.cancel(byProducingResumeData: { [self] data in
            if let data, store.get(job.id)?.version == job.version { try? data.write(to: file, options: .atomic) }
            work.async { [self] in
                pauseLock.lock()
                replacing.remove(job.id)
                let next = deferredLaunch.removeValue(forKey: job.id)
                pauseLock.unlock()
                if let next { launch(next) }
            }
        })
    }

    func pause(_ id: String) {
        let paused = store.update(id) { job in
            if Self.isTerminal(job.state) { return false }
            job.state = "paused"
            return true
        }
        guard let paused else { return }
        emit(paused)
        pauseLock.lock(); pausing.insert(id); pauseLock.unlock()
        session.getAllTasks { [self] tasks in
            let mine = tasks.compactMap { $0 as? URLSessionDownloadTask }
                .filter { $0.taskDescription?.hasPrefix("\(id)|") == true && ($0.state == .running || $0.state == .suspended) }
            let group = DispatchGroup()
            for t in mine {
                group.enter()
                t.cancel(byProducingResumeData: { data in
                    if let data { try? data.write(to: self.resumeFile(paused, for: t), options: .atomic) }
                    group.leave()
                })
            }
            group.notify(queue: work) {
                self.pauseLock.lock()
                self.pausing.remove(id)
                let next = self.deferredLaunch.removeValue(forKey: id)
                self.pauseLock.unlock()
                if let next { self.launch(next) }
            }
        }
    }

    func cancel(_ id: String) {
        guard let job = store.get(id) else { return }
        store.remove(id)
        pauseLock.lock(); deferredLaunch.removeValue(forKey: id); pauseLock.unlock()
        session.getAllTasks { tasks in
            tasks.filter { $0.taskDescription?.hasPrefix("\(id)|") == true }.forEach { $0.cancel() }
        }
        discardArtifacts(of: job)
    }

    // MARK: recovery

    /// Runs at plugin load, on every return to the foreground and from status(). In-flight jobs without a live task
    /// are parked as waiting; installs that were deferred or interrupted are finished here, because a background
    /// launch is too short for a several-hundred-MB decompression (C5).
    func recover(allowFinalize: Bool = true) {
        session.getAllTasks { [self] tasks in
            // A replaced task outlives its replacement only when the app died before its cancel landed.
            pauseLock.lock(); let inFlight = replacing; pauseLock.unlock()
            for t in tasks where t.state == .running || t.state == .suspended {
                guard let d = t.taskDescription, d.hasSuffix("|\(Self.replacedSuffix)"),
                      let id = d.split(separator: "|").first, !inFlight.contains(String(id)) else { continue }
                t.cancel()
            }
            let live = Set(tasks.filter { $0.state == .running || $0.state == .suspended }.compactMap { $0.taskDescription })
            for job in store.all() {
                let hasZst = FileManager.default.fileExists(atPath: zstFile(job).path)
                if job.state != "done", !hasZst, FileManager.default.fileExists(atPath: finalFile(job).path) {
                    write(job.id, job.version, allowing: { $0 != "done" }, {
                        $0.state = "done"; $0.error = nil; $0.bytesDownloaded = $0.sizeBytes
                        $0.relativePath = "\($0.id)/\($0.version).sqlite"
                    })
                } else if ["verifying", "installing"].contains(job.state), hasZst {
                    // Only foreground entry points decompress (C5); the path monitor must not.
                    if allowFinalize { runFinalize(job) }
                } else if ["queued", "waiting_network", "waiting_wifi"].contains(job.state), !live.contains("\(job.id)|\(job.version)"), !hasZst, canRun(job) {
                    // Parked earlier and the network is back: continue from the resume data. launch() re-checks
                    // for a live task, and the delay lets a completion event queued for a finished task land first.
                    work.asyncAfter(deadline: .now() + 2) { [self] in
                        if let current = store.get(job.id), current.version == job.version, ["queued", "waiting_network", "waiting_wifi"].contains(current.state) { launch(current) }
                    }
                } else if ["downloading", "verifying", "installing"].contains(job.state), !live.contains("\(job.id)|\(job.version)") {
                    let state = job.allowCellular ? "waiting_network" : "waiting_wifi"
                    write(job.id, job.version, allowing: { ["downloading", "verifying", "installing"].contains($0) }, { $0.state = state })
                }
            }
        }
    }

    func observeForeground() {
        NotificationCenter.default.addObserver(forName: UIApplication.didBecomeActiveNotification, object: nil, queue: .main) { [weak self] _ in
            self?.recover()
        }
    }

    /// Decompression happens only while the app is active (C5): a background relaunch for session events is too
    /// short, and the job stays "installing" until the next foreground. The state is read on main, never waited on.
    private func runFinalize(_ incoming: InstallJobRecord) {
        DispatchQueue.main.async { [self] in
            guard UIApplication.shared.applicationState == .active else { return }
            let cancel = CancelFlag()
            let endLock = NSLock()
            var bg = UIBackgroundTaskIdentifier.invalid
            var ended = false
            let end = {
                endLock.lock(); defer { endLock.unlock() }
                if !ended { ended = true; UIApplication.shared.endBackgroundTask(bg) }
            }
            bg = UIApplication.shared.beginBackgroundTask(withName: "lexnur-install") {
                // Out of time: make the decompress/sha loops stop; they delete the .tmp and leave the job installing.
                cancel.set()
                end()
            }
            work.async { [self] in
                defer { DispatchQueue.main.async { end() } }
                if finalizing.contains(incoming.id) { return }
                finalizing.insert(incoming.id)
                defer { finalizing.remove(incoming.id) }
                finalize(incoming, cancelled: { cancel.isSet })
            }
        }
    }

    private func finalize(_ job: InstallJobRecord, cancelled: () -> Bool) {
        let id = job.id, version = job.version
        func step(_ state: String) -> Bool {
            write(id, version, allowing: Self.running, { $0.state = state; $0.error = nil }) != nil
        }
        do {
            try? FileManager.default.removeItem(at: tmpFile(job))
            guard step("verifying") else { return }
            try PackageFinalizer.verify(zst: zstFile(job), expectedSha256: job.sha256, expectedSize: job.sizeBytes, cancelled: cancelled)
            guard step("installing") else { return }
            try PackageFinalizer.install(zst: zstFile(job), final: finalFile(job), cancelled: cancelled)
            let done = write(id, version, allowing: { !Self.isTerminal($0) }, {
                $0.state = "done"; $0.bytesDownloaded = $0.sizeBytes; $0.relativePath = "\($0.id)/\($0.version).sqlite"
            })
            // The job was cancelled or replaced while installing: do not leave an orphaned database behind.
            if done == nil { try? FileManager.default.removeItem(at: finalFile(job)) }
        } catch PackageError.cancelled {
            try? FileManager.default.removeItem(at: tmpFile(job))
            write(id, version, allowing: { !Self.isTerminal($0) && $0 != "paused" }, { $0.state = "installing" })
        } catch {
            let code = (error as? PackageError)?.code ?? "io"
            write(id, version, allowing: { !Self.isTerminal($0) }, { $0.state = "failed"; $0.error = code })
        }
    }

    // MARK: URLSession delegate

    static let replacedSuffix = "replaced"

    /// Parses an "id|version" task description. Anything else, such as a replaced task's "id|version|replaced",
    /// is not a job's task and gives nil.
    static func taskKey(_ description: String?) -> (id: String, version: String)? {
        guard let parts = description?.split(separator: "|", omittingEmptySubsequences: false),
              parts.count == 2, !parts[0].isEmpty, !parts[1].isEmpty else { return nil }
        return (String(parts[0]), String(parts[1]))
    }

    private func key(_ task: URLSessionTask) -> (id: String, version: String)? { Self.taskKey(task.taskDescription) }

    func urlSession(_ session: URLSession, downloadTask: URLSessionDownloadTask, didWriteData _: Int64,
                    totalBytesWritten: Int64, totalBytesExpectedToWrite _: Int64) {
        guard let k = key(downloadTask) else { return }
        let now = Date()
        if let last = lastEmit[k.id], now.timeIntervalSince(last) < 0.25 { return }
        lastEmit[k.id] = now
        pauseLock.lock(); retries[k.id] = nil; pauseLock.unlock()
        write(k.id, k.version, allowing: { ["queued", "downloading", "waiting_network", "waiting_wifi"].contains($0) }, {
            $0.state = "downloading"; $0.bytesDownloaded = totalBytesWritten
        })
    }

    func urlSession(_ session: URLSession, taskIsWaitingForConnectivity task: URLSessionTask) {
        guard let k = key(task) else { return }
        write(k.id, k.version, allowing: { ["queued", "downloading", "waiting_network", "waiting_wifi"].contains($0) }, {
            $0.state = $0.allowCellular ? "waiting_network" : "waiting_wifi"
        })
    }

    // The system deletes `location` when this method returns, so the move happens synchronously here.
    // Verification and decompression are deferred to the foreground (C5); the job shows "Installing" meanwhile.
    func urlSession(_ session: URLSession, downloadTask: URLSessionDownloadTask, didFinishDownloadingTo location: URL) {
        guard let k = key(downloadTask), let job = store.get(k.id), job.version == k.version, !Self.isTerminal(job.state) else { return }
        let status = (downloadTask.response as? HTTPURLResponse)?.statusCode ?? 0
        guard status == 200 || status == 206 else {
            write(k.id, k.version, allowing: Self.running, { $0.state = "failed"; $0.error = "http"; $0.httpStatus = status })
            return
        }
        let zst = zstFile(job)
        do {
            try FileManager.default.createDirectory(at: packageDir(job.id), withIntermediateDirectories: true)
            try? FileManager.default.removeItem(at: zst)
            try FileManager.default.moveItem(at: location, to: zst)
        } catch {
            write(k.id, k.version, allowing: Self.running, { $0.state = "failed"; $0.error = "io" })
            return
        }
        // A paused job keeps its state; launch() finishes the install when it is resumed.
        guard let updated = write(k.id, k.version, allowing: Self.running, { $0.state = "installing"; $0.bytesDownloaded = $0.sizeBytes }) else {
            if store.get(k.id)?.version != k.version { try? FileManager.default.removeItem(at: zst) }
            return
        }
        runFinalize(updated)
    }

    func urlSession(_ session: URLSession, task: URLSessionTask, didCompleteWithError error: Error?) {
        guard let error, let k = key(task), let job = store.get(k.id), job.version == k.version, Self.running(job.state) else { return }
        let ns = error as NSError
        let data = ns.userInfo[NSURLSessionDownloadTaskResumeData] as? Data
        // The system reports a force-quit as "cancelled" but still hands over resume data. Pause, cancel and
        // replace are already filtered out above (state or version no longer match).
        if let data { try? data.write(to: resumeFile(job, for: task), options: .atomic) }
        if ns.code == NSURLErrorCancelled { return }
        if data != nil {
            write(k.id, k.version, allowing: Self.running, { $0.state = $0.allowCellular ? "waiting_network" : "waiting_wifi" })
            pauseLock.lock()
            let n = retries[k.id, default: 0]
            retries[k.id] = n + 1
            pauseLock.unlock()
            let delay = [Self.retryDelay, 30, 60][min(n, 2)]
            work.asyncAfter(deadline: .now() + delay) { [self] in
                if let current = store.get(k.id), current.version == k.version, ["waiting_network", "waiting_wifi"].contains(current.state) { launch(current) }
            }
        } else {
            write(k.id, k.version, allowing: Self.running, { $0.state = "failed"; $0.error = "network" })
        }
    }

    func urlSessionDidFinishEvents(forBackgroundURLSession session: URLSession) {
        DispatchQueue.main.async {
            self.backgroundCompletionHandler?()
            self.backgroundCompletionHandler = nil
        }
    }
}
