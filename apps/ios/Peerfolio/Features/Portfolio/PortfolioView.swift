import SwiftUI
import PeerfolioKit

struct PortfolioView: View {
    @Environment(AppEnvironment.self) private var env
    @State var model: PortfolioViewModel
    @State private var showSettings = false

    init(model: PortfolioViewModel) { _model = State(initialValue: model) }

    var body: some View {
        NavigationStack {
            PageScroll(refresh: { await model.load() }) {
                PageHead(title: "Portfolio", lede: nil) {
                    Button { Haptics.light(); showSettings = true } label: {
                        Avatar(name: env.auth.user?.name, url: env.auth.user?.image, size: 32)
                    }
                    .buttonStyle(PressStyle())
                    .accessibilityLabel("Account and settings")
                }
                content
            }
            .navigationBarTitleDisplayMode(.inline)
            .toolbar(.hidden, for: .navigationBar)
            .task { await model.load() }
            .sheet(isPresented: $showSettings) { SettingsView().environment(env) }
        }
    }

    @ViewBuilder private var content: some View {
        switch model.state {
        case .idle, .loading:
            PortfolioSkeleton()
        case .failed(let error):
            ErrorPanel(error: error) { Task { await model.load() } }
        case .loaded(let p):
            if p.accounts.isEmpty {
                EmptyPanel(title: "Nothing here yet", message: "Add your accounts on peerfolio.org and they will show up here. Linking and manual accounts are not available in the app yet.", systemImage: "chart.line.uptrend.xyaxis")
            } else {
                loaded(p)
            }
        }
    }

    @ViewBuilder private func loaded(_ p: PortfolioResponse) -> some View {
        if let broken = p.items.first(where: { $0.status != "active" }) {
            ConnectionBanner(institution: broken.institutionName ?? "A connection").reveal(0)
        }
        HeroPanel(portfolio: p, range: Binding(get: { model.range }, set: { new in Task { await model.changeRange(new) } }))
            .reveal(1)
        if !p.allocation.isEmpty { AllocationPanel(slices: p.allocation).reveal(2) }
        if !p.holdings.isEmpty { HoldingsPanel(holdings: p.holdings).reveal(3) }
        AccountsPanel(accounts: p.accounts).reveal(4)
        if !p.leagues.isEmpty { LeaguePillsPanel(pills: p.leagues).reveal(5) }
        Text("Prices are delayed and may be stale. Figures are for tracking only and are not investment advice.")
            .font(PFFont.caption).foregroundStyle(Theme.fg3).padding(.horizontal, 4)
    }
}

// MARK: Hero

private struct HeroPanel: View {
    let portfolio: PortfolioResponse
    @Binding var range: PerformanceRange

    var body: some View {
        Panel {
            VStack(alignment: .leading, spacing: 0) {
                VStack(alignment: .leading, spacing: 6) {
                    Text("Net worth").eyebrow()
                    Text(Format.currency(portfolio.summary.netWorth, fractionDigits: 0))
                        .font(PFFont.heroFigure).tracking(-1.6).numeric().foregroundStyle(Theme.fg)
                        .lineLimit(1).minimumScaleFactor(0.6)
                        .contentTransition(.numericText())
                    HStack(spacing: 14) {
                        if let today = portfolio.today {
                            HStack(spacing: 6) {
                                Delta(value: today.amount, style: .currency)
                                Text("(\(Format.percent(today.percent)))").font(PFFont.caption).numeric().foregroundStyle(Theme.fg3)
                                Text("today").font(PFFont.caption).foregroundStyle(Theme.fg3)
                            }
                        }
                    }
                    if let all = portfolio.allTime {
                        HStack(spacing: 6) {
                            Delta(value: all.amount, style: .currency, font: PFFont.sans(13, .medium))
                            Text("(\(Format.percent(all.percent)))").font(PFFont.caption).numeric().foregroundStyle(Theme.fg3)
                            Text("all time").font(PFFont.caption).foregroundStyle(Theme.fg3)
                        }
                    }
                }
                .padding(.horizontal, Theme.inset).padding(.top, 18)

                HStack {
                    SegmentedPicker(options: PerformanceRange.allCases, selection: $range) { $0.rawValue }
                    Spacer()
                    if portfolio.hasHistory {
                        HStack(spacing: 4) {
                            Text("TWR").eyebrow(color: Theme.fg3)
                            Delta(value: portfolio.performance.percent, font: PFFont.sans(13, .medium))
                        }
                        .swapIn(on: portfolio.performance.percent)
                    }
                }
                .padding(.horizontal, Theme.inset).padding(.top, 16)

                Group {
                    if portfolio.hasHistory {
                        NetWorthChart(points: portfolio.history).frame(height: 190)
                    } else {
                        Text("History starts building tonight. Check back tomorrow to see a chart.")
                            .font(PFFont.body).foregroundStyle(Theme.fg2)
                            .frame(maxWidth: .infinity, minHeight: 120, alignment: .center).multilineTextAlignment(.center)
                    }
                }
                .padding(.horizontal, Theme.inset).padding(.top, 12).padding(.bottom, 14)

                StatGrid(items: [
                    .init(key: "Assets", value: Format.compactCurrency(portfolio.summary.totalAssets)),
                    .init(key: "Debts", value: Format.compactCurrency(portfolio.summary.totalLiabilities)),
                    .init(key: "Investable", value: Format.compactCurrency(portfolio.summary.investableAssets)),
                ])
            }
        }
    }
}

