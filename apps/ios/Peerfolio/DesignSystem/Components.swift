import SwiftUI
import PeerfolioKit

// MARK: Panel

/// The web's `.pf-panel`: a flat 14pt-radius panel with a hairline border and no shadow.
struct Panel<Content: View>: View {
    var highlight: Bool = false
    @ViewBuilder var content: Content

    var body: some View {
        VStack(alignment: .leading, spacing: 0) { content }
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(highlight ? Theme.raise : Theme.panel)
            .clipShape(RoundedRectangle(cornerRadius: Theme.panelRadius, style: .continuous))
            .overlay(RoundedRectangle(cornerRadius: Theme.panelRadius, style: .continuous).strokeBorder(Theme.hair, lineWidth: 1))
    }
}

/// Panel head: 46pt, hairline underneath, mono eyebrow led by a 2pt accent tick that glows.
struct PanelHeader<Trailing: View>: View {
    let title: String
    var detail: String? = nil
    @ViewBuilder var trailing: Trailing

    var body: some View {
        HStack(spacing: 12) {
            HStack(spacing: 9) {
                RoundedRectangle(cornerRadius: 1).fill(Theme.accent).frame(width: 2, height: 9)
                    .shadow(color: Theme.accent.opacity(0.7), radius: 3.5)
                    .opacity(0.9)
                Text(title).eyebrow()
                if let detail { Text(detail).font(PFFont.eyebrow).foregroundStyle(Theme.fg3).textCase(.none) }
            }
            Spacer(minLength: 8)
            trailing
        }
        .padding(.horizontal, Theme.inset)
        .padding(.vertical, 10)
        .frame(minHeight: 46)
        .overlay(alignment: .bottom) { Rectangle().fill(Theme.hair).frame(height: 1) }
    }
}

extension PanelHeader where Trailing == EmptyView {
    init(_ title: String, detail: String? = nil) {
        self.init(title: title, detail: detail) { EmptyView() }
    }
}

/// Hairline between rows (the web's `border-top: 1px solid var(--hair2)`).
struct RowDivider: View {
    var body: some View { Rectangle().fill(Theme.hair2).frame(height: 1) }
}

/// A 56pt data row with its separator on top. Wrap in `Button` / `NavigationLink` for a pressable row.
struct DataRow<Content: View>: View {
    var first: Bool = false
    var isYou: Bool = false
    @ViewBuilder var content: Content

    var body: some View {
        VStack(spacing: 0) {
            if !first { RowDivider() }
            HStack(spacing: 12) { content }
                .padding(.horizontal, Theme.inset)
                .frame(minHeight: Theme.rowHeight)
        }
        .background(isYou ? Theme.raise : Color.clear)
        .overlay(alignment: .leading) { if isYou { Rectangle().fill(Theme.accent).frame(width: 2) } }
        .contentShape(Rectangle())
    }
}

/// Primary / secondary line pair inside a row: sans title over mono subtitle.
struct RowTitle: View {
    let title: String
    var subtitle: String? = nil
    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            Text(title).font(PFFont.bodyMedium).foregroundStyle(Theme.fg).lineLimit(1)
            if let subtitle { Text(subtitle).font(PFFont.rowSubtitle).foregroundStyle(Theme.fg3).lineLimit(1) }
        }
    }
}

/// The web's `.pf-stats`: equal columns separated by hairlines, mono key over a 20pt value.
struct StatGrid: View {
    struct Item: Identifiable { let id = UUID(); let key: String; let value: String; var sub: String? = nil; var tint: Color? = nil }
    let items: [Item]

    var body: some View {
        HStack(alignment: .top, spacing: 0) {
            ForEach(Array(items.enumerated()), id: \.element.id) { index, item in
                VStack(alignment: .leading, spacing: 0) {
                    Text(item.key).font(PFFont.eyebrow).tracking(1.2).textCase(.uppercase).foregroundStyle(Theme.fg3).lineLimit(1)
                    Text(item.value).font(PFFont.stat).numeric().foregroundStyle(item.tint ?? Theme.fg).lineLimit(1).minimumScaleFactor(0.7).padding(.top, 8)
                    if let sub = item.sub { Text(sub).font(PFFont.caption).foregroundStyle(Theme.fg3).padding(.top, 4).lineLimit(1) }
                }
                .padding(.horizontal, 14).padding(.top, 16).padding(.bottom, 18)
                .frame(maxWidth: .infinity, alignment: .leading)
                .overlay(alignment: .leading) { if index > 0 { Rectangle().fill(Theme.hair).frame(width: 1) } }
            }
        }
        .overlay(alignment: .top) { Rectangle().fill(Theme.hair).frame(height: 1) }
    }
}

