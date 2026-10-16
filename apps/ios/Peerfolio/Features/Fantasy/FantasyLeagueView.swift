import SwiftUI
import PeerfolioKit

struct FantasyLeagueView: View {
    @State var model: FantasyLeagueViewModel
    let summary: FantasyLeagueSummary?
    @State private var tradeSymbol: TradeTarget?

    init(model: FantasyLeagueViewModel, summary: FantasyLeagueSummary?) { _model = State(initialValue: model); self.summary = summary }

    struct TradeTarget: Identifiable { let id = UUID(); let symbol: String? }

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
        .sheet(item: $tradeSymbol) { target in
            if case .loaded(let d) = model.state {
                TradeSheet(model: TradeViewModel(client: model.client, leagueId: model.leagueId, preselect: target.symbol), cash: d.you.cash, positions: d.you.positions) {
                    Task { await model.load() }
                }
            }
        }
    }

    @ViewBuilder private func loaded(_ d: FantasyLeagueDetail) -> some View {
        HStack(spacing: 14) {
            LeagueTile(emoji: d.league.emoji, size: 52)
            VStack(alignment: .leading, spacing: 4) {
                Text(d.league.name).font(PFFont.serif(28)).tracking(-0.6).foregroundStyle(Theme.fg)
                Text(subtitle(d.league)).font(PFFont.rowSubtitle).foregroundStyle(Theme.fg3)
            }
        }
        .reveal(0)

        Panel {
            StatGrid(items: [
                .init(key: "Value", value: Format.compactCurrency(d.you.value)),
                .init(key: "Return", value: Format.percent(d.you.percent), tint: Theme.direction(d.you.percent)),
                .init(key: "Rank", value: "#\(d.you.rank)", tint: Theme.medal(for: d.you.rank)),
            ])
            .overlay(alignment: .top) { EmptyView() }
            RowDivider()
            HStack {
                VStack(alignment: .leading, spacing: 2) {
                    Text("Cash to spend").eyebrow(color: Theme.fg3)
                    Text(Format.currency(d.you.cash, fractionDigits: 0)).font(PFFont.stat).numeric().foregroundStyle(Theme.fg)
                }
                Spacer()
                if !d.league.isClosed {
                    Button { Haptics.light(); tradeSymbol = TradeTarget(symbol: nil) } label: { Label("Trade", systemImage: "arrow.left.arrow.right").padding(.horizontal, 18) }
                        .buttonStyle(PrimaryButtonStyle()).fixedSize()
                }
            }
            .padding(Theme.inset)
        }
        .reveal(1)

        if !d.you.orders.isEmpty {
            Panel {
                PanelHeader("Orders", detail: "waiting for the open")
                ForEach(Array(d.you.orders.enumerated()), id: \.element.id) { index, o in
                    DataRow(first: index == 0) {
                        RowTitle(title: "\(o.side == .buy ? "Buy" : "Sell") \(o.ticker)",
                                 subtitle: o.amount.map { Format.currency($0, fractionDigits: 0) } ?? (o.shares.map { "\(Format.shares($0)) shares" } ?? "All shares"))
                        Spacer()
                        if o.status == "pending" {
                            Button("Cancel") { Task { await model.cancel(order: o) } }.font(PFFont.mono(11, medium: true)).foregroundStyle(Theme.loss)
                        } else {
                            Text(o.reason ?? o.status.capitalized).font(PFFont.rowSubtitle).foregroundStyle(Theme.fg3).multilineTextAlignment(.trailing)
                        }
                    }
                }
            }
            .reveal(2)
        }

        Panel {
            PanelHeader("Your picks", detail: "\(d.you.positions.count)")
            if d.you.positions.isEmpty {
                Text("No picks yet. Tap Trade to buy your first stock with virtual cash.").font(PFFont.body).foregroundStyle(Theme.fg2).padding(Theme.inset)
            }
            ForEach(Array(d.you.positions.enumerated()), id: \.element.id) { index, p in
                Button { Haptics.selection(); tradeSymbol = TradeTarget(symbol: p.ticker) } label: {
                    DataRow(first: index == 0) {
                        RowTitle(title: p.ticker, subtitle: "\(Format.shares(p.shares)) sh · avg \(Format.currency(p.averageCost))")
                        Spacer()
                        VStack(alignment: .trailing, spacing: 0) {
                            Text(Format.currency(p.value, fractionDigits: 0)).font(PFFont.bodyMedium).numeric().foregroundStyle(Theme.fg)
                            Delta(value: p.gainPct, font: PFFont.mono(11))
                        }
                    }
                }
                .buttonStyle(RowPressStyle())
                .accessibilityElement(children: .combine)
            }
        }
        .reveal(3)

        Panel {
            PanelHeader("Standings", detail: "picks are public in this league")
            ForEach(Array(d.standings.enumerated()), id: \.element.id) { index, s in
                StandingRow(rank: s.rank, name: s.name, handle: s.handle, imageURL: s.image, percent: s.percent, spark: s.spark, isYou: s.isYou,
                            holdings: s.holdings, reactions: s.reactions, myReactions: model.myReactions, userId: s.userId,
                            onReact: { e in Task { await model.toggleReaction(to: s.userId, emoji: e) } }, first: index == 0)
            }
        }
        .reveal(4)

        if !d.feed.isEmpty {
            Panel {
                PanelHeader("Activity")
                ForEach(Array(d.feed.prefix(12).enumerated()), id: \.element.id) { index, f in
                    DataRow(first: index == 0) {
                        Avatar(name: f.name, url: f.image, size: 28)
                        VStack(alignment: .leading, spacing: 0) {
                            Text("\(f.name ?? f.handle ?? "Someone") \(f.side == .buy ? "bought" : "sold") \(f.ticker)").font(PFFont.body).foregroundStyle(Theme.fg).lineLimit(1)
                            Text("\(Format.shares(f.shares)) sh at \(Format.currency(f.price))").font(PFFont.rowSubtitle).foregroundStyle(Theme.fg3)
                        }
                        Spacer()
                    }
                    .accessibilityElement(children: .combine)
                }
            }
            .reveal(5)
        }

        Panel {
            PanelHeader("Invite")
            HStack {
                Text(d.league.inviteCode).font(PFFont.mono(22, medium: true)).tracking(2).foregroundStyle(Theme.fg)
                Spacer()
                ShareLink(item: "Join my Peerfolio fantasy league \"\(d.league.name)\" with code \(d.league.inviteCode)") {
                    Image(systemName: "square.and.arrow.up").foregroundStyle(Theme.fg2).frame(width: 44, height: 44)
                        .overlay(RoundedRectangle(cornerRadius: Theme.controlRadius, style: .continuous).strokeBorder(Theme.line, lineWidth: 1))
                }
                .accessibilityLabel("Share invite code")
            }
            .padding(Theme.inset)
        }

        Text("Fantasy leagues use virtual cash only. Orders are simulated against delayed market prices and never reach a broker.")
            .font(PFFont.caption).foregroundStyle(Theme.fg3).padding(.horizontal, 4)
    }

    private func subtitle(_ l: FantasyLeagueDetail.Info) -> String {
        var parts = ["Start \(Format.compactCurrency(l.startingCash))"]
        if let cap = l.maxPositionPct { parts.append("max \(cap)% per pick") }
        if l.isClosed { parts.append("finished") } else if let end = l.endsAt, let date = Format.instant(end) { parts.append("ends \(date.formatted(.dateTime.month(.abbreviated).day()))") }
        return parts.joined(separator: " · ")
    }
}

