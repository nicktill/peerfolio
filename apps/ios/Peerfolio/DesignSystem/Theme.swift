import SwiftUI
import UIKit

/// Colour tokens of the signed-in web app ("5C", apps/web/src/app/peerfolio-5c.css), light and dark.
/// Values mirror docs/ios/design-tokens.json; change them there and here together.
enum Theme {
    /// Page background.
    static let bg = Color(light: 0xECEFF2, dark: 0x0D0F11)
    /// Panels and cards.
    static let panel = Color(light: 0xF9FAFB, dark: 0x14171A)
    /// Hovered / pressed / "you" rows and wells.
    static let raise = Color(light: 0xEDF0F4, dark: 0x1E2226)
    /// Panel borders and header rules.
    static let hair = Color(light: 0xD6DCE3, dark: 0x2A3036)
    /// Row separators.
    static let hair2 = Color(light: 0xE5E9EE, dark: 0x22272B)
    /// Input borders and strong rules.
    static let line = Color(light: 0xB4BFCB, dark: 0x3B434B)

    static let fg = Color(light: 0x202A34, dark: 0xF0F2F4)
    static let fg2 = Color(light: 0x4A5967, dark: 0xB4BCC5)
    static let fg3 = Color(light: 0x5B6B7C, dark: 0x939CA7)

    static let accent = Color(light: 0x3867A1, dark: 0x98B8E7)
    static let gain = Color(light: 0x286549, dark: 0x94C8AF)
    static let loss = Color(light: 0xA65048, dark: 0xE6A39D)

    /// Inverted-ink primary button.
    static let ink = Color(light: 0x25364B, dark: 0xEDF2F8)
    static let inkFg = Color(light: 0xF9FAFB, dark: 0x14181D)

    static let medal1 = Color(light: 0x8A6500, dark: 0xE0B544)
    static let medal2 = Color(light: 0x4F5D6D, dark: 0xC3D0DE)
    static let medal3 = Color(light: 0x8A5426, dark: 0xD39B6C)

    /// Categorical chart colours, assigned in order and never cycled (CVD-validated order from the web).
    static let series: [Color] = [
        Color(light: 0x2A78D6, dark: 0x3987E5),
        Color(light: 0xEB6834, dark: 0xD95926),
        Color(light: 0x1BAF7A, dark: 0x199E70),
        Color(light: 0xEDA100, dark: 0xC98500),
        Color(light: 0xE87BA4, dark: 0xD55181),
        Color(light: 0x008300, dark: 0x008300),
        Color(light: 0x7C5CD6, dark: 0x9B7CF0),
    ]

    static func seriesColor(_ index: Int) -> Color { series[index % series.count] }

    static func medal(for rank: Int) -> Color? {
        switch rank { case 1: return medal1; case 2: return medal2; case 3: return medal3; default: return nil }
    }

    /// Colour for a signed change. Always shown with a sign and arrow too: red/green alone is not enough.
    static func direction(_ value: Double) -> Color {
        switch Format.direction(value) { case .up: return gain; case .down: return loss; case .flat: return fg3 }
    }

    // Shape
    static let panelRadius: CGFloat = 14
    static let controlRadius: CGFloat = 9
    static let chipRadius: CGFloat = 4
    static let leagueTileRadius: CGFloat = 12
    static let inset: CGFloat = 16
    static let pageGap: CGFloat = 16
    static let rowHeight: CGFloat = 56
}

extension Color {
    init(light: UInt32, dark: UInt32) {
        self = Color(uiColor: UIColor { traits in
            UIColor(hex: traits.userInterfaceStyle == .dark ? dark : light)
        })
    }
}

extension UIColor {
    convenience init(hex: UInt32) {
        self.init(
            red: CGFloat((hex >> 16) & 0xFF) / 255,
            green: CGFloat((hex >> 8) & 0xFF) / 255,
            blue: CGFloat(hex & 0xFF) / 255,
            alpha: 1
        )
    }
}
