# Better Auth Service

Serverless Next.js service that provides OAuth2/OIDC auth flows, JWT issuance, and a sign-in experience for web and API clients. Built with better-auth, Drizzle ORM, and a Turso/libSQL backend.

## Overview

- OAuth2/OIDC endpoints with JWKS exposure
- JWT issuance with rotation support
- Email/password sign-in plus OAuth client flows (confidential + PKCE)
- Drizzle-managed schema targeting Turso/libSQL
- Next.js UI for auth screens and admin-facing flows

## Setup

- Install dependencies: `pnpm install`
- Prepare environment values using the provided example file
- Local development: `pnpm dev`
- Production-like check with Docker Compose (see package scripts such as `d:up`/`d:down`)
- Quality gates: `pnpm lint` and `pnpm build`

## Features

- OIDC provider surface (`authorize`, `token`, `userinfo`, `jwks`) with rotating keys
- ReBAC + ABAC engine: tuple-store graph traversal, transitive relations, Lua policy hooks, and dependency-safe model updates
- API keys treated as first-class subjects: client-scoped issuance, permission checks reuse the same resolver as users
- Webhook system: endpoint/subscription/event/delivery tables with retries, status tracking, and secret management
- Pipeline system: Customizable Lua script execution at 16+ auth lifecycle hooks
  - DAG-based parallel/sequential execution with chain depth (10) and parallel node (5) limits
  - Swimlane Editor with React Flow visualization and straight vertical connectors
  - LSP-style Lua editor: hover docs, autocomplete, diagnostics, signature help, inlay hints
  - Pre-save script validation with blocking error checks
  - OpenTelemetry-compatible trace viewer with waterfall span visualization
  - Sandboxed runtime with instruction limits, SSRF protection, and encrypted secrets
- Repository-driven data layer powering admin/auth flows and keeping queries centralized

## Additional Notes

- Common scripts (seeding, smoke tests, user creation) live under `scripts/`; see `package.json` for the latest commands and arguments
- Architecture and integration notes live in `docs/`
- Keep dependencies in sync with `pnpm-lock.yaml` when updating packages