// MARK: Trade

struct TradeSheet: View {
    @State var model: TradeViewModel
    let cash: Double
    let positions: [FantasyPosition]
    var onDone: () -> Void
    @Environment(\.dismiss) private var dismiss
    @FocusState private var tickerFocused: Bool

    var body: some View {
        NavigationStack {
            PageScroll {
                SegmentedPicker(options: TradeViewModel.Side.allCases, selection: $model.side) { $0.rawValue }
                    .onChange(of: model.side) { _, _ in model.outcome = nil }

                Panel {
                    VStack(alignment: .leading, spacing: 10) {
                        Text("Ticker").eyebrow(color: Theme.fg3)
                        TextField("Search a stock, e.g. AAPL", text: $model.query)
                            .textFieldStyle(PFTextFieldStyle(focused: tickerFocused))
                            .focused($tickerFocused).textInputAutocapitalization(.characters).autocorrectionDisabled()
                            .onChange(of: model.query) { _, _ in model.queryChanged() }
                        if !model.suggestions.isEmpty {
                            VStack(spacing: 0) {
                                ForEach(model.suggestions) { s in
                                    Button { Task { await model.select(s) }; tickerFocused = false } label: {
                                        HStack { Text(s.symbol).font(PFFont.mono(13, medium: true)).foregroundStyle(Theme.fg); Text(s.name ?? "").font(PFFont.caption).foregroundStyle(Theme.fg3).lineLimit(1); Spacer() }
                                            .frame(minHeight: 44)
                                    }
                                    .buttonStyle(RowPressStyle())
                                    RowDivider()
                                }
                            }
                        }
                        quoteView
                    }
                    .padding(Theme.inset)
                }

                Panel {
                    VStack(alignment: .leading, spacing: 10) {
                        if model.side == .buy {
                            Text("Amount in dollars").eyebrow(color: Theme.fg3)
                            TextField("0", text: $model.amountText).keyboardType(.decimalPad).textFieldStyle(PFTextFieldStyle()).font(PFFont.stat)
                            Text("\(Format.currency(cash, fractionDigits: 0)) available").font(PFFont.caption).foregroundStyle(Theme.fg3)
                            HStack { ForEach([0.25, 0.5, 1.0], id: \.self) { f in
                                Button(f == 1 ? "All" : "\(Int(f * 100))%") { Haptics.selection(); model.amountText = String(format: "%.0f", cash * f) }
                                    .buttonStyle(OutlineButtonStyle()).frame(maxHeight: 36)
                            } }
                        } else {
                            Text("Shares").eyebrow(color: Theme.fg3)
                            TextField("0", text: $model.sharesText).keyboardType(.decimalPad).textFieldStyle(PFTextFieldStyle()).font(PFFont.stat).disabled(model.sellAll).opacity(model.sellAll ? 0.4 : 1)
                            Toggle("Sell all", isOn: $model.sellAll).tint(Theme.accent).font(PFFont.body)
                            if let held = positions.first(where: { $0.ticker == model.symbol }) {
                                Text("You hold \(Format.shares(held.shares)) shares").font(PFFont.caption).foregroundStyle(Theme.fg3)
                            }
                        }
                        if let estimate = model.estimate { Text(estimate).font(PFFont.caption).foregroundStyle(Theme.fg2) }
                    }
                    .padding(Theme.inset)
                }

                if let outcome = model.outcome { OutcomeBanner(outcome: outcome).transition(.opacity.combined(with: .offset(y: 6))) }

                Button(model.isSubmitting ? "Placing..." : (model.side == .buy ? "Buy with virtual cash" : "Sell")) { Task { await model.submit(); onDone() } }
                    .buttonStyle(PrimaryButtonStyle()).disabled(!model.canSubmit)

                Text("Simulated trade with virtual cash. Nothing is bought or sold with real money.").font(PFFont.caption).foregroundStyle(Theme.fg3)
            }
            .animation(Motion.ease(), value: model.outcome)
            .navigationTitle("Trade").navigationBarTitleDisplayMode(.inline)
            .toolbar { ToolbarItem(placement: .confirmationAction) { Button("Done") { dismiss() } } }
            .task { if model.symbol != nil { await model.loadQuote() } }
        }
        .presentationDetents([.large])
    }

