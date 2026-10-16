import XCTest
import PeerfolioKit
@testable import Peerfolio

/// View-model logic that does not need a server. Run from Xcode (Cmd-U) on a Mac.
@MainActor
final class ViewModelTests: XCTestCase {
    func testBuyNeedsASymbolAndAnAmount() {
        let vm = TradeViewModel(client: nil, leagueId: "f1")
        XCTAssertFalse(vm.canSubmit)
        vm.symbol = "AAPL"
        vm.amountText = "0"
        XCTAssertFalse(vm.canSubmit)
        vm.amountText = "1,250"
        XCTAssertTrue(vm.canSubmit)
    }

    func testSellAllNeedsNoShareCount() {
        let vm = TradeViewModel(client: nil, leagueId: "f1", preselect: "AAPL")
        vm.side = .sell
        XCTAssertFalse(vm.canSubmit)
        vm.sellAll = true
        XCTAssertTrue(vm.canSubmit)
    }

    func testAssistantAppendsAUserTurnAndAPlaceholder() {
        let vm = AssistantViewModel(client: nil, page: .news)
        vm.draft = "  How's the market?  "
        XCTAssertTrue(vm.canSend)
        vm.send()
        XCTAssertEqual(vm.turns.count, 2)
        XCTAssertEqual(vm.turns[0].text, "How's the market?")
        XCTAssertTrue(vm.turns[1].isStreaming)
        XCTAssertEqual(vm.draft, "")
    }

    func testSportsIsHiddenForNow() {
        XCTAssertFalse(Features.sportsEnabled)
    }
}
