import SwiftUI
import Charts
import Observation
import PeerfolioKit

@MainActor
@Observable
final class WealthLabViewModel {
    var inputs: Wealth.Inputs
    var spread = Wealth.defaultSpread
    var usedPortfolio = false
    var loadingPortfolio = false
    private let client: APIClient?

    init(client: APIClient?, inputs: Wealth.Inputs = Wealth.Inputs(startingValue: 25_000, monthlyContribution: 500, annualContributionGrowthPct: 0, years: 20,
                                                                      expectedAnnualReturnPct: 7, inflationPct: 2.5, targetValue: 1_000_000)) {
        self.client = client; self.inputs = inputs
    }

    var scenarios: Wealth.Scenarios { Wealth.scenarios(inputs, spread: spread) }

    /// Monthly amount that would reach the target in the chosen horizon, or nil without a target.
    var requiredContribution: Double? {
        guard inputs.targetValue > 0 else { return nil }
        return Wealth.requiredMonthlyContribution(target: inputs.targetValue, years: inputs.years, inputs: inputs)
    }

    var monthsToTarget: Int? { Wealth.monthsToReachTarget(inputs) }

    /// Starts from the person's real investable assets. Nothing is saved; this only prefills the sandbox.
    func usePortfolio() async {
        guard let client else { return }
        loadingPortfolio = true
        defer { loadingPortfolio = false }
        if let p = try? await client.portfolio(range: .month) {
            inputs.startingValue = p.summary.investableAssets.rounded()
            usedPortfolio = true
            Haptics.success()
        } else { Haptics.error() }
    }
}

struct WealthLabView: View {
    @State var model: WealthLabViewModel

    init(model: WealthLabViewModel) { _model = State(initialValue: model) }

    var body: some View {
        let s = model.scenarios
        PageScroll {
            PageHead("Wealth Lab", lede: "A planning sandbox. Change the assumptions and see what could happen. These are hypotheticals, not predictions or advice, and nothing here is saved.")
            resultPanel(s).reveal(0)
            chartPanel(s).reveal(1)
            inputsPanel.reveal(2)
            if model.inputs.targetValue > 0 { targetPanel.reveal(3) }
        }
        .navigationTitle("Wealth Lab").navigationBarTitleDisplayMode(.inline)
    }

    // MARK: Result

    private func resultPanel(_ s: Wealth.Scenarios) -> some View {
        let b = s.base.summary
        return Panel {
            VStack(alignment: .leading, spacing: 6) {
                Text("In \(Format.shares(model.inputs.years)) years").eyebrow()
                Text(Format.currency(b.finalNominal, fractionDigits: 0)).font(PFFont.heroFigure).tracking(-1.6).numeric().foregroundStyle(Theme.fg)
                    .lineLimit(1).minimumScaleFactor(0.5).contentTransition(.numericText())
                Text("\(Format.currency(b.finalReal, fractionDigits: 0)) in today's money").font(PFFont.body).foregroundStyle(Theme.fg2)
            }
            .padding(.horizontal, Theme.inset).padding(.top, 18).padding(.bottom, 16)
            StatGrid(items: [
                .init(key: "You add", value: Format.compactCurrency(b.totalContributions)),
                .init(key: "Growth", value: Format.compactCurrency(b.totalGrowth)),
                .init(key: "Range", value: "\(Format.compactCurrency(s.conservative.summary.finalNominal))-\(Format.compactCurrency(s.optimistic.summary.finalNominal))"),
            ])
        }
    }

    private func chartPanel(_ s: Wealth.Scenarios) -> some View {
        Panel {
            PanelHeader(title: "Scenarios", detail: "base \(Format.shares(model.inputs.expectedAnnualReturnPct))% ± \(Format.shares(s.spread))") { EmptyView() }
            WealthChart(scenarios: s, target: model.inputs.targetValue)
                .frame(height: 220).padding(Theme.inset)
        }
    }

    // MARK: Inputs

    private var inputsPanel: some View {
        Panel {
            PanelHeader(title: "Assumptions") {
                Button(model.usedPortfolio ? "Using your portfolio" : "Use my portfolio") { Task { await model.usePortfolio() } }
                    .font(PFFont.mono(11, medium: true)).foregroundStyle(Theme.accent).disabled(model.loadingPortfolio)
            }
            VStack(spacing: 0) {
                MoneyField(title: "Starting value", value: $model.inputs.startingValue)
                MoneyField(title: "Monthly contribution", value: $model.inputs.monthlyContribution)
                SliderRow(title: "Contribution grows", value: $model.inputs.annualContributionGrowthPct, range: 0...10, step: 0.5, format: { "\(Format.shares($0))% a year" })
                SliderRow(title: "Years", value: $model.inputs.years, range: 1...50, step: 1, format: { "\(Format.shares($0)) years" })
                SliderRow(title: "Expected return", value: $model.inputs.expectedAnnualReturnPct, range: 0...15, step: 0.5, format: { "\(Format.shares($0))% a year" })
                SliderRow(title: "Inflation", value: $model.inputs.inflationPct, range: 0...8, step: 0.1, format: { "\(Format.shares($0))% a year" })
                SliderRow(title: "Scenario spread", value: $model.spread, range: 0...5, step: 0.5, format: { "± \(Format.shares($0)) points" })
                MoneyField(title: "Target (optional)", value: $model.inputs.targetValue)
            }
        }
    }

