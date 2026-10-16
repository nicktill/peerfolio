import SwiftUI
import Observation
import PeerfolioKit

@MainActor
@Observable
final class FantasyViewModel {
    var state: Loadable<[FantasyLeagueSummary]>
    let client: APIClient?

    init(client: APIClient?, preset: [FantasyLeagueSummary]? = nil) {
        self.client = client
        self.state = preset.map { .loaded($0) } ?? .idle
    }

    func load() async {
        guard let client else { return }
        if state.value == nil { state = .loading }
        do { state = .loaded(try await client.fantasyLeagues()) }
        catch let error as APIError { if state.value == nil { state = .failed(error) } }
        catch {}
    }

    func join(code: String) async -> String? {
        guard let client else { return nil }
        do { _ = try await client.joinFantasyLeague(code: code.trimmingCharacters(in: .whitespaces)); await load(); return nil }
        catch { return (error as? APIError)?.errorDescription ?? "Couldn't join that league." }
    }

    func create(name: String, startingCash: Int, maxPositionPct: Int?, endsAt: Date?) async -> String? {
        guard let client else { return nil }
        let iso = endsAt.map { ISO8601DateFormatter().string(from: $0) }
        do {
            _ = try await client.createFantasyLeague(CreateFantasyLeagueRequest(name: name, startingCash: startingCash, maxPositionPct: maxPositionPct, endsAt: iso))
            await load(); return nil
        } catch { return (error as? APIError)?.errorDescription ?? "Couldn't create the league." }
    }
}

@MainActor
@Observable
final class FantasyLeagueViewModel {
    var state: Loadable<FantasyLeagueDetail>
    var myReactions: Set<String> = []
    let leagueId: String
    let client: APIClient?

    init(client: APIClient?, leagueId: String, preset: FantasyLeagueDetail? = nil) {
        self.client = client; self.leagueId = leagueId
        self.state = preset.map { .loaded($0) } ?? .idle
    }

    func load() async {
        guard let client else { return }
        if state.value == nil { state = .loading }
        do { state = .loaded(try await client.fantasyLeague(id: leagueId)) }
        catch let error as APIError { if state.value == nil { state = .failed(error) } }
        catch {}
    }

    func cancel(order: FantasyOrder) async {
        guard let client else { return }
        do { try await client.cancelOrder(leagueId: leagueId, orderId: order.id); Haptics.success(); await load() }
        catch { Haptics.error() }
    }

    func toggleReaction(to userId: String, emoji: String) async {
        let key = "\(userId)|\(emoji)"
        let wasOn = myReactions.contains(key)
        if wasOn { myReactions.remove(key) } else { myReactions.insert(key) }
        Haptics.light()
        guard let client else { return }
        do {
            let result = try await client.reactInFantasy(id: leagueId, toUserId: userId, emoji: emoji)
            if result.active { myReactions.insert(key) } else { myReactions.remove(key) }
            await load()
        } catch {
            if wasOn { myReactions.insert(key) } else { myReactions.remove(key) }
            Haptics.error()
        }
    }
}

/// Trade panel state: ticker search with debounce, live quote preview, and order placement.
@MainActor
@Observable
final class TradeViewModel {
    enum Side: String, CaseIterable { case buy = "Buy", sell = "Sell" }
    enum Outcome: Equatable {
        case filled(String)
        case queued(String)
        case failed(String)
    }

    var side: Side = .buy
    var query = ""
    var suggestions: [TickerSearchResponse.Result] = []
    var symbol: String?
    var quote: Loadable<QuoteResponse> = .idle
    var amountText = ""
    var sharesText = ""
    var sellAll = false
    var isSubmitting = false
    var outcome: Outcome?

    let leagueId: String
    private let client: APIClient?
    private var searchTask: Task<Void, Never>?

    init(client: APIClient?, leagueId: String, preselect: String? = nil) {
        self.client = client; self.leagueId = leagueId
        if let preselect { self.symbol = preselect; self.query = preselect }
    }

    /// Debounced autocomplete: waits 250ms after the last keystroke so a league full of typists costs few requests.
    func queryChanged() {
        searchTask?.cancel()
        let text = query.trimmingCharacters(in: .whitespaces)
        if text != symbol { symbol = nil; quote = .idle }
        guard text.count >= 1, text != symbol, let client else { suggestions = []; return }
        searchTask = Task {
            try? await Task.sleep(nanoseconds: 250_000_000)
            guard !Task.isCancelled else { return }
            suggestions = (try? await client.searchTickers(text)) ?? []
        }
    }

    func select(_ result: TickerSearchResponse.Result) async {
        Haptics.selection()
        symbol = result.symbol; query = result.symbol; suggestions = []
        await loadQuote()
    }

    func loadQuote() async {
        guard let client, let symbol else { return }
        quote = .loading
        do { quote = .loaded(try await client.quote(symbol: symbol)) }
        catch let error as APIError { quote = .failed(error) }
        catch {}
    }

    var amount: Double? { Double(amountText.replacingOccurrences(of: ",", with: "")) }
    var shares: Double? { Double(sharesText) }

    var canSubmit: Bool {
        guard symbol != nil, !isSubmitting else { return false }
        switch side {
        case .buy: return (amount ?? 0) > 0
        case .sell: return sellAll || (shares ?? 0) > 0
        }
    }

    /// Rough size of the order for the confirm line; the server decides the real fill price.
    var estimate: String? {
        guard case .loaded(let q) = quote else { return nil }
        switch side {
        case .buy: return amount.map { "About \(Format.shares($0 / max(q.price, 0.01))) shares at \(Format.currency(q.price))" }
        case .sell: return shares.map { "About \(Format.currency($0 * q.price)) at \(Format.currency(q.price))" }
        }
    }

    func submit() async {
        guard let client, let symbol else { return }
        isSubmitting = true; outcome = nil
        defer { isSubmitting = false }
        let request: TradeRequest
        switch side {
        case .buy: request = .buy(symbol: symbol, amount: amount ?? 0)
        case .sell: request = sellAll ? .sellAll(symbol: symbol) : .sell(symbol: symbol, shares: shares ?? 0)
        }
        do {
            let result = try await client.trade(leagueId: leagueId, request)
            if result.isQueued {
                Haptics.warning()
                outcome = .queued(result.why == "closed" ? "The market is closed. Your order will fill at the next open." : "No live price right now. Your order is queued.")
            } else {
                Haptics.success()
                let price = result.price.map { " at \(Format.currency($0))" } ?? ""
                outcome = .filled("Filled \(result.ticker)\(price).")
            }
        } catch {
            Haptics.error()
            outcome = .failed((error as? APIError)?.errorDescription ?? "The order didn't go through.")
        }
    }
}
