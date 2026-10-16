import SwiftUI
import Observation
import PeerfolioKit

@MainActor
@Observable
final class NewsViewModel {
    var news: Loadable<NewsResponse>
    var market: Loadable<MarketNewsResponse>
    private let client: APIClient?

    init(client: APIClient?, news: NewsResponse? = nil, market: MarketNewsResponse? = nil) {
        self.client = client
        self.news = news.map { .loaded($0) } ?? .idle
        self.market = market.map { .loaded($0) } ?? .idle
    }

    /// The market board can be slow (it waits on providers), so it loads independently of the recap and headlines.
    func load() async {
        guard let client else { return }
        if news.value == nil { news = .loading }
        if market.value == nil { market = .loading }
        async let n: Void = loadNews(client)
        async let m: Void = loadMarket(client)
        _ = await (n, m)
    }

    private func loadNews(_ client: APIClient) async {
        do { news = .loaded(try await client.news()) }
        catch let error as APIError { if news.value == nil { news = .failed(error) } }
        catch {}
    }

    private func loadMarket(_ client: APIClient) async {
        do { market = .loaded(try await client.marketNews()) }
        catch let error as APIError { if market.value == nil { market = .failed(error) } }
        catch {}
    }
}
