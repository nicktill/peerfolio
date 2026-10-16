import SwiftUI
import PeerfolioKit

struct LeaguesView: View {
    @State var model: LeaguesViewModel
    @State private var showJoin = false
    @State private var showCreate = false

    enum Mode: String, CaseIterable { case mine = "My leagues", board = "Board" }
    @State private var mode: Mode = .mine
    @State private var board: BoardViewModel

    init(model: LeaguesViewModel, boardPreset: BoardResponse? = nil) {
        _model = State(initialValue: model)
        _board = State(initialValue: BoardViewModel(client: model.client, preset: boardPreset))
    }

    var body: some View {
        NavigationStack {
            PageScroll(refresh: { await model.load(); if mode == .board { await board.load() } }) {
                PageHead(title: "Leagues", lede: "Compare real returns with people you trust. Only percentages are shared, never balances.") {
                    Menu {
                        Button("Join with a code", systemImage: "ticket") { showJoin = true }
                        Button("Create a league", systemImage: "plus") { showCreate = true }
                    } label: {
                        Image(systemName: "plus").font(.system(size: 14, weight: .semibold)).foregroundStyle(Theme.fg2)
                            .frame(width: 36, height: 36)
                            .overlay(RoundedRectangle(cornerRadius: Theme.controlRadius, style: .continuous).strokeBorder(Theme.line, lineWidth: 1))
                    }
                    .accessibilityLabel("Join or create a league")
                }
                SegmentedPicker(options: Mode.allCases, selection: $mode) { $0.rawValue }
                if mode == .mine { content } else { BoardView(model: board) }
            }
            .toolbar(.hidden, for: .navigationBar)
            .navigationDestination(for: LeagueSummary.self) { league in
                LeagueDetailView(model: LeagueDetailViewModel(client: model.client, leagueId: league.id), summary: league)
            }
            .task { await model.load() }
            .sheet(isPresented: $showJoin) { JoinCodeSheet(title: "Join a league", hint: "Invite code") { code in await model.join(code: code) } }
            .sheet(isPresented: $showCreate) { CreateLeagueSheet { req in await model.create(req) } }
        }
    }

    @ViewBuilder private var content: some View {
        switch model.state {
        case .idle, .loading:
            Panel { VStack(spacing: 18) { ForEach(0..<3, id: \.self) { _ in HStack { Skeleton(width: 40, height: 40); Skeleton(height: 16) } } }.padding(Theme.inset) }
        case .failed(let e): ErrorPanel(error: e) { Task { await model.load() } }
        case .loaded(let leagues):
            if leagues.isEmpty {
                EmptyPanel(title: "No leagues yet", message: "Create one and send the invite code to friends, or join with a code someone sent you.", systemImage: "person.2")
            } else {
                Panel {
                    ForEach(Array(leagues.enumerated()), id: \.element.id) { index, league in
                        NavigationLink(value: league) {
                            DataRow(first: index == 0) {
                                LeagueTile(emoji: league.emoji)
                                RowTitle(title: league.name, subtitle: "\(league.memberCount) members" + (league.role == "owner" ? " · owner" : ""))
                                Spacer(minLength: 8)
                                Image(systemName: "chevron.right").font(.system(size: 12, weight: .semibold)).foregroundStyle(Theme.fg3)
                            }
                        }
                        .buttonStyle(RowPressStyle())
                        .reveal(index)
                    }
                }
            }
        }
    }
}

struct LeagueDetailView: View {
    @State var model: LeagueDetailViewModel
    let summary: LeagueSummary?
    @Environment(\.dismiss) private var dismiss
    @State private var confirmLeave = false

    init(model: LeagueDetailViewModel, summary: LeagueSummary?) { _model = State(initialValue: model); self.summary = summary }

