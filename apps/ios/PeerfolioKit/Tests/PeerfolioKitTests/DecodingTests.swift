import XCTest
@testable import PeerfolioKit

final class DecodingTests: XCTestCase {
    func testPortfolioDecodesRealShape() throws {
        let p = try JSONDecoder().decode(PortfolioResponse.self, from: Fixture.portfolio)
        XCTAssertEqual(p.summary.netWorth, 123000.5)
        XCTAssertEqual(p.accounts.first?.positions.first?.ticker, "AAPL")
        XCTAssertEqual(p.holdings.first?.todayPercent, 0.63)
        XCTAssertNil(p.allTime)
        XCTAssertNil(p.leagues.first?.rank)
        XCTAssertEqual(p.performance.series.last?.indexed, 101.01)
        XCTAssertTrue(p.hasHistory)
    }

    func testSectorTupleDecodes() throws {
        let json = Data(#"{"board":{"indexes":[{"key":"spx","name":"S&P 500","symbol":"SPY","price":6742.18,"day":{"percent":0.42,"points":28.19,"path":[0,0.4]},"week":null}],"sectors":[["Technology",1.2,2.5],["Energy",-0.4,null]],"session":"2026-10-15","asOf":"2026-10-15T20:00:00Z"},"earnings":null,"fearGreed":null}"#.utf8)
        let m = try JSONDecoder().decode(MarketNewsResponse.self, from: json)
        XCTAssertEqual(m.board?.sectors, [SectorMove(name: "Technology", dayPercent: 1.2, weekPercent: 2.5), SectorMove(name: "Energy", dayPercent: -0.4, weekPercent: nil)])
        XCTAssertNil(m.board?.indexes.first?.week)
        XCTAssertNil(m.earnings)
    }

    func testFantasyDetailAndTradeResults() throws {
        let detail = Data("""
        {"league":{"id":"f1","name":"Cup","emoji":"🏈","accent":"emerald","inviteCode":"ABCD12","startingCash":100000,"maxPositionPct":null,"endsAt":null,"isClosed":false,"isOwner":true},
         "standings":[{"userId":"u1","name":"Ada","handle":"ada1","image":null,"rank":1,"percent":2.5,"days":3,"spark":[100,102.5],"hasHistory":true,"shareHoldings":true,"isVerified":false,"holdings":[{"ticker":"AAPL","name":"Apple","weight":40}],"reactions":{"🔥":2},"isYou":true,"value":102500,"cash":50000}],
         "you":{"cash":49000,"value":102500,"percent":2.5,"rank":1,"positions":[{"ticker":"AAPL","name":"Apple","shares":5,"price":200,"priceAsOf":"2026-10-15","averageCost":190,"value":1000,"gainPct":5.2}],
                "orders":[{"id":"o1","side":"buy","ticker":"MSFT","name":"Microsoft","amount":1000,"shares":null,"price":400,"status":"pending","reason":null,"at":"2026-10-15T20:00:00.000Z"}]},
         "feed":[{"id":"t1","name":"Ada","handle":"ada1","image":null,"side":"buy","ticker":"AAPL","shares":5,"price":190,"at":"2026-10-14T15:00:00.000Z"}]}
        """.utf8)
        let d = try JSONDecoder().decode(FantasyLeagueDetail.self, from: detail)
        XCTAssertEqual(d.you.orders.first?.side, .buy)
        XCTAssertNil(d.league.maxPositionPct)
        XCTAssertEqual(d.standings.first?.reactions["🔥"], 2)

        let filled = try JSONDecoder().decode(TradeResult.self, from: Data(#"{"trade":{"id":"x"},"ticker":"AAPL","price":200.1,"priceAsOf":"2026-10-15T20:00:00.000Z","shares":2.5}"#.utf8))
        XCTAssertFalse(filled.isQueued)
        XCTAssertEqual(filled.shares, 2.5)
        let queued = try JSONDecoder().decode(TradeResult.self, from: Data(#"{"queued":true,"why":"closed","orderId":"o9","ticker":"AAPL","side":"buy"}"#.utf8))
        XCTAssertTrue(queued.isQueued)
        XCTAssertEqual(queued.why, "closed")
    }

    func testTradeRequestEncoding() throws {
        func json(_ r: TradeRequest) throws -> [String: Any] {
            try JSONSerialization.jsonObject(with: JSONEncoder().encode(r)) as! [String: Any]
        }
        let buy = try json(.buy(symbol: "AAPL", amount: 250))
        XCTAssertEqual(buy["side"] as? String, "buy"); XCTAssertEqual(buy["amount"] as? Double, 250); XCTAssertNil(buy["shares"])
        XCTAssertEqual(try json(.sell(symbol: "AAPL", shares: 1.5))["shares"] as? Double, 1.5)
        XCTAssertEqual(try json(.sellAll(symbol: "AAPL"))["shares"] as? String, "all")
        XCTAssertEqual(buy["kind"] as? String, "stock")
    }

    func testLeagueAndNewsDecode() throws {
        let leagues = try JSONDecoder().decode(LeagueListResponse.self, from: Data(#"{"leagues":[{"id":"l1","name":"Friends","description":null,"emoji":"🏆","accent":"emerald","inviteCode":"XYZ","ownerId":"u1","createdAt":"2026-01-01T00:00:00.000Z","role":"owner","memberCount":3}]}"#.utf8))
        XCTAssertEqual(leagues.leagues.first?.memberCount, 3)
        let news = try JSONDecoder().decode(NewsResponse.self, from: Data(#"{"day":null,"week":{"period":"week","periodEnd":"2026-10-10","headline":"H","body":"B","takeaways":[{"title":"T","body":"b","sourceIds":["1"]}],"sources":[{"id":"1","source":"AP","title":"t","url":"https://x"}],"fallback":false,"createdAt":"2026-10-10T00:00:00.000Z"},"headlines":[{"source":"AP","title":"t","url":"https://x","summary":null,"publishedAt":"2026-10-15T12:00:00.000Z"}]}"#.utf8))
        XCTAssertNil(news.day)
        XCTAssertEqual(news.week?.takeaways.first?.title, "T")
    }

    func testAssistantEventsDecode() throws {
        func event(_ s: String) throws -> AssistantEvent { try JSONDecoder().decode(AssistantEvent.self, from: Data(s.utf8)) }
        XCTAssertEqual(try event(#"{"type":"text","delta":"Hi"}"#), .text("Hi"))
        XCTAssertEqual(try event(#"{"type":"status","stage":"analyzing","label":"Reading your holdings"}"#), .status(stage: .analyzing, label: "Reading your holdings"))
        XCTAssertEqual(try event(#"{"type":"status","stage":"someday"}"#), .status(stage: nil, label: nil))
        XCTAssertEqual(try event(#"{"type":"link","label":"Open","href":"/wealth?x=1"}"#), .link(label: "Open", href: "/wealth?x=1"))
        XCTAssertEqual(try event(#"{"type":"done"}"#), .done)
        XCTAssertEqual(try event(#"{"type":"future-thing","x":1}"#), .unknown(type: "future-thing"))
        guard case .visual(.benchmark(let label, _, let you, let bench)) = try event(#"{"type":"visual","data":{"kind":"benchmark","label":"S&P 500","range":"1M","you":3.2,"benchmark":2.1}}"#) else { return XCTFail("benchmark visual") }
        XCTAssertEqual(label, "S&P 500"); XCTAssertEqual(you, 3.2); XCTAssertEqual(bench, 2.1)
        guard case .visual(.unknown(let kind)) = try event(#"{"type":"visual","data":{"kind":"hologram"}}"#) else { return XCTFail("unknown visual") }
        XCTAssertEqual(kind, "hologram")
        guard case .xray(let x) = try event(#"{"type":"xray","data":{"asOf":"2026-10-15","overview":{"totalValue":1000,"holdingCount":3,"positionCount":4,"largest":[]},"concentration":{"top1":40,"top3":80,"top5":100,"hhi":0.3},"risks":[{"id":"r","severity":"watch","title":"T","summary":"S","followUp":"f"}],"limitations":["none"]}}"#) else { return XCTFail("xray") }
        XCTAssertEqual(x.overview?.holdingCount, 3); XCTAssertEqual(x.risks.first?.severity, "watch"); XCTAssertTrue(x.nextSteps.isEmpty)
    }

    func testFormatting() {
        XCTAssertEqual(Format.currency(1234.5), "$1,234.50")
        XCTAssertEqual(Format.percent(1.236), "+1.24%")
        XCTAssertEqual(Format.percent(-0.5), "-0.50%")
        XCTAssertEqual(Format.percent(0.001), "0.00%")
        XCTAssertEqual(Format.signedCurrency(-12), "-$12.00")
        XCTAssertEqual(Format.compactCurrency(1_340_000), "$1.3M")
        XCTAssertEqual(Format.direction(-3), .down)
        XCTAssertNotNil(Format.day("2026-10-15"))
        XCTAssertNotNil(Format.instant("2026-10-15T21:00:00.000Z"))
        XCTAssertNotNil(Format.instant("2026-10-15T21:00:00Z"))
    }
}
