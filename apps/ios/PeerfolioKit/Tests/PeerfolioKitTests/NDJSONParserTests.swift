import XCTest
@testable import PeerfolioKit

final class NDJSONParserTests: XCTestCase {
    func testLinesSplitAcrossChunks() {
        var p = NDJSONParser<AssistantEvent>()
        let all = Data(#"{"type":"text","delta":"Hel"}"#.utf8) + Data("\n".utf8) + Data(#"{"type":"text","delta":"lo"}"#.utf8) + Data("\n".utf8)
        var events: [AssistantEvent] = []
        for byte in all { events += p.feed(Data([byte])) }   // worst case: one byte at a time
        XCTAssertEqual(events, [.text("Hel"), .text("lo")])
    }

    func testSeveralEventsInOneChunkAndBlankLines() {
        var p = NDJSONParser<AssistantEvent>()
        let chunk = Data("{\"type\":\"status\",\"stage\":\"reading\"}\n\n{\"type\":\"done\"}\n".utf8)
        XCTAssertEqual(p.feed(chunk), [.status(stage: .reading, label: nil), .done])
    }

    func testMalformedLineIsSkippedNotFatal() {
        var p = NDJSONParser<AssistantEvent>()
        let out = p.feed(Data("not json\n{\"type\":\"text\",\"delta\":\"ok\"}\n".utf8))
        XCTAssertEqual(out, [.text("ok")])
        XCTAssertEqual(p.skippedLines, 1)
    }

    func testCRLFAndMultibyteSplit() {
        var p = NDJSONParser<AssistantEvent>()
        let line = Data("{\"type\":\"text\",\"delta\":\"café 🚀\"}\r\n".utf8)
        let mid = 24   // lands inside the multibyte sequence region
        var out = p.feed(line.prefix(mid))
        out += p.feed(line.suffix(from: mid))
        XCTAssertEqual(out, [.text("café 🚀")])
    }

    func testFinishFlushesUnterminatedLine() {
        var p = NDJSONParser<AssistantEvent>()
        XCTAssertTrue(p.feed(Data("{\"type\":\"done\"}".utf8)).isEmpty)
        XCTAssertEqual(p.finish(), [.done])
        XCTAssertTrue(p.finish().isEmpty)
    }
}
