import Foundation

public enum LexnurBackgroundSession {
    // Called from AppDelegate.application(_:handleEventsForBackgroundURLSession:completionHandler:).
    public static func handleEvents(identifier: String, completionHandler: @escaping () -> Void) {
        guard identifier == DownloadManager.sessionId else { completionHandler(); return }
        DownloadManager.shared.backgroundCompletionHandler = completionHandler
        _ = DownloadManager.shared.session
    }
}
