# Repository / Environment Access Requirements

To move from specification to code changes, the coding agent needs one of the following supported paths:

## Preferred
- Source repository URL/connector or uploaded repository archive
- Read/write access to a staging branch
- Staging environment URL
- Staging database credentials or managed migration access
- Existing environment-variable template without production secrets
- Deployment/CI instructions

## Minimum viable
An uploaded source-code archive containing frontend, backend, migrations/schema and package manifests is enough to perform the M0 audit and prepare code patches locally.

## Production access should come later
Production database/server credentials are not needed for initial implementation and should not be shared casually. Use staging first, then deploy through the project's existing controlled release process.

## Useful existing artifacts
If available, include:
- schema dump without sensitive data
- ERD
- .env.example
- Docker Compose/Kubernetes manifests
- CI workflow
- API docs
- test accounts for each role
