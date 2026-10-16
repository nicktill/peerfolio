import XCTest
#if canImport(FoundationNetworking)
import FoundationNetworking
#endif
@testable import PeerfolioKit

/// Mutable clock shared with the session manager.
final class Clock: @unchecked Sendable {
    private let lock = NSLock()
    private var t: Date
    init(_ t: Date = Date(timeIntervalSince1970: 1_800_000_000)) { self.t = t }
    var now: Date { lock.lock(); defer { lock.unlock() }; return t }
    func advance(_ s: TimeInterval) { lock.lock(); t = t.addingTimeInterval(s); lock.unlock() }
}

final class APIClientTests: XCTestCase {
    private func make(_ transport: MockTransport, tokens: StoredTokens?, clock: Clock = Clock(), onSignedOut: (@Sendable () -> Void)? = nil) -> (APIClient, InMemoryTokenStore) {
        let store = InMemoryTokenStore(tokens)
        let session = SessionManager(config: Fixture.base, transport: transport, store: store, now: { clock.now }, onSignedOut: onSignedOut)
        return (APIClient(config: Fixture.base, transport: transport, session: session), store)
    }

    private func tokens(_ access: String = "A1", _ refresh: String = "R1", expiresIn: TimeInterval = 900, clock: Clock = Clock()) -> StoredTokens {
        StoredTokens(accessToken: access, refreshToken: refresh, accessExpiresAt: clock.now.addingTimeInterval(expiresIn))
    }

    func testSendsBearerTokenToVersionedPathAndDecodes() async throws {
        let transport = MockTransport { _ in (200, Fixture.portfolio) }
        let (client, _) = make(transport, tokens: tokens())
        let p = try await client.portfolio(range: .quarter)
        XCTAssertEqual(p.summary.netWorth, 123000.5)
        let req = transport.requests[0]
        XCTAssertEqual(req.url?.absoluteString, "https://example.test/api/v1/portfolio?range=3M")
        XCTAssertEqual(req.value(forHTTPHeaderField: "Authorization"), "Bearer A1")
    }

    func testSignedOutRequiredCallFailsWithoutNetwork() async {
        let transport = MockTransport { _ in (200, Data()) }
        let (client, _) = make(transport, tokens: nil)
        do { _ = try await client.portfolio(); XCTFail("should throw") }
        catch { XCTAssertEqual(error as? APIError, .unauthenticated) }
        XCTAssertTrue(transport.requests.isEmpty)
    }

    func testExpiredTokenIsRefreshedBeforeTheRequest() async throws {
        let clock = Clock()
        let transport = MockTransport { req in
            if req.url!.path.hasSuffix("/mobile/auth/refresh") { return (200, Fixture.authJSON(access: "A2", refresh: "R2")) }
            return (200, Fixture.portfolio)
        }
        let (client, store) = make(transport, tokens: tokens(expiresIn: 10, clock: clock), clock: clock)   // inside the 30s leeway
        _ = try await client.portfolio()
        XCTAssertEqual(transport.requests.map { $0.url!.path }, ["/api/v1/mobile/auth/refresh", "/api/v1/portfolio"])
        XCTAssertEqual(transport.requests[1].value(forHTTPHeaderField: "Authorization"), "Bearer A2")
        XCTAssertEqual(store.load()?.refreshToken, "R2")
        let body = try JSONSerialization.jsonObject(with: transport.requests[0].httpBody!) as! [String: String]
        XCTAssertEqual(body["refreshToken"], "R1")
    }

