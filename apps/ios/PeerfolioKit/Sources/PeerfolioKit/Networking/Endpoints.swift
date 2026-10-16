import Foundation

/// One method per backend route the app uses. Paths are relative to `/api/v1`.
extension APIClient {
    // MARK: Auth

    /// Trades a Sign in with Apple / Google ID token for a Peerfolio session and stores it.
    @discardableResult
    public func signIn(_ request: TokenExchangeRequest) async throws -> SessionUser? {
        let response: AuthSessionResponse = try await send("POST", "/mobile/auth/token", body: request, auth: .none)
        await session.establish(response)
        return response.user
    }

    /// App Review sign-in. Fails with a 404 `APIError.http` when the server has the feature switched off.
    @discardableResult
    public func reviewSignIn(_ request: ReviewSignInRequest) async throws -> SessionUser? {
        let response: AuthSessionResponse = try await send("POST", "/mobile/auth/review", body: request, auth: .none)
        await session.establish(response)
        return response.user
    }

    /// Registers this device's APNs token. Groundwork: the server stores it but does not send yet.
    public func registerDevice(_ request: RegisterDeviceRequest) async throws {
        let _: OkResponse = try await send("POST", "/mobile/devices", body: request)
    }

    public func unregisterDevice(token: String) async throws {
        let _: OkResponse = try await send("DELETE", "/mobile/devices", body: ["token": token])
    }

    public func me() async throws -> MeResponse { try await get("/me") }

    @discardableResult
    public func updateMe(_ update: UpdateMeRequest) async throws -> OkResponse { try await send("PATCH", "/me", body: update) }

    /// Permanently deletes the account and its data (App Store guideline 5.1.1(v)). Ends the local session afterwards.
    public func deleteAccount() async throws {
        let _: OkResponse = try await send("DELETE", "/me")
        await session.signOut()
    }

    // MARK: Portfolio

    public func portfolio(range: PerformanceRange = .month) async throws -> PortfolioResponse {
        try await get("/portfolio", query: [URLQueryItem(name: "range", value: range.rawValue)])
    }

    public func benchmark(symbol: String, range: PerformanceRange) async throws -> BenchmarkResponse {
        try await get("/portfolio/benchmark", query: [URLQueryItem(name: "symbol", value: symbol), URLQueryItem(name: "range", value: range.rawValue)])
    }

    // MARK: Leagues

    public func leagues() async throws -> [LeagueSummary] {
        let response: LeagueListResponse = try await get("/leagues")
        return response.leagues
    }

    public func league(id: String, range: PerformanceRange = .month) async throws -> LeagueDetailResponse {
        try await get("/leagues/\(id)", query: [URLQueryItem(name: "range", value: range.rawValue)])
    }

    public func createLeague(_ request: CreateLeagueRequest) async throws -> LeagueRef {
        let response: CreateLeagueResponse = try await send("POST", "/leagues", body: request)
        return response.league
    }

    public func joinLeague(code: String) async throws -> JoinLeagueResponse { try await send("POST", "/leagues/join", body: ["code": code]) }

    public func leaveLeague(id: String) async throws { let _: OkResponse = try await send("POST", "/leagues/\(id)/leave") }

    public func reactInLeague(id: String, toUserId: String, emoji: String) async throws -> ReactionResponse {
        try await send("POST", "/leagues/\(id)/react", body: ["toUserId": toUserId, "emoji": emoji])
    }

    public func board(range: PerformanceRange = .month, followingOnly: Bool = false) async throws -> BoardResponse {
        try await get("/board", query: [URLQueryItem(name: "range", value: range.rawValue), URLQueryItem(name: "scope", value: followingOnly ? "following" : "all")], auth: .optional)
    }

    // MARK: Fantasy (stocks)

    public func fantasyLeagues() async throws -> [FantasyLeagueSummary] {
        let response: FantasyListResponse = try await get("/fantasy")
        return response.leagues
    }

    public func fantasyLeague(id: String) async throws -> FantasyLeagueDetail { try await get("/fantasy/\(id)") }

    public func createFantasyLeague(_ request: CreateFantasyLeagueRequest) async throws -> LeagueRef {
        let response: CreateLeagueResponse = try await send("POST", "/fantasy", body: request)
        return response.league
    }

    public func joinFantasyLeague(code: String) async throws -> LeagueRef {
        let response: CreateLeagueResponse = try await send("POST", "/fantasy/join", body: ["code": code])
        return response.league
    }

    public func trade(leagueId: String, _ request: TradeRequest) async throws -> TradeResult {
        try await send("POST", "/fantasy/\(leagueId)/trade", body: request)
    }

    public func cancelOrder(leagueId: String, orderId: String) async throws {
        let _: JSONValue = try await send("DELETE", "/fantasy/\(leagueId)/orders/\(orderId)")
    }

    public func reactInFantasy(id: String, toUserId: String, emoji: String) async throws -> ReactionResponse {
        try await send("POST", "/fantasy/\(id)/react", body: ["toUserId": toUserId, "emoji": emoji])
    }

    public func quote(symbol: String) async throws -> QuoteResponse {
        try await get("/market/quote", query: [URLQueryItem(name: "symbol", value: symbol)])
    }

    public func searchTickers(_ text: String) async throws -> [TickerSearchResponse.Result] {
        let response: TickerSearchResponse = try await get("/market/search", query: [URLQueryItem(name: "q", value: text)])
        return response.results
    }

    // MARK: News

    public func news() async throws -> NewsResponse { try await get("/news", auth: .optional) }

    public func marketNews() async throws -> MarketNewsResponse { try await get("/news/market", auth: .optional) }

    // MARK: Assistant

    public func assistantAvailable() async throws -> Bool {
        let status: AssistantStatus = try await get("/assistant/status")
        return status.available
    }
}
