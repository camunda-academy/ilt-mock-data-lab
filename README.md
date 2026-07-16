# ilt-mock-data-lab

Shared WireMock-based mock data server for Camunda Academy trainings. One Cloud Run
deployment, serving static JSON fixtures for any training that needs fake data
without a real database.

## Structure

```
wiremock/mappings/<training-name>/*.json
```

Each training gets its own subfolder of WireMock mapping files. Add a new training
by creating a new subfolder — no changes needed to the Dockerfile, Terraform, or CI.

Current trainings:
- `ao-trip-disruption/` — trip/traveler context data for the Trip Disruption
  Recovery use case (Agentic Orchestration ILT)

## Adding fixtures

Drop a new WireMock mapping JSON file into the relevant training subfolder
(see existing files for the request/response shape) and redeploy — no code changes
required.

## Deploy

Cloud Run service + Artifact Registry repository are provisioned by the
`ilt-mock-data-lab` directory in the separate `terraform-dev` repo (one-time
setup / infra changes only — see that repo's README). This repo's `terraform/`
folder is intentionally empty of resources, to avoid two Terraform configs
managing the same GCP resources.

Ongoing fixture/code deployments: Docker image built from this repo, pushed to
Artifact Registry, deployed to Cloud Run via the GitHub Actions workflow in
`.github/workflows/deploy.yml` (`gcloud run deploy`, no Terraform involved).
