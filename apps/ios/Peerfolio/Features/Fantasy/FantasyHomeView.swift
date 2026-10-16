import SwiftUI
import PeerfolioKit

/// Fantasy tab. Stocks leagues are live; the Sports half of the segmented control stays hidden until
/// `Features.sportsEnabled` is switched on (the backend has no sports leagues yet).
struct FantasyHomeView: View {
    enum Mode: String, CaseIterable { case stocks = "Stocks", sports = "Sports" }

    @State var model: FantasyViewModel
    @State private var mode: Mode = .stocks
    @State private var showJoin = false
    @State private var showCreate = false

    init(model: FantasyViewModel) { _model = State(initialValue: model) }

    var body: some View {
        NavigationStack {
            PageScroll(refresh: { await model.load() }) {
                PageHead(title: "Fantasy", lede: "Everyone starts with the same virtual cash. Pick stocks, climb the table. No real money, no real trades.") {
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
                if Features.sportsEnabled {
                    SegmentedPicker(options: Mode.allCases, selection: $mode) { $0.rawValue }
                }
                if mode == .stocks { stocks } else {
                    EmptyPanel(title: "Sports are coming", message: "Fantasy sports leagues are not available yet.", systemImage: "sportscourt")
                }
            }
            .toolbar(.hidden, for: .navigationBar)
            .navigationDestination(for: FantasyLeagueSummary.self) { league in
                FantasyLeagueView(model: FantasyLeagueViewModel(client: model.client, leagueId: league.id), summary: league)
            }
            .task { await model.load() }
            .sheet(isPresented: $showJoin) { JoinCodeSheet(title: "Join a fantasy league", hint: "Invite code") { await model.join(code: $0) } }
            .sheet(isPresented: $showCreate) { CreateFantasySheet { name, cash, cap, ends in await model.create(name: name, startingCash: cash, maxPositionPct: cap, endsAt: ends) } }
        }
    }

    @ViewBuilder private var stocks: some View {
        switch model.state {
        case .idle, .loading:
            Panel { VStack(spacing: 18) { ForEach(0..<3, id: \.self) { _ in HStack { Skeleton(width: 40, height: 40); Skeleton(height: 16) } } }.padding(Theme.inset) }
        case .failed(let e): ErrorPanel(error: e) { Task { await model.load() } }
        case .loaded(let leagues):
            if leagues.isEmpty {
                EmptyPanel(title: "No fantasy leagues", message: "Create a league with a starting balance, or join one with an invite code.", systemImage: "gamecontroller")
            } else {
                Panel {
                    ForEach(Array(leagues.enumerated()), id: \.element.id) { index, league in
                        NavigationLink(value: league) {
                            DataRow(first: index == 0) {
                                LeagueTile(emoji: league.emoji)
                                VStack(alignment: .leading, spacing: 0) {
                                    Text(league.name).font(PFFont.bodyMedium).foregroundStyle(Theme.fg).lineLimit(1)
                                    Text(league.isClosed ? "Finished · \(league.memberCount) players" : "\(league.memberCount) players").font(PFFont.rowSubtitle).foregroundStyle(Theme.fg3)
                                }
                                Spacer(minLength: 8)
                                VStack(alignment: .trailing, spacing: 0) {
                                    Delta(value: league.yourReturn)
                                    if let rank = league.yourRank { Text("Rank \(rank)").font(PFFont.rowSubtitle).foregroundStyle(Theme.medal(for: rank) ?? Theme.fg3) }
                                }
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

struct CreateFantasySheet: View {
    let submit: (String, Int, Int?, Date?) async -> String?
    @Environment(\.dismiss) private var dismiss
    @State private var name = ""
    @State private var cash = 100_000
    @State private var capEnabled = false
    @State private var cap = 40
    @State private var endEnabled = false
    @State private var ends = Calendar.current.date(byAdding: .month, value: 2, to: Date()) ?? Date()
    @State private var error: String?
    @State private var working = false

    var body: some View {
        NavigationStack {
            PageScroll {
                PageHead("New fantasy league", lede: "Everyone starts with the same virtual cash.")
                TextField("League name", text: $name).textFieldStyle(PFTextFieldStyle())
                Panel {
                    VStack(alignment: .leading, spacing: 14) {
                        Stepper(value: $cash, in: 1_000...10_000_000, step: 10_000) {
                            VStack(alignment: .leading) {
                                Text("Starting cash").eyebrow(color: Theme.fg3)
                                Text(Format.currency(Double(cash), fractionDigits: 0)).font(PFFont.stat).numeric()
                            }
                        }
                        Toggle("Cap any one pick", isOn: $capEnabled).tint(Theme.accent)
                        if capEnabled { Stepper("Max \(cap)% per stock", value: $cap, in: 5...100, step: 5) }
                        Toggle("Ends on a date", isOn: $endEnabled).tint(Theme.accent)
                        if endEnabled { DatePicker("End date", selection: $ends, in: Date().addingTimeInterval(7200)..., displayedComponents: .date) }
                    }
                    .font(PFFont.body).padding(Theme.inset)
                }
                if let error { Text(error).font(PFFont.caption).foregroundStyle(Theme.loss) }
                Button(working ? "Creating..." : "Create league") {
                    Task {
                        working = true; error = nil
                        if let m = await submit(name.trimmingCharacters(in: .whitespaces), cash, capEnabled ? cap : nil, endEnabled ? ends : nil) { error = m; Haptics.error() } else { Haptics.success(); dismiss() }
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

#Preview("Fantasy") { FantasyHomeView(model: FantasyViewModel(client: nil, preset: Mock.fantasyLeagues)).environment(PreviewSupport.environment) }
#Preview("Fantasy, dark") { FantasyHomeView(model: FantasyViewModel(client: nil, preset: Mock.fantasyLeagues)).environment(PreviewSupport.environment).preferredColorScheme(.dark) }
#Preview("Fantasy, empty") { FantasyHomeView(model: FantasyViewModel(client: nil, preset: [])).environment(PreviewSupport.environment) }
