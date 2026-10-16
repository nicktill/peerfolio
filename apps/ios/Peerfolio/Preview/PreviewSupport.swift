import SwiftUI
import PeerfolioKit

/// An environment for previews. It points at an address nothing listens on and starts with no tokens, so a
/// preview that accidentally loads data fails fast instead of reaching a real server. Previews pass `Mock` data in.
enum PreviewSupport {
    @MainActor static var environment: AppEnvironment {
        AppEnvironment(baseURL: URL(string: "https://preview.invalid")!, tokenStore: InMemoryTokenStore())
    }
}
