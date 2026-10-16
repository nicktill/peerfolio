import SwiftUI
import Observation
import PeerfolioKit

@MainActor
@Observable
final class PortfolioViewModel {
    var state: Loadable<PortfolioResponse>
    var range: PerformanceRange = .month
    private let client: APIClient?

    /// `preset` is for previews: it shows the given data and never touches the network.
    init(client: APIClient?, preset: PortfolioResponse? = nil) {
        self.client = client
        self.state = preset.map { .loaded($0) } ?? .idle
    }

    func load() async {
        guard let client else { return }
        // Keep what is on screen while refreshing; only the first load shows skeletons.
        if state.value == nil { state = .loading }
        do {
            state = .loaded(try await client.portfolio(range: range))
        } catch let error as APIError {
            if state.value == nil { state = .failed(error) }
        } catch {}
    }

    func changeRange(_ new: PerformanceRange) async {
        range = new
        await load()
    }
}
