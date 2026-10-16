import Foundation
import PeerfolioKit

/// Sample payloads in the API's real JSON shape, decoded with the real models, so previews exercise the same
/// decoding the app uses. Shared by SwiftUI previews and the "demo" mode.
enum Mock {
    private static func decode<T: Decodable>(_ json: String) -> T {
        do { return try JSONDecoder().decode(T.self, from: Data(json.utf8)) }
        catch { fatalError("Mock JSON no longer matches \(T.self): \(error)") }
    }

    private static func day(_ offset: Int) -> String {
        let date = Calendar(identifier: .gregorian).date(byAdding: .day, value: offset, to: Date(timeIntervalSince1970: 1_792_000_000))!
        let f = DateFormatter(); f.dateFormat = "yyyy-MM-dd"; f.timeZone = TimeZone(secondsFromGMT: 0); f.locale = Locale(identifier: "en_US_POSIX")
        return f.string(from: date)
    }

    private static func spark(_ seed: Double, _ n: Int = 24) -> String {
        var v = 100.0
        let out = (0..<n).map { i -> String in v += sin(Double(i) * 0.7 + seed) * 0.8 + seed * 0.05; return String(format: "%.2f", v) }
        return "[" + out.joined(separator: ",") + "]"
    }

    static var portfolio: PortfolioResponse {
        var net = 118_400.0
        let history = (0..<60).map { i -> String in
            net += sin(Double(i) * 0.45) * 520 + 140
            return #"{"date":"\#(day(i - 59))","netWorth":\#(String(format: "%.2f", net)),"investableAssets":\#(String(format: "%.2f", net * 0.82))}"#
        }.joined(separator: ",")
        var idx = 100.0
        let series = (0..<60).map { i -> String in
            idx += sin(Double(i) * 0.45) * 0.6 + 0.18
            return #"{"date":"\#(day(i - 59))","indexed":\#(String(format: "%.2f", idx))}"#
        }.joined(separator: ",")
        return decode("""
        {
          "summary": {"totalAssets": 131200.40, "totalLiabilities": 3150.00, "netWorth": 128050.40, "investableAssets": 104980.12},
          "accounts": [
            {"id":"a1","name":"Brokerage","officialName":null,"mask":"4821","type":"investment","subtype":"brokerage","category":"investment","balance":86420.12,"isLiability":false,"source":"plaid","institutionName":"Fidelity","institutionLogo":null,"itemId":"i1","holdingCount":4,"holdingsPending":false,"holdingPreview":["VTI","AAPL","MSFT","NVDA"],"positions":[]},
            {"id":"a2","name":"Roth IRA","officialName":null,"mask":"1190","type":"investment","subtype":"ira","category":"investment","balance":18560.00,"isLiability":false,"source":"manual","institutionName":"Manual account","institutionLogo":null,"itemId":null,"holdingCount":0,"holdingsPending":false,"holdingPreview":[],"positions":[]},
            {"id":"a3","name":"Checking","officialName":null,"mask":"0042","type":"depository","subtype":"checking","category":"cash","balance":26220.28,"isLiability":false,"source":"plaid","institutionName":"Chase","institutionLogo":null,"itemId":"i2","holdingCount":0,"holdingsPending":false,"holdingPreview":[],"positions":[]},
            {"id":"a4","name":"Sapphire","officialName":null,"mask":"7733","type":"credit","subtype":"credit card","category":"credit","balance":3150.00,"isLiability":true,"source":"plaid","institutionName":"Chase","institutionLogo":null,"itemId":"i2","holdingCount":0,"holdingsPending":false,"holdingPreview":[],"positions":[]}
          ],
          "archivedAccounts": [],
          "items": [
            {"id":"i1","institutionName":"Fidelity","institutionLogo":null,"status":"active","errorCode":null,"lastSyncedAt":"2026-10-15T21:00:00.000Z"},
            {"id":"i2","institutionName":"Chase","institutionLogo":null,"status":"needs_reauth","errorCode":"ITEM_LOGIN_REQUIRED","lastSyncedAt":"2026-10-12T21:00:00.000Z"}
          ],
          "allocation": [
            {"name":"ETFs","value":46200,"percent":44.0},{"name":"Stocks","value":38400,"percent":36.6},
            {"name":"Plan funds","value":12380.12,"percent":11.8},{"name":"Cash","value":8000,"percent":7.6}
          ],
          "holdings": [
            {"securityId":"s1","ticker":"VTI","name":"Vanguard Total Stock Market ETF","type":"etf","quantity":142.5,"value":41800.00,"weight":39.8,"todayAmount":210.40,"todayPercent":0.51,"gainAmount":6200.00,"gainPercent":17.4,"positions":2},
            {"securityId":"s2","ticker":"AAPL","name":"Apple Inc.","type":"equity","quantity":60,"value":13420.00,"weight":12.8,"todayAmount":-48.00,"todayPercent":-0.36,"gainAmount":2410.00,"gainPercent":21.9,"positions":1},
            {"securityId":"s3","ticker":"MSFT","name":"Microsoft Corp.","type":"equity","quantity":28,"value":12180.50,"weight":11.6,"todayAmount":96.20,"todayPercent":0.80,"gainAmount":1720.50,"gainPercent":16.4,"positions":1},
            {"securityId":"s4","ticker":"NVDA","name":"NVIDIA Corp.","type":"equity","quantity":70,"value":12800.00,"weight":12.2,"todayAmount":211.00,"todayPercent":1.68,"gainAmount":5300.00,"gainPercent":70.7,"positions":1},
            {"securityId":"s5","ticker":"FXAIX","name":"Fidelity 500 Index Fund","type":"mutual_fund","quantity":50,"value":9100.00,"weight":8.7,"todayAmount":null,"todayPercent":null,"gainAmount":null,"gainPercent":null,"positions":1}
          ],
          "holdingsPending": false,
          "today": {"amount": 469.60, "percent": 0.47, "coverage": 0.91, "asOf": "\(day(0))"},
          "allTime": {"amount": 15630.50, "percent": 18.9, "cost": 82700.00, "coverage": 0.79},
          "leagues": [{"id":"l1","name":"College Friends","emoji":"🏆","rank":2,"members":6},{"id":"l2","name":"Work Crew","emoji":"🚀","rank":null,"members":4}],
          "history": [\(history)],
          "performance": {"percent": 11.4, "days": 60, "range": "3M", "series": [\(series)]},
          "hasHistory": true, "firstDate": "\(day(-59))", "isVerified": false
        }
        """)
    }

