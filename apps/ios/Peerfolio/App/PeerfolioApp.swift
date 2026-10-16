import SwiftUI
import UIKit
import PeerfolioKit
#if canImport(GoogleSignIn)
import GoogleSignIn
#endif

@main
@MainActor
struct PeerfolioApp: App {
    @State private var env = AppEnvironment(baseURL: AppEnvironment.configuredBaseURL())
    @AppStorage("appearance") private var appearanceRaw = AppearancePreference.system.rawValue

    init() { Self.styleChrome() }

    var body: some Scene {
        WindowGroup {
            RootView()
                .environment(env)
                .preferredColorScheme((AppearancePreference(rawValue: appearanceRaw) ?? .system).scheme)
                .tint(Theme.accent)
                #if canImport(GoogleSignIn)
                .onOpenURL { GIDSignIn.sharedInstance.handle($0) }
                #endif
        }
    }

    /// The web's mobile chrome: page-coloured bar with a hairline, 11pt medium labels, muted until selected.
    private static func styleChrome() {
        let tab = UITabBarAppearance()
        tab.configureWithOpaqueBackground()
        tab.backgroundColor = UIColor(Theme.bg)
        tab.shadowColor = UIColor(Theme.hair)
        let item = UITabBarItemAppearance()
        let font = UIFont(name: "HankenGrotesk-Medium", size: 11) ?? .systemFont(ofSize: 11, weight: .medium)
        item.normal.titleTextAttributes = [.font: font, .foregroundColor: UIColor(Theme.fg3)]
        item.selected.titleTextAttributes = [.font: font, .foregroundColor: UIColor(Theme.fg)]
        item.normal.iconColor = UIColor(Theme.fg3)
        item.selected.iconColor = UIColor(Theme.fg)
        tab.stackedLayoutAppearance = item
        tab.inlineLayoutAppearance = item
        tab.compactInlineLayoutAppearance = item
        UITabBar.appearance().standardAppearance = tab
        UITabBar.appearance().scrollEdgeAppearance = tab
    }
}
