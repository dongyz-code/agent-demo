# Repository Guidelines

## Project Structure & Module Organization

This is a pnpm/Turbo monorepo. Applications live in `apps/`: `apps/client` is a React/Vite client, `apps/admin` is a Vue/Vite admin app, and `apps/server` is a TypeScript Node service. Shared packages live in `packages/`, including `types`, `ui`, `configs`, `openid`, `scripts`, and utilities under `packages/utils/*`. Source code is under each package's `src/`; assets are in `src/assets`, `src/static`, or `apps/server/static`. Do not edit generated `dist/`, `build/`, `.turbo/`, or `node_modules/`.

## Build, Test, and Development Commands

Use Node `>=20.19` and pnpm `11.7.0`.

- `pnpm install` installs workspace dependencies.
- `pnpm turbo build` builds workspace packages in dependency order.
- `pnpm turbo lint` runs package lint/typecheck tasks.
- `pnpm --filter @repo/deploy-client dev` starts the React client.
- `pnpm --filter @repo/deploy-admin dev` starts the Vue admin app.
- `pnpm --filter @repo/deploy-server dev` starts the server with `tsx`.
- `pnpm --filter @repo/deploy-client test` runs Vitest.
- `pnpm --filter @repo/deploy-server db:generate` and `db:migrate` handle Drizzle schema changes.
- `pnpm pkg:sort` sorts workspace `package.json` files after dependency edits.

## Coding Style & Naming Conventions

Use TypeScript ESM, two-space indentation, single quotes, and semicolons. Prefer `@` aliases inside apps and `@repo/*` for workspace imports. Use `PascalCase` for React/Vue components and exported types, `camelCase` for functions and variables, and dotted lowercase route names where established, such as `sys.user`. ESLint flat configs come from `@repo/eslint-config`; many `lint` scripts also run `tsc`, `vue-tsc`, or builds.

New or modified comments must use Chinese unless preserving external API names, protocol fields, library types, or error codes. When adding or changing functions, methods, classes, hooks, exported constants, interfaces, type aliases, generic parameters, function parameters, return values, or type fields, add clear Chinese TSDoc or property comments. Comments should explain purpose, input meaning, return value, side effects, constraints, and non-obvious business rules where relevant. Avoid empty translation-style comments that only restate the identifier, such as "sets the value"; prefer comments that help future maintainers understand why the code exists and how it should be used.

## Testing Guidelines

The active test setup is in `apps/client` with Vitest, jsdom, Testing Library, and `apps/client/src/test/setup.ts`. Add tests near covered code using `*.test.ts` or `*.test.tsx`. Run `pnpm --filter @repo/deploy-client test` for client tests and `pnpm turbo lint` before handoff. There is no enforced coverage target; add focused tests for changed behavior and edge cases.

## Commit & Pull Request Guidelines

Git history follows Conventional Commit style, for example `feat: init`. Keep commits short, imperative, and scoped when useful, such as `fix(client): handle api errors`. Pull requests should describe the change, list validation commands, link issues or OpenSpec changes, and include screenshots for UI changes. Mention migrations, generated routes, or dependency changes explicitly.

## Agent-Specific Notes

For client routes, update `apps/client/src/router/routes.tsx` and route types together. Declare page components with `lazyRouteComponent` and dynamic imports. Put route metadata in `meta`, and use helpers from `apps/client/src/router/methods.ts` for navigation instead of hand-built URLs.
