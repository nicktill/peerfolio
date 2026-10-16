import Foundation
#if canImport(FoundationNetworking)
import FoundationNetworking
#endif

public struct APIConfiguration: Sendable {
    public var baseURL: URL
    /// The versioned prefix the backend aliases to `/api`.
    public var apiPrefix: String
    public init(baseURL: URL, apiPrefix: String = "/api/v1") { self.baseURL = baseURL; self.apiPrefix = apiPrefix }

    func url(_ path: String, query: [URLQueryItem] = []) -> URL {
        var components = URLComponents(url: baseURL, resolvingAgainstBaseURL: false)!
        components.path = (components.path.hasSuffix("/") ? String(components.path.dropLast()) : components.path) + apiPrefix + path
        components.queryItems = query.isEmpty ? nil : query
        return components.url!
    }
}

/// Owns the signed-in session: hands out a valid access token, refreshes it, and signs out.
///
/// Refreshing is single-flight. Refresh tokens are one-time on the server (reuse revokes the whole session), so two
/// requests that hit an expired token at once must share one refresh call instead of racing with the same token.
public actor SessionManager {
    private let config: APIConfiguration
    private let transport: HTTPTransport
    private let store: TokenStore
    private let now: @Sendable () -> Date
    private let onSignedOut: (@Sendable () -> Void)?
    private var refreshTask: Task<StoredTokens, Error>?

    /// Refresh this long before the access token expires so a request doesn't leave with a token about to lapse.
    private let leeway: TimeInterval = 30

    public init(config: APIConfiguration, transport: HTTPTransport, store: TokenStore, now: @escaping @Sendable () -> Date = Date.init, onSignedOut: (@Sendable () -> Void)? = nil) {
        self.config = config; self.transport = transport; self.store = store; self.now = now; self.onSignedOut = onSignedOut
    }

    public var isSignedIn: Bool { store.load() != nil }

    /// A token good for at least `leeway` more seconds, refreshing if needed. Nil when signed out.
    public func accessToken() async throws -> String? {
        guard let tokens = store.load() else { return nil }
        if tokens.accessExpiresAt.timeIntervalSince(now()) > leeway { return tokens.accessToken }
        return try await refresh().accessToken
    }

    /// Called after the server answered 401 to `rejected`. If another request already replaced that token, use the new one.
    public func tokenAfterRejection(of rejected: String) async throws -> String {
        if let current = store.load(), current.accessToken != rejected { return current.accessToken }
        return try await refresh().accessToken
    }

    public func establish(_ response: AuthSessionResponse) {
        store.save(StoredTokens(accessToken: response.accessToken, refreshToken: response.refreshToken, accessExpiresAt: now().addingTimeInterval(TimeInterval(response.expiresIn))))
    }

    /// Ends the session locally and, best effort, on the server.
    public func signOut() async {
        let refreshToken = store.load()?.refreshToken
        store.clear()
        onSignedOut?()
        guard let refreshToken else { return }
        var request = URLRequest(url: config.url("/mobile/auth/logout"))
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = try? JSONEncoder().encode(["refreshToken": refreshToken])
        _ = try? await transport.data(for: request)
    }

    private func refresh() async throws -> StoredTokens {
        if let refreshTask { return try await refreshTask.value }
        guard let tokens = store.load() else { throw APIError.unauthenticated }
        let task = Task { try await self.performRefresh(tokens.refreshToken) }
        refreshTask = task
        defer { refreshTask = nil }
        return try await task.value
    }

    private func performRefresh(_ refreshToken: String) async throws -> StoredTokens {
        var request = URLRequest(url: config.url("/mobile/auth/refresh"))
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = try JSONEncoder().encode(["refreshToken": refreshToken])

        let data: Data, http: HTTPURLResponse
        do { (data, http) = try await transport.data(for: request) }
        catch { throw APIError.transport(error.localizedDescription) }

        switch http.statusCode {
        case 200..<300:
            guard let session = try? JSONDecoder().decode(AuthSessionResponse.self, from: data) else { throw APIError.decoding("refresh") }
            let tokens = StoredTokens(accessToken: session.accessToken, refreshToken: session.refreshToken, accessExpiresAt: now().addingTimeInterval(TimeInterval(session.expiresIn)))
            store.save(tokens)
            return tokens
        case 400, 401, 403:
            // The server no longer honours this refresh token (expired, revoked, replayed): the session is over.
            store.clear()
            onSignedOut?()
            throw APIError.unauthenticated
        default:
            // A server or network problem says nothing about the token, so keep the session and let the caller retry.
            throw APIError.http(status: http.statusCode, message: "Peerfolio is having trouble right now. Try again in a moment.")
        }
    }
}