// MARK: Direction

/// A signed change with an arrow, coloured by direction. Never colour alone.
struct Delta: View {
    enum Style { case percent, currency }
    let value: Double
    var style: Style = .percent
    var font: Font = PFFont.sans(14, .medium)
    var showArrow: Bool = true

    var body: some View {
        let dir = Format.direction(value, epsilon: style == .percent ? 0.005 : 0.005)
        HStack(spacing: 3) {
            if showArrow {
                Image(systemName: dir == .down ? "arrow.down.right" : (dir == .up ? "arrow.up.right" : "minus"))
                    .font(.system(size: 10, weight: .bold))
            }
            Text(style == .percent ? Format.percent(value) : Format.signedCurrency(value)).numeric()
        }
        .font(font)
        .foregroundStyle(Theme.direction(value))
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("\(dir == .down ? "down" : (dir == .up ? "up" : "unchanged")) \(style == .percent ? Format.percent(abs(value), signed: false) : Format.currency(abs(value)))")
    }
}

// MARK: Controls

/// Hairline pill track with a sliding highlight, mono 11pt labels (the web's range / scope radiogroup).
struct SegmentedPicker<Value: Hashable>: View {
    let options: [Value]
    @Binding var selection: Value
    let label: (Value) -> String
    @Namespace private var ns

    var body: some View {
        HStack(spacing: 0) {
            ForEach(options, id: \.self) { option in
                Button {
                    guard option != selection else { return }
                    Haptics.selection()
                    withAnimation(Motion.ease(Motion.d2)) { selection = option }
                } label: {
                    Text(label(option))
                        .font(PFFont.mono(11, medium: option == selection)).tracking(0.44)
                        .foregroundStyle(option == selection ? Theme.fg : Theme.fg3)
                        .padding(.horizontal, 10).frame(minWidth: 34, minHeight: 28)
                        .background {
                            if option == selection {
                                RoundedRectangle(cornerRadius: 7, style: .continuous).fill(Theme.raise)
                                    .overlay(RoundedRectangle(cornerRadius: 7, style: .continuous).strokeBorder(Theme.hair, lineWidth: 1))
                                    .matchedGeometryEffect(id: "pill", in: ns)
                            }
                        }
                }
                .buttonStyle(.plain)
                .accessibilityAddTraits(option == selection ? .isSelected : [])
            }
        }
        .padding(2)
        .overlay(RoundedRectangle(cornerRadius: Theme.controlRadius, style: .continuous).strokeBorder(Theme.hair, lineWidth: 1))
    }
}

struct PrimaryButtonStyle: ButtonStyle {
    @Environment(\.isEnabled) private var enabled
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(PFFont.bodyMedium)
            .foregroundStyle(Theme.inkFg)
            .frame(maxWidth: .infinity, minHeight: 44)
            .background(Theme.ink.opacity(enabled ? (configuration.isPressed ? 0.88 : 1) : 0.4), in: RoundedRectangle(cornerRadius: Theme.controlRadius, style: .continuous))
            .scaleEffect(configuration.isPressed ? 0.98 : 1)
            .animation(Motion.press, value: configuration.isPressed)
    }
}

struct OutlineButtonStyle: ButtonStyle {
    var destructive = false
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(PFFont.bodyMedium)
            .foregroundStyle(destructive ? Theme.loss : Theme.fg)
            .frame(maxWidth: .infinity, minHeight: 44)
            .background(configuration.isPressed ? Theme.raise : Color.clear, in: RoundedRectangle(cornerRadius: Theme.controlRadius, style: .continuous))
            .overlay(RoundedRectangle(cornerRadius: Theme.controlRadius, style: .continuous).strokeBorder(destructive ? Theme.loss.opacity(0.6) : Theme.line, lineWidth: 1))
            .scaleEffect(configuration.isPressed ? 0.98 : 1)
            .animation(Motion.press, value: configuration.isPressed)
    }
}

