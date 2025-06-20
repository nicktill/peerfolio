# Peerfolio
<img width="1727" alt="Screenshot 2025-06-20 at 11 58 45 AM" src="https://github.com/user-attachments/assets/0e1ca293-afce-4f64-828a-008dce7a15b1" />
Peerfolio is a social investing platform that lets users track their portfolios, compare performance with friends, and grow wealth together. Connect accounts, join groups, and invest transparently in a community-driven way.

# Dashboard View
<img width="1723" alt="Screenshot 2025-06-20 at 12 01 47 PM" src="https://github.com/user-attachments/assets/aba0d3b2-5aab-417b-81e2-15bc177bf61c" />
<img width="1049" alt="Screenshot 2025-06-20 at 12 02 37 PM" src="https://github.com/user-attachments/assets/5da76ab3-d3cc-44c5-84d4-65f5cc2af67d" />

## Dark Mode
<img width="1728" alt="Screenshot 2025-06-20 at 12 02 56 PM" src="https://github.com/user-attachments/assets/a60be7e2-cf2e-4b1b-bff8-0741cb4d86ff" />
<img width="1728" alt="Screenshot 2025-06-20 at 12 03 05 PM" src="https://github.com/user-attachments/assets/6254a182-d807-488e-b0bf-d6cf373583d2" />



# Turborepo starter

This Turborepo starter is maintained by the Turborepo core team.

## Using this example

Run the following command:

```sh
npx create-turbo@latest
```

## What's inside?

This Turborepo includes the following packages/apps:

### Apps and Packages

- `docs`: a [Next.js](https://nextjs.org/) app
- `web`: another [Next.js](https://nextjs.org/) app
- `@repo/ui`: a stub React component library shared by both `web` and `docs` applications
- `@repo/eslint-config`: `eslint` configurations (includes `eslint-config-next` and `eslint-config-prettier`)
- `@repo/typescript-config`: `tsconfig.json`s used throughout the monorepo

Each package/app is 100% [TypeScript](https://www.typescriptlang.org/).

### Utilities

This Turborepo has some additional tools already setup for you:

- [TypeScript](https://www.typescriptlang.org/) for static type checking
- [ESLint](https://eslint.org/) for code linting
- [Prettier](https://prettier.io) for code formatting

### Build

To build all apps and packages, run the following command:

```
cd my-turborepo
pnpm build
```

### Develop

To develop all apps and packages, run the following command:

```
cd my-turborepo
pnpm dev
```

### Remote Caching

> [!TIP]
> Vercel Remote Cache is free for all plans. Get started today at [vercel.com](https://vercel.com/signup?/signup?utm_source=remote-cache-sdk&utm_campaign=free_remote_cache).

Turborepo can use a technique known as [Remote Caching](https://turborepo.com/docs/core-concepts/remote-caching) to share cache artifacts across machines, enabling you to share build caches with your team and CI/CD pipelines.

By default, Turborepo will cache locally. To enable Remote Caching you will need an account with Vercel. If you don't have an account you can [create one](https://vercel.com/signup?utm_source=turborepo-examples), then enter the following commands:

```
cd my-turborepo
npx turbo login
```

This will authenticate the Turborepo CLI with your [Vercel account](https://vercel.com/docs/concepts/personal-accounts/overview).

Next, you can link your Turborepo to your Remote Cache by running the following command from the root of your Turborepo:

```
npx turbo link
```

## Useful Links

Learn more about the power of Turborepo:

- [Tasks](https://turborepo.com/docs/crafting-your-repository/running-tasks)
- [Caching](https://turborepo.com/docs/crafting-your-repository/caching)
- [Remote Caching](https://turborepo.com/docs/core-concepts/remote-caching)
- [Filtering](https://turborepo.com/docs/crafting-your-repository/running-tasks#using-filters)
- [Configuration Options](https://turborepo.com/docs/reference/configuration)
- [CLI Usage](https://turborepo.com/docs/reference/command-line-reference)
