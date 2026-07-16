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

### CI authentication

The workflow authenticates to GCP via Workload Identity Federation (no
long-lived service account key), using `google-github-actions/auth@v2`. This
requires the following repo secrets to be set (Settings -> Secrets and
variables -> Actions):

- `GCP_WORKLOAD_IDENTITY_PROVIDER` -- the full WIF provider resource name,
  e.g. `projects/<project-number>/locations/global/workloadIdentityPools/github/providers/github`
- `GCP_SERVICE_ACCOUNT` -- `github-actions@<project-id>.iam.gserviceaccount.com`
- `GCP_PROJECT_ID`
- `GCP_REGION`
- `ARTIFACT_REPOSITORY_ID`

The WIF binding that allows this repo to assume the service account is
provisioned by `terraform-dev/infrastructure` (`github_repos` variable must
include `ilt-mock-data-lab`) -- see that repo for the one-time setup.