/// The web's `.pf-input`: 44pt tall on touch, hairline `line` border, accent border when focused.
struct PFTextFieldStyle: TextFieldStyle {
    var focused: Bool = false
    func _body(configuration: TextField<Self._Label>) -> some View {
        configuration
            .font(PFFont.body)
            .padding(.horizontal, 12).frame(minHeight: 44)
            .overlay(RoundedRectangle(cornerRadius: Theme.controlRadius, style: .continuous).strokeBorder(focused ? Theme.accent : Theme.line, lineWidth: 1))
    }
}

struct Chip: View {
    let text: String
    var body: some View {
        Text(text).font(PFFont.mono(11)).foregroundStyle(Theme.fg2)
            .padding(.horizontal, 8).frame(height: 24)
            .overlay(RoundedRectangle(cornerRadius: Theme.chipRadius).strokeBorder(Theme.hair, lineWidth: 1))
    }
}

struct Tag: View {
    let text: String
    var body: some View {
        Text(text).eyebrow(tracking: 1.0)
            .padding(.horizontal, 8).frame(height: 24)
            .overlay(RoundedRectangle(cornerRadius: Theme.controlRadius, style: .continuous).strokeBorder(Theme.line, lineWidth: 1))
    }
}

/// Steady dot with a ring that swells and fades (the web's `.live-dot`).
struct LiveDot: View {
    @State private var pulse = false
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    var body: some View {
        Circle().fill(Theme.gain).frame(width: 6, height: 6)
            .background(
                Circle().fill(Theme.gain)
                    .scaleEffect(pulse ? 2.4 : 1).opacity(pulse ? 0 : 0.45)
            )
            .onAppear {
                guard !reduceMotion else { return }
                withAnimation(.easeOut(duration: 2.6).repeatForever(autoreverses: false)) { pulse = true }
            }
            .accessibilityHidden(true)
    }
}

// MARK: Images

struct Avatar: View {
    let name: String?
    let url: String?
    var size: CGFloat = 36
    var ring: Color? = nil

    var body: some View {
        Group {
            if let url, let u = URL(string: url) {
                AsyncImage(url: u) { phase in
                    if let image = phase.image { image.resizable().scaledToFill() } else { initials }
                }
            } else { initials }
        }
        .frame(width: size, height: size)
        .clipShape(Circle())
        .overlay(Circle().strokeBorder(Theme.hair, lineWidth: 1))
        .padding(ring == nil ? 0 : 2)
        .overlay { if let ring { Circle().strokeBorder(ring, lineWidth: 1.5) } }
    }

    private var initials: some View {
        ZStack {
            Theme.raise
            Text(String((name ?? "?").prefix(1)).uppercased()).font(PFFont.sans(size * 0.4, .medium)).foregroundStyle(Theme.fg2)
        }
    }
}

/// League tile: 12pt-radius square with the league's emoji.
struct LeagueTile: View {
    let emoji: String
    var size: CGFloat = 40
    var body: some View {
        Text(emoji).font(.system(size: size * 0.5))
            .frame(width: size, height: size)
            .background(Theme.raise, in: RoundedRectangle(cornerRadius: Theme.leagueTileRadius, style: .continuous))
            .overlay(RoundedRectangle(cornerRadius: Theme.leagueTileRadius, style: .continuous).strokeBorder(Theme.hair, lineWidth: 1))
    }
}

/// Rank numeral: medal-coloured and bold for the top three, quiet otherwise.
struct RankLabel: View {
    let rank: Int
    var body: some View {
        Text("\(rank)").font(PFFont.sans(15, .semibold)).numeric()
            .foregroundStyle(Theme.medal(for: rank) ?? Theme.fg3)
            .frame(width: 22, alignment: .leading)
            .accessibilityLabel("Rank \(rank)")
    }
}

// MARK: Charts

/// Tiny trend line for rows. `values` are indexed (100 = start); colour follows the net direction.
struct Sparkline: View {
    let values: [Double]
    var width: CGFloat = 64
    var height: CGFloat = 24

