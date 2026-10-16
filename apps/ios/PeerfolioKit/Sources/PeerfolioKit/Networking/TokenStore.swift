import Foundation

public struct StoredTokens: Codable, Equatable, Sendable {
    public var accessToken: String
    public var refreshToken: String
    public var accessExpiresAt: Date
    public init(accessToken: String, refreshToken: String, accessExpiresAt: Date) {
        self.accessToken = accessToken; self.refreshToken = refreshToken; self.accessExpiresAt = accessExpiresAt
    }
}

/// Where the session lives between launches. The app uses the Keychain; tests use memory.
public protocol TokenStore: Sendable {
    func load() -> StoredTokens?
    func save(_ tokens: StoredTokens)
    func clear()
}

public final class InMemoryTokenStore: TokenStore, @unchecked Sendable {
    private let lock = NSLock()
    private var tokens: StoredTokens?
    public init(_ tokens: StoredTokens? = nil) { self.tokens = tokens }
    public func load() -> StoredTokens? { lock.lock(); defer { lock.unlock() }; return tokens }
    public func save(_ tokens: StoredTokens) { lock.lock(); self.tokens = tokens; lock.unlock() }
    public func clear() { lock.lock(); tokens = nil; lock.unlock() }
}

#if canImport(Security)
import Security

/// Keychain-backed storage. `kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly` keeps tokens out of backups and
/// readable by background refreshes after the first unlock.
public struct KeychainTokenStore: TokenStore {
    private let service: String
    private let account = "session"

    public init(service: String = "org.peerfolio.app.session") { self.service = service }

    private var query: [String: Any] {
        [kSecClass as String: kSecClassGenericPassword, kSecAttrService as String: service, kSecAttrAccount as String: account]
    }

    public func load() -> StoredTokens? {
        var q = query
        q[kSecReturnData as String] = true
        q[kSecMatchLimit as String] = kSecMatchLimitOne
        var out: CFTypeRef?
        guard SecItemCopyMatching(q as CFDictionary, &out) == errSecSuccess, let data = out as? Data else { return nil }
        return try? JSONDecoder().decode(StoredTokens.self, from: data)
    }

    public func save(_ tokens: StoredTokens) {
        guard let data = try? JSONEncoder().encode(tokens) else { return }
        SecItemDelete(query as CFDictionary)
        var q = query
        q[kSecValueData as String] = data
        q[kSecAttrAccessible as String] = kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly
        SecItemAdd(q as CFDictionary, nil)
    }

    public func clear() { SecItemDelete(query as CFDictionary) }
}
#endif
