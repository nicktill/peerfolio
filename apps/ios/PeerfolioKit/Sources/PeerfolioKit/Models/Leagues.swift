import Foundation

/// A holding shared inside a league: weight within that member's own portfolio, never dollars.
public struct SharedHolding: Codable, Equatable, Sendable, Identifiable {
    public var ticker: String
    public var name: String?
    public var weight: Double
    public var id: String { ticker }
    public init(ticker: String, name: String?, weight: Double) { self.ticker = ticker; self.name = name; self.weight = weight }
}

/// `GET /api/leagues`
public struct LeagueListResponse: Codable, Equatable, Sendable {
    public var leagues: [LeagueSummary]
}

public struct LeagueSummary: Codable, Hashable, Sendable, Identifiable {
    public var id: String
    public var name: String
    public var description: String?
    public var emoji: String
    public var accent: String
    public var inviteCode: String
    public var ownerId: String
    public var createdAt: String
    public var role: String
    public var memberCount: Int
}

/// One ranked member in a real-money league or on the board.
public struct LeagueStanding: Codable, Equatable, Sendable, Identifiable {
    public var userId: String
    public var name: String?
    public var handle: String?
    public var image: String?
    public var rank: Int
    public var percent: Double
    public var days: Int
    public var spark: [Double]
    public var hasHistory: Bool
    public var isVerified: Bool
    public var shareHoldings: Bool
    public var holdings: [SharedHolding]
    public var reactions: [String: Int]
    public var isYou: Bool
    public var id: String { userId }
}

/// `GET /api/leagues/{id}?range=1M`
public struct LeagueDetailResponse: Codable, Equatable, Sendable {
    public var league: Info
    public var you: You
    public var standings: [LeagueStanding]
    public var range: String

    public struct Info: Codable, Equatable, Sendable, Identifiable {
        public var id: String
        public var name: String
        public var description: String?
        public var emoji: String
        public var accent: String
        public var inviteCode: String
        public var isOwner: Bool
    }

    public struct You: Codable, Equatable, Sendable {
        public var shareHoldings: Bool
    }
}

/// Body for `POST /api/leagues`.
public struct CreateLeagueRequest: Codable, Equatable, Sendable {
    public var name: String
    public var description: String?
    public var emoji: String
    public var accent: String
    public init(name: String, description: String? = nil, emoji: String = "🏆", accent: String = "emerald") {
        self.name = name; self.description = description; self.emoji = emoji; self.accent = accent
    }
}

/// `{ league: { id, name } }` from join (and create, which returns more fields that the app ignores).
public struct LeagueRef: Codable, Equatable, Sendable {
    public var id: String
    public var name: String?
}

public struct JoinLeagueResponse: Codable, Equatable, Sendable {
    public var league: LeagueRef
    public var alreadyMember: Bool?
}

public struct CreateLeagueResponse: Codable, Equatable, Sendable {
    public var league: LeagueRef
}

public struct ReactionResponse: Codable, Equatable, Sendable {
    public var active: Bool
}

/// `GET /api/board` (public; sign-in only adds `isFollowing`/`isYou`).
public struct BoardResponse: Codable, Equatable, Sendable {
    public var range: String
    public var scope: String
    public var minHistoryDays: Int
    public var requiresVerified: Bool
    public var traders: [Trader]

    public struct Trader: Codable, Equatable, Sendable, Identifiable {
        public var handle: String?
        public var name: String?
        public var image: String?
        public var bio: String?
        public var rank: Int
        public var percent: Double
        public var days: Int
        public var spark: [Double]
        public var holdings: [SharedHolding]
        public var isFollowing: Bool
        public var isYou: Bool
        public var id: String { handle ?? "rank-\(rank)" }
    }
}
