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
    @State private var contextPage: AssistantContext.Page = .portfolio

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
            AssistantView(model: AssistantViewModel(client: env.client, page: contextPage), page: contextPage)
                .tabItem { Label("Assistant", systemImage: "sparkles") }.tag(AppTab.assistant)
        }
        .onChange(of: selection) { old, new in
            Haptics.selection()
            // The assistant answers "my portfolio" questions differently on each page, so remember where the person came from.
            if new == .assistant { contextPage = Self.page(for: old) }
        }
    }

    private static func page(for tab: AppTab) -> AssistantContext.Page {
        switch tab {
        case .portfolio, .assistant: return .portfolio
        case .leagues: return .leagues
        case .fantasy: return .fantasy
        case .news: return .news
        }
    }
}