    static var leagues: [LeagueSummary] {
        let list: LeagueListResponse = decode("""
        {"leagues":[
          {"id":"l1","name":"College Friends","description":"Who really reads the 10-K?","emoji":"🏆","accent":"emerald","inviteCode":"K7QH2M","ownerId":"u1","createdAt":"2026-08-01T00:00:00.000Z","role":"owner","memberCount":6},
          {"id":"l2","name":"Work Crew","description":null,"emoji":"🚀","accent":"violet","inviteCode":"P9ZX4C","ownerId":"u2","createdAt":"2026-09-10T00:00:00.000Z","role":"member","memberCount":4}
        ]}
        """)
        return list.leagues
    }

    static var leagueDetail: LeagueDetailResponse {
        decode("""
        {"league":{"id":"l1","name":"College Friends","description":"Who really reads the 10-K?","emoji":"🏆","accent":"emerald","inviteCode":"K7QH2M","isOwner":true},
         "you":{"shareHoldings":true},
         "standings":[
          {"userId":"u3","name":"Priya Nair","handle":"priya","image":null,"rank":1,"percent":14.62,"days":60,"spark":\(spark(1)),"hasHistory":true,"isVerified":true,"shareHoldings":true,"holdings":[{"ticker":"NVDA","name":"NVIDIA","weight":31.2},{"ticker":"VTI","name":"Vanguard Total","weight":24.0},{"ticker":"TSM","name":"TSMC","weight":12.5}],"reactions":{"🔥":3,"🚀":1},"isYou":false},
          {"userId":"u1","name":"Alex Rivera","handle":"alexr","image":null,"rank":2,"percent":11.40,"days":60,"spark":\(spark(2)),"hasHistory":true,"isVerified":false,"shareHoldings":true,"holdings":[{"ticker":"VTI","name":"Vanguard Total","weight":39.8},{"ticker":"AAPL","name":"Apple","weight":12.8}],"reactions":{"👏":2},"isYou":true},
          {"userId":"u4","name":"Sam Okafor","handle":"samo","image":null,"rank":3,"percent":3.08,"days":60,"spark":\(spark(-1)),"hasHistory":true,"isVerified":true,"shareHoldings":false,"holdings":[],"reactions":{},"isYou":false},
          {"userId":"u5","name":"Jo Lindqvist","handle":"jol","image":null,"rank":4,"percent":-2.35,"days":60,"spark":\(spark(-3)),"hasHistory":true,"isVerified":false,"shareHoldings":true,"holdings":[{"ticker":"ARKK","name":"ARK Innovation","weight":55.0}],"reactions":{"🧊":1},"isYou":false}
         ],"range":"3M"}
        """)
    }

