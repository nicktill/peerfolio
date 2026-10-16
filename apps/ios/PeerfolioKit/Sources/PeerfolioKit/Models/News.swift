import Foundation

/// `GET /api/news` (public)
public struct NewsResponse: Codable, Equatable, Sendable {
    public var day: Brief?
    public var week: Brief?
    public var headlines: [Headline]

    public struct Brief: Codable, Equatable, Sendable {
        public var period: String
        public var periodEnd: String
        public var headline: String
        public var body: String
        public var takeaways: [Takeaway]
        public var sources: [Source]
        public var fallback: Bool
        public var createdAt: String
    }

    public struct Takeaway: Codable, Equatable, Sendable, Identifiable {
        public var title: String
        public var body: String
        public var sourceIds: [String]
        public var id: String { title }
    }

    public struct Source: Codable, Equatable, Sendable, Identifiable {
        public var id: String
        public var source: String
        public var title: String
        public var url: String
        public var publishedAt: String?
    }

    public struct Headline: Codable, Equatable, Sendable, Identifiable {
        public var source: String
        public var title: String
        public var url: String
        public var summary: String?
        public var publishedAt: String
        public var id: String { url }
    }
}

/// A day's or week's move for an index fund.
public struct MarketMove: Codable, Equatable, Sendable {
    public var percent: Double
    public var points: Double
    /// Percent from the start of the window, for a sparkline.
    public var path: [Double]
}

public struct IndexQuote: Codable, Equatable, Sendable, Identifiable {
    public var key: String
    public var name: String
    public var symbol: String?
    public var price: Double
    public var day: MarketMove
    public var week: MarketMove?
    public var id: String { key }
}

/// The API sends sectors as `[name, dayPercent, weekPercent|null]`.
public struct SectorMove: Codable, Equatable, Sendable, Identifiable {
    public var name: String
    public var dayPercent: Double
    public var weekPercent: Double?
    public var id: String { name }

    public init(name: String, dayPercent: Double, weekPercent: Double?) {
        self.name = name; self.dayPercent = dayPercent; self.weekPercent = weekPercent
    }

    public init(from decoder: Decoder) throws {
        var c = try decoder.unkeyedContainer()
        name = try c.decode(String.self)
        dayPercent = try c.decode(Double.self)
        weekPercent = try c.decodeIfPresent(Double.self)
    }

    public func encode(to encoder: Encoder) throws {
        var c = encoder.unkeyedContainer()
        try c.encode(name); try c.encode(dayPercent)
        if let weekPercent { try c.encode(weekPercent) } else { try c.encodeNil() }
    }
}

public struct MarketBoard: Codable, Equatable, Sendable {
    public var indexes: [IndexQuote]
    public var sectors: [SectorMove]
    public var session: String
    public var asOf: String
}

public struct EarningsReport: Codable, Equatable, Sendable, Identifiable {
    public var symbol: String
    public var name: String
    /// "before-open", "after-close", "during" or "unknown".
    public var when: String
    public var epsEstimate: String
    public var confirmed: Bool?
    public var owned: Bool
    public var id: String { symbol }
}

public struct EarningsDay: Codable, Equatable, Sendable, Identifiable {
    public var dow: String
    public var label: String
    public var date: Int
    public var iso: String?
    public var past: Bool?
    public var today: Bool?
    public var reports: [EarningsReport]
    public var id: String { iso ?? label }
}

public struct EarningsWeek: Codable, Equatable, Sendable {
    public var label: String
    public var days: [EarningsDay]
    public var asOf: String
}

public struct FearGreed: Codable, Equatable, Sendable {
    public var score: Double
    public var rating: String
    public var asOf: String
    public var history: [Point]
    public struct Point: Codable, Equatable, Sendable { public var label: String; public var score: Double }
}

/// `GET /api/news/market` (public). Each part is null when its source is down; `?part=` returns just one key.
public struct MarketNewsResponse: Codable, Equatable, Sendable {
    public var board: MarketBoard?
    public var earnings: EarningsWeek?
    public var fearGreed: FearGreed?
}
