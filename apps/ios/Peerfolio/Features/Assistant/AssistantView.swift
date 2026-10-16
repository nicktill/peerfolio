import SwiftUI
import PeerfolioKit

struct AssistantView: View {
    @Environment(AppEnvironment.self) private var env
    @State var model: AssistantViewModel
    var page: AssistantContext.Page = .portfolio
    @State private var browser: IdentifiableURL?
    @State private var wealth: WealthSheet?
    @FocusState private var composerFocused: Bool

    init(model: AssistantViewModel, page: AssistantContext.Page = .portfolio) {
        _model = State(initialValue: model); self.page = page
    }

    var body: some View {
        NavigationStack {
            VStack(spacing: 0) {
                ScrollViewReader { proxy in
                    ScrollView {
                        VStack(alignment: .leading, spacing: 18) {
                            if model.turns.isEmpty { welcome }
                            ForEach(model.turns) { turn in
                                TurnView(turn: turn, onOpen: open, onRetry: model.retry)
                                    .id(turn.id)
                                    .transition(.opacity.combined(with: .offset(y: 8)))
                            }
                            Color.clear.frame(height: 1).id("bottom")
                        }
                        .padding(.horizontal, 16).padding(.top, 8).padding(.bottom, 12)
                    }
                    .scrollIndicators(.hidden)
                    .scrollDismissesKeyboard(.interactively)
                    .onChange(of: model.turns.last?.text) { _, _ in proxy.scrollTo("bottom", anchor: .bottom) }
                    .onChange(of: model.turns.count) { _, _ in withAnimation(Motion.ease()) { proxy.scrollTo("bottom", anchor: .bottom) } }
                }
                composer
            }
            .background(Theme.bg.ignoresSafeArea())
            .navigationTitle("Assistant").navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button { model.newChat() } label: { Image(systemName: "square.and.pencil") }
                        .disabled(model.turns.isEmpty).accessibilityLabel("New chat")
                }
            }
            .animation(Motion.ease(), value: model.turns.count)
            .onAppear { model.page = page }
            .onChange(of: page) { _, new in model.page = new }
            .sheet(item: $browser) { SafariView(url: $0.url).ignoresSafeArea() }
            .sheet(item: $wealth) { sheet in
                NavigationStack {
                    WealthLabView(model: WealthLabViewModel(client: env.client, inputs: sheet.inputs))
                        .toolbar { ToolbarItem(placement: .confirmationAction) { Button("Done") { wealth = nil } } }
                }
            }
            .environment(\.openURL, OpenURLAction { url in
                if url.scheme?.hasPrefix("http") == true { browser = IdentifiableURL(url: url); return .handled }
                return .systemAction
            })
        }
    }

    private func open(_ href: String) {
        Haptics.selection()
        // The assistant's "Open in Wealth Lab" link is a web path with the assumptions in the query: open the native screen, prefilled.
        if href.hasPrefix("/wealth") {
            let seed = Wealth.Inputs(startingValue: 0, monthlyContribution: 0, annualContributionGrowthPct: 0, years: 20, expectedAnnualReturnPct: 7, inflationPct: 2.5, targetValue: 0)
            wealth = WealthSheet(inputs: Wealth.apply(link: href, to: seed) ?? seed)
            return
        }
        if let url = env.webURL(for: href) { browser = IdentifiableURL(url: url) }
    }

    private var welcome: some View {
        VStack(alignment: .leading, spacing: 16) {
            Text("Ask anything about\nyour portfolio.").font(PFFont.serif(32)).tracking(-0.9).foregroundStyle(Theme.fg).reveal(0)
            Text("The assistant reads your accounts, leagues and the market. It explains and analyses; it never trades or moves money, and it isn't investment advice.")
                .font(PFFont.body).foregroundStyle(Theme.fg2).reveal(1)
            VStack(alignment: .leading, spacing: 8) {
                ForEach(Array(AssistantViewModel.suggestions.enumerated()), id: \.element) { index, s in
                    Button { model.send(s) } label: {
                        HStack { Text(s).font(PFFont.body).foregroundStyle(Theme.fg); Spacer(); Image(systemName: "arrow.up.right").font(.system(size: 11, weight: .semibold)).foregroundStyle(Theme.fg3) }
                            .padding(.horizontal, 14).frame(minHeight: 48)
                            .background(Theme.panel, in: RoundedRectangle(cornerRadius: Theme.controlRadius, style: .continuous))
                            .overlay(RoundedRectangle(cornerRadius: Theme.controlRadius, style: .continuous).strokeBorder(Theme.hair, lineWidth: 1))
                    }
                    .buttonStyle(PressStyle())
                    .reveal(index + 2)
                }
            }
        }
        .padding(.top, 24)
    }

    private var composer: some View {
        HStack(alignment: .bottom, spacing: 10) {
            TextField("Ask about your portfolio", text: $model.draft, axis: .vertical)
                .lineLimit(1...5).font(PFFont.sans(16)).focused($composerFocused)
                .padding(.horizontal, 14).padding(.vertical, 11)
                .overlay(RoundedRectangle(cornerRadius: 20, style: .continuous).strokeBorder(composerFocused ? Theme.accent : Theme.line, lineWidth: 1))
                .submitLabel(.send)
                .onSubmit { model.send() }
            Button {
                if model.isStreaming { model.stop() } else { model.send() }
            } label: {
                Image(systemName: model.isStreaming ? "stop.fill" : "arrow.up").font(.system(size: 15, weight: .bold)).foregroundStyle(Theme.inkFg)
                    .frame(width: 44, height: 44)
                    .background(Theme.ink.opacity(model.isStreaming || model.canSend ? 1 : 0.35), in: Circle())
            }
            .buttonStyle(PressStyle())
            .disabled(!model.isStreaming && !model.canSend)
            .accessibilityLabel(model.isStreaming ? "Stop" : "Send")
        }
        .padding(.horizontal, 16).padding(.vertical, 10)
        .background(Theme.bg)
        .overlay(alignment: .top) { RowDivider().background(Theme.hair) }
    }
}