    @ViewBuilder private var quoteView: some View {
        switch model.quote {
        case .idle: EmptyView()
        case .loading: Skeleton(width: 140, height: 18)
        case .failed(let e): Text(e.errorDescription ?? "No quote.").font(PFFont.caption).foregroundStyle(Theme.loss)
        case .loaded(let q):
            HStack(alignment: .firstTextBaseline, spacing: 8) {
                Text(Format.currency(q.price)).font(PFFont.stat).numeric().foregroundStyle(Theme.fg)
                if q.live { LiveDot(); Text("live").font(PFFont.mono(11)).foregroundStyle(Theme.fg3) } else { Text("last close").font(PFFont.mono(11)).foregroundStyle(Theme.fg3) }
                Spacer()
                if let name = q.name { Text(name).font(PFFont.caption).foregroundStyle(Theme.fg2).lineLimit(1) }
            }
        }
    }
}

private struct OutcomeBanner: View {
    let outcome: TradeViewModel.Outcome
    var body: some View {
        let (text, color, icon): (String, Color, String) = {
            switch outcome {
            case .filled(let t): return (t, Theme.gain, "checkmark.circle")
            case .queued(let t): return (t, Theme.accent, "clock")
            case .failed(let t): return (t, Theme.loss, "exclamationmark.circle")
            }
        }()
        HStack(spacing: 10) {
            Image(systemName: icon).foregroundStyle(color)
            Text(text).font(PFFont.body).foregroundStyle(Theme.fg)
            Spacer(minLength: 0)
        }
        .padding(12)
        .background(color.opacity(0.08), in: RoundedRectangle(cornerRadius: Theme.controlRadius, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: Theme.controlRadius, style: .continuous).strokeBorder(color.opacity(0.35), lineWidth: 1))
    }
}

#Preview("Fantasy league") {
    NavigationStack { FantasyLeagueView(model: FantasyLeagueViewModel(client: nil, leagueId: "f1", preset: Mock.fantasyDetail), summary: Mock.fantasyLeagues.first) }.environment(PreviewSupport.environment)
}
#Preview("Fantasy league, dark") {
    NavigationStack { FantasyLeagueView(model: FantasyLeagueViewModel(client: nil, leagueId: "f1", preset: Mock.fantasyDetail), summary: Mock.fantasyLeagues.first) }.environment(PreviewSupport.environment).preferredColorScheme(.dark)
}
#Preview("Trade") {
    TradeSheet(model: TradeViewModel(client: nil, leagueId: "f1", preselect: "AAPL"), cash: 29200, positions: Mock.fantasyDetail.you.positions) {}
}
