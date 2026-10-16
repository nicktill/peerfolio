import Foundation

/// Block structure of the assistant's markdown. Inline styling (bold, italic, code, links) is left to
/// `AttributedString(markdown:)` in the UI; this only splits text into the blocks SwiftUI cannot render itself.
public enum MarkdownBlock: Equatable, Sendable {
    case paragraph(String)
    case heading(level: Int, text: String)
    case bullets([String])
    case numbered([String])
    case code(String)
    case quote(String)
}

public enum MarkdownBlocks {
    /// Tolerates text that is still streaming: an unclosed code fence renders as code so far.
    public static func parse(_ text: String) -> [MarkdownBlock] {
        var blocks: [MarkdownBlock] = []
        var paragraph: [String] = []
        var bullets: [String] = []
        var numbered: [String] = []
        var quote: [String] = []
        var code: [String]? = nil

        func flush() {
            if !paragraph.isEmpty { blocks.append(.paragraph(paragraph.joined(separator: " "))); paragraph = [] }
            if !bullets.isEmpty { blocks.append(.bullets(bullets)); bullets = [] }
            if !numbered.isEmpty { blocks.append(.numbered(numbered)); numbered = [] }
            if !quote.isEmpty { blocks.append(.quote(quote.joined(separator: " "))); quote = [] }
        }

        for rawLine in text.replacingOccurrences(of: "\r\n", with: "\n").components(separatedBy: "\n") {
            let line = rawLine.trimmingCharacters(in: .whitespaces)

            if line.hasPrefix("```") {
                if let open = code { blocks.append(.code(open.joined(separator: "\n"))); code = nil }
                else { flush(); code = [] }
                continue
            }
            if code != nil { code!.append(rawLine); continue }

            if line.isEmpty { flush(); continue }

            if let heading = headingMatch(line) { flush(); blocks.append(heading); continue }

            if let item = bulletItem(line) {
                if paragraph.isEmpty == false || numbered.isEmpty == false || quote.isEmpty == false { flush() }
                bullets.append(item); continue
            }
            if let item = numberedItem(line) {
                if paragraph.isEmpty == false || bullets.isEmpty == false || quote.isEmpty == false { flush() }
                numbered.append(item); continue
            }
            if line.hasPrefix(">") {
                if paragraph.isEmpty == false || bullets.isEmpty == false || numbered.isEmpty == false { flush() }
                quote.append(String(line.dropFirst()).trimmingCharacters(in: .whitespaces)); continue
            }

            // A plain line after a list item continues that item; otherwise it joins the paragraph.
            if !bullets.isEmpty { bullets[bullets.count - 1] += " " + line; continue }
            if !numbered.isEmpty { numbered[numbered.count - 1] += " " + line; continue }
            if !quote.isEmpty { flush() }
            paragraph.append(line)
        }
        if let open = code { blocks.append(.code(open.joined(separator: "\n"))) }
        flush()
        return blocks
    }

    private static func headingMatch(_ line: String) -> MarkdownBlock? {
        guard line.hasPrefix("#") else { return nil }
        let hashes = line.prefix(while: { $0 == "#" })
        guard (1...6).contains(hashes.count) else { return nil }
        let rest = line.dropFirst(hashes.count)
        guard rest.first == " " else { return nil }
        return .heading(level: hashes.count, text: rest.trimmingCharacters(in: .whitespaces))
    }

    private static func bulletItem(_ line: String) -> String? {
        for marker in ["- ", "* ", "• "] where line.hasPrefix(marker) { return String(line.dropFirst(marker.count)) }
        return nil
    }

    private static func numberedItem(_ line: String) -> String? {
        let digits = line.prefix(while: { $0.isNumber })
        guard !digits.isEmpty, digits.count <= 3 else { return nil }
        let rest = line.dropFirst(digits.count)
        guard rest.hasPrefix(". ") || rest.hasPrefix(") ") else { return nil }
        return String(rest.dropFirst(2))
    }
}
