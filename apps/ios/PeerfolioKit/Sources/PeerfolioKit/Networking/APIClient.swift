import Foundation
#if canImport(FoundationNetworking)
import FoundationNetworking
#endif

public enum AuthRequirement: Sendable {
    /// Must be signed in; a missing session is `APIError.unauthenticated` without a network call.
    case required
    /// Public endpoint that personalises when a session exists (news, board).
    case optional
    case none
}

/// Typed access to the Peerfolio API. Adds the bearer token, refreshes it once on a 401, and decodes JSON.
public struct APIClient: Sendable {
    public let config: APIConfiguration
    public let session: SessionManager
    private let transport: HTTPTransport

    public init(config: APIConfiguration, transport: HTTPTransport = URLSessionTransport(), session: SessionManager) {
        self.config = config; self.transport = transport; self.session = session
    }

    // MARK: Requests

    public func get<T: Decodable>(_ path: String, query: [URLQueryItem] = [], auth: AuthRequirement = .required, as type: T.Type = T.self) async throws -> T {
        let data = try await perform(makeRequest("GET", path, query: query, body: nil), auth: auth)
        return try decode(data)
    }

    public func send<T: Decodable>(_ method: String, _ path: String, body: (any Encodable)? = nil, auth: AuthRequirement = .required, as type: T.Type = T.self) async throws -> T {
        let encoded = try body.map { try JSONEncoder().encode(AnyEncodable($0)) }
        let data = try await perform(makeRequest(method, path, query: [], body: encoded), auth: auth)
        return try decode(data)
    }

    func makeRequest(_ method: String, _ path: String, query: [URLQueryItem], body: Data?) -> URLRequest {
        var request = URLRequest(url: config.url(path, query: query))
        request.httpMethod = method
        request.setValue("application/json", forHTTPHeaderField: "Accept")
        if let body {
            request.httpBody = body
            request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        }
        request.timeoutInterval = 30
        return request
    }

    private func authorize(_ request: URLRequest, token: String?) -> URLRequest {
        var request = request
        if let token { request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization") }
        return request
    }

    /// Sends with a token and, if the server says 401, refreshes once and retries once.
    private func perform(_ request: URLRequest, auth: AuthRequirement) async throws -> Data {
        var token: String? = nil
        if auth != .none {
            token = try await session.accessToken()
            if token == nil && auth == .required { throw APIError.unauthenticated }
        }

        var (data, http) = try await roundTrip(authorize(request, token: token))
        if http.statusCode == 401, let rejected = token {
            let fresh = try await session.tokenAfterRejection(of: rejected)
            (data, http) = try await roundTrip(authorize(request, token: fresh))
            if http.statusCode == 401 {
                await session.signOut()
                throw APIError.unauthenticated
            }
        }
        guard (200..<300).contains(http.statusCode) else { throw Self.httpError(http.statusCode, data) }
        return data
    }

    private func roundTrip(_ request: URLRequest) async throws -> (Data, HTTPURLResponse) {
        do { return try await transport.data(for: request) }
        catch let error as APIError { throw error }
        catch { throw APIError.transport(Self.describe(error)) }
    }

    private func decode<T: Decodable>(_ data: Data) throws -> T {
        do { return try JSONDecoder().decode(T.self, from: data) }
        catch { throw APIError.decoding(String(describing: error)) }
    }

    static func httpError(_ status: Int, _ data: Data) -> APIError {
        struct Body: Decodable { var error: String? }
        let message = (try? JSONDecoder().decode(Body.self, from: data))?.error
        return .http(status: status, message: message ?? "Something went wrong (\(status)).")
    }

    static func describe(_ error: Error) -> String {
        if (error as? URLError)?.code == .notConnectedToInternet { return "You're offline." }
        if (error as? URLError)?.code == .timedOut { return "That took too long. Try again." }
        return "Couldn't reach Peerfolio. Check your connection."
    }

    // MARK: Streaming

    /// Sends a chat turn and yields the assistant's events as they arrive. Ends after `.done` or `.error`.
    public func assistantEvents(_ body: AssistantRequest) -> AsyncThrowingStream<AssistantEvent, Error> {
        AsyncThrowingStream { continuation in
            let task = Task {
                do {
                    let data = try JSONEncoder().encode(body)
                    var request = makeRequest("POST", "/assistant", query: [], body: data)
                    request.setValue("application/x-ndjson", forHTTPHeaderField: "Accept")
                    request.timeoutInterval = 90

                    guard let token = try await session.accessToken() else { throw APIError.unauthenticated }
                    var (head, stream) = try await open(authorize(request, token: token))
                    if head.statusCode == 401 {
                        let fresh = try await session.tokenAfterRejection(of: token)
                        (head, stream) = try await open(authorize(request, token: fresh))
                        if head.statusCode == 401 { await session.signOut(); throw APIError.unauthenticated }
                    }
                    if !(200..<300).contains(head.statusCode) {
                        var errorBody = Data()
                        for try await chunk in stream { errorBody.append(chunk) }
                        throw Self.httpError(head.statusCode, errorBody)
                    }

                    var parser = NDJSONParser<AssistantEvent>()
                    for try await chunk in stream {
                        for event in parser.feed(chunk) {
                            continuation.yield(event)
                            if case .done = event { continuation.finish(); return }
                        }
                    }
                    for event in parser.finish() { continuation.yield(event) }
                    continuation.finish()
                } catch is CancellationError {
                    continuation.finish()
                } catch let error as APIError {
                    continuation.finish(throwing: error)
                } catch {
                    continuation.finish(throwing: APIError.transport(Self.describe(error)))
                }
            }
            continuation.onTermination = { _ in task.cancel() }
        }
    }

    private func open(_ request: URLRequest) async throws -> (HTTPURLResponse, AsyncThrowingStream<Data, Error>) {
        try await transport.stream(for: request)
    }
}

private struct AnyEncodable: Encodable {
    private let encodeFunc: (Encoder) throws -> Void
    init(_ wrapped: any Encodable) { encodeFunc = wrapped.encode }
    func encode(to encoder: Encoder) throws { try encodeFunc(encoder) }
}
