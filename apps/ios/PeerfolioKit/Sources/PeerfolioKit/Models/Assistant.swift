import Foundation

public struct ChatMessage: Codable, Equatable, Sendable {
    public enum Role: String, Codable, Sendable { case user, assistant }
    public var role: Role
    public var content: String
    public init(role: Role, content: String) { self.role = role; self.content = content }
}

/// Where the person is in the app; steers the assistant's answers. Informational only.
public struct AssistantContext: Codable, Equatable, Sendable {
    public enum Page: String, Codable, Sendable { case portfolio, leagues, fantasy, news, board, wealth, other }
    public var page: Page
    public var entityId: String?
    public init(page: Page, entityId: String? = nil) { self.page = page; self.entityId = entityId }
}

/// Body for `POST /api/assistant`.
public struct AssistantRequest: Codable, Equatable, Sendable {
    public var messages: [ChatMessage]
    public var context: AssistantContext
    public init(messages: [ChatMessage], context: AssistantContext) { self.messages = messages; self.context = context }
}

/// `GET /api/assistant/status`
public struct AssistantStatus: Codable, Equatable, Sendable { public var available: Bool }

/// Small summaries the assistant's tools hand to the chat window.
public enum AssistantVisual: Decodable, Equatable, Sendable {
    case market(session: String, indexes: [Move], sectors: [Move])
    case movers(gainers: [Mover], losers: [Mover])
    case earnings(days: [EarningsVisualDay])
    case benchmark(label: String, range: String, you: Double, benchmark: Double)
    case unknown(kind: String)

    public struct Move: Decodable, Equatable, Sendable, Identifiable {
        public var name: String
        public var dayPercent: Double
        public var id: String { name }
    }
    public struct Mover: Decodable, Equatable, Sendable, Identifiable {
        public var symbol: String
        public var changePercent: Double
        public var held: Bool
        public var id: String { symbol }
    }
    public struct EarningsVisualDay: Decodable, Equatable, Sendable, Identifiable {
        public var day: String
        public var reports: [Report]
        public var id: String { day }
        public struct Report: Decodable, Equatable, Sendable, Identifiable {
            public var symbol: String
            public var when: String
            public var held: Bool
            public var id: String { symbol }
        }
    }

    private enum Keys: String, CodingKey { case kind, session, indexes, sectors, gainers, losers, days, label, range, you, benchmark }

    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: Keys.self)
        let kind = try c.decode(String.self, forKey: .kind)
        switch kind {
        case "market":
            self = .market(session: try c.decode(String.self, forKey: .session), indexes: try c.decode([Move].self, forKey: .indexes), sectors: try c.decode([Move].self, forKey: .sectors))
        case "movers":
            self = .movers(gainers: try c.decode([Mover].self, forKey: .gainers), losers: try c.decode([Mover].self, forKey: .losers))
        case "earnings":
            self = .earnings(days: try c.decode([EarningsVisualDay].self, forKey: .days))
        case "benchmark":
            self = .benchmark(label: try c.decode(String.self, forKey: .label), range: try c.decode(String.self, forKey: .range), you: try c.decode(Double.self, forKey: .you), benchmark: try c.decode(Double.self, forKey: .benchmark))
        default:
            self = .unknown(kind: kind)
        }
    }
}

/// The parts of the portfolio X-Ray the app draws. Everything else in the payload is ignored.
public struct XRaySummary: Decodable, Equatable, Sendable {
    public var asOf: String?
    public var overview: Overview?
    public var concentration: Concentration?
    public var risks: [Insight]
    public var nextSteps: [Insight]
    public var limitations: [String]

    public struct Overview: Decodable, Equatable, Sendable {
        public var totalValue: Double
        public var holdingCount: Int
        public var positionCount: Int
    }
    public struct Concentration: Decodable, Equatable, Sendable {
        public var top1: Double
        public var top3: Double
        public var top5: Double
    }
    public struct Insight: Decodable, Equatable, Sendable, Identifiable {
        public var id: String
        /// "info", "watch" or "notable".
        public var severity: String
        public var title: String
        public var summary: String
        public var metric: String?
    }

    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        asOf = try c.decodeIfPresent(String.self, forKey: .asOf)
        overview = try c.decodeIfPresent(Overview.self, forKey: .overview)
        concentration = try c.decodeIfPresent(Concentration.self, forKey: .concentration)
        risks = try c.decodeIfPresent([Insight].self, forKey: .risks) ?? []
        nextSteps = try c.decodeIfPresent([Insight].self, forKey: .nextSteps) ?? []
        limitations = try c.decodeIfPresent([String].self, forKey: .limitations) ?? []
    }

    private enum CodingKeys: String, CodingKey { case asOf, overview, concentration, risks, nextSteps, limitations }
}

/// One line of the assistant's NDJSON stream.
public enum AssistantEvent: Decodable, Equatable, Sendable {
    public enum Stage: String, Decodable, Sendable { case reading, analyzing, writing }

    case status(stage: Stage?, label: String?)
    case text(String)
    case xray(XRaySummary)
    case visual(AssistantVisual)
    /// `href` is a path on the web app (for example `/wealth?...`), not a full URL.
    case link(label: String, href: String)
    case error(String)
    case done
    /// A type this app version does not know. Ignored so the server can add event kinds.
    case unknown(type: String)

    private enum Keys: String, CodingKey { case type, stage, label, delta, data, href, message }

    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: Keys.self)
        let type = try c.decode(String.self, forKey: .type)
        switch type {
        case "status":
            self = .status(stage: try? c.decodeIfPresent(Stage.self, forKey: .stage), label: try c.decodeIfPresent(String.self, forKey: .label))
        case "text": self = .text(try c.decode(String.self, forKey: .delta))
        case "xray": self = .xray(try c.decode(XRaySummary.self, forKey: .data))
        case "visual": self = .visual(try c.decode(AssistantVisual.self, forKey: .data))
        case "link": self = .link(label: try c.decode(String.self, forKey: .label), href: try c.decode(String.self, forKey: .href))
        case "error": self = .error(try c.decode(String.self, forKey: .message))
        case "done": self = .done
        default: self = .unknown(type: type)
        }
    }
}
