import SwiftUI
import Observation
import PeerfolioKit

/// Feature switches. Sports leagues are not built on the backend yet, so the Sports half of the Fantasy
/// segmented control stays hidden until this is turned on.
enum Features {
    static let sportsEnabled = false
}

/// Everything screens need from the outside world: the API client and the signed-in user.
@MainActor
@Observable
final class AppEnvironment {
    let client: APIClient
    let baseURL: URL
    let auth: AuthController

    init(baseURL: URL, tokenStore: TokenStore = KeychainTokenStore()) {
        self.baseURL = baseURL
        let config = APIConfiguration(baseURL: baseURL)
        let transport = URLSessionTransport()
        let holder = SignOutRelay()
        let session = SessionManager(config: config, transport: transport, store: tokenStore, onSignedOut: { holder.fire() })
        let apiClient = APIClient(config: config, transport: transport, session: session)
        let controller = AuthController(client: apiClient)
        self.client = apiClient
        self.auth = controller
        holder.handler = { [weak controller] in Task { @MainActor in controller?.sessionEnded() } }
    }

    /// The web app's URL for a path such as `/wealth?x=1` returned by the assistant.
    func webURL(for href: String) -> URL? {
        if let absolute = URL(string: href), absolute.scheme != nil { return absolute.scheme?.hasPrefix("http") == true ? absolute : nil }
        return URL(string: href, relativeTo: baseURL)?.absoluteURL
    }

    static func configuredBaseURL() -> URL {
        let raw = Bundle.main.object(forInfoDictionaryKey: "PeerfolioBaseURL") as? String
        return URL(string: raw ?? "") ?? URL(string: "https://www.peerfolio.org")!
    }
}

/// Lets the session manager (created before the controller) call back into the controller.
private final class SignOutRelay: @unchecked Sendable {
    var handler: (() -> Void)?
    func fire() { handler?() }
}
