import XCTest
@testable import PeerfolioKit

final class MarkdownBlocksTests: XCTestCase {
    func testParagraphsAndLists() {
        let md = """
        Your portfolio is **tech heavy**.

        - NVDA is 12%
        - AAPL is 13%
          and rising

        1. Review concentration
        2. Check overlap
        """
        XCTAssertEqual(MarkdownBlocks.parse(md), [
            .paragraph("Your portfolio is **tech heavy**."),
            .bullets(["NVDA is 12%", "AAPL is 13% and rising"]),
            .numbered(["Review concentration", "Check overlap"]),
        ])
    }

    func testHeadingsAndQuotes() {
        XCTAssertEqual(MarkdownBlocks.parse("## Risks\n> be careful\nmore text"), [
            .heading(level: 2, text: "Risks"), .quote("be careful"), .paragraph("more text"),
        ])
        XCTAssertEqual(MarkdownBlocks.parse("#hashtag"), [.paragraph("#hashtag")])
    }

    func testUnclosedCodeFenceWhileStreaming() {
        XCTAssertEqual(MarkdownBlocks.parse("Try:\n```\nlet x = 1"), [.paragraph("Try:"), .code("let x = 1")])
        XCTAssertEqual(MarkdownBlocks.parse("```\na\nb\n```\nafter"), [.code("a\nb"), .paragraph("after")])
    }

    func testSoftWrappedLinesJoinAndEmptyIsEmpty() {
        XCTAssertEqual(MarkdownBlocks.parse("one\ntwo"), [.paragraph("one two")])
        XCTAssertEqual(MarkdownBlocks.parse(""), [])
    }
}
