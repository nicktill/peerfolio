This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.

# Google OAuth Setup

## 1. Environment Variables

Update the `.env.local` file with your Google OAuth credentials:

```env
GOOGLE_CLIENT_ID=your-actual-google-client-id
GOOGLE_CLIENT_SECRET=your-actual-google-client-secret
```

## 2. Architecture

### Authentication Flow:
1. **Landing Page**: Users see the "Get Started" button
2. **Google Sign-In**: Clicking triggers Google OAuth flow
3. **Account Creation**: 
   - New users: Automatically creates an account
   - Existing users: Signs them into their existing account
4. **Dashboard**: After sign-in, users are redirected to `/dashboard`

### Features:
- ✅ **User Management**: NextAuth handles user creation/login
- ✅ **Session Management**: Users stay logged in across browser sessions
- ✅ **Security**: Built-in CSRF protection and secure cookies

## 3. Implementation
- `src/app/api/auth/[...nextauth]/route.ts` - NextAuth configuration
- `src/components/auth-provider.tsx` - Session provider wrapper
- `src/app/dashboard/page.tsx` - Protected dashboard page
- `src/app/layout.tsx` - Added AuthProvider
- `src/app/page.tsx` - Added authentication logic
- `src/components/landing-coming-soon.tsx` - Added sign-in buttons
- `.env.local` - Environment variables

### Authentication States:
- **Loading**: Shows spinner while checking authentication
- **Unauthenticated**: Shows landing page with sign-in options
- **Authenticated**: Redirects to dashboard automatically

## 🔧 Troubleshooting

**Common Issues:**
- **"Error: Missing Google OAuth credentials"**: Update your `.env.local` file
- **"Redirect URI mismatch"**: Make sure your Google Console redirect URIs match
- **"API not enabled"**: Enable the Google+ API in Google Cloud Console

## 📁 File Structure

```
src/
├── app/
│   ├── api/auth/[...nextauth]/route.ts  # NextAuth API routes
│   ├── dashboard/page.tsx               # Protected dashboard
│   ├── page.tsx                         # Landing page with auth logic
│   └── layout.tsx                       # Root layout with AuthProvider
└── components/
    ├── auth-provider.tsx                # Session provider
    └── landing-coming-soon.tsx          # Updated with sign-in buttons
```