    func testA401TriggersOneRefreshAndOneRetry() async throws {
        let calls = Counter()
        let transport = MockTransport { req in
            if req.url!.path.hasSuffix("/refresh") { return (200, Fixture.authJSON(access: "A2", refresh: "R2")) }
            // First portfolio call is rejected (token revoked early); the retry with the new token succeeds.
            return calls.next() == 1 ? (401, Data(#"{"error":"Not signed in"}"#.utf8)) : (200, Fixture.portfolio)
        }
        let (client, store) = make(transport, tokens: tokens())
        _ = try await client.portfolio()
        XCTAssertEqual(transport.requests.count, 3)
        XCTAssertEqual(transport.requests[2].value(forHTTPHeaderField: "Authorization"), "Bearer A2")
        XCTAssertEqual(store.load()?.accessToken, "A2")
    }

    func testConcurrentRequestsShareASingleRefresh() async throws {
        let clock = Clock()
        let transport = MockTransport { req in
            if req.url!.path.hasSuffix("/refresh") { return (200, Fixture.authJSON(access: "A2", refresh: "R2")) }
            return (200, Fixture.portfolio)
        }
        transport.delayNanos = 50_000_000
        let (client, _) = make(transport, tokens: tokens(expiresIn: -5, clock: clock), clock: clock)
        try await withThrowingTaskGroup(of: Void.self) { group in
            for _ in 0..<5 { group.addTask { _ = try await client.portfolio() } }
            try await group.waitForAll()
        }
        let refreshes = transport.requests.filter { $0.url!.path.hasSuffix("/refresh") }
        XCTAssertEqual(refreshes.count, 1, "refresh tokens are one-time; concurrent callers must share one refresh")
    }

    func testRejectedRefreshSignsOut() async {
        let signedOut = Counter()
        let transport = MockTransport { req in
            req.url!.path.hasSuffix("/refresh") ? (401, Data(#"{"error":"Please sign in again."}"#.utf8)) : (401, Data())
        }
        let (client, store) = make(transport, tokens: tokens(), onSignedOut: { _ = signedOut.next() })
        do { _ = try await client.portfolio(); XCTFail("should throw") }
        catch { XCTAssertEqual(error as? APIError, .unauthenticated) }
        XCTAssertNil(store.load())
        XCTAssertGreaterThanOrEqual(signedOut.value, 1)
    }

    func testServerErrorDuringRefreshKeepsTheSession() async {
        let transport = MockTransport { req in
            req.url!.path.hasSuffix("/refresh") ? (503, Data()) : (401, Data())
        }
        let (client, store) = make(transport, tokens: tokens())
        do { _ = try await client.portfolio(); XCTFail("should throw") }
        catch let error as APIError { XCTAssertTrue(error.isRetryable) }
        catch { XCTFail("wrong error \(error)") }
        XCTAssertNotNil(store.load(), "a 503 says nothing about the refresh token")
    }

    func testErrorBodyMessageSurfaces() async {
        let transport = MockTransport { _ in (409, Data(#"{"error":"That handle is taken"}"#.utf8)) }
        let (client, _) = make(transport, tokens: tokens())
        do { try await client.updateMe(UpdateMeRequest(handle: "ada")).ok.map { _ in () }; XCTFail("should throw") }
        catch { XCTAssertEqual(error as? APIError, .http(status: 409, message: "That handle is taken")) }
    }

    func testSignInStoresSessionAndReturnsUser() async throws {
        let transport = MockTransport { _ in
            (200, Data(#"{"accessToken":"A9","refreshToken":"R9","tokenType":"Bearer","expiresIn":900,"refreshExpiresAt":"2026-12-01T00:00:00Z","user":{"id":"u1","email":"a@b.co","name":"Ada","image":null,"handle":"ada1"}}"#.utf8))
        }
        let (client, store) = make(transport, tokens: nil)
        let user = try await client.signIn(TokenExchangeRequest(provider: .apple, idToken: "tok", nonce: "nonce"))
        XCTAssertEqual(user?.handle, "ada1")
        XCTAssertEqual(store.load()?.refreshToken, "R9")
        XCTAssertNil(transport.requests[0].value(forHTTPHeaderField: "Authorization"))
    }

    func testReviewSignInPostsCredentialsAndStoresTheSession() async throws {
        let transport = MockTransport { _ in
            (200, Data(#"{"accessToken":"AR","refreshToken":"RR","tokenType":"Bearer","expiresIn":900,"refreshExpiresAt":"2026-12-01T00:00:00Z","user":{"id":"u9","email":"review@x.co","name":"App Review","image":null,"handle":null}}"#.utf8))
        }
        let (client, store) = make(transport, tokens: nil)
        let user = try await client.reviewSignIn(ReviewSignInRequest(email: "review@x.co", code: "secret-code"))
        XCTAssertEqual(user?.name, "App Review")
        XCTAssertEqual(store.load()?.accessToken, "AR")
        XCTAssertEqual(transport.requests[0].url?.path, "/api/v1/mobile/auth/review")
        let body = try JSONSerialization.jsonObject(with: transport.requests[0].httpBody!) as! [String: String]
        XCTAssertEqual(body["code"], "secret-code")
    }

    func testReviewSignInIsA404WhenTheServerHasItOff() async {
        let transport = MockTransport { _ in (404, Data(#"{"error":"Not found"}"#.utf8)) }
        let (client, _) = make(transport, tokens: nil)
        do { _ = try await client.reviewSignIn(ReviewSignInRequest(email: "a@b.co", code: "x")); XCTFail("should throw") }
        catch { XCTAssertEqual(error as? APIError, .http(status: 404, message: "Not found")) }
    }

    func testAppleExchangeCarriesTheAuthorizationCodeAndRateLimitsSurface() async throws {
        let transport = MockTransport { _ in (429, Data(#"{"error":"Too many attempts. Wait a moment and try again.","retryAfterSec":30}"#.utf8)) }
        let (client, _) = make(transport, tokens: nil)
        do { _ = try await client.signIn(TokenExchangeRequest(provider: .apple, idToken: "t", nonce: "n", authorizationCode: "code-123")); XCTFail("should throw") }
        catch let error as APIError { XCTAssertEqual(error.errorDescription, "Too many attempts. Wait a moment and try again.") }
        let body = try JSONSerialization.jsonObject(with: transport.requests[0].httpBody!) as! [String: String]
        XCTAssertEqual(body["authorizationCode"], "code-123")
    }

    func testRegisterAndUnregisterDevice() async throws {
        let transport = MockTransport { _ in (200, Data(#"{"ok":true}"#.utf8)) }
        let (client, _) = make(transport, tokens: tokens())
        try await client.registerDevice(RegisterDeviceRequest(token: String(repeating: "ab", count: 32), environment: .sandbox))
        try await client.unregisterDevice(token: "abcd")
        XCTAssertEqual(transport.requests.map { $0.httpMethod }, ["POST", "DELETE"])
        XCTAssertEqual(transport.requests[0].url?.path, "/api/v1/mobile/devices")
    }

    func testPublicEndpointWorksSignedOutWithoutAuthHeader() async throws {
        let transport = MockTransport { _ in (200, Data(#"{"day":null,"week":null,"headlines":[]}"#.utf8)) }
        let (client, _) = make(transport, tokens: nil)
        let news = try await client.news()
        XCTAssertTrue(news.headlines.isEmpty)
        XCTAssertNil(transport.requests[0].value(forHTTPHeaderField: "Authorization"))
    }

    func testAssistantStreamYieldsEventsAndStopsAtDone() async throws {
        let ndjson = """
        {"type":"status","stage":"reading"}
        {"type":"text","delta":"Your "}
        {"type":"text","delta":"portfolio"}
        {"type":"link","label":"Open in Wealth Lab","href":"/wealth?a=1"}
        {"type":"done"}
        {"type":"text","delta":"ignored"}

        """
        let transport = MockTransport { _ in (200, Data(ndjson.utf8)) }
        let (client, _) = make(transport, tokens: tokens())
        var events: [AssistantEvent] = []
        for try await e in client.assistantEvents(AssistantRequest(messages: [ChatMessage(role: .user, content: "hi")], context: AssistantContext(page: .portfolio))) { events.append(e) }
        XCTAssertEqual(events, [.status(stage: .reading, label: nil), .text("Your "), .text("portfolio"), .link(label: "Open in Wealth Lab", href: "/wealth?a=1"), .done])
        let sent = try JSONSerialization.jsonObject(with: transport.requests[0].httpBody!) as! [String: Any]
        XCTAssertEqual((sent["context"] as? [String: Any])?["page"] as? String, "portfolio")
        XCTAssertEqual(transport.requests[0].value(forHTTPHeaderField: "Authorization"), "Bearer A1")
    }

    func testAssistantStreamSurfacesHTTPError() async {
        let transport = MockTransport { _ in (429, Data(#"{"error":"Daily limit reached"}"#.utf8)) }
        let (client, _) = make(transport, tokens: tokens())
        do {
            for try await _ in client.assistantEvents(AssistantRequest(messages: [], context: AssistantContext(page: .other))) {}
            XCTFail("should throw")
        } catch { XCTAssertEqual(error as? APIError, .http(status: 429, message: "Daily limit reached")) }
    }
}

final class Counter: @unchecked Sendable {
    private let lock = NSLock()
    private var n = 0
    func next() -> Int { lock.lock(); defer { lock.unlock() }; n += 1; return n }
    var value: Int { lock.lock(); defer { lock.unlock() }; return n }
}