    var body: some View {
        PageScroll(refresh: { await model.load() }) {
            switch model.state {
            case .idle, .loading:
                Panel { VStack(spacing: 18) { ForEach(0..<4, id: \.self) { _ in HStack { Skeleton(width: 36, height: 36); Skeleton(height: 16) } } }.padding(Theme.inset) }
            case .failed(let e): ErrorPanel(error: e) { Task { await model.load() } }
            case .loaded(let d): loaded(d)
            }
        }
        .navigationTitle(summary?.name ?? "League").navigationBarTitleDisplayMode(.inline)
        .task { await model.load() }
        .confirmationDialog("Leave this league?", isPresented: $confirmLeave, titleVisibility: .visible) {
            Button("Leave league", role: .destructive) { Task { if await model.leave() { Haptics.success(); dismiss() } } }
        }
    }

    @ViewBuilder private func loaded(_ d: LeagueDetailResponse) -> some View {
        HStack(spacing: 14) {
            LeagueTile(emoji: d.league.emoji, size: 52)
            VStack(alignment: .leading, spacing: 4) {
                Text(d.league.name).font(PFFont.serif(28)).tracking(-0.6).foregroundStyle(Theme.fg)
                if let desc = d.league.description { Text(desc).font(PFFont.body).foregroundStyle(Theme.fg2) }
            }
        }
        .reveal(0)

        HStack {
            SegmentedPicker(options: PerformanceRange.allCases, selection: Binding(get: { model.range }, set: { new in Task { await model.changeRange(new) } })) { $0.rawValue }
            Spacer()
        }
        .reveal(1)

        Panel {
            PanelHeader("Standings", detail: "time-weighted return")
            ForEach(Array(d.standings.enumerated()), id: \.element.id) { index, s in
                StandingRow(rank: s.rank, name: s.name, handle: s.handle, imageURL: s.image, percent: s.percent, spark: s.spark, isYou: s.isYou,
                            isVerified: s.isVerified, holdings: s.holdings, reactions: s.reactions, myReactions: model.myReactions, userId: s.userId,
                            onReact: { emoji in Task { await model.toggleReaction(to: s.userId, emoji: emoji) } }, first: index == 0)
            }
            Text("Returns ignore deposits and withdrawals, so adding money neither helps nor hurts your rank. Early rankings rest on little history.")
                .font(PFFont.caption).foregroundStyle(Theme.fg3).padding(Theme.inset)
                .overlay(alignment: .top) { Rectangle().fill(Theme.hair).frame(height: 1) }
        }
        .swapIn(on: model.range)
        .reveal(2)

        Panel {
            PanelHeader("Invite")
            HStack {
                VStack(alignment: .leading, spacing: 2) {
                    Text("Invite code").eyebrow(color: Theme.fg3)
                    Text(d.league.inviteCode).font(PFFont.mono(22, medium: true)).tracking(2).foregroundStyle(Theme.fg)
                }
                Spacer()
                ShareLink(item: "Join my Peerfolio league \"\(d.league.name)\" with code \(d.league.inviteCode)") {
                    Image(systemName: "square.and.arrow.up").font(.system(size: 15, weight: .medium)).foregroundStyle(Theme.fg2)
                        .frame(width: 44, height: 44)
                        .overlay(RoundedRectangle(cornerRadius: Theme.controlRadius, style: .continuous).strokeBorder(Theme.line, lineWidth: 1))
                }
                .accessibilityLabel("Share invite code")
            }
            .padding(Theme.inset)
        }
        .reveal(3)

        Panel {
            PanelHeader("Your sharing")
            Toggle(isOn: Binding(get: { d.you.shareHoldings }, set: { on in Task { await model.setSharing(on) } })) {
                VStack(alignment: .leading, spacing: 2) {
                    Text("Show my top holdings").font(PFFont.bodyMedium).foregroundStyle(Theme.fg)
                    Text("Members see tickers and weights, never dollar amounts.").font(PFFont.caption).foregroundStyle(Theme.fg3)
                }
            }
            .padding(Theme.inset)
            .tint(Theme.accent)
        }
        .reveal(4)

        Button("Leave league") { Haptics.warning(); confirmLeave = true }.buttonStyle(OutlineButtonStyle(destructive: true))
    }
}

// MARK: Sheets

struct JoinCodeSheet: View {
    let title: String
    let hint: String
    let submit: (String) async -> String?
    @Environment(\.dismiss) private var dismiss
    @State private var code = ""
    @State private var error: String?
    @State private var working = false
    @FocusState private var focused: Bool