struct WealthSheet: Identifiable { let id = UUID(); let inputs: Wealth.Inputs }

// MARK: Turns

private struct TurnView: View {
    let turn: ChatTurn
    let onOpen: (String) -> Void
    let onRetry: () -> Void

    var body: some View {
        if turn.role == .user {
            HStack {
                Spacer(minLength: 48)
                Text(turn.text).font(PFFont.sans(15)).foregroundStyle(Theme.inkFg)
                    .padding(.horizontal, 14).padding(.vertical, 10)
                    .background(Theme.ink, in: RoundedRectangle(cornerRadius: 18, style: .continuous))
            }
        } else {
            VStack(alignment: .leading, spacing: 12) {
                if let status = turn.statusLabel { StatusLine(label: status) }
                if let xray = turn.xray { XRayCard(xray: xray) }
                if !turn.text.isEmpty { MarkdownText(text: turn.text) }
                ForEach(Array(turn.visuals.enumerated()), id: \.offset) { _, visual in VisualCard(visual: visual) }
                if let link = turn.link {
                    Button { onOpen(link.href) } label: {
                        HStack(spacing: 6) { Text(link.label); Image(systemName: "arrow.up.right") }.padding(.horizontal, 16)
                    }
                    .buttonStyle(OutlineButtonStyle()).fixedSize()
                }
                if let error = turn.error {
                    VStack(alignment: .leading, spacing: 8) {
                        Text(error).font(PFFont.body).foregroundStyle(Theme.loss)
                        Button("Try again", action: onRetry).buttonStyle(OutlineButtonStyle()).frame(maxWidth: 140)
                    }
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
        }
    }
}

private struct StatusLine: View {
    let label: String
    var body: some View {
        HStack(spacing: 8) {
            LiveDot()
            Text(label).font(PFFont.mono(12)).foregroundStyle(Theme.fg3)
        }
        .transition(.opacity)
        .accessibilityLabel("\(label)...")
    }
}

/// Markdown with block structure from `MarkdownBlocks` and inline styling and links from `AttributedString`.
struct MarkdownText: View {
    let text: String

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            ForEach(Array(MarkdownBlocks.parse(text).enumerated()), id: \.offset) { _, block in
                switch block {
                case .paragraph(let t): inline(t).font(PFFont.sans(15)).foregroundStyle(Theme.fg).lineSpacing(3)
                case .heading(_, let t): inline(t).font(PFFont.serif(20)).foregroundStyle(Theme.fg).padding(.top, 4)
                case .bullets(let items):
                    VStack(alignment: .leading, spacing: 6) {
                        ForEach(Array(items.enumerated()), id: \.offset) { _, item in
                            HStack(alignment: .firstTextBaseline, spacing: 8) {
                                Text("•").foregroundStyle(Theme.fg3)
                                inline(item).font(PFFont.sans(15)).foregroundStyle(Theme.fg).lineSpacing(3)
                            }
                        }
                    }
                case .numbered(let items):
                    VStack(alignment: .leading, spacing: 6) {
                        ForEach(Array(items.enumerated()), id: \.offset) { index, item in
                            HStack(alignment: .firstTextBaseline, spacing: 8) {
                                Text("\(index + 1).").font(PFFont.mono(13)).foregroundStyle(Theme.fg3).frame(minWidth: 18, alignment: .trailing)
                                inline(item).font(PFFont.sans(15)).foregroundStyle(Theme.fg).lineSpacing(3)
                            }
                        }
                    }
                case .quote(let t):
                    inline(t).font(PFFont.sans(15)).foregroundStyle(Theme.fg2).padding(.leading, 12)
                        .overlay(alignment: .leading) { Rectangle().fill(Theme.line).frame(width: 2) }
                case .code(let c):
                    ScrollView(.horizontal, showsIndicators: false) {
                        Text(c).font(PFFont.mono(12)).foregroundStyle(Theme.fg).padding(12)
                    }
                    .background(Theme.raise, in: RoundedRectangle(cornerRadius: Theme.controlRadius, style: .continuous))
                }
            }
        }
        .textSelection(.enabled)
        .tint(Theme.accent)
    }

