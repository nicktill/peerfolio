import SwiftUI
import PeerfolioKit

/// Reaction emoji the backend accepts (REACTION_EMOJI in apps/web/src/lib/social.ts).
let reactionEmoji = ["🔥", "🚀", "👏", "🧊", "🤝", "😤"]

/// One member of a league table, shared by real-money and fantasy leagues. Top three get a medal-coloured rank
/// numeral, a thin ring on the avatar and a faint wash, like the web; "you" gets the raised row and accent rail.
struct StandingRow: View {
    let rank: Int
    let name: String?
    let handle: String?
    let imageURL: String?
    let percent: Double
    let spark: [Double]
    let isYou: Bool
    var isVerified: Bool = false
    var holdings: [SharedHolding] = []
    var reactions: [String: Int] = [:]
    var myReactions: Set<String> = []
    var userId: String = ""
    var onReact: ((String) -> Void)? = nil
    var first: Bool = false
    @State private var expanded = false

    var body: some View {
        let medal = Theme.medal(for: rank)
        VStack(spacing: 0) {
            Button {
                guard !holdings.isEmpty || onReact != nil else { return }
                Haptics.selection()
                withAnimation(Motion.ease()) { expanded.toggle() }
            } label: {
                DataRow(first: first, isYou: isYou) {
                    RankLabel(rank: rank)
                    Avatar(name: name, url: imageURL, size: 36, ring: medal)
                    VStack(alignment: .leading, spacing: 0) {
                        HStack(spacing: 6) {
                            Text(name ?? handle ?? "Member").font(PFFont.bodyMedium).foregroundStyle(Theme.fg).lineLimit(1)
                            if isYou { Text("YOU").font(PFFont.mono(9, medium: true)).tracking(0.8).foregroundStyle(Theme.accent) }
                            if isVerified { Image(systemName: "checkmark.seal.fill").font(.system(size: 11)).foregroundStyle(Theme.accent).accessibilityLabel("Verified") }
                        }
                        if let handle { Text("@\(handle)").font(PFFont.rowSubtitle).foregroundStyle(Theme.fg3).lineLimit(1) }
                    }
                    Spacer(minLength: 6)
                    Sparkline(values: spark)
                    Delta(value: percent, font: PFFont.sans(14, .medium)).frame(minWidth: 76, alignment: .trailing)
                }
                .background(alignment: .leading) {
                    if let medal, !isYou { LinearGradient(colors: [medal.opacity(0.07), .clear], startPoint: .leading, endPoint: UnitPoint(x: 0.55, y: 0.5)) }
                }
            }
            .buttonStyle(RowPressStyle())
            .accessibilityElement(children: .combine)
            .accessibilityHint(holdings.isEmpty ? "" : "Shows holdings and reactions")

            if expanded {
                VStack(alignment: .leading, spacing: 10) {
                    if !holdings.isEmpty {
                        Text("Top holdings, share of their portfolio").eyebrow(color: Theme.fg3)
                        FlowChips(items: holdings.map { "\($0.ticker) \(Format.percent($0.weight, fractionDigits: 0, signed: false))" })
                    }
                    if let onReact, !isYou {
                        HStack(spacing: 8) {
                            ForEach(reactionEmoji, id: \.self) { emoji in
                                let mine = myReactions.contains("\(userId)|\(emoji)")
                                Button { onReact(emoji) } label: {
                                    HStack(spacing: 4) {
                                        Text(emoji)
                                        if let n = reactions[emoji], n > 0 { Text("\(n)").font(PFFont.mono(11)).foregroundStyle(Theme.fg2) }
                                    }
                                    .padding(.horizontal, 8).frame(minHeight: 32)
                                    .background(mine ? Theme.accent.opacity(0.14) : Color.clear, in: Capsule())
                                    .overlay(Capsule().strokeBorder(mine ? Theme.accent : Theme.hair, lineWidth: 1))
                                }
                                .buttonStyle(PressStyle())
                                .accessibilityLabel("React \(emoji)")
                            }
                        }
                    }
                }
                .padding(.horizontal, Theme.inset).padding(.bottom, 14).padding(.top, 2)
                .frame(maxWidth: .infinity, alignment: .leading)
                .transition(.opacity.combined(with: .offset(y: -4)))
            }
        }
    }
}

/// Wrapping row of mono chips.
struct FlowChips: View {
    let items: [String]
    var body: some View {
        FlowLayout(spacing: 6) { ForEach(items, id: \.self) { Chip(text: $0) } }
    }
}

/// Minimal left-to-right wrapping layout.
struct FlowLayout: Layout {
    var spacing: CGFloat = 6

    func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) -> CGSize {
        let maxWidth = proposal.width ?? .infinity
        var x: CGFloat = 0, y: CGFloat = 0, rowHeight: CGFloat = 0, width: CGFloat = 0
        for view in subviews {
            let size = view.sizeThatFits(.unspecified)
            if x + size.width > maxWidth, x > 0 { x = 0; y += rowHeight + spacing; rowHeight = 0 }
            x += size.width + spacing; rowHeight = max(rowHeight, size.height); width = max(width, x - spacing)
        }
        return CGSize(width: width, height: y + rowHeight)
    }

    func placeSubviews(in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) {
        var x = bounds.minX, y = bounds.minY, rowHeight: CGFloat = 0
        for view in subviews {
            let size = view.sizeThatFits(.unspecified)
            if x + size.width > bounds.maxX, x > bounds.minX { x = bounds.minX; y += rowHeight + spacing; rowHeight = 0 }
            view.place(at: CGPoint(x: x, y: y), proposal: ProposedViewSize(size))
            x += size.width + spacing; rowHeight = max(rowHeight, size.height)
        }
    }
}
