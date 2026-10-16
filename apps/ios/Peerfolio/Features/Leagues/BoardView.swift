import SwiftUI
import Observation
import PeerfolioKit

@MainActor
@Observable
final class BoardViewModel {
    var state: Loadable<BoardResponse>
    var range: PerformanceRange = .month
    var followingOnly = false
    /// Follow state flipped this session, by handle, so the button answers instantly.
    var followOverrides: [String: Bool] = [:]
    private let client: APIClient?

    init(client: APIClient?, preset: BoardResponse? = nil) {
        self.client = client
        self.state = preset.map { .loaded($0) } ?? .idle
    }

    func load() async {
        guard let client else { return }
        if state.value == nil { state = .loading }
        do { state = .loaded(try await client.board(range: range, followingOnly: followingOnly)) }
        catch let error as APIError { if state.value == nil { state = .failed(error) } }
        catch {}
    }

    func isFollowing(_ trader: BoardResponse.Trader) -> Bool {
        trader.handle.flatMap { followOverrides[$0] } ?? trader.isFollowing
    }

    func toggleFollow(_ trader: BoardResponse.Trader) async {
        guard let handle = trader.handle else { return }
        let target = !isFollowing(trader)
        followOverrides[handle] = target
        Haptics.light()
        guard let client else { return }
        do { followOverrides[handle] = target ? try await client.follow(handle: handle) : try await client.unfollow(handle: handle) }
        catch { followOverrides[handle] = !target; Haptics.error() }
    }
}

/// The public board: opted-in, brokerage-verified portfolios ranked by time-weighted return. Percentages only.
struct BoardView: View {
    @State var model: BoardViewModel

    init(model: BoardViewModel) { _model = State(initialValue: model) }

    var body: some View {
        VStack(alignment: .leading, spacing: Theme.pageGap) {
            HStack {
                SegmentedPicker(options: PerformanceRange.allCases, selection: Binding(get: { model.range }, set: { new in model.range = new; Task { await model.load() } })) { $0.rawValue }
                Spacer()
                SegmentedPicker(options: [false, true], selection: Binding(get: { model.followingOnly }, set: { new in model.followingOnly = new; Task { await model.load() } })) { $0 ? "Following" : "All" }
            }
            switch model.state {
            case .idle, .loading:
                Panel { VStack(spacing: 18) { ForEach(0..<4, id: \.self) { _ in HStack { Skeleton(width: 36, height: 36); Skeleton(height: 16) } } }.padding(Theme.inset) }
            case .failed(let e): ErrorPanel(error: e) { Task { await model.load() } }
            case .loaded(let board):
                if board.traders.isEmpty {
                    EmptyPanel(title: model.followingOnly ? "Nobody you follow yet" : "No one is ranked yet",
                               message: "People appear here after choosing to go public with at least \(board.minHistoryDays) days of brokerage-verified history.", systemImage: "trophy")
                } else {
                    Panel {
                        PanelHeader("Verified returns", detail: board.range)
                        ForEach(Array(board.traders.enumerated()), id: \.element.id) { index, t in
                            VStack(spacing: 0) {
                                StandingRow(rank: t.rank, name: t.name, handle: t.handle, imageURL: t.image, percent: t.percent, spark: t.spark, isYou: t.isYou,
                                            isVerified: true, holdings: t.holdings, first: index == 0)
                                if !t.isYou, t.handle != nil {
                                    HStack {
                                        if let bio = t.bio { Text(bio).font(PFFont.caption).foregroundStyle(Theme.fg3).lineLimit(2) }
                                        Spacer()
                                        let following = model.isFollowing(t)
                                        Button(following ? "Following" : "Follow") { Task { await model.toggleFollow(t) } }
                                            .font(PFFont.mono(11, medium: true)).tracking(0.4)
                                            .foregroundStyle(following ? Theme.fg2 : Theme.accent)
                                            .padding(.horizontal, 12).frame(minHeight: 32)
                                            .overlay(Capsule().strokeBorder(following ? Theme.hair : Theme.accent, lineWidth: 1))
                                    }
                                    .padding(.horizontal, Theme.inset).padding(.bottom, 10)
                                }
                            }
                        }
                        Text("Only people who opted in and whose every day came from a linked brokerage are ranked. Percentages only, never balances.")
                            .font(PFFont.caption).foregroundStyle(Theme.fg3).padding(Theme.inset)
                            .overlay(alignment: .top) { RowDivider() }
                    }
                    .swapIn(on: "\(model.range.rawValue)\(model.followingOnly)")
                }
            }
        }
        .task { await model.load() }
    }
}

#Preview("Board") {
    PageScroll { BoardView(model: BoardViewModel(client: nil, preset: Mock.board)) }.environment(PreviewSupport.environment)
}
#Preview("Board, dark") {
    PageScroll { BoardView(model: BoardViewModel(client: nil, preset: Mock.board)) }.environment(PreviewSupport.environment).preferredColorScheme(.dark)
}
