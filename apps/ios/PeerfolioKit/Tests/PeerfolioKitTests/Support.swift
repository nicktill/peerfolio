import Foundation
#if canImport(FoundationNetworking)
import FoundationNetworking
#endif
@testable import PeerfolioKit

/// Scripted transport: each request is matched by a closure and recorded.
final class MockTransport: HTTPTransport, @unchecked Sendable {
    typealias Handler = @Sendable (URLRequest) throws -> (Int, Data)
    private let lock = NSLock()
    private var _requests: [URLRequest] = []
    private let handler: Handler
    var delayNanos: UInt64 = 0

    init(_ handler: @escaping Handler) { self.handler = handler }

    var requests: [URLRequest] { lock.lock(); defer { lock.unlock() }; return _requests }

    private func record(_ r: URLRequest) { lock.lock(); _requests.append(r); lock.unlock() }

    private func respond(_ request: URLRequest) throws -> (Data, HTTPURLResponse) {
        let (status, data) = try handler(request)
        let http = HTTPURLResponse(url: request.url!, statusCode: status, httpVersion: nil, headerFields: nil)!
        return (data, http)
    }

    func data(for request: URLRequest) async throws -> (Data, HTTPURLResponse) {
        record(request)
        if delayNanos > 0 { try await Task.sleep(nanoseconds: delayNanos) }
        return try respond(request)
    }

    func stream(for request: URLRequest) async throws -> (HTTPURLResponse, AsyncThrowingStream<Data, Error>) {
        record(request)
        let (data, http) = try respond(request)
        // Deliver in awkward 7-byte chunks to prove the parser copes with split lines.
        let stream = AsyncThrowingStream<Data, Error> { c in
            var i = data.startIndex
            while i < data.endIndex {
                let j = data.index(i, offsetBy: 7, limitedBy: data.endIndex) ?? data.endIndex
                c.yield(data[i..<j]); i = j
            }
            c.finish()
        }
        return (http, stream)
    }
}

enum Fixture {
    static let base = APIConfiguration(baseURL: URL(string: "https://example.test")!)

    static func authJSON(access: String, refresh: String, expiresIn: Int = 900) -> Data {
        Data("""
        {"accessToken":"\(access)","refreshToken":"\(refresh)","tokenType":"Bearer","expiresIn":\(expiresIn),"refreshExpiresAt":"2026-12-01T00:00:00.000Z"}
        """.utf8)
    }

    static let portfolio = Data("""
    {
      "summary": {"totalAssets": 125000.5, "totalLiabilities": 2000, "netWorth": 123000.5, "investableAssets": 100000},
      "accounts": [{
        "id": "a1", "name": "Brokerage", "officialName": null, "mask": "0000", "type": "investment", "subtype": "brokerage",
        "category": "investment", "balance": 100000, "isLiability": false, "source": "plaid", "institutionName": "Fidelity",
        "institutionLogo": null, "itemId": "i1", "holdingCount": 1, "holdingsPending": false, "holdingPreview": ["AAPL"],
        "positions": [{"id": "p1", "ticker": "AAPL", "name": "Apple", "kind": "stock", "quantity": 10, "price": 200, "value": 2000, "costBasis": 1500, "priceAsOf": "2026-10-15"}]
      }],
      "archivedAccounts": [],
      "items": [{"id": "i1", "institutionName": "Fidelity", "institutionLogo": null, "status": "active", "errorCode": null, "lastSyncedAt": "2026-10-15T21:00:00.000Z"}],
      "allocation": [{"name": "Stocks", "value": 2000, "percent": 100}],
      "holdings": [{"securityId": "s1", "ticker": "AAPL", "name": "Apple", "type": "equity", "quantity": 10, "value": 2000, "weight": 100,
        "todayAmount": 12.5, "todayPercent": 0.63, "gainAmount": 500, "gainPercent": 33.3, "positions": 1}],
      "holdingsPending": false,
      "today": {"amount": 12.5, "percent": 0.63, "coverage": 1, "asOf": "2026-10-15"},
      "allTime": null,
      "leagues": [{"id": "l1", "name": "Friends", "emoji": "🏆", "rank": null, "members": 4}],
      "history": [{"date": "2026-10-14", "netWorth": 122000, "investableAssets": 99000}, {"date": "2026-10-15", "netWorth": 123000.5, "investableAssets": 100000}],
      "performance": {"percent": 1.01, "days": 2, "range": "1M", "series": [{"date": "2026-10-14", "indexed": 100}, {"date": "2026-10-15", "indexed": 101.01}]},
      "hasHistory": true, "firstDate": "2026-10-14", "isVerified": true
    }
    """.utf8)
}
