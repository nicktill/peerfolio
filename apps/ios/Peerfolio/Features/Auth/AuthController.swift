import SwiftUI
import Observation
import AuthenticationServices
import CryptoKit
import PeerfolioKit
#if canImport(GoogleSignIn)
import GoogleSignIn
#endif

@MainActor
@Observable
final class AuthController {
    enum State: Equatable {
        case launching
        case signedOut
        case signedIn(SessionUser)
    }

    private(set) var state: State = .launching
    private(set) var isWorking = false
    var errorMessage: String?

    private let client: APIClient
    /// The raw nonce for the Apple request in flight; its SHA-256 went to Apple.
    private var pendingNonce: String?

    init(client: APIClient) { self.client = client }

    var user: SessionUser? { if case .signedIn(let u) = state { return u }; return nil }

    /// Called at launch: a stored session is checked against `/me`, so a deleted account lands on sign-in.
    func restore() async {
        guard await client.session.isSignedIn else { state = .signedOut; return }
        do {
            let me = try await client.me()
            state = .signedIn(SessionUser(id: me.user.id, email: me.user.email, name: me.user.name, image: me.user.image, handle: me.user.handle))
        } catch let error as APIError where error == .unauthenticated {
            state = .signedOut
        } catch {
            // Offline at launch: keep the session and show the app with what we know. Screens surface their own errors.
            state = .signedIn(SessionUser(id: "", email: "", name: nil, image: nil, handle: nil))
        }
    }

    // MARK: Apple

    func prepareApple(_ request: ASAuthorizationAppleIDRequest) {
        let raw = Self.randomNonce()
        pendingNonce = raw
        request.requestedScopes = [.fullName, .email]
        request.nonce = Self.sha256Hex(raw)
    }

    func completeApple(_ result: Result<ASAuthorization, Error>) async {
        switch result {
        case .failure(let error):
            if (error as? ASAuthorizationError)?.code != .canceled { fail("Sign in with Apple didn't finish. Try again.") }
        case .success(let authorization):
            guard let credential = authorization.credential as? ASAuthorizationAppleIDCredential,
                  let tokenData = credential.identityToken, let token = String(data: tokenData, encoding: .utf8),
                  let nonce = pendingNonce else { return fail("Sign in with Apple didn't return what we need. Try again.") }
            let name = credential.fullName.flatMap { PersonNameComponentsFormatter().string(from: $0) }
            await exchange(TokenExchangeRequest(provider: .apple, idToken: token, nonce: nonce, fullName: (name?.isEmpty == false) ? name : nil))
        }
        pendingNonce = nil
    }

    // MARK: Google

    func signInWithGoogle() async {
        #if canImport(GoogleSignIn)
        guard let presenter = Self.topViewController() else { return }
        let nonce = Self.randomNonce()
        isWorking = true
        defer { isWorking = false }
        do {
            let result = try await GIDSignIn.sharedInstance.signIn(withPresenting: presenter, hint: nil, additionalScopes: nil, nonce: nonce)
            guard let token = result.user.idToken?.tokenString else { return fail("Google didn't return what we need. Try again.") }
            await exchange(TokenExchangeRequest(provider: .google, idToken: token, nonce: nonce))
        } catch {
            if (error as NSError).code != GIDSignInError.canceled.rawValue { fail("Google sign-in didn't finish. Try again.") }
        }
        #else
        fail("Google sign-in isn't included in this build.")
        #endif
    }

    // MARK: Session

    private func exchange(_ request: TokenExchangeRequest) async {
        isWorking = true
        defer { isWorking = false }
        do {
            let user = try await client.signIn(request)
            Haptics.success()
            state = .signedIn(user ?? SessionUser(id: "", email: "", name: nil, image: nil, handle: nil))
            errorMessage = nil
        } catch {
            Haptics.error()
            fail((error as? APIError)?.errorDescription ?? "Couldn't sign you in. Try again.")
        }
    }

    func signOut() async {
        await client.session.signOut()
        state = .signedOut
    }

    func deleteAccount() async throws {
        try await client.deleteAccount()
        state = .signedOut
    }

    /// The session manager lost the session (refresh rejected).
    func sessionEnded() {
        if state != .signedOut { state = .signedOut }
    }

    private func fail(_ message: String) { errorMessage = message }

    // MARK: Helpers

    private static func randomNonce(length: Int = 32) -> String {
        var bytes = [UInt8](repeating: 0, count: length)
        precondition(SecRandomCopyBytes(kSecRandomDefault, bytes.count, &bytes) == errSecSuccess)
        return bytes.map { String(format: "%02x", $0) }.joined()
    }

    private static func sha256Hex(_ input: String) -> String {
        SHA256.hash(data: Data(input.utf8)).map { String(format: "%02x", $0) }.joined()
    }

    #if canImport(GoogleSignIn)
    private static func topViewController() -> UIViewController? {
        let scene = UIApplication.shared.connectedScenes.compactMap { $0 as? UIWindowScene }.first { $0.activationState == .foregroundActive }
        var top = scene?.keyWindow?.rootViewController
        while let presented = top?.presentedViewController { top = presented }
        return top
    }
    #endif
}