    var body: some View {
        Canvas { context, size in
            guard values.count > 1, let lo = values.min(), let hi = values.max() else { return }
            let span = max(hi - lo, 0.0001)
            var path = Path()
            for (i, v) in values.enumerated() {
                let x = size.width * CGFloat(i) / CGFloat(values.count - 1)
                let y = size.height - size.height * CGFloat((v - lo) / span)
                i == 0 ? path.move(to: CGPoint(x: x, y: y)) : path.addLine(to: CGPoint(x: x, y: y))
            }
            let up = (values.last ?? 0) >= (values.first ?? 0)
            context.stroke(path, with: .color(up ? Theme.gain : Theme.loss), style: StrokeStyle(lineWidth: 1.5, lineCap: .round, lineJoin: .round))
        }
        .frame(width: width, height: height)
        .accessibilityHidden(true)
    }
}

// MARK: Loading and errors

enum Loadable<Value> {
    case idle
    case loading
    case loaded(Value)
    case failed(APIError)

    var value: Value? { if case .loaded(let v) = self { return v }; return nil }
    var isLoading: Bool { if case .loading = self { return true }; return false }
    var error: APIError? { if case .failed(let e) = self { return e }; return nil }
}

/// Shimmering placeholder block (the web's `.pf-sk`): hair-coloured, pulsing between 100% and 50%.
struct Skeleton: View {
    var width: CGFloat? = nil
    var height: CGFloat = 14
    @State private var dim = false
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    var body: some View {
        RoundedRectangle(cornerRadius: 4).fill(Theme.hair)
            .frame(width: width, height: height)
            .opacity(dim ? 0.5 : 1)
            .onAppear {
                guard !reduceMotion else { return }
                withAnimation(.easeInOut(duration: 0.7).repeatForever(autoreverses: true)) { dim = true }
            }
            .accessibilityHidden(true)
    }
}

struct ErrorPanel: View {
    let error: APIError
    var retry: (() -> Void)? = nil

    var body: some View {
        Panel {
            VStack(alignment: .leading, spacing: 12) {
                Text(error.errorDescription ?? "Something went wrong.").font(PFFont.body).foregroundStyle(Theme.fg)
                if let retry, error.isRetryable {
                    Button("Try again") { Haptics.light(); retry() }.buttonStyle(OutlineButtonStyle()).frame(maxWidth: 160)
                }
            }
            .padding(Theme.inset)
        }
    }
}

struct EmptyPanel: View {
    let title: String
    let message: String
    var systemImage: String = "tray"
    var body: some View {
        Panel {
            VStack(spacing: 10) {
                Image(systemName: systemImage).font(.system(size: 22, weight: .regular)).foregroundStyle(Theme.fg3)
                Text(title).font(PFFont.serif(22)).foregroundStyle(Theme.fg)
                Text(message).font(PFFont.body).foregroundStyle(Theme.fg2).multilineTextAlignment(.center)
            }
            .frame(maxWidth: .infinity).padding(.vertical, 32).padding(.horizontal, Theme.inset)
        }
    }
}

/// Page head: serif title, optional lede, hairline underneath (the web's `.pf-phead`).
struct PageHead<Trailing: View>: View {
    let title: String
    var lede: String? = nil
    @ViewBuilder var trailing: Trailing

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            HStack(alignment: .bottom) {
                Text(title).font(PFFont.pageTitle).tracking(-0.75).foregroundStyle(Theme.fg)
                Spacer(minLength: 8)
                trailing
            }
            if let lede { Text(lede).font(PFFont.body).foregroundStyle(Theme.fg2).padding(.top, 8) }
            Rectangle().fill(Theme.hair).frame(height: 1).padding(.top, 14)
        }
    }
}

extension PageHead where Trailing == EmptyView {
    init(_ title: String, lede: String? = nil) { self.init(title: title, lede: lede) { EmptyView() } }
}

/// Standard scrolling page: bg, 16pt side gutters, 16pt gaps, pull to refresh.
struct PageScroll<Content: View>: View {
    var refresh: (() async -> Void)? = nil
    @ViewBuilder var content: Content

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: Theme.pageGap) { content }
                .padding(.horizontal, 16).padding(.top, 8).padding(.bottom, 24)
        }
        .scrollIndicators(.hidden)
        .background(Theme.bg.ignoresSafeArea())
        .refreshable { if let refresh { await refresh(); Haptics.light() } }
    }
}
