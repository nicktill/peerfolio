import SwiftUI
import SafariServices
import PeerfolioKit

struct NewsView: View {
    @State var model: NewsViewModel
    @State private var safariURL: IdentifiableURL?

    init(model: NewsViewModel) { _model = State(initialValue: model) }

    var body: some View {
        PageScrollNav(refresh: { await model.load() }) {
            PageHead("News", lede: "A plain-language recap of the market, with the sources behind it.")
            recap
            marketBoard
            headlines
            Text("News and market data are delayed and provided for information only. Recaps are summaries and not investment advice.")
                .font(PFFont.caption).foregroundStyle(Theme.fg3).padding(.horizontal, 4)
        }
        .task { await model.load() }
        .sheet(item: $safariURL) { SafariView(url: $0.url).ignoresSafeArea() }
    }

    // MARK: Recap

    @ViewBuilder private var recap: some View {
        switch model.news {
        case .idle, .loading:
            Panel { VStack(alignment: .leading, spacing: 10) { Skeleton(width: 90, height: 10); Skeleton(height: 28); Skeleton(height: 14); Skeleton(height: 14) }.padding(Theme.inset) }
        case .failed(let e): ErrorPanel(error: e) { Task { await model.load() } }
        case .loaded(let n):
            if let brief = n.day ?? n.week {
                Panel {
                    PanelHeader(title: brief.period == "week" ? "Week in review" : "Today's recap", detail: nil) {
                        if brief.fallback { Tag(text: "Auto") }
                    }
                    VStack(alignment: .leading, spacing: 12) {
                        Text(brief.headline).font(PFFont.serif(26)).tracking(-0.5).foregroundStyle(Theme.fg).fixedSize(horizontal: false, vertical: true)
                        ForEach(brief.body.components(separatedBy: "\n\n"), id: \.self) { paragraph in
                            Text(paragraph).font(PFFont.sans(15)).foregroundStyle(Theme.fg2).lineSpacing(3)
                        }
                    }
                    .padding(Theme.inset)
                    ForEach(brief.takeaways) { t in
                        VStack(alignment: .leading, spacing: 4) {
                            Text(t.title).font(PFFont.bodyMedium).foregroundStyle(Theme.fg)
                            Text(t.body).font(PFFont.body).foregroundStyle(Theme.fg2)
                        }
                        .padding(Theme.inset).frame(maxWidth: .infinity, alignment: .leading)
                        .overlay(alignment: .top) { RowDivider() }
                    }
                    if !brief.sources.isEmpty {
                        VStack(alignment: .leading, spacing: 6) {
                            Text("Sources").eyebrow(color: Theme.fg3)
                            FlowLayout(spacing: 6) {
                                ForEach(brief.sources) { s in
                                    Button { if let u = URL(string: s.url) { Haptics.selection(); safariURL = IdentifiableURL(url: u) } } label: { Chip(text: s.source) }
                                        .buttonStyle(PressStyle())
                                }
                            }
                        }
                        .padding(Theme.inset).frame(maxWidth: .infinity, alignment: .leading)
                        .overlay(alignment: .top) { RowDivider() }
                    }
                }
                .reveal(0)
            } else {
                EmptyPanel(title: "No recap yet", message: "The next recap is published after the market closes.", systemImage: "newspaper")
            }
        }
    }

    // MARK: Market

    @ViewBuilder private var marketBoard: some View {
        switch model.market {
        case .idle, .loading:
            Panel { VStack(spacing: 14) { ForEach(0..<3, id: \.self) { _ in Skeleton(height: 22) } }.padding(Theme.inset) }
        case .failed: EmptyView()
        case .loaded(let m):
            if let board = m.board {
                Panel {
                    PanelHeader(title: "Markets", detail: board.session) { EmptyView() }
                    ForEach(Array(board.indexes.enumerated()), id: \.element.id) { index, q in
                        DataRow(first: index == 0) {
                            RowTitle(title: q.name, subtitle: q.symbol)
                            Spacer()
                            Sparkline(values: q.day.path, width: 56)
                            VStack(alignment: .trailing, spacing: 0) {
                                Text(q.price.formatted(.number.precision(.fractionLength(2)))).font(PFFont.bodyMedium).numeric().foregroundStyle(Theme.fg)
                                Delta(value: q.day.percent, font: PFFont.mono(11))
                            }
                            .frame(minWidth: 84, alignment: .trailing)
                        }
                        .accessibilityElement(children: .combine)
                    }
                }
                .reveal(1)

                Panel {
                    PanelHeader("Sectors", detail: "day move")
                    SectorBars(sectors: board.sectors).padding(Theme.inset)
                }
                .reveal(2)
            }
            if let fg = m.fearGreed { FearGreedPanel(reading: fg).reveal(3) }
            if let e = m.earnings, e.days.contains(where: { !$0.reports.isEmpty }) { EarningsPanel(week: e).reveal(4) }
        }
    }

    // MARK: Headlines

    @ViewBuilder private var headlines: some View {
        if let n = model.news.value, !n.headlines.isEmpty {
            Panel {
                PanelHeader("Headlines")
                ForEach(Array(n.headlines.enumerated()), id: \.element.id) { index, h in
                    Button {
                        if let u = URL(string: h.url) { Haptics.selection(); safariURL = IdentifiableURL(url: u) }
                    } label: {
                        DataRow(first: index == 0) {
                            VStack(alignment: .leading, spacing: 3) {
                                Text(h.title).font(PFFont.bodyMedium).foregroundStyle(Theme.fg).multilineTextAlignment(.leading).fixedSize(horizontal: false, vertical: true)
                                Text("\(h.source) · \(Format.instant(h.publishedAt)?.formatted(.relative(presentation: .named)) ?? "")").font(PFFont.rowSubtitle).foregroundStyle(Theme.fg3)
                            }
                            .padding(.vertical, 10)
                            Spacer(minLength: 4)
                        }
                    }
                    .buttonStyle(RowPressStyle())
                }
            }
            .reveal(5)
        }
    }
}

