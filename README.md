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

Each file is one request/response pair: a `request` matcher (path + query
parameter) and the static `response` to return when it matches. Example
(trimmed from `ao-trip-disruption/trip-context-trip-001.json`):

```json
{
  "request": {
    "method": "GET",
    "urlPathPattern": "/trip-context",
    "queryParameters": {
      "bookingRef": {
        "equalTo": "LH-9F3K2A"
      }
    }
  },
  "response": {
    "status": 200,
    "headers": {
      "Content-Type": "application/json"
    },
    "jsonBody": {
      "tripId": "TRIP-001",
      "travelerId": "TRAV-001",
      "segments": [
        {
          "type": "FLIGHT",
          "carrier": "LH",
          "flightNumber": "LH441",
          "origin": "FRA",
          "destination": "JFK",
          "status": "CANCELLED",
          "bookingRef": "LH-9F3K2A"
        }
      ]
    }
  }
}
```

Served as `GET /trip-context?bookingRef=LH-9F3K2A`. Fixtures are keyed on
`bookingRef` (`equalTo`, so an exact match) — a request with no matching mapping
gets a WireMock 404, which is usually a sign of a typo in the query parameter
rather than a server problem. Keep one scenario per file so each lookup stays
deterministic and gradeable.

## Dynamic dates

Date fields in fixtures use WireMock [response templating](https://wiremock.org/docs/response-templating/)
so trips are always in the future, regardless of when the server is called.
The server is started with `--global-response-templating` (set in `Dockerfile`)
which activates Handlebars evaluation on every response body.

Date values are written as a template + fixed time-of-day string:

```json
"departure": "{{now offset='2 days' format='yyyy-MM-dd'}}T08:10:00+02:00"
```

The `{{now offset='N days'}}` part resolves to today + N days at request time;
the time and timezone suffix are fixed (they reflect the geographic location of
the segment). The caller receives a plain ISO 8601 string — no changes required
on the consumer side.

When adding a new fixture with dates, use relative offsets that keep the primary
disruption event 2–3 days ahead and space dependent segments (hotels, connecting
flights) by their natural day difference from the first segment.

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
