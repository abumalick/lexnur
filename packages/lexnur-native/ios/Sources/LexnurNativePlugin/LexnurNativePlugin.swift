import Foundation
import Capacitor

@objc(LexnurNativePlugin)
public class LexnurNativePlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "LexnurNativePlugin"
    public let jsName = "LexnurNative"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "paths", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "freeSpace", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "systemColors", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "startInstall", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "pauseInstall", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "resumeInstall", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "cancelInstall", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "removePackage", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "status", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "acknowledge", returnType: CAPPluginReturnPromise)
    ]

    private var manager: DownloadManager { DownloadManager.shared }

    override public func load() {
        manager.onJob = { [weak self] job in self?.notifyListeners("installProgress", data: job.jsObject) }
        _ = manager.session
        manager.observeForeground()
        manager.recover()
    }

    @objc func paths(_ call: CAPPluginCall) {
        do { call.resolve(["packagesDir": try PackagePaths.packagesDir().path]) }
        catch { call.reject("paths failed", "io", error) }
    }

    @objc func freeSpace(_ call: CAPPluginCall) {
        do { call.resolve(["bytes": try PackagePaths.freeBytes(at: PackagePaths.packagesDir())]) }
        catch { call.reject("freeSpace failed", "io", error) }
    }

    @objc func systemColors(_ call: CAPPluginCall) {
        call.resolve(["seed": NSNull()])
    }

    @objc func startInstall(_ call: CAPPluginCall) {
        guard let id = call.getString("id"), let version = call.getString("version"),
              let url = call.getString("url"), let sha = call.getString("sha256") else { call.reject("missing option", "io"); return }
        let cellular = call.getBool("allowCellular") ?? false
        if let existing = manager.store.get(id) {
            if existing.version == version, !["done", "failed"].contains(existing.state) {
                // Same version already in flight: re-launch is a no-op while a task is live, and continues a paused or parked job.
                let updated = manager.store.update(id) { job in
                    if ["done", "failed"].contains(job.state) { return false }
                    job.allowCellular = cellular
                    if job.state == "paused" || job.state.hasPrefix("waiting") { job.state = manager.waitingState(allowCellular: cellular); job.error = nil }
                    return true
                }
                if let updated { manager.onJob?(updated); manager.launch(updated) }
                call.resolve()
                return
            }
            manager.discardArtifacts(of: existing)
        }
        let job = InstallJobRecord(id: id, version: version, url: url, sha256: sha,
                                   sizeBytes: Int64(call.getDouble("sizeBytes") ?? 0),
                                   installedSizeBytes: Int64(call.getDouble("installedSizeBytes") ?? 0),
                                   allowCellular: cellular, state: manager.waitingState(allowCellular: cellular))
        manager.store.put(job)
        manager.onJob?(job)
        manager.launch(job)
        call.resolve()
    }

    @objc func pauseInstall(_ call: CAPPluginCall) {
        manager.pause(call.getString("id") ?? "")
        call.resolve()
    }

    @objc func resumeInstall(_ call: CAPPluginCall) {
        let id = call.getString("id") ?? ""
        guard manager.store.get(id) != nil else { call.reject("no such job", "io"); return }
        let cellular = call.getBool("allowCellular") ?? false
        let updated = manager.store.update(id) { job in
            if ["done", "failed"].contains(job.state) { return false }
            job.allowCellular = cellular
            job.state = manager.waitingState(allowCellular: cellular)
            job.error = nil
            return true
        }
        if let updated { manager.onJob?(updated); manager.launch(updated) }
        call.resolve()
    }

    @objc func cancelInstall(_ call: CAPPluginCall) {
        manager.cancel(call.getString("id") ?? "")
        call.resolve()
    }

    @objc func removePackage(_ call: CAPPluginCall) {
        guard let url = PackagePaths.resolve(call.getString("relativePath") ?? "", in: manager.dir) else { call.reject("bad path", "io"); return }
        do {
            if FileManager.default.fileExists(atPath: url.path) { try FileManager.default.removeItem(at: url) }
            let parent = url.deletingLastPathComponent()
            if parent.standardizedFileURL != manager.dir.standardizedFileURL,
               (try? FileManager.default.contentsOfDirectory(atPath: parent.path))?.isEmpty == true { try? FileManager.default.removeItem(at: parent) }
            call.resolve()
        } catch { call.reject("delete failed", "io", error) }
    }

    @objc func status(_ call: CAPPluginCall) {
        manager.recover()
        call.resolve(["jobs": manager.store.all().map { $0.jsObject }])
    }

    @objc func acknowledge(_ call: CAPPluginCall) {
        let id = call.getString("id") ?? ""
        if let job = manager.store.get(id), ["done", "failed"].contains(job.state) { manager.store.remove(id) }
        call.resolve()
    }
}
