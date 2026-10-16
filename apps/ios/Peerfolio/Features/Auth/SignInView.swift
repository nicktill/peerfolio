import SwiftUI
import AuthenticationServices

struct SignInView: View {
    @Environment(AppEnvironment.self) private var env
    @Environment(\.colorScheme) private var scheme
    @State private var showReview = false

    var body: some View {
        let auth = env.auth
        VStack(spacing: 0) {
            Spacer(minLength: 40)
            VStack(alignment: .leading, spacing: 14) {
                HStack(spacing: 10) {
                    Image("Logo").resizable().scaledToFit().frame(width: 30, height: 30)
                    Text("Peerfolio").font(PFFont.serif(26)).tracking(-0.5).foregroundStyle(Theme.fg)
                }
                .reveal(0)
                Text("Your portfolio,\nwith friends.").font(PFFont.serif(40)).tracking(-1.2).foregroundStyle(Theme.fg).lineSpacing(2).reveal(1)
                Text("Track what you own, compare returns with people you trust, and play fantasy leagues with virtual cash.")
                    .font(PFFont.body).foregroundStyle(Theme.fg2).reveal(2)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(.horizontal, 24)

            Spacer(minLength: 32)

            VStack(spacing: 12) {
                SignInWithAppleButton(.signIn) { request in
                    auth.prepareApple(request)
                } onCompletion: { result in
                    Task { await auth.completeApple(result) }
                }
                .signInWithAppleButtonStyle(scheme == .dark ? .white : .black)
                .frame(height: 48)
                .clipShape(RoundedRectangle(cornerRadius: Theme.controlRadius, style: .continuous))

                Button {
                    Task { await auth.signInWithGoogle() }
                } label: {
                    HStack(spacing: 8) {
                        Image(systemName: "g.circle.fill")
                        Text("Continue with Google")
                    }
                }
                .buttonStyle(OutlineButtonStyle())

                if let message = auth.errorMessage {
                    Text(message).font(PFFont.caption).foregroundStyle(Theme.loss).multilineTextAlignment(.center)
                        .transition(.opacity)
                }
            }
            .padding(.horizontal, 24)
            .disabled(auth.isWorking)
            .opacity(auth.isWorking ? 0.6 : 1)
            .reveal(3)

            Button("Have a review code?") { showReview = true }
                .font(PFFont.mono(11)).tracking(0.4).foregroundStyle(Theme.fg3)
                .frame(minHeight: 44)

            Text("Peerfolio is for tracking and learning. It isn't investment advice, and fantasy leagues use virtual cash only. No real trades are ever placed.")
                .font(PFFont.caption).foregroundStyle(Theme.fg3).multilineTextAlignment(.center)
                .padding(.horizontal, 32).padding(.top, 20).padding(.bottom, 16)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(Theme.bg.ignoresSafeArea())
        .animation(Motion.ease(), value: auth.errorMessage)
        .sheet(isPresented: $showReview) { ReviewSignInSheet().environment(env) }
    }
}

/// For App Store review only: the server rejects it unless it has been switched on for the review period.
struct ReviewSignInSheet: View {
    @Environment(AppEnvironment.self) private var env
    @Environment(\.dismiss) private var dismiss
    @State private var email = ""
    @State private var code = ""
    @State private var error: String?

    var body: some View {
        NavigationStack {
            PageScroll {
                PageHead("Review sign-in", lede: "Enter the email and code from the App Review notes.")
                TextField("Email", text: $email).textFieldStyle(PFTextFieldStyle())
                    .keyboardType(.emailAddress).textInputAutocapitalization(.never).autocorrectionDisabled()
                SecureField("Code", text: $code).textFieldStyle(PFTextFieldStyle())
                if let error { Text(error).font(PFFont.caption).foregroundStyle(Theme.loss) }
                Button("Sign in") {
                    Task {
                        error = await env.auth.reviewSignIn(email: email, code: code)
                        if error == nil { dismiss() }
                    }
                }
                .buttonStyle(PrimaryButtonStyle())
                .disabled(email.isEmpty || code.isEmpty || env.auth.isWorking)
            }
            .toolbar { ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() } } }
            .navigationBarTitleDisplayMode(.inline)
        }
        .presentationDetents([.medium])
    }
}

#Preview("Sign in, light") { SignInView().environment(PreviewSupport.environment) }
#Preview("Sign in, dark") { SignInView().environment(PreviewSupport.environment).preferredColorScheme(.dark) }