    private var targetPanel: some View {
        Panel {
            PanelHeader("Your target", detail: Format.compactCurrency(model.inputs.targetValue))
            VStack(alignment: .leading, spacing: 12) {
                if let b = model.scenarios.base.summary.progress {
                    ProgressView(value: min(b, 1)).tint(Theme.accent)
                    Text(b >= 1 ? "The base case reaches the target within \(Format.shares(model.inputs.years)) years." : "The base case reaches \(Format.percent(b * 100, fractionDigits: 0, signed: false)) of the target in \(Format.shares(model.inputs.years)) years.")
                        .font(PFFont.body).foregroundStyle(Theme.fg)
                }
                if let m = model.monthsToTarget {
                    Text(m == 0 ? "You are already there." : "At this pace it takes about \(Format.shares(Double(m) / 12)) years.").font(PFFont.body).foregroundStyle(Theme.fg2)
                } else {
                    Text("At this pace the target isn't reached within 100 years.").font(PFFont.body).foregroundStyle(Theme.fg2)
                }
                if let need = model.requiredContribution {
                    Text(need == 0 ? "No further saving is needed to get there in this time." : "To get there in \(Format.shares(model.inputs.years)) years you would save about \(Format.currency(need, fractionDigits: 0)) a month.")
                        .font(PFFont.bodyMedium).foregroundStyle(Theme.fg)
                }
            }
            .padding(Theme.inset)
        }
    }
}

// MARK: Pieces

private struct WealthChart: View {
    let scenarios: Wealth.Scenarios
    let target: Double

    private struct Item: Identifiable { let id: String; let year: Double; let value: Double; let series: String }

    private var items: [Item] {
        func rows(_ p: Wealth.Projection, _ name: String) -> [Item] {
            let step = max(1, p.months / 120)
            return p.points.filter { $0.month % step == 0 || $0.month == p.months }.map { Item(id: "\(name)\($0.month)", year: Double($0.month) / 12, value: $0.nominal, series: name) }
        }
        return rows(scenarios.conservative, "Conservative") + rows(scenarios.optimistic, "Optimistic") + rows(scenarios.base, "Base")
    }

    var body: some View {
        Chart {
            ForEach(items) { item in
                LineMark(x: .value("Years", item.year), y: .value("Value", item.value), series: .value("Scenario", item.series))
                    .foregroundStyle(item.series == "Base" ? Theme.accent : Theme.fg3)
                    .lineStyle(StrokeStyle(lineWidth: item.series == "Base" ? 2.5 : 1.5, dash: item.series == "Base" ? [] : [4, 3]))
                    .interpolationMethod(.monotone)
            }
            if target > 0 {
                RuleMark(y: .value("Target", target))
                    .foregroundStyle(Theme.medal1)
                    .lineStyle(StrokeStyle(lineWidth: 1, dash: [2, 3]))
                    .annotation(position: .top, alignment: .leading) { Text("Target").font(PFFont.mono(10)).foregroundStyle(Theme.medal1) }
            }
        }
        .chartLegend(.hidden)
        .chartYAxis {
            AxisMarks(position: .trailing, values: .automatic(desiredCount: 4)) { value in
                AxisGridLine(stroke: StrokeStyle(lineWidth: 0.5)).foregroundStyle(Theme.hair2)
                AxisValueLabel { if let v = value.as(Double.self) { Text(Format.compactCurrency(v)).font(PFFont.mono(10)).foregroundStyle(Theme.fg3) } }
            }
        }
        .chartXAxis {
            AxisMarks(values: .automatic(desiredCount: 5)) { value in
                AxisValueLabel { if let v = value.as(Double.self) { Text("\(Int(v))y").font(PFFont.mono(10)).foregroundStyle(Theme.fg3) } }
            }
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("Projected value over time, three scenarios")
        .accessibilityValue("Base case ends at \(Format.currency(scenarios.base.summary.finalNominal, fractionDigits: 0))")
    }
}

private struct MoneyField: View {
    let title: String
    @Binding var value: Double
    @State private var text = ""
    @FocusState private var focused: Bool

    var body: some View {
        HStack {
            Text(title).font(PFFont.body).foregroundStyle(Theme.fg)
            Spacer()
            TextField("0", text: $text)
                .keyboardType(.decimalPad).multilineTextAlignment(.trailing).focused($focused)
                .font(PFFont.bodyMedium).numeric().frame(maxWidth: 140)
                .onChange(of: text) { _, new in
                    let cleaned = new.replacingOccurrences(of: ",", with: "")
                    if let v = Double(cleaned) { value = min(max(v, 0), Wealth.maxMoney) } else if cleaned.isEmpty { value = 0 }
                }
                .onChange(of: value) { _, new in if !focused { text = Self.display(new) } }
                .onAppear { text = Self.display(value) }
        }
        .padding(.horizontal, Theme.inset).frame(minHeight: Theme.rowHeight)
        .overlay(alignment: .top) { RowDivider() }
    }

    private static func display(_ v: Double) -> String { v == 0 ? "" : String(format: "%.0f", v) }
}

private struct SliderRow: View {
    let title: String
    @Binding var value: Double
    let range: ClosedRange<Double>
    let step: Double
    let format: (Double) -> String

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            HStack {
                Text(title).font(PFFont.body).foregroundStyle(Theme.fg)
                Spacer()
                Text(format(value)).font(PFFont.mono(12)).numeric().foregroundStyle(Theme.fg2)
            }
            Slider(value: $value, in: range, step: step) { editing in if !editing { Haptics.selection() } }.tint(Theme.accent)
        }
        .padding(.horizontal, Theme.inset).padding(.vertical, 10)
        .overlay(alignment: .top) { RowDivider() }
    }
}

#Preview("Wealth Lab") { NavigationStack { WealthLabView(model: WealthLabViewModel(client: nil)) }.environment(PreviewSupport.environment) }
#Preview("Wealth Lab, dark") { NavigationStack { WealthLabView(model: WealthLabViewModel(client: nil)) }.environment(PreviewSupport.environment).preferredColorScheme(.dark) }
