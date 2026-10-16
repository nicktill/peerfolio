import SwiftUI
import PeerfolioKit

/// Signed-out -> sign-in; signed-in -> the five-tab app that mirrors the web nav.
struct RootView: View {
    @Environment(AppEnvironment.self) private var env

    var body: some View {
        Group {
            switch env.auth.state {
            case .launching:
                LaunchView()
            case .signedOut:
                SignInView().transition(.opacity)
            case .signedIn:
                MainTabs().transition(.opacity)
            }
        }
        .animation(Motion.ease(Motion.d3), value: env.auth.state)
        .task { await env.auth.restore() }
    }
}

private struct LaunchView: View {
    var body: some View {
        ZStack {
            Theme.bg.ignoresSafeArea()
            Image("Logo").resizable().scaledToFit().frame(width: 44, height: 44)
        }
    }
}

enum AppTab: Hashable { case portfolio, leagues, fantasy, news, assistant }

struct MainTabs: View {
    @Environment(AppEnvironment.self) private var env
    @State private var selection: AppTab = .portfolio

    var body: some View {
        TabView(selection: $selection) {
            PortfolioView(model: PortfolioViewModel(client: env.client))
                .tabItem { Label("Portfolio", systemImage: "chart.pie") }.tag(AppTab.portfolio)
            LeaguesView(model: LeaguesViewModel(client: env.client))
                .tabItem { Label("Leagues", systemImage: "person.2") }.tag(AppTab.leagues)
            FantasyHomeView(model: FantasyViewModel(client: env.client))
                .tabItem { Label("Fantasy", systemImage: "gamecontroller") }.tag(AppTab.fantasy)
            NewsView(model: NewsViewModel(client: env.client))
                .tabItem { Label("News", systemImage: "newspaper") }.tag(AppTab.news)
            AssistantView(model: AssistantViewModel(client: env.client, page: .portfolio))
                .tabItem { Label("Assistant", systemImage: "sparkles") }.tag(AppTab.assistant)
        }
        .onChange(of: selection) { _, _ in Haptics.selection() }
    }
}
