import Foundation

/// Port of the web's Wealth Lab engine (apps/web/src/lib/wealth/engine.ts). Pure and deterministic.
///
/// Monthly steps; the monthly rate is (1 + annual)^(1/12) - 1 so twelve months compound to exactly the annual return.
/// Contributions land at month end, after that month's growth, and step up once a year. Real value deflates by inflation.
/// Nothing throws: non-finite numbers become 0, negatives clamp to 0, rates floor at -99%, years cap at 100.
public enum Wealth {
    public static let maxYears = 100.0
    public static let minRatePct = -99.0
    public static let defaultSpread = 2.0

    public struct Inputs: Equatable, Sendable {
        public var startingValue: Double
        public var monthlyContribution: Double
        public var annualContributionGrowthPct: Double
        public var years: Double
        public var expectedAnnualReturnPct: Double
        public var inflationPct: Double
        /// 0 means no target.
        public var targetValue: Double

        public init(startingValue: Double = 0, monthlyContribution: Double = 0, annualContributionGrowthPct: Double = 0, years: Double = 10,
                    expectedAnnualReturnPct: Double = 7, inflationPct: Double = 2.5, targetValue: Double = 0) {
            self.startingValue = startingValue; self.monthlyContribution = monthlyContribution
            self.annualContributionGrowthPct = annualContributionGrowthPct; self.years = years
            self.expectedAnnualReturnPct = expectedAnnualReturnPct; self.inflationPct = inflationPct; self.targetValue = targetValue
        }
    }

    public struct Point: Equatable, Sendable, Identifiable {
        public var month: Int
        public var nominal: Double
        public var real: Double
        public var contributions: Double
        public var growth: Double
        public var id: Int { month }
    }

    public struct Summary: Equatable, Sendable {
        public var finalNominal: Double
        public var finalReal: Double
        public var totalContributions: Double
        public var totalGrowth: Double
        /// First month the nominal value reaches the target within the horizon; nil if never or no target.
        public var monthsToTarget: Int?
        /// finalNominal / target, uncapped; nil without a target.
        public var progress: Double?
    }

    public struct Projection: Equatable, Sendable {
        public var inputs: Inputs
        public var months: Int
        public var points: [Point]
        public var summary: Summary
    }

    public struct Scenarios: Equatable, Sendable {
        public var spread: Double
        public var conservative: Projection
        public var base: Projection
        public var optimistic: Projection
    }

    // MARK: Normalising

    private static func finite(_ n: Double) -> Double { n.isFinite ? n : 0 }
    private static func nonNegative(_ n: Double) -> Double { max(0, finite(n)) }
    private static func rate(_ n: Double) -> Double { max(minRatePct, finite(n)) }

    public static func normalize(_ i: Inputs) -> Inputs {
        Inputs(startingValue: nonNegative(i.startingValue), monthlyContribution: nonNegative(i.monthlyContribution),
               annualContributionGrowthPct: rate(i.annualContributionGrowthPct), years: min(maxYears, nonNegative(i.years)),
               expectedAnnualReturnPct: rate(i.expectedAnnualReturnPct), inflationPct: rate(i.inflationPct), targetValue: nonNegative(i.targetValue))
    }

    public static func monthlyRate(_ annualPct: Double) -> Double { pow(1 + annualPct / 100, 1.0 / 12) - 1 }
    private static func months(for years: Double) -> Int { Int((years * 12).rounded()) }

    private static func contribution(_ n: Inputs, month: Int) -> Double {
        n.monthlyContribution * pow(1 + n.annualContributionGrowthPct / 100, Double((month - 1) / 12))
    }

    // MARK: Projection

