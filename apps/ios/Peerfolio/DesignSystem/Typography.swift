import SwiftUI
import UIKit

/// The web's three families: Hanken Grotesk (UI and data), Newsreader (titles and hero figures), IBM Plex Mono
/// (eyebrows, tickers, captions). Sizes scale with Dynamic Type. If a font file is missing from the bundle the
/// closest system design is used (rounded sans, serif, monospaced) so the app never shows a blank glyph.
enum PFFont {
    enum SansWeight { case regular, medium, semibold }

    private static func custom(_ name: String, _ size: CGFloat, relativeTo style: Font.TextStyle, fallback: Font) -> Font {
        UIFont(name: name, size: size) != nil ? .custom(name, size: size, relativeTo: style) : fallback
    }

    static func sans(_ size: CGFloat, _ weight: SansWeight = .regular, relativeTo style: Font.TextStyle = .body) -> Font {
        switch weight {
        case .regular: return custom("HankenGrotesk-Regular", size, relativeTo: style, fallback: .system(size: size, weight: .regular))
        case .medium: return custom("HankenGrotesk-Medium", size, relativeTo: style, fallback: .system(size: size, weight: .medium))
        case .semibold: return custom("HankenGrotesk-SemiBold", size, relativeTo: style, fallback: .system(size: size, weight: .semibold))
        }
    }

    static func serif(_ size: CGFloat, italic: Bool = false, relativeTo style: Font.TextStyle = .title) -> Font {
        let name = italic ? "Newsreader16pt16pt-Italic" : "Newsreader16pt16pt-Regular"
        return custom(name, size, relativeTo: style, fallback: .system(size: size, weight: .regular, design: .serif))
    }

    static func mono(_ size: CGFloat, medium: Bool = false, relativeTo style: Font.TextStyle = .caption) -> Font {
        custom(medium ? "IBMPlexMono-Medium" : "IBMPlexMono-Regular", size, relativeTo: style,
               fallback: .system(size: size, weight: medium ? .medium : .regular, design: .monospaced))
    }

    // Roles from docs/ios/design-tokens.json
    static let pageTitle = serif(30, relativeTo: .largeTitle)
    static let heroFigure = serif(48, relativeTo: .largeTitle)
    static let stat = sans(20, .medium, relativeTo: .title3)
    static let body = sans(14, relativeTo: .body)
    static let bodyMedium = sans(14, .medium, relativeTo: .body)
    static let rowSubtitle = mono(11, relativeTo: .caption)
    static let caption = sans(12, relativeTo: .caption)
    static let eyebrow = mono(10.5, medium: true, relativeTo: .caption2)
    static let tab = sans(11, .medium, relativeTo: .caption2)
}

extension View {
    /// Mono uppercase label with the web's 0.09em tracking.
    func eyebrow(color: Color = Theme.fg2, tracking: CGFloat = 0.95) -> some View {
        self.font(PFFont.eyebrow).tracking(tracking).textCase(.uppercase).foregroundStyle(color)
    }

    /// Tabular lining figures, so money and percentages do not reflow as digits change.
    func numeric() -> some View { self.monospacedDigit() }
}