// MARK: Pieces

struct SectorBars: View {
    let sectors: [SectorMove]
    var body: some View {
        let peak = max(sectors.map { abs($0.dayPercent) }.max() ?? 1, 0.1)
        VStack(spacing: 8) {
            ForEach(sectors.sorted { $0.dayPercent > $1.dayPercent }) { s in
                HStack(spacing: 10) {
                    Text(s.name).font(PFFont.caption).foregroundStyle(Theme.fg2).frame(width: 104, alignment: .leading).lineLimit(1)
                    GeometryReader { geo in
                        let half = geo.size.width / 2
                        let w = half * CGFloat(abs(s.dayPercent) / peak)
                        ZStack(alignment: .leading) {
                            Rectangle().fill(Theme.hair).frame(width: 1).offset(x: half)
                            RoundedRectangle(cornerRadius: 2).fill(Theme.direction(s.dayPercent).opacity(0.85))
                                .frame(width: max(w, 2), height: 10)
                                .offset(x: s.dayPercent >= 0 ? half : half - w)
                        }
                        .frame(maxHeight: .infinity)
                    }
                    .frame(height: 14)
                    Delta(value: s.dayPercent, font: PFFont.mono(11)).frame(width: 74, alignment: .trailing)
                }
                .accessibilityElement(children: .combine)
            }
        }
    }
}

struct FearGreedPanel: View {
    let reading: FearGreed
    var body: some View {
        Panel {
            PanelHeader("Fear and greed", detail: "CNN")
            HStack(alignment: .center, spacing: 18) {
                ZStack {
                    Circle().trim(from: 0, to: 0.75).stroke(Theme.hair, style: StrokeStyle(lineWidth: 8, lineCap: .round)).rotationEffect(.degrees(135))
                    Circle().trim(from: 0, to: 0.75 * CGFloat(min(max(reading.score, 0), 100) / 100))
                        .stroke(Theme.accent, style: StrokeStyle(lineWidth: 8, lineCap: .round)).rotationEffect(.degrees(135))
                    Text("\(Int(reading.score.rounded()))").font(PFFont.serif(30)).numeric().foregroundStyle(Theme.fg)
                }
                .frame(width: 92, height: 92)
                VStack(alignment: .leading, spacing: 4) {
                    Text(reading.rating.capitalized).font(PFFont.serif(22)).foregroundStyle(Theme.fg)
                    ForEach(reading.history.prefix(3), id: \.label) { p in
                        HStack { Text(p.label).font(PFFont.caption).foregroundStyle(Theme.fg3); Spacer(); Text("\(Int(p.score.rounded()))").font(PFFont.mono(12)).numeric().foregroundStyle(Theme.fg2) }
                    }
                }
            }
            .padding(Theme.inset)
            .accessibilityElement(children: .combine)
        }
    }
}

struct EarningsPanel: View {
    let week: EarningsWeek
    var body: some View {
        Panel {
            PanelHeader(title: "Earnings", detail: week.label) { EmptyView() }
            ForEach(week.days.filter { !$0.reports.isEmpty }) { day in
                VStack(alignment: .leading, spacing: 8) {
                    Text("\(day.dow) \(day.date)").eyebrow(color: day.today == true ? Theme.accent : Theme.fg3)
                    FlowLayout(spacing: 6) {
                        ForEach(day.reports.prefix(12)) { r in
                            HStack(spacing: 5) {
                                Text(r.symbol).font(PFFont.mono(11, medium: true))
                                if r.owned { Circle().fill(Theme.accent).frame(width: 5, height: 5).accessibilityLabel("You own this") }
                            }
                            .foregroundStyle(r.owned ? Theme.fg : Theme.fg2)
                            .padding(.horizontal, 8).frame(height: 26)
                            .overlay(RoundedRectangle(cornerRadius: Theme.chipRadius).strokeBorder(r.owned ? Theme.accent : Theme.hair, lineWidth: 1))
                        }
                    }
                }
                .padding(Theme.inset).frame(maxWidth: .infinity, alignment: .leading)
                .overlay(alignment: .top) { RowDivider() }
            }
        }
    }
}

struct IdentifiableURL: Identifiable { let url: URL; var id: URL { url } }

/// In-app browser for articles and web-only pages.
struct SafariView: UIViewControllerRepresentable {
    let url: URL
    func makeUIViewController(context: Context) -> SFSafariViewController { SFSafariViewController(url: url) }
    func updateUIViewController(_ controller: SFSafariViewController, context: Context) {}
}

/// `PageScroll` inside its own NavigationStack, for tabs that have no pushed screens.
struct PageScrollNav<Content: View>: View {
    var refresh: (() async -> Void)? = nil
    @ViewBuilder var content: Content
    var body: some View {
        NavigationStack {
            PageScroll(refresh: refresh) { content }.toolbar(.hidden, for: .navigationBar)
        }
    }
}

#Preview("News") { NewsView(model: NewsViewModel(client: nil, news: Mock.news, market: Mock.market)).environment(PreviewSupport.environment) }
#Preview("News, dark") { NewsView(model: NewsViewModel(client: nil, news: Mock.news, market: Mock.market)).environment(PreviewSupport.environment).preferredColorScheme(.dark) }
