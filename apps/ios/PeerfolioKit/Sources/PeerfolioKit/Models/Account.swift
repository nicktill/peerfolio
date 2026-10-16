import Foundation

public struct SessionUser: Codable, Equatable, Sendable, Identifiable {
    public var id: String
    public var email: String
    public var name: String?
    public var image: String?
    public var handle: String?
    public init(id: String, email: String, name: String?, image: String?, handle: String?) {
        self.id = id; self.email = email; self.name = name; self.image = image; self.handle = handle
    }
}

/// Body for `POST /api/mobile/auth/token`.
public struct TokenExchangeRequest: Codable, Equatable, Sendable {
    public enum Provider: String, Codable, Sendable { case apple, google }
    public var provider: Provider
    public var idToken: String
    /// The raw nonce; its SHA-256 went to the provider.
    public var nonce: String
    public var fullName: String?
    /// Apple only: the one-time authorization code, so the server can revoke Apple's token when the account is deleted.
    public var authorizationCode: String?
    public init(provider: Provider, idToken: String, nonce: String, fullName: String? = nil, authorizationCode: String? = nil) {
        self.provider = provider; self.idToken = idToken; self.nonce = nonce; self.fullName = fullName; self.authorizationCode = authorizationCode
    }
}

/// Body for `POST /api/mobile/auth/review` (App Review's sign-in; the route answers 404 unless the server enables it).
public struct ReviewSignInRequest: Codable, Equatable, Sendable {
    public var email: String
    public var code: String
    public init(email: String, code: String) { self.email = email; self.code = code }
}

/// Body for `POST /api/mobile/devices` (push groundwork).
public struct RegisterDeviceRequest: Codable, Equatable, Sendable {
    public enum Environment: String, Codable, Sendable { case sandbox, production }
    public var token: String
    public var environment: Environment
    public init(token: String, environment: Environment) { self.token = token; self.environment = environment }
}

/// Reply from `/api/mobile/auth/token` (with `user`) and `/api/mobile/auth/refresh` (without).
public struct AuthSessionResponse: Codable, Equatable, Sendable {
    public var accessToken: String
    public var refreshToken: String
    public var tokenType: String
    public var expiresIn: Int
    public var refreshExpiresAt: String
    public var user: SessionUser?
}

/// `GET /api/me`
public struct MeResponse: Codable, Equatable, Sendable {
    public var user: Profile
    public var stats: Stats

    public struct Profile: Codable, Equatable, Sendable, Identifiable {
        public var id: String
        public var email: String
        public var name: String?
        public var image: String?
        public var handle: String?
        public var bio: String?
        public var isPublic: Bool
    }
    public struct Stats: Codable, Equatable, Sendable {
        public var snapshotDays: Int
        public var followers: Int
    }
}

/// Body for `PATCH /api/me`; nil fields are omitted.
public struct UpdateMeRequest: Codable, Equatable, Sendable {
    public var handle: String?
    public var bio: String?
    public var isPublic: Bool?
    public init(handle: String? = nil, bio: String? = nil, isPublic: Bool? = nil) { self.handle = handle; self.bio = bio; self.isPublic = isPublic }
}
