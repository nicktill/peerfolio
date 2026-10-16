import SwiftUI
import PeerfolioKit

/// An environment for previews. It points at an address nothing listens on and starts with no tokens, so a
/// preview that accidentally loads data fails fast instead of reaching a real server. Previews pass `Mock` data in.
enum PreviewSupport {
    @MainActor static var environment: AppEnvironment {
        AppEnvironment(baseURL: URL(string: "https://preview.invalid")!, tokenStore: InMemoryTokenStore())
    }

    /// A finished assistant exchange with an X-Ray, visuals and a link, for previews.
    static var conversation: [ChatTurn] {
        var answer = ChatTurn(role: .assistant, text: "Your portfolio is **tech heavy** but broadly diversified.\n\n- VTI is about 40% of holdings\n- NVDA is the largest single stock\n\nWorth a look: [concentration](https://www.peerfolio.org).")
        answer.xray = Mock.xray
        answer.visuals = Mock.visuals
        answer.link = ("Open in Wealth Lab", "/wealth?x=1")
        return [ChatTurn(role: .user, text: "How am I doing?"), answer]
    }
}