    static var board: BoardResponse {
        decode("""
        {"range":"1M","scope":"all","minHistoryDays":7,"requiresVerified":true,"traders":[
          {"handle":"marta","name":"Marta Silva","image":null,"bio":"Boring index funds, exciting compounding.","rank":1,"percent":6.42,"days":30,"spark":\(spark(1)),"holdings":[{"ticker":"VTI","name":"Vanguard Total","weight":55.0},{"ticker":"VXUS","name":"Vanguard Intl","weight":25.0}],"isFollowing":true,"isYou":false},
          {"handle":"kenji","name":"Kenji Mori","image":null,"bio":null,"rank":2,"percent":4.1,"days":30,"spark":\(spark(0.4)),"holdings":[{"ticker":"MSFT","name":"Microsoft","weight":30.0}],"isFollowing":false,"isYou":false},
          {"handle":"alexr","name":"Alex Rivera","image":null,"bio":"Index funds and curiosity.","rank":3,"percent":2.8,"days":30,"spark":\(spark(0.1)),"holdings":[],"isFollowing":false,"isYou":true}
        ]}
        """)
    }

    static var fantasyLeagues: [FantasyLeagueSummary] {
        let list: FantasyListResponse = decode("""
        {"leagues":[
          {"id":"f1","name":"Fall Showdown","emoji":"🏈","accent":"emerald","endsAt":"2026-12-20T00:00:00.000Z","isClosed":false,"memberCount":8,"yourReturn":4.82,"yourRank":3},
          {"id":"f2","name":"Summer Cup","emoji":"🏆","accent":"amber","endsAt":"2026-09-01T00:00:00.000Z","isClosed":true,"memberCount":5,"yourReturn":-1.2,"yourRank":4}
        ]}
        """)
        return list.leagues
    }

    static var fantasyDetail: FantasyLeagueDetail {
        decode("""
        {"league":{"id":"f1","name":"Fall Showdown","emoji":"🏈","accent":"emerald","inviteCode":"FALL26","startingCash":100000,"maxPositionPct":40,"endsAt":"2026-12-20T00:00:00.000Z","isClosed":false,"isOwner":true},
         "standings":[
          {"userId":"u3","name":"Priya Nair","handle":"priya","image":null,"rank":1,"percent":9.4,"days":14,"spark":\(spark(1, 14)),"hasHistory":true,"shareHoldings":true,"isVerified":false,"holdings":[{"ticker":"NVDA","name":"NVIDIA","weight":38.0}],"reactions":{"🔥":2},"isYou":false,"value":109400,"cash":12000},
          {"userId":"u6","name":"Dee Park","handle":"deep","image":null,"rank":2,"percent":6.1,"days":14,"spark":\(spark(0.5, 14)),"hasHistory":true,"shareHoldings":true,"isVerified":false,"holdings":[{"ticker":"TSLA","name":"Tesla","weight":30.0}],"reactions":{},"isYou":false,"value":106100,"cash":40000},
          {"userId":"u1","name":"Alex Rivera","handle":"alexr","image":null,"rank":3,"percent":4.82,"days":14,"spark":\(spark(0.2, 14)),"hasHistory":true,"shareHoldings":true,"isVerified":false,"holdings":[{"ticker":"AAPL","name":"Apple","weight":25.0},{"ticker":"MSFT","name":"Microsoft","weight":22.0}],"reactions":{"👏":1},"isYou":true,"value":104820,"cash":31200}
         ],
         "you":{"cash":29200,"value":104820,"percent":4.82,"rank":3,
          "positions":[
            {"ticker":"AAPL","name":"Apple Inc.","shares":120,"price":223.4,"priceAsOf":"2026-10-15","averageCost":212.1,"value":26808,"gainPct":5.33},
            {"ticker":"MSFT","name":"Microsoft Corp.","shares":55,"price":435.0,"priceAsOf":"2026-10-15","averageCost":441.8,"value":23925,"gainPct":-1.54}
          ],
          "orders":[{"id":"o1","side":"buy","ticker":"NVDA","name":"NVIDIA Corp.","amount":2000,"shares":null,"price":182.5,"status":"pending","reason":null,"at":"2026-10-15T22:00:00.000Z"}]},
         "feed":[
          {"id":"t1","name":"Priya Nair","handle":"priya","image":null,"side":"buy","ticker":"NVDA","shares":40,"price":181.2,"at":"2026-10-15T15:10:00.000Z"},
          {"id":"t2","name":"Dee Park","handle":"deep","image":null,"side":"sell","ticker":"AMD","shares":25,"price":164.0,"at":"2026-10-15T14:02:00.000Z"}
         ]}
        """)
    }

