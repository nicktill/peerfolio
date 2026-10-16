import Foundation

/// Ranges accepted by `?range=` on the portfolio, league and board endpoints.
public enum PerformanceRange: String, Codable, CaseIterable, Sendable, Identifiable {
    case week = "1W", month = "1M", quarter = "3M", halfYear = "6M", year = "1Y", all = "ALL"
    public var id: String { rawValue }
}

/// `GET /api/portfolio`
public struct PortfolioResponse: Codable, Equatable, Sendable {
    public var summary: Summary
    public var accounts: [Account]
    public var archivedAccounts: [ArchivedAccount]?
    public var items: [Item]
    public var allocation: [AllocationSlice]
    public var holdings: [Holding]
    public var holdingsPending: Bool
    public var today: TodayChange?
    public var allTime: AllTimeGain?
    public var leagues: [LeaguePill]
    public var history: [HistoryPoint]
    public var performance: Performance
    public var hasHistory: Bool
    public var firstDate: String?
    public var isVerified: Bool

    public struct Summary: Codable, Equatable, Sendable {
        public var totalAssets: Double
        public var totalLiabilities: Double
        public var netWorth: Double
        public var investableAssets: Double
        public init(totalAssets: Double, totalLiabilities: Double, netWorth: Double, investableAssets: Double) {
            self.totalAssets = totalAssets; self.totalLiabilities = totalLiabilities
            self.netWorth = netWorth; self.investableAssets = investableAssets
        }
    }

    public struct Account: Codable, Equatable, Sendable, Identifiable {
        public var id: String
        public var name: String
        public var officialName: String?
        public var mask: String?
        public var type: String
        public var subtype: String?
        public var category: String
        public var balance: Double
        public var isLiability: Bool
        public var source: String
        public var institutionName: String
        public var institutionLogo: String?
        public var itemId: String?
        public var holdingCount: Int
        public var holdingsPending: Bool
        public var holdingPreview: [String]
        public var positions: [Position]
    }

    public struct Position: Codable, Equatable, Sendable, Identifiable {
        public var id: String
        public var ticker: String?
        public var name: String?
        public var kind: String
        public var quantity: Double
        public var price: Double
        public var value: Double
        public var costBasis: Double?
        public var priceAsOf: String?
    }

    public struct ArchivedAccount: Codable, Equatable, Sendable, Identifiable {
        public var id: String
        public var name: String
        public var institutionName: String
        public var balance: Double
    }

    public struct Item: Codable, Equatable, Sendable, Identifiable {
        public var id: String
        public var institutionName: String?
        public var institutionLogo: String?
        public var status: String
        public var errorCode: String?
        public var lastSyncedAt: String?
    }

    public struct AllocationSlice: Codable, Equatable, Sendable, Identifiable {
        public var name: String
        public var value: Double
        public var percent: Double
        public var id: String { name }
        public init(name: String, value: Double, percent: Double) { self.name = name; self.value = value; self.percent = percent }
    }

    /// One row per security across every account.
    public struct Holding: Codable, Equatable, Sendable, Identifiable {
        public var securityId: String
        public var ticker: String?
        public var name: String?
        public var type: String?
        public var quantity: Double
        public var value: Double
        public var weight: Double
        public var todayAmount: Double?
        public var todayPercent: Double?
        public var gainAmount: Double?
        public var gainPercent: Double?
        public var positions: Int
        public var id: String { securityId }
    }

    public struct TodayChange: Codable, Equatable, Sendable {
        public var amount: Double
        public var percent: Double
        public var coverage: Double
        public var asOf: String?
    }

    public struct AllTimeGain: Codable, Equatable, Sendable {
        public var amount: Double
        public var percent: Double
        public var cost: Double
        public var coverage: Double
    }

    public struct LeaguePill: Codable, Equatable, Sendable, Identifiable {
        public var id: String
        public var name: String
        public var emoji: String
        public var rank: Int?
        public var members: Int
    }

    public struct HistoryPoint: Codable, Equatable, Sendable, Identifiable {
        public var date: String
        public var netWorth: Double
        public var investableAssets: Double
        public var id: String { date }
        public init(date: String, netWorth: Double, investableAssets: Double) { self.date = date; self.netWorth = netWorth; self.investableAssets = investableAssets }
    }

    public struct Performance: Codable, Equatable, Sendable {
        public var percent: Double
        public var days: Int
        public var range: String
        public var series: [IndexedPoint]
    }

    public struct IndexedPoint: Codable, Equatable, Sendable, Identifiable {
        public var date: String
        public var indexed: Double
        public var id: String { date }
        public init(date: String, indexed: Double) { self.date = date; self.indexed = indexed }
    }
}

/// `GET /api/portfolio/benchmark?symbol=SPY&range=1M`. Always 200; `comparison` is nil with a `reason` when there is none.
public struct BenchmarkResponse: Codable, Equatable, Sendable {
    public var symbol: String
    public var label: String
    public var description: String?
    public var basis: String
    public var reason: String?
    public var comparison: Comparison?

    public struct Comparison: Codable, Equatable, Sendable {
        public var startDate: String
        public var endDate: String
        public var portfolioPercent: Double
        public var benchmarkPercent: Double
        public var differencePoints: Double
        public var coverage: Double
        public var series: [PortfolioResponse.IndexedPoint]
    }
}

/// `GET /api/portfolio/intraday`
public struct IntradayResponse: Codable, Equatable, Sendable {
    public var session: String
    public var points: [JSONValue]
}