// MARK: Allocation

private struct AllocationPanel: View {
    let slices: [PortfolioResponse.AllocationSlice]

    var body: some View {
        Panel {
            PanelHeader("Allocation")
            VStack(alignment: .leading, spacing: 14) {
                GeometryReader { geo in
                    HStack(spacing: 2) {
                        ForEach(Array(slices.enumerated()), id: \.element.id) { index, slice in
                            RoundedRectangle(cornerRadius: 2, style: .continuous)
                                .fill(Theme.seriesColor(index))
                                .frame(width: max(2, (geo.size.width - CGFloat(slices.count - 1) * 2) * slice.percent / 100))
                        }
                    }
                }
                .frame(height: 10)
                .accessibilityHidden(true)

                VStack(spacing: 8) {
                    ForEach(Array(slices.enumerated()), id: \.element.id) { index, slice in
                        HStack(spacing: 10) {
                            RoundedRectangle(cornerRadius: 2).fill(Theme.seriesColor(index)).frame(width: 10, height: 10)
                            Text(slice.name).font(PFFont.body).foregroundStyle(Theme.fg)
                            Spacer()
                            Text(Format.percent(slice.percent, fractionDigits: 1, signed: false)).font(PFFont.mono(12)).numeric().foregroundStyle(Theme.fg2)
                            Text(Format.compactCurrency(slice.value)).font(PFFont.sans(14, .medium)).numeric().foregroundStyle(Theme.fg)
                                .frame(minWidth: 62, alignment: .trailing)
                        }
                        .accessibilityElement(children: .combine)
                    }
                }
            }
            .padding(Theme.inset)
        }
    }
}

// MARK: Holdings

private struct HoldingsPanel: View {
    let holdings: [PortfolioResponse.Holding]
    @State private var expanded = false

    var body: some View {
        let shown = expanded ? holdings : Array(holdings.prefix(6))
        Panel {
            PanelHeader(title: "Holdings", detail: "\(holdings.count)") { EmptyView() }
            ForEach(Array(shown.enumerated()), id: \.element.id) { index, h in
                DataRow(first: index == 0) {
                    RowTitle(title: h.ticker ?? h.name ?? "Holding", subtitle: h.ticker != nil ? (h.name ?? "") : "\(Format.shares(h.quantity)) units")
                    Spacer(minLength: 8)
                    VStack(alignment: .trailing, spacing: 0) {
                        Text(Format.currency(h.value, fractionDigits: 0)).font(PFFont.bodyMedium).numeric().foregroundStyle(Theme.fg)
                        if let pct = h.todayPercent {
                            Delta(value: pct, font: PFFont.mono(11), showArrow: true)
                        } else {
                            Text("\(Format.percent(h.weight, fractionDigits: 1, signed: false)) of total").font(PFFont.rowSubtitle).foregroundStyle(Theme.fg3)
                        }
                    }
                }
                .accessibilityElement(children: .combine)
            }
            if holdings.count > 6 {
                RowDivider()
                Button {
                    Haptics.selection()
                    withAnimation(Motion.ease()) { expanded.toggle() }
                } label: {
                    Text(expanded ? "Show fewer" : "Show all \(holdings.count)").font(PFFont.mono(11, medium: true)).tracking(0.6).foregroundStyle(Theme.fg2)
                        .frame(maxWidth: .infinity, minHeight: 44)
                }
                .buttonStyle(RowPressStyle())
            }
        }
    }
}

