import SwiftUI
import PeerfolioKit

enum AppearancePreference: String, CaseIterable, Identifiable {
    case system, light, dark
    var id: String { rawValue }
    var label: String { rawValue.capitalized }
    var scheme: ColorScheme? { switch self { case .system: return nil; case .light: return .light; case .dark: return .dark } }
}

struct SettingsView: View {
    @Environment(AppEnvironment.self) private var env
    @Environment(\.dismiss) private var dismiss
    @AppStorage("appearance") private var appearanceRaw = AppearancePreference.system.rawValue
    @State private var confirmSignOut = false
    @State private var showDelete = false

    private var appearance: Binding<AppearancePreference> {
        Binding(get: { AppearancePreference(rawValue: appearanceRaw) ?? .system }, set: { appearanceRaw = $0.rawValue })
    }

    var body: some View {
        NavigationStack {
            PageScroll {
                profile.reveal(0)
                Panel {
                    PanelHeader("Appearance")
                    HStack {
                        Text("Theme").font(PFFont.body).foregroundStyle(Theme.fg)
                        Spacer()
                        SegmentedPicker(options: AppearancePreference.allCases, selection: appearance) { $0.label }
                    }
                    .padding(Theme.inset)
                }
                .reveal(1)

                Panel {
                    PanelHeader("About")
                    linkRow("Privacy policy", path: "/privacy", first: true)
                    linkRow("Terms of service", path: "/terms")
                    DataRow { Text("Version").font(PFFont.body).foregroundStyle(Theme.fg); Spacer(); Text(Self.version).font(PFFont.mono(12)).foregroundStyle(Theme.fg3) }
                }
                .reveal(2)

                Text("Peerfolio is for tracking and learning, not investment advice. Fantasy leagues use virtual cash only; no real trades are ever placed.")
                    .font(PFFont.caption).foregroundStyle(Theme.fg3).padding(.horizontal, 4)

                VStack(spacing: 10) {
                    Button("Sign out") { Haptics.light(); confirmSignOut = true }.buttonStyle(OutlineButtonStyle())
                    Button("Delete account") { Haptics.warning(); showDelete = true }.buttonStyle(OutlineButtonStyle(destructive: true))
                }
                .reveal(3)
            }
            .navigationTitle("Settings").navigationBarTitleDisplayMode(.inline)
            .toolbar { ToolbarItem(placement: .confirmationAction) { Button("Done") { dismiss() } } }
            .confirmationDialog("Sign out of Peerfolio?", isPresented: $confirmSignOut, titleVisibility: .visible) {
                Button("Sign out", role: .destructive) { Task { dismiss(); await env.auth.signOut() } }
            }
            .sheet(isPresented: $showDelete) { DeleteAccountView().environment(env) }
        }
    }

    private var profile: some View {
        Panel {
            HStack(spacing: 14) {
                Avatar(name: env.auth.user?.name, url: env.auth.user?.image, size: 52)
                VStack(alignment: .leading, spacing: 2) {
                    Text(env.auth.user?.name ?? "Your account").font(PFFont.serif(22)).foregroundStyle(Theme.fg)
                    if let handle = env.auth.user?.handle { Text("@\(handle)").font(PFFont.rowSubtitle).foregroundStyle(Theme.fg3) }
                    if let email = env.auth.user?.email, !email.isEmpty { Text(email).font(PFFont.rowSubtitle).foregroundStyle(Theme.fg3) }
                }
                Spacer()
            }
            .padding(Theme.inset)
        }
    }

    private func linkRow(_ title: String, path: String, first: Bool = false) -> some View {
        Link(destination: env.baseURL.appendingPathComponent(path)) {
            DataRow(first: first) {
                Text(title).font(PFFont.body).foregroundStyle(Theme.fg)
                Spacer()
                Image(systemName: "arrow.up.right").font(.system(size: 11, weight: .semibold)).foregroundStyle(Theme.fg3)
            }
        }
        .buttonStyle(RowPressStyle())
    }

    private static var version: String {
        let v = Bundle.main.object(forInfoDictionaryKey: "CFBundleShortVersionString") as? String ?? "1.0"
        let b = Bundle.main.object(forInfoDictionaryKey: "CFBundleVersion") as? String ?? "1"
        return "\(v) (\(b))"
    }
}

/// In-app account deletion (App Store guideline 5.1.1(v)): calls `DELETE /api/me`, which removes the account, its
/// data, brokerage connections and mobile sessions.
struct DeleteAccountView: View {
    @Environment(AppEnvironment.self) private var env
    @Environment(\.dismiss) private var dismiss
    @State private var confirmation = ""
    @State private var working = false
    @State private var error: String?

    var body: some View {
        NavigationStack {
            PageScroll {
                PageHead("Delete account", lede: "This permanently deletes your Peerfolio account, portfolio history, leagues you own that have no other members, fantasy results and connected brokerages. It cannot be undone.")
                Panel {
                    VStack(alignment: .leading, spacing: 10) {
                        Text("Type DELETE to confirm").eyebrow()
                        TextField("DELETE", text: $confirmation)
                            .textFieldStyle(PFTextFieldStyle())
                            .textInputAutocapitalization(.characters).autocorrectionDisabled()
                        if let error { Text(error).font(PFFont.caption).foregroundStyle(Theme.loss) }
                    }
                    .padding(Theme.inset)
                }
                Button {
                    Task { await delete() }
                } label: { Text(working ? "Deleting..." : "Permanently delete my account") }
                    .buttonStyle(OutlineButtonStyle(destructive: true))
                    .disabled(confirmation != "DELETE" || working)
                Text("If you signed in with Apple, you can also remove Peerfolio under Settings > Apple Account > Sign in with Apple.")
                    .font(PFFont.caption).foregroundStyle(Theme.fg3)
            }
            .navigationBarTitleDisplayMode(.inline)
            .toolbar { ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() } } }
        }
    }

    private func delete() async {
        working = true; error = nil
        do {
            try await env.auth.deleteAccount()
            Haptics.success()
        } catch {
            Haptics.error()
            self.error = (error as? APIError)?.errorDescription ?? "Couldn't delete your account. Try again."
        }
        working = false
    }
}

#Preview("Settings") { SettingsView().environment(PreviewSupport.environment) }
#Preview("Delete") { DeleteAccountView().environment(PreviewSupport.environment).preferredColorScheme(.dark) }
