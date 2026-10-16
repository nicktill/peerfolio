import SwiftUI
import UIKit

/// Motion system of the web app: one easing curve, four durations, transform and opacity only.
enum Motion {
    static let d1: Double = 0.12
    static let d2: Double = 0.20
    static let d3: Double = 0.32
    static let d4: Double = 0.50

    /// cubic-bezier(0.22, 1, 0.36, 1)
    static func ease(_ duration: Double = d3) -> Animation { .timingCurve(0.22, 1, 0.36, 1, duration: duration) }
    static let press = ease(0.15)
}

/// Sections arrive one after another (the web's `.reveal`): rise 12pt and fade, 40ms apart, capped at index 6.
private struct RevealModifier: ViewModifier {
    let index: Int
    @State private var shown = false
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    func body(content: Content) -> some View {
        content
            .opacity(shown || reduceMotion ? 1 : 0)
            .offset(y: shown || reduceMotion ? 0 : 12)
            .onAppear {
                guard !shown else { return }
                withAnimation(Motion.ease(0.42).delay(Double(min(index, 6)) * 0.04)) { shown = true }
            }
    }
}

/// A short soft cross-fade with a hint of focus-pull, for content that swaps in place (a new range, a new day).
private struct SwapInModifier<Value: Equatable>: ViewModifier {
    let value: Value
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    func body(content: Content) -> some View {
        content
            .id(value)
            .transition(reduceMotion ? .opacity : .opacity.combined(with: .offset(y: 4)))
            .animation(reduceMotion ? nil : Motion.ease(0.38), value: value)
    }
}

extension View {
    func reveal(_ index: Int = 0) -> some View { modifier(RevealModifier(index: index)) }
    func swapIn<V: Equatable>(on value: V) -> some View { modifier(SwapInModifier(value: value)) }
}

/// "Anything you can press gives a little": 97% scale with the web's easing.
struct PressStyle: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .scaleEffect(configuration.isPressed ? 0.97 : 1)
            .animation(Motion.press, value: configuration.isPressed)
    }
}

/// A row that darkens to `raise` while pressed, like the web's `a.pf-row:hover`.
struct RowPressStyle: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .background(configuration.isPressed ? Theme.raise : Color.clear)
            .animation(Motion.ease(Motion.d2), value: configuration.isPressed)
    }
}

/// Haptics. Selection for pickers and tabs; notifications for outcomes of trades and destructive actions.
enum Haptics {
    static func selection() { UISelectionFeedbackGenerator().selectionChanged() }
    static func light() { UIImpactFeedbackGenerator(style: .light).impactOccurred() }
    static func success() { UINotificationFeedbackGenerator().notificationOccurred(.success) }
    static func warning() { UINotificationFeedbackGenerator().notificationOccurred(.warning) }
    static func error() { UINotificationFeedbackGenerator().notificationOccurred(.error) }
}
