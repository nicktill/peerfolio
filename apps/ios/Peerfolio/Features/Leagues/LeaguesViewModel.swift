import SwiftUI
import Observation
import PeerfolioKit

@MainActor
@Observable
final class LeaguesViewModel {
    var state: Loadable<[LeagueSummary]>
    let client: APIClient?

    init(client: APIClient?, preset: [LeagueSummary]? = nil) {
        self.client = client
        self.state = preset.map { .loaded($0) } ?? .idle
    }

    func load() async {
        guard let client else { return }
        if state.value == nil { state = .loading }
        do { state = .loaded(try await client.leagues()) }
        catch let error as APIError { if state.value == nil { state = .failed(error) } }
        catch {}
    }

    /// Joins by invite code; returns an error message or nil on success.
    func join(code: String) async -> String? {
        guard let client else { return nil }
        do { _ = try await client.joinLeague(code: code.trimmingCharacters(in: .whitespaces)); await load(); return nil }
        catch { return (error as? APIError)?.errorDescription ?? "Couldn't join that league." }
    }

    func create(_ request: CreateLeagueRequest) async -> String? {
        guard let client else { return nil }
        do { _ = try await client.createLeague(request); await load(); return nil }
        catch { return (error as? APIError)?.errorDescription ?? "Couldn't create the league." }
    }
}

@MainActor
@Observable
final class LeagueDetailViewModel {
    var state: Loadable<LeagueDetailResponse>
    var range: PerformanceRange = .month
    /// Reactions toggled this session, to flip the pill immediately: "<toUserId>|<emoji>".
    var myReactions: Set<String> = []
    let leagueId: String
    private let client: APIClient?

    init(client: APIClient?, leagueId: String, preset: LeagueDetailResponse? = nil) {
        self.client = client
        self.leagueId = leagueId
        self.state = preset.map { .loaded($0) } ?? .idle
    }

    func load() async {
        guard let client else { return }
        if state.value == nil { state = .loading }
        do { state = .loaded(try await client.league(id: leagueId, range: range)) }
        catch let error as APIError { if state.value == nil { state = .failed(error) } }
        catch {}
    }

    func changeRange(_ new: PerformanceRange) async { range = new; await load() }

    func toggleReaction(to userId: String, emoji: String) async {
        let key = "\(userId)|\(emoji)"
        let wasOn = myReactions.contains(key)
        if wasOn { myReactions.remove(key) } else { myReactions.insert(key) }
        Haptics.light()
        guard let client else { return }
        do {
            let result = try await client.reactInLeague(id: leagueId, toUserId: userId, emoji: emoji)
            if result.active { myReactions.insert(key) } else { myReactions.remove(key) }
            await load()
        } catch {
            if wasOn { myReactions.insert(key) } else { myReactions.remove(key) }
            Haptics.error()
        }
    }

    func setSharing(_ on: Bool) async {
        guard let client else { return }
        _ = try? await client.send("PATCH", "/leagues/\(leagueId)", body: ["shareHoldings": on], as: OkResponse.self)
        await load()
    }

    func leave() async -> Bool {
        guard let client else { return true }
        do { try await client.leaveLeague(id: leagueId); return true } catch { Haptics.error(); return false }
    }
}
