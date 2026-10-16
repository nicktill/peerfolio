import Foundation

/// `GET /api/fantasy`
public struct FantasyListResponse: Codable, Equatable, Sendable {
    public var leagues: [FantasyLeagueSummary]
}

public struct FantasyLeagueSummary: Codable, Equatable, Sendable, Identifiable {
    public var id: String
    public var name: String
    public var emoji: String
    public var accent: String
    public var endsAt: String?
    public var isClosed: Bool
    public var memberCount: Int
    public var yourReturn: Double
    public var yourRank: Int?
}

public struct FantasyStanding: Codable, Equatable, Sendable, Identifiable {
    public var userId: String
    public var name: String?
    public var handle: String?
    public var image: String?
    public var rank: Int
    public var percent: Double
    public var days: Int
    public var spark: [Double]
    public var hasHistory: Bool
    public var shareHoldings: Bool
    public var isVerified: Bool
    public var holdings: [SharedHolding]
    public var reactions: [String: Int]
    public var isYou: Bool
    public var value: Double
    public var cash: Double
    public var id: String { userId }
}

public struct FantasyPosition: Codable, Equatable, Sendable, Identifiable {
    public var ticker: String
    public var name: String?
    public var shares: Double
    public var price: Double
    public var priceAsOf: String?
    public var averageCost: Double
    public var value: Double
    public var gainPct: Double
    public var id: String { ticker }
}

public struct FantasyOrder: Codable, Equatable, Sendable, Identifiable {
    public var id: String
    public var side: TradeSide
    public var ticker: String
    public var name: String?
    /// Dollars, for a buy.
    public var amount: Double?
    /// Shares, for a sell; nil sells everything.
    public var shares: Double?
    public var price: Double
    public var status: String
    public var reason: String?
    public var at: String
}

public struct FantasyFeedItem: Codable, Equatable, Sendable, Identifiable {
    public var id: String
    public var name: String?
    public var handle: String?
    public var image: String?
    public var side: TradeSide
    public var ticker: String
    public var shares: Double
    public var price: Double
    public var at: String
}

public enum TradeSide: String, Codable, Sendable { case buy, sell }

/// `GET /api/fantasy/{id}`
public struct FantasyLeagueDetail: Codable, Equatable, Sendable {
    public var league: Info
    public var standings: [FantasyStanding]
    public var you: You
    public var feed: [FantasyFeedItem]

    public struct Info: Codable, Equatable, Sendable, Identifiable {
        public var id: String
        public var name: String
        public var emoji: String
        public var accent: String
        public var inviteCode: String
        public var startingCash: Double
        public var maxPositionPct: Int?
        public var endsAt: String?
        public var isClosed: Bool
        public var isOwner: Bool
    }

    public struct You: Codable, Equatable, Sendable {
        /// Spendable cash: cash set aside for queued buys is already taken out.
        public var cash: Double
        public var value: Double
        public var percent: Double
        public var rank: Int
        public var positions: [FantasyPosition]
        public var orders: [FantasyOrder]
    }
}

/// Body for `POST /api/fantasy`.
public struct CreateFantasyLeagueRequest: Codable, Equatable, Sendable {
    public var name: String
    public var emoji: String
    public var accent: String
    public var startingCash: Int
    public var maxPositionPct: Int?
    public var endsAt: String?
    public init(name: String, emoji: String = "🏈", accent: String = "emerald", startingCash: Int = 100_000, maxPositionPct: Int? = nil, endsAt: String? = nil) {
        self.name = name; self.emoji = emoji; self.accent = accent
        self.startingCash = startingCash; self.maxPositionPct = maxPositionPct; self.endsAt = endsAt
    }
}

/// Body for `POST /api/fantasy/{id}/trade`. Buys are sized in dollars, sells in shares or "all".
public enum TradeRequest: Equatable, Sendable {
    case buy(symbol: String, amount: Double)
    case sell(symbol: String, shares: Double)
    case sellAll(symbol: String)
}

extension TradeRequest: Encodable {
    private enum Keys: String, CodingKey { case side, symbol, kind, amount, shares }

    public func encode(to encoder: Encoder) throws {
        var c = encoder.container(keyedBy: Keys.self)
        try c.encode("stock", forKey: .kind)
        switch self {
        case .buy(let symbol, let amount):
            try c.encode("buy", forKey: .side); try c.encode(symbol, forKey: .symbol); try c.encode(amount, forKey: .amount)
        case .sell(let symbol, let shares):
            try c.encode("sell", forKey: .side); try c.encode(symbol, forKey: .symbol); try c.encode(shares, forKey: .shares)
        case .sellAll(let symbol):
            try c.encode("sell", forKey: .side); try c.encode(symbol, forKey: .symbol); try c.encode("all", forKey: .shares)
        }
    }
}

/// Reply to a trade: HTTP 201 when it filled, 202 when it was queued for the next open.
public struct TradeResult: Codable, Equatable, Sendable {
    public var ticker: String
    public var price: Double?
    public var priceAsOf: String?
    public var shares: Double?
    public var queued: Bool?
    /// "closed" or "no-live-price" when queued.
    public var why: String?
    public var orderId: String?
    public var side: TradeSide?
    public var isQueued: Bool { queued == true }
}

/// `GET /api/market/quote?symbol=AAPL`
public struct QuoteResponse: Codable, Equatable, Sendable {
    public var symbol: String
    public var kind: String?
    public var name: String?
    public var price: Double
    public var asOf: String?
    public var live: Bool
}

/// `GET /api/market/search?q=app`
public struct TickerSearchResponse: Codable, Equatable, Sendable {
    public var results: [Result]
    public struct Result: Codable, Equatable, Sendable, Identifiable {
        public var symbol: String
        public var name: String?
        public var id: String { symbol }
    }
}

public struct OkResponse: Codable, Equatable, Sendable {
    public var ok: Bool?
}
