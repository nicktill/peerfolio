import Foundation

/// Splits a byte stream into newline-delimited JSON values and decodes each line.
///
/// Network chunks do not respect line boundaries, so partial lines are held until their newline arrives. A line that
/// is not valid JSON is skipped rather than ending the stream: the server's events are independent of each other.
public struct NDJSONParser<Element: Decodable> {
    private var buffer = Data()
    private let decoder: JSONDecoder
    /// Lines that could not be decoded, for diagnostics.
    public private(set) var skippedLines = 0

    public init(decoder: JSONDecoder = JSONDecoder()) { self.decoder = decoder }

    /// Adds a chunk and returns every element completed by it.
    public mutating func feed(_ chunk: Data) -> [Element] {
        buffer.append(chunk)
        var out: [Element] = []
        while let newline = buffer.firstIndex(of: 0x0A) {
            let line = buffer[buffer.startIndex..<newline]
            buffer.removeSubrange(buffer.startIndex...newline)
            if let element = decode(Data(line)) { out.append(element) }
        }
        return out
    }

    /// Decodes a final line that never got its newline (the stream closed mid-write).
    public mutating func finish() -> [Element] {
        defer { buffer.removeAll() }
        guard let element = decode(buffer) else { return [] }
        return [element]
    }

    private mutating func decode(_ line: Data) -> Element? {
        let trimmed = line.drop(while: { $0 == 0x20 || $0 == 0x0D || $0 == 0x09 })
        guard !trimmed.isEmpty else { return nil }
        // Tolerate a trailing carriage return from CRLF framing.
        let body = trimmed.last == 0x0D ? trimmed.dropLast() : trimmed
        if let element = try? decoder.decode(Element.self, from: Data(body)) { return element }
        skippedLines += 1
        return nil
    }
}