    /// Bold, italic, inline code and links. Falls back to plain text if the markdown is mid-stream and incomplete.
    private func inline(_ s: String) -> Text {
        let options = AttributedString.MarkdownParsingOptions(interpretedSyntax: .inlineOnlyPreservingWhitespace)
        if let attributed = try? AttributedString(markdown: s, options: options) { return Text(attributed) }
        return Text(s)
    }
}

// MARK: Cards

private struct VisualCard: View {
    let visual: AssistantVisual

    var body: some View {
        switch visual {
        case .market(let session, let indexes, let sectors):
            Panel {
                PanelHeader("Market", detail: session)
                VStack(spacing: 8) {
                    ForEach(indexes) { m in row(m.name, m.dayPercent) }
                    if !sectors.isEmpty { RowDivider().padding(.vertical, 4) }
                    ForEach(sectors) { m in row(m.name, m.dayPercent) }
                }
                .padding(Theme.inset)
            }
        case .movers(let gainers, let losers):
            Panel {
                PanelHeader("Biggest movers")
                VStack(spacing: 8) {
                    ForEach(gainers.prefix(5)) { m in row(m.symbol + (m.held ? "  (you own)" : ""), m.changePercent) }
                    if !gainers.isEmpty && !losers.isEmpty { RowDivider().padding(.vertical, 4) }
                    ForEach(losers.prefix(5)) { m in row(m.symbol + (m.held ? "  (you own)" : ""), m.changePercent) }
                }
                .padding(Theme.inset)
            }
        case .earnings(let days):
            Panel {
                PanelHeader("Earnings")
                VStack(alignment: .leading, spacing: 10) {
                    ForEach(days) { d in
                        VStack(alignment: .leading, spacing: 6) {
                            Text(d.day).eyebrow(color: Theme.fg3)
                            FlowChips(items: d.reports.map { $0.symbol + ($0.held ? " ●" : "") })
                        }
                    }
                }
                .padding(Theme.inset).frame(maxWidth: .infinity, alignment: .leading)
            }
        case .benchmark(let label, let range, let you, let benchmark):
            Panel {
                PanelHeader("You vs \(label)", detail: range)
                HStack(spacing: 0) {
                    stat("You", you)
                    Rectangle().fill(Theme.hair).frame(width: 1).frame(maxHeight: 56)
                    stat(label, benchmark)
                }
                .padding(.vertical, Theme.inset)
            }
        case .unknown: EmptyView()
        }
    }

