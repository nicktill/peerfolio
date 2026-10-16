import XCTest
@testable import PeerfolioKit

/// MockData.swift lives in the app (it feeds previews) and is symlinked into this target, so a model change that
/// breaks the sample payloads fails here instead of crashing a preview on a Mac.
final class MockDataTests: XCTestCase {
    func testEveryMockPayloadDecodes() {
        XCTAssertEqual(Mock.portfolio.accounts.count, 4)
        XCTAssertEqual(Mock.portfolio.history.count, 60)
        XCTAssertEqual(Mock.leagues.count, 2)
        XCTAssertEqual(Mock.leagueDetail.standings.count, 4)
        XCTAssertEqual(Mock.fantasyLeagues.count, 2)
        XCTAssertEqual(Mock.fantasyDetail.you.positions.count, 2)
        XCTAssertNotNil(Mock.news.day)
        XCTAssertEqual(Mock.market.board?.sectors.count, 5)
        XCTAssertEqual(Mock.me.user.handle, "alexr")
        XCTAssertEqual(Mock.xray.risks.count, 1)
        XCTAssertEqual(Mock.visuals.count, 2)
    }
}