// MARK: Accounts

private struct AccountsPanel: View {
    let accounts: [PortfolioResponse.Account]

    var body: some View {
        Panel {
            PanelHeader("Accounts", detail: "\(accounts.count)")
            ForEach(Array(accounts.enumerated()), id: \.element.id) { index, a in
                DataRow(first: index == 0) {
                    RowTitle(title: a.name, subtitle: [a.institutionName, a.mask.map { "••\($0)" }].compactMap { $0 }.joined(separator: " "))
                    Spacer(minLength: 8)
                    VStack(alignment: .trailing, spacing: 0) {
                        Text((a.isLiability ? "-" : "") + Format.currency(a.balance, fractionDigits: 0)).font(PFFont.bodyMedium).numeric()
                            .foregroundStyle(a.isLiability ? Theme.loss : Theme.fg)
                        if a.source == "manual" { Text("Manual").font(PFFont.rowSubtitle).foregroundStyle(Theme.fg3) }
                    }
                }
                .accessibilityElement(children: .combine)
            }
        }
    }
}

private struct LeaguePillsPanel: View {
    let pills: [PortfolioResponse.LeaguePill]
    var body: some View {
        Panel {
            PanelHeader("Your leagues")
            ForEach(Array(pills.enumerated()), id: \.element.id) { index, pill in
                DataRow(first: index == 0) {
                    LeagueTile(emoji: pill.emoji, size: 34)
                    RowTitle(title: pill.name, subtitle: "\(pill.members) members")
                    Spacer(minLength: 8)
                    if let rank = pill.rank { RankLabel(rank: rank) } else { Text("Ranking soon").font(PFFont.rowSubtitle).foregroundStyle(Theme.fg3) }
                }
                .accessibilityElement(children: .combine)
            }
        }
    }
}

private struct ConnectionBanner: View {
    let institution: String
    var body: some View {
        HStack(spacing: 10) {
            Image(systemName: "exclamationmark.triangle").foregroundStyle(Theme.loss)
            Text("\(institution) needs to be reconnected. Open peerfolio.org to fix it; balances may be out of date.")
                .font(PFFont.caption).foregroundStyle(Theme.fg)
        }
        .padding(12)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Theme.loss.opacity(0.08), in: RoundedRectangle(cornerRadius: Theme.controlRadius, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: Theme.controlRadius, style: .continuous).strokeBorder(Theme.loss.opacity(0.35), lineWidth: 1))
    }
}

private struct PortfolioSkeleton: View {
    var body: some View {
        VStack(spacing: Theme.pageGap) {
            Panel {
                VStack(alignment: .leading, spacing: 12) {
                    Skeleton(width: 80, height: 10)
                    Skeleton(width: 220, height: 44)
                    Skeleton(width: 150, height: 14)
                    Skeleton(height: 170).padding(.top, 8)
                }
                .padding(Theme.inset)
            }
            Panel {
                VStack(alignment: .leading, spacing: 14) { ForEach(0..<4, id: \.self) { _ in Skeleton(height: 18) } }.padding(Theme.inset)
            }
        }
    }
}

#Preview("Portfolio, light") {
    PortfolioView(model: PortfolioViewModel(client: nil, preset: Mock.portfolio)).environment(PreviewSupport.environment)
}
#Preview("Portfolio, dark") {
    PortfolioView(model: PortfolioViewModel(client: nil, preset: Mock.portfolio)).environment(PreviewSupport.environment).preferredColorScheme(.dark)
}
#Preview("Portfolio, loading") {
    PortfolioView(model: PortfolioViewModel(client: nil)).environment(PreviewSupport.environment)
}