    static var news: NewsResponse {
        decode("""
        {"day":{"period":"day","periodEnd":"2026-10-15","headline":"Stocks edge higher as chipmakers rally","body":"Major indexes finished modestly higher on Thursday, led by semiconductors after an upbeat supplier report. Treasury yields eased, which helped growth stocks.\\n\\nInvestors now look to Friday's retail sales data for signs of how resilient consumers remain.","takeaways":[{"title":"Chips lead","body":"Semiconductor names gained as demand commentary beat expectations.","sourceIds":["1"]},{"title":"Yields ease","body":"The 10-year yield slipped a few basis points, supporting valuations.","sourceIds":["2"]}],"sources":[{"id":"1","source":"Reuters","title":"Chip stocks climb","url":"https://example.com/1"},{"id":"2","source":"AP","title":"Yields slip","url":"https://example.com/2"}],"fallback":false,"createdAt":"2026-10-15T22:10:00.000Z"},
         "week":null,
         "headlines":[
          {"source":"Reuters","title":"Chip stocks climb after supplier raises outlook","url":"https://example.com/1","summary":"Semiconductor shares rose broadly.","publishedAt":"2026-10-15T19:30:00.000Z"},
          {"source":"AP","title":"Treasury yields slip ahead of retail sales data","url":"https://example.com/2","summary":null,"publishedAt":"2026-10-15T17:05:00.000Z"},
          {"source":"CNBC","title":"Oil steadies as inventories draw down","url":"https://example.com/3","summary":null,"publishedAt":"2026-10-15T15:40:00.000Z"}
         ]}
        """)
    }

    static var market: MarketNewsResponse {
        decode("""
        {"board":{"indexes":[
           {"key":"spx","name":"S&P 500","symbol":"SPY","price":6742.18,"day":{"percent":0.42,"points":28.19,"path":[0,-0.08,0.05,0.12,0.06,0.18,0.25,0.21,0.3,0.27,0.35,0.33,0.4,0.42]},"week":{"percent":1.18,"points":78.62,"path":[0,0.22,0.15,0.41,0.58,0.49,0.72,0.9,1.02,1.18]}},
           {"key":"ndx","name":"Nasdaq 100","symbol":"QQQ","price":24310.5,"day":{"percent":0.77,"points":186.4,"path":[0,0.1,0.2,0.15,0.4,0.5,0.6,0.77]},"week":null},
           {"key":"dji","name":"Dow Jones","symbol":"DIA","price":46980.1,"day":{"percent":-0.12,"points":-56.2,"path":[0,0.1,-0.05,-0.2,-0.1,-0.12]},"week":null}
         ],
         "sectors":[["Technology",1.32,2.4],["Communication",0.8,1.1],["Financials",0.25,null],["Energy",-0.61,-1.4],["Utilities",-0.9,0.3]],
         "session":"2026-10-15","asOf":"2026-10-15T20:15:00.000Z"},
         "earnings":{"label":"Oct 13 - 17","asOf":"2026-10-15T12:00:00.000Z","days":[
           {"dow":"Thu","label":"Thursday","date":16,"iso":"2026-10-16","past":false,"today":true,"reports":[
              {"symbol":"TSM","name":"Taiwan Semiconductor","when":"before-open","epsEstimate":"$2.47","confirmed":null,"owned":false},
              {"symbol":"NFLX","name":"Netflix","when":"after-close","epsEstimate":"$5.12","confirmed":null,"owned":true}]}]},
         "fearGreed":{"score":63,"rating":"Greed","asOf":"2026-10-15T20:00:00.000Z","history":[{"label":"Previous close","score":61},{"label":"1 week ago","score":55},{"label":"1 month ago","score":48}]}}
        """)
    }

    static var me: MeResponse {
        decode(#"{"user":{"id":"u1","email":"alex@example.com","name":"Alex Rivera","image":null,"handle":"alexr","bio":"Index funds and curiosity.","isPublic":false},"stats":{"snapshotDays":60,"followers":3}}"#)
    }

    static let user = SessionUser(id: "u1", email: "alex@example.com", name: "Alex Rivera", image: nil, handle: "alexr")

    static var xray: XRaySummary {
        decode(#"{"asOf":"2026-10-15","overview":{"totalValue":104980.12,"holdingCount":5,"positionCount":6},"concentration":{"top1":39.8,"top3":64.2,"top5":85.1},"risks":[{"id":"r1","severity":"watch","title":"Large single fund","summary":"VTI is about 40% of what you hold. It is a broad fund, so this is diversified exposure.","metric":"39.8% of portfolio"}],"nextSteps":[],"limitations":["Sector detail covers only the classified stocks."]}"#)
    }

    static var visuals: [AssistantVisual] {
        let market: AssistantVisual = decode(#"{"kind":"market","session":"2026-10-15","indexes":[{"name":"S&P 500","dayPercent":0.42},{"name":"Nasdaq 100","dayPercent":0.77}],"sectors":[{"name":"Technology","dayPercent":1.32},{"name":"Energy","dayPercent":-0.61}]}"#)
        let benchmark: AssistantVisual = decode(#"{"kind":"benchmark","label":"S&P 500","range":"3M","you":11.4,"benchmark":8.9}"#)
        return [market, benchmark]
    }
}