    public static func project(_ input: Inputs) -> Projection {
        let n = normalize(input)
        let months = months(for: n.years)
        let rm = monthlyRate(n.expectedAnnualReturnPct)
        let infl = 1 + n.inflationPct / 100

        var points = [Point(month: 0, nominal: n.startingValue, real: n.startingValue, contributions: 0, growth: 0)]
        var value = n.startingValue
        var contributed = 0.0
        if months >= 1 {
            for m in 1...months {
                let c = contribution(n, month: m)
                value = value * (1 + rm) + c
                contributed += c
                points.append(Point(month: m, nominal: value, real: value / pow(infl, Double(m) / 12), contributions: contributed, growth: value - n.startingValue - contributed))
            }
        }
        let last = points[points.count - 1]
        let hasTarget = n.targetValue > 0
        let reached = hasTarget ? points.first { $0.nominal >= n.targetValue } : nil
        return Projection(inputs: n, months: months, points: points, summary: Summary(
            finalNominal: last.nominal, finalReal: last.real, totalContributions: last.contributions, totalGrowth: last.growth,
            monthsToTarget: reached?.month, progress: hasTarget ? last.nominal / n.targetValue : nil))
    }

    private static func finalValue(_ n: Inputs, months: Int) -> Double {
        let rm = monthlyRate(n.expectedAnnualReturnPct)
        var value = n.startingValue
        if months >= 1 { for m in 1...months { value = value * (1 + rm) + contribution(n, month: m) } }
        return value
    }

    /// Monthly contribution needed to reach `target` after `years`; 0 if the starting value already gets there, nil if no months to contribute in.
    public static func requiredMonthlyContribution(target: Double, years: Double, inputs: Inputs) -> Double? {
        var i = inputs; i.years = years; i.targetValue = target
        let n = normalize(i)
        let months = months(for: n.years)
        var zero = n; zero.monthlyContribution = 0
        let base = finalValue(zero, months: months)
        if base >= n.targetValue { return 0 }
        if months == 0 { return nil }
        var one = n; one.monthlyContribution = 1
        let perDollar = finalValue(one, months: months) - base
        return (n.targetValue - base) / perDollar
    }

    /// Months until the target is reached, searching up to 100 years; nil if never or no target.
    public static func monthsToReachTarget(_ input: Inputs) -> Int? {
        let n = normalize(input)
        if n.targetValue <= 0 { return nil }
        if n.startingValue >= n.targetValue { return 0 }
        let rm = monthlyRate(n.expectedAnnualReturnPct)
        var value = n.startingValue
        for m in 1...Int(maxYears) * 12 {
            value = value * (1 + rm) + contribution(n, month: m)
            if value >= n.targetValue { return m }
        }
        return nil
    }

    /// Base return minus and plus `spread` percentage points.
    public static func scenarios(_ input: Inputs, spread: Double = defaultSpread) -> Scenarios {
        let s = nonNegative(spread)
        let r = finite(input.expectedAnnualReturnPct)
        func with(_ rate: Double) -> Inputs { var i = input; i.expectedAnnualReturnPct = rate; return i }
        return Scenarios(spread: s, conservative: project(with(r - s)), base: project(input), optimistic: project(with(r + s)))
    }

    // MARK: Links

    public static let maxMoney = 1e9
    public static let maxRatePct = 30.0

    /// Assumptions carried by a web link such as `/wealth?startingValue=1000&years=20`. Only valid fields are applied; unknown
    /// params are ignored. Mirrors `decodeWealthParams` in the web's link.ts, which treats the query as untrusted.
    public static func apply(link: String, to base: Inputs) -> Inputs? {
        guard let query = URLComponents(string: link)?.queryItems, !query.isEmpty else { return nil }
        var out = base
        var applied = false
        for item in query {
            guard let raw = item.value, raw.range(of: #"^\d{1,12}(\.\d{1,6})?$"#, options: .regularExpression) != nil, let v = Double(raw) else { continue }
            func clamp(_ max: Double) -> Double { Swift.min(max, Swift.max(0, v)) }
            switch item.name {
            case "startingValue": out.startingValue = clamp(maxMoney)
            case "monthlyContribution": out.monthlyContribution = clamp(maxMoney)
            case "annualContributionGrowthPct": out.annualContributionGrowthPct = clamp(maxRatePct)
            case "years": out.years = clamp(maxYears)
            case "expectedAnnualReturnPct": out.expectedAnnualReturnPct = clamp(maxRatePct)
            case "inflationPct": out.inflationPct = clamp(maxRatePct)
            case "targetValue": out.targetValue = clamp(maxMoney)
            default: continue
            }
            applied = true
        }
        return applied ? out : nil
    }
}
