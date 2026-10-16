import Foundation
#if canImport(FoundationNetworking)
import FoundationNetworking
#endif

/// The one seam between the client and the network, so tests can script responses.
public protocol HTTPTransport: Sendable {
    func data(for request: URLRequest) async throws -> (Data, HTTPURLResponse)
    /// Delivers the response head first, then the body as it arrives (used for the assistant's stream).
    func stream(for request: URLRequest) async throws -> (HTTPURLResponse, AsyncThrowingStream<Data, Error>)
}

public struct URLSessionTransport: HTTPTransport {
    private let session: URLSession

    public init(session: URLSession = .shared) { self.session = session }

    public func data(for request: URLRequest) async throws -> (Data, HTTPURLResponse) {
        let (data, response) = try await session.data(for: request)
        guard let http = response as? HTTPURLResponse else { throw APIError.transport("Not an HTTP response") }
        return (data, http)
    }

    public func stream(for request: URLRequest) async throws -> (HTTPURLResponse, AsyncThrowingStream<Data, Error>) {
        #if canImport(FoundationNetworking)
        // Linux has no incremental bytes API; deliver the body in one piece. Only used by tests and tooling.
        let (data, http) = try await self.data(for: request)
        return (http, AsyncThrowingStream { c in c.yield(data); c.finish() })
        #else
        let (bytes, response) = try await session.bytes(for: request)
        guard let http = response as? HTTPURLResponse else { throw APIError.transport("Not an HTTP response") }
        let body = AsyncThrowingStream<Data, Error> { continuation in
            let task = Task {
                do {
                    // Chunk by line-sized batches: URLSession.bytes yields single bytes, which would be wasteful to forward one at a time.
                    var buffer = Data()
                    for try await byte in bytes {
                        buffer.append(byte)
                        if byte == 0x0A { continuation.yield(buffer); buffer.removeAll(keepingCapacity: true) }
                    }
                    if !buffer.isEmpty { continuation.yield(buffer) }
                    continuation.finish()
                } catch {
                    continuation.finish(throwing: error)
                }
            }
            continuation.onTermination = { _ in task.cancel() }
        }
        return (http, body)
        #endif
    }
}

public enum APIError: Error, Equatable, LocalizedError {
    /// No usable session; the app should show sign-in.
    case unauthenticated
    case http(status: Int, message: String)
    case decoding(String)
    case transport(String)

    public var errorDescription: String? {
        switch self {
        case .unauthenticated: return "Please sign in again."
        case .http(_, let message): return message
        case .decoding: return "Peerfolio sent something the app didn't understand. Try updating the app."
        case .transport(let message): return message
        }
    }

    /// True for errors worth a retry button (offline, timeouts, 5xx).
    public var isRetryable: Bool {
        switch self {
        case .transport: return true
        case .http(let status, _): return status >= 500
        default: return false
        }
    }
}
