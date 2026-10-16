import SwiftUI
import Charts
import PeerfolioKit

/// Net-worth line over the selected range, drawn from stored daily snapshots (never synthesised).
/// Drag to scrub: a rule and a value label follow the finger, with a light selection haptic per point.
struct NetWorthChart: View {
    let points: [PortfolioResponse.HistoryPoint]
    @State private var selectedDate: Date?
    @State private var lastHapticDate: Date?
    @State private var drawn = false
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    private struct Item: Identifiable { let id: String; let date: Date; let value: Double }

    private var items: [Item] {
        points.compactMap { p in Format.day(p.date).map { Item(id: p.date, date: $0, value: p.netWorth) } }
    }

    private var selected: Item? {
        guard let selectedDate else { return nil }
        return items.min { abs($0.date.timeIntervalSince(selectedDate)) < abs($1.date.timeIntervalSince(selectedDate)) }
    }

    var body: some View {
        let data = items
        let lo = data.map(\.value).min() ?? 0
        let hi = data.map(\.value).max() ?? 1
        let pad = max((hi - lo) * 0.18, 1)

        Chart {
            ForEach(data) { item in
                AreaMark(x: .value("Date", item.date), yStart: .value("Floor", lo - pad), yEnd: .value("Net worth", item.value))
                    .foregroundStyle(LinearGradient(colors: [Theme.accent.opacity(0.14), Theme.accent.opacity(0)], startPoint: .top, endPoint: .bottom))
                    .interpolationMethod(.monotone)
                LineMark(x: .value("Date", item.date), y: .value("Net worth", item.value))
                    .foregroundStyle(Theme.accent)
                    .lineStyle(StrokeStyle(lineWidth: 2, lineCap: .round, lineJoin: .round))
                    .interpolationMethod(.monotone)
            }
            if let s = selected {
                RuleMark(x: .value("Selected", s.date))
                    .foregroundStyle(Theme.line)
                    .lineStyle(StrokeStyle(lineWidth: 1))
                    .annotation(position: .top, spacing: 4, overflowResolution: .init(x: .fit(to: .chart), y: .disabled)) {
                        VStack(spacing: 1) {
                            Text(Format.currency(s.value, fractionDigits: 0)).font(PFFont.sans(13, .medium)).numeric().foregroundStyle(Theme.fg)
                            Text(s.date.formatted(.dateTime.month(.abbreviated).day())).font(PFFont.mono(10)).foregroundStyle(Theme.fg3)
                        }
                        .padding(.horizontal, 8).padding(.vertical, 4)
                        .background(Theme.panel, in: RoundedRectangle(cornerRadius: 7, style: .continuous))
                        .overlay(RoundedRectangle(cornerRadius: 7, style: .continuous).strokeBorder(Theme.hair, lineWidth: 1))
                    }
                PointMark(x: .value("Selected", s.date), y: .value("Net worth", s.value))
                    .foregroundStyle(Theme.accent).symbolSize(54)
            }
        }
        .chartYScale(domain: (lo - pad)...(hi + pad))
        .chartXSelection(value: $selectedDate)
        .chartYAxis {
            AxisMarks(position: .trailing, values: .automatic(desiredCount: 3)) { value in
                AxisGridLine(stroke: StrokeStyle(lineWidth: 0.5)).foregroundStyle(Theme.hair2)
                AxisValueLabel {
                    if let v = value.as(Double.self) { Text(Format.compactCurrency(v)).font(PFFont.mono(10)).foregroundStyle(Theme.fg3) }
                }
            }
        }
        .chartXAxis {
            AxisMarks(values: .automatic(desiredCount: 4)) { _ in
                AxisValueLabel(format: .dateTime.month(.abbreviated).day(), anchor: .top).font(PFFont.mono(10)).foregroundStyle(Theme.fg3)
            }
        }
        // The line draws in from the left, like the web's `.pf-draw`.
        .mask(alignment: .leading) {
            GeometryReader { geo in Rectangle().frame(width: reduceMotion || drawn ? geo.size.width : 0) }
        }
        .onAppear { withAnimation(Motion.ease(Motion.d4)) { drawn = true } }
        .onChange(of: selected?.id) { _, id in
            if id != nil { Haptics.selection() }
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("Net worth chart")
        .accessibilityValue(summary(data))
    }

    private func summary(_ data: [Item]) -> String {
        guard let first = data.first, let last = data.last else { return "No history yet" }
        return "From \(Format.currency(first.value, fractionDigits: 0)) to \(Format.currency(last.value, fractionDigits: 0))"
    }
}

#Preview("Chart") {
    NetWorthChart(points: Mock.portfolio.history).frame(height: 190).padding().background(Theme.panel)
}
