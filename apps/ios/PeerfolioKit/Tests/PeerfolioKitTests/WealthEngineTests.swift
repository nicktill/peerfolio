import XCTest
@testable import PeerfolioKit

/// Reference numbers come from running the web's engine.ts on the same inputs, so the two implementations stay in step.
final class WealthEngineTests: XCTestCase {
    private let input = Wealth.Inputs(startingValue: 10_000, monthlyContribution: 500, annualContributionGrowthPct: 3, years: 20,
                                      expectedAnnualReturnPct: 7, inflationPct: 2.5, targetValue: 500_000)

    func testProjectionMatchesTheWebEngine() {
        let p = Wealth.project(input)
        XCTAssertEqual(p.points.count, 241)
        XCTAssertEqual(p.summary.finalNominal, 358_042.4663985319, accuracy: 0.01)
        XCTAssertEqual(p.summary.finalReal, 218_502.91355253334, accuracy: 0.01)
        XCTAssertEqual(p.summary.totalContributions, 161_222.24693388274, accuracy: 0.01)
        XCTAssertNil(p.summary.monthsToTarget)
        XCTAssertEqual(p.summary.progress!, 0.7160849327970639, accuracy: 1e-9)
    }

    func testRequiredContributionAndMonthsToTarget() {
        var base = input; base.monthlyContribution = 0
        XCTAssertEqual(Wealth.requiredMonthlyContribution(target: 1_000_000, years: 25, inputs: base)!, 916.5865641757001, accuracy: 0.001)
        var goal = input; goal.targetValue = 1_000_000
        XCTAssertEqual(Wealth.monthsToReachTarget(goal), 379)
    }

    func testScenariosSpreadTheReturn() {
        let s = Wealth.scenarios(input)
        XCTAssertEqual(s.conservative.summary.finalNominal, 286_462.01807470596, accuracy: 0.01)
        XCTAssertEqual(s.optimistic.summary.finalNominal, 451_298.28525208065, accuracy: 0.01)
    }

    func testBadInputsNeverCrash() {
        let p = Wealth.project(Wealth.Inputs(startingValue: -5, monthlyContribution: .nan, annualContributionGrowthPct: -500, years: 0, expectedAnnualReturnPct: .infinity, inflationPct: 0))
        XCTAssertEqual(p.points.count, 1)
        XCTAssertEqual(p.summary.finalNominal, 0)
        XCTAssertNil(Wealth.requiredMonthlyContribution(target: 1000, years: 0, inputs: Wealth.Inputs()))
        XCTAssertNil(Wealth.monthsToReachTarget(Wealth.Inputs()))
        XCTAssertEqual(Wealth.project(Wealth.Inputs(years: 1000)).months, 1200)
    }

    func testLinksApplyOnlyValidClampedFields() {
        let base = Wealth.Inputs()
        let applied = Wealth.apply(link: "/wealth?startingValue=25000&years=500&expectedAnnualReturnPct=abc&inflationPct=99&bogus=1", to: base)!
        XCTAssertEqual(applied.startingValue, 25_000)
        XCTAssertEqual(applied.years, 100, "clamped to the maximum")
        XCTAssertEqual(applied.expectedAnnualReturnPct, base.expectedAnnualReturnPct, "invalid values are dropped, not zeroed")
        XCTAssertEqual(applied.inflationPct, 30)
        XCTAssertNil(Wealth.apply(link: "/wealth", to: base))
        XCTAssertNil(Wealth.apply(link: "/wealth?years=-3&monthlyContribution=1e9", to: base))
    }
}