    var body: some View {
        NavigationStack {
            PageScroll {
                PageHead(title, lede: "Enter the code a friend sent you.")
                TextField(hint, text: $code)
                    .textFieldStyle(PFTextFieldStyle(focused: focused))
                    .focused($focused).textInputAutocapitalization(.characters).autocorrectionDisabled()
                    .font(PFFont.mono(18, medium: true))
                if let error { Text(error).font(PFFont.caption).foregroundStyle(Theme.loss) }
                Button(working ? "Joining..." : "Join") {
                    Task {
                        working = true; error = nil
                        if let message = await submit(code) { error = message; Haptics.error() } else { Haptics.success(); dismiss() }
                        working = false
                    }
                }
                .buttonStyle(PrimaryButtonStyle()).disabled(code.trimmingCharacters(in: .whitespaces).count < 4 || working)
            }
            .toolbar { ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() } } }
            .navigationBarTitleDisplayMode(.inline)
            .onAppear { focused = true }
        }
        .presentationDetents([.medium])
    }
}

struct CreateLeagueSheet: View {
    let submit: (CreateLeagueRequest) async -> String?
    @Environment(\.dismiss) private var dismiss
    @State private var name = ""
    @State private var detail = ""
    @State private var emoji = "🏆"
    @State private var error: String?
    @State private var working = false

    private let emojis = ["🏆", "🚀", "📈", "💎", "🦅", "🧠", "🔥", "🌱"]

    var body: some View {
        NavigationStack {
            PageScroll {
                PageHead("New league", lede: "Members compare time-weighted returns. You can invite anyone with the code.")
                TextField("League name", text: $name).textFieldStyle(PFTextFieldStyle())
                TextField("Description (optional)", text: $detail).textFieldStyle(PFTextFieldStyle())
                HStack(spacing: 8) {
                    ForEach(emojis, id: \.self) { e in
                        Button { Haptics.selection(); emoji = e } label: { Text(e).font(.system(size: 22)).frame(width: 38, height: 38) }
                            .background(emoji == e ? Theme.raise : Color.clear, in: RoundedRectangle(cornerRadius: 10, style: .continuous))
                            .overlay(RoundedRectangle(cornerRadius: 10, style: .continuous).strokeBorder(emoji == e ? Theme.accent : Theme.hair, lineWidth: 1))
                            .buttonStyle(PressStyle())
                    }
                }
                if let error { Text(error).font(PFFont.caption).foregroundStyle(Theme.loss) }
                Button(working ? "Creating..." : "Create league") {
                    Task {
                        working = true; error = nil
                        let req = CreateLeagueRequest(name: name.trimmingCharacters(in: .whitespaces), description: detail.isEmpty ? nil : detail, emoji: emoji)
                        if let message = await submit(req) { error = message; Haptics.error() } else { Haptics.success(); dismiss() }
                        working = false
                    }
                }
                .buttonStyle(PrimaryButtonStyle()).disabled(name.trimmingCharacters(in: .whitespaces).count < 2 || working)
            }
            .toolbar { ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() } } }
            .navigationBarTitleDisplayMode(.inline)
        }
    }
}

#Preview("Leagues") { LeaguesView(model: LeaguesViewModel(client: nil, preset: Mock.leagues)).environment(PreviewSupport.environment) }
#Preview("Leagues, dark") { LeaguesView(model: LeaguesViewModel(client: nil, preset: Mock.leagues)).environment(PreviewSupport.environment).preferredColorScheme(.dark) }
#Preview("League detail") {
    NavigationStack { LeagueDetailView(model: LeagueDetailViewModel(client: nil, leagueId: "l1", preset: Mock.leagueDetail), summary: Mock.leagues.first) }.environment(PreviewSupport.environment)
}
#Preview("League detail, dark") {
    NavigationStack { LeagueDetailView(model: LeagueDetailViewModel(client: nil, leagueId: "l1", preset: Mock.leagueDetail), summary: Mock.leagues.first) }.environment(PreviewSupport.environment).preferredColorScheme(.dark)
}
