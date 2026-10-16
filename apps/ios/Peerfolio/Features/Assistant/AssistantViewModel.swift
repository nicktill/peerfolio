import SwiftUI
import Observation
import PeerfolioKit

struct ChatTurn: Identifiable, Equatable {
    let id = UUID()
    var role: ChatMessage.Role
    var text: String = ""
    /// What the assistant is doing right now ("Reading your holdings"), shown until text starts.
    var statusLabel: String?
    var visuals: [AssistantVisual] = []
    var xray: XRaySummary?
    var link: (label: String, href: String)?
    var error: String?
    var isStreaming = false

    static func == (a: ChatTurn, b: ChatTurn) -> Bool {
        a.id == b.id && a.text == b.text && a.statusLabel == b.statusLabel && a.visuals == b.visuals && a.xray == b.xray
            && a.link?.href == b.link?.href && a.error == b.error && a.isStreaming == b.isStreaming
    }
}

@MainActor
@Observable
final class AssistantViewModel {
    var turns: [ChatTurn]
    var draft = ""
    var page: AssistantContext.Page
    var entityId: String?
    private(set) var isStreaming = false
    private let client: APIClient?
    private var streamTask: Task<Void, Never>?

    init(client: APIClient?, page: AssistantContext.Page, preset: [ChatTurn] = []) {
        self.client = client; self.page = page; self.turns = preset
    }

    static let suggestions = [
        "How am I doing this month?",
        "What stands out in my portfolio?",
        "How's the market today?",
        "How do I compare with the S&P 500?",
    ]

    var canSend: Bool { !draft.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty && !isStreaming }

    func send(_ text: String? = nil) {
        let content = (text ?? draft).trimmingCharacters(in: .whitespacesAndNewlines)
        guard !content.isEmpty, !isStreaming else { return }
        draft = ""
        Haptics.light()
        turns.append(ChatTurn(role: .user, text: content))
        turns.append(ChatTurn(role: .assistant, statusLabel: "Reading your portfolio", isStreaming: true))
        run()
    }

    func stop() {
        streamTask?.cancel()
        finishStreaming()
    }

    func newChat() {
        stop()
        turns = []
        Haptics.selection()
    }

    func retry() {
        guard !isStreaming, let last = turns.last, last.error != nil else { return }
        turns.removeLast()
        turns.append(ChatTurn(role: .assistant, statusLabel: "Reading your portfolio", isStreaming: true))
        run()
    }

    private func run() {
        guard let client else { return }
        let history = turns.dropLast().compactMap { turn -> ChatMessage? in
            turn.text.isEmpty || turn.error != nil ? nil : ChatMessage(role: turn.role, content: turn.text)
        }
        let request = AssistantRequest(messages: Array(history), context: AssistantContext(page: page, entityId: entityId))
        isStreaming = true
        streamTask = Task { [weak self] in
            do {
                for try await event in client.assistantEvents(request) { self?.apply(event) }
            } catch let error as APIError {
                self?.fail(error.errorDescription ?? "The assistant couldn't finish that.")
            } catch {
                if !(error is CancellationError) { self?.fail("The assistant couldn't finish that.") }
            }
            self?.finishStreaming()
        }
    }

    private func apply(_ event: AssistantEvent) {
        guard !turns.isEmpty else { return }
        let i = turns.count - 1
        switch event {
        case .status(_, let label): if turns[i].text.isEmpty { turns[i].statusLabel = label ?? turns[i].statusLabel }
        case .text(let delta): turns[i].statusLabel = nil; turns[i].text += delta
        case .xray(let summary): turns[i].xray = summary
        case .visual(let visual): if case .unknown = visual {} else { turns[i].visuals.append(visual) }
        case .link(let label, let href): turns[i].link = (label, href)
        case .error(let message): turns[i].error = message; Haptics.error()
        case .done: Haptics.success()
        case .unknown: break
        }
    }

    private func fail(_ message: String) {
        guard !turns.isEmpty else { return }
        turns[turns.count - 1].error = message
        Haptics.error()
    }

    private func finishStreaming() {
        isStreaming = false
        if !turns.isEmpty { turns[turns.count - 1].isStreaming = false; turns[turns.count - 1].statusLabel = nil }
    }
}