    private func row(_ name: String, _ percent: Double) -> some View {
        HStack { Text(name).font(PFFont.body).foregroundStyle(Theme.fg); Spacer(); Delta(value: percent, font: PFFont.mono(12)) }
            .accessibilityElement(children: .combine)
    }

    private func stat(_ key: String, _ value: Double) -> some View {
        VStack(spacing: 4) {
            Text(key).eyebrow(color: Theme.fg3)
            Text(Format.percent(value)).font(PFFont.stat).numeric().foregroundStyle(Theme.direction(value))
        }
        .frame(maxWidth: .infinity)
    }
}

/// Condensed Portfolio X-Ray: size, concentration and the flags worth a look.
private struct XRayCard: View {
    let xray: XRaySummary
    var body: some View {
        Panel {
            PanelHeader("Portfolio X-Ray", detail: xray.asOf)
            if let o = xray.overview, let c = xray.concentration {
                StatGrid(items: [
                    .init(key: "Holdings", value: "\(o.holdingCount)"),
                    .init(key: "Top 1", value: Format.percent(c.top1, fractionDigits: 0, signed: false)),
                    .init(key: "Top 5", value: Format.percent(c.top5, fractionDigits: 0, signed: false)),
                ])
            }
            ForEach(xray.risks + xray.nextSteps) { insight in
                VStack(alignment: .leading, spacing: 3) {
                    HStack(spacing: 6) {
                        Circle().fill(insight.severity == "notable" ? Theme.loss : (insight.severity == "watch" ? Theme.medal1 : Theme.fg3)).frame(width: 6, height: 6)
                        Text(insight.title).font(PFFont.bodyMedium).foregroundStyle(Theme.fg)
                    }
                    Text(insight.summary).font(PFFont.caption).foregroundStyle(Theme.fg2)
                    if let metric = insight.metric { Text(metric).font(PFFont.rowSubtitle).foregroundStyle(Theme.fg3) }
                }
                .padding(Theme.inset).frame(maxWidth: .infinity, alignment: .leading)
                .overlay(alignment: .top) { RowDivider() }
            }
            if let note = xray.limitations.first {
                Text(note).font(PFFont.caption).foregroundStyle(Theme.fg3).padding(Theme.inset).frame(maxWidth: .infinity, alignment: .leading)
                    .overlay(alignment: .top) { RowDivider() }
            }
        }
    }
}

#Preview("Assistant, empty") { AssistantView(model: AssistantViewModel(client: nil, page: .portfolio)).environment(PreviewSupport.environment) }

#Preview("Assistant, conversation") {
    AssistantView(model: AssistantViewModel(client: nil, page: .portfolio, preset: PreviewSupport.conversation))
        .environment(PreviewSupport.environment).preferredColorScheme(.dark)
}
#Preview("Assistant, thinking") {
    AssistantView(model: AssistantViewModel(client: nil, page: .news, preset: [ChatTurn(role: .user, text: "How's the market?"), ChatTurn(role: .assistant, statusLabel: "Checking the market", isStreaming: true)]))
        .environment(PreviewSupport.environment)
}
