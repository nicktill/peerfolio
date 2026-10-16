import Foundation

/// Number formatting shared by every screen. Money and percentages always carry a sign and a direction glyph where
/// they are changes, because red and green alone are not enough (see docs/ios/DESIGN_TOKENS.md).
public enum Format {
    public static func currency(_ value: Double, fractionDigits: Int = 2, code: String = "USD") -> String {
        let f = NumberFormatter()
        f.numberStyle = .currency
        f.currencyCode = code
        f.locale = Locale(identifier: "en_US")
        f.minimumFractionDigits = fractionDigits
        f.maximumFractionDigits = fractionDigits
        return f.string(from: NSNumber(value: value)) ?? "$\(value)"
    }

    /// $1.2K, $3.4M for tight spaces such as chart axes.
    public static func compactCurrency(_ value: Double) -> String {
        let a = abs(value)
        let sign = value < 0 ? "-" : ""
        switch a {
        case 1_000_000_000...: return "\(sign)$\(trim(a / 1_000_000_000))B"
        case 1_000_000...: return "\(sign)$\(trim(a / 1_000_000))M"
        case 1_000...: return "\(sign)$\(trim(a / 1_000))K"
        default: return "\(sign)$\(Int(a.rounded()))"
        }
    }

    /// "+1.24%" / "-0.50%" / "0.00%".
    public static func percent(_ value: Double, fractionDigits: Int = 2, signed: Bool = true) -> String {
        let rounded = (value * pow(10, Double(fractionDigits))).rounded() / pow(10, Double(fractionDigits))
        let body = String(format: "%.\(fractionDigits)f", abs(rounded))
        if rounded == 0 { return "\(body)%" }
        return (rounded < 0 ? "-" : (signed ? "+" : "")) + body + "%"
    }

    /// "+$1,234.50" / "-$12.00".
    public static func signedCurrency(_ value: Double, fractionDigits: Int = 2) -> String {
        let body = currency(abs(value), fractionDigits: fractionDigits)
        if value > 0 { return "+" + body }
        if value < 0 { return "-" + body }
        return body
    }

    public static func shares(_ value: Double) -> String {
        let f = NumberFormatter()
        f.numberStyle = .decimal
        f.maximumFractionDigits = 4
        f.minimumFractionDigits = 0
        f.locale = Locale(identifier: "en_US")
        return f.string(from: NSNumber(value: value)) ?? "\(value)"
    }

    public enum Direction { case up, down, flat }

    public static func direction(_ value: Double, epsilon: Double = 0.005) -> Direction {
        value > epsilon ? .up : (value < -epsilon ? .down : .flat)
    }

    /// Parses the API's `YYYY-MM-DD` dates as a calendar day in UTC (they are New York or UTC session dates, not instants).
    public static func day(_ iso: String) -> Date? {
        let f = DateFormatter()
        f.calendar = Calendar(identifier: .gregorian)
        f.locale = Locale(identifier: "en_US_POSIX")
        f.timeZone = TimeZone(secondsFromGMT: 0)
        f.dateFormat = "yyyy-MM-dd"
        return f.date(from: String(iso.prefix(10)))
    }

    /// Parses an ISO-8601 instant with or without fractional seconds.
    public static func instant(_ iso: String) -> Date? {
        let withFraction = ISO8601DateFormatter()
        withFraction.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        if let d = withFraction.date(from: iso) { return d }
        return ISO8601DateFormatter().date(from: iso)
    }

    private static func trim(_ v: Double) -> String {
        let s = String(format: "%.1f", v)
        return s.hasSuffix(".0") ? String(s.dropLast(2)) : s
    }
}
