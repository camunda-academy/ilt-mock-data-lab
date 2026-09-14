# ilt-mock-data-lab

Shared mock data server for Camunda Academy trainings. One Cloud Run deployment
serving:
- static JSON fixtures (via an internal WireMock instance) for any training that
  needs fake data without a real database, and
- real, non-fixture logic where a training's process needs an actual computation
  rather than a canned answer (e.g. `/check-consistency`, see below).

A small Node/Express app (`app/`) is the container's public entry point: it
handles a couple of real endpoints itself and reverse-proxies everything else to
WireMock running internally on a private port. See [Architecture](#architecture).

## Structure

```
wiremock/mappings/<training-name>/*.json
```

Each training gets its own subfolder of WireMock mapping files. Add a new training
by creating a new subfolder — no changes needed to the Dockerfile, Terraform, or CI.

Current trainings:
- `ao-trip-disruption/` — trip/traveler context data for the Trip Disruption
  Recovery use case (Agentic Orchestration ILT)

## Real endpoints (not fixtures)

### `POST /check-consistency`

Checks that a set of itinerary segments (as re-woven by the AI agent after a
disruption) are chronologically consistent: no segment starts before the
previous one ends, and connections leave at least a minimum buffer. This is a
pure computation over whatever segments the caller passes in — it does not read
trip data itself, so it can't be a static fixture; the whole point is that it
reacts to whatever itinerary the agent actually proposes.

Ported from the `check_trip_consistency` MCP tool in `mcp-travel-agency`
(`src/services/ConsistencyService.ts`) so the BPMN process can call it directly
over HTTP instead of via the MCP connector — logic and behavior are identical.

Request body:

```json
{
  "segments": [
    {
      "type": "TRAIN",
      "bookingRef": "ES-58120C",
      "departure": "2026-09-10T07:31:00+01:00",
      "arrival": "2026-09-10T14:47:00+02:00"
    },
    {
      "type": "HOTEL",
      "bookingRef": "HLM-20847",
      "checkIn": "2026-09-10T15:00:00+02:00",
      "checkOut": "2026-09-13T11:00:00+02:00"
    }
  ],
  "minConnectionMinutes": 45
}
```

- `segments`: required array, one entry per itinerary segment (`FLIGHT`, `TRAIN`,
  `HOTEL`, `CAR`, `TRANSFER`, `CRUISE`, `LIFT_PASS`). Use `departure`/`arrival` for
  FLIGHT/TRAIN, `checkIn`/`checkOut` for HOTEL, `pickupDate` for CAR/TRANSFER,
  `departureDate` for CRUISE. Order doesn't matter — segments are sorted by start
  time before checking.
- `minConnectionMinutes`: optional, defaults to `45`.

Response body:

```json
{
  "consistent": false,
  "segmentsChecked": 2,
  "issues": [
    {
      "type": "INSUFFICIENT_CONNECTION_TIME",
      "fromBookingRef": "ES-58120C",
      "toBookingRef": "HLM-20847",
      "detail": "Only 13 min between TRAIN ES-58120C ending and HOTEL HLM-20847 starting (minimum 45 min)."
    }
  ]
}
```

`issues[].type` is one of `OVERLAP`, `INSUFFICIENT_CONNECTION_TIME`, or
`UNPARSEABLE_DATES` (missing/invalid date fields on a segment).

## Architecture

The container runs one Node process (`app/server.js`) as its entry point, which
in turn spawns WireMock as an internal child process:

```
Cloud Run container
  Node/Express (port 8080, public)
  ├─ POST /check-consistency  -> real logic (app/consistencyService.js)
  └─ *                        -> reverse-proxied to WireMock (127.0.0.1:8081)

  WireMock (port 8081, internal only, not exposed outside the container)
  └─ static fixtures, unchanged (wiremock/mappings/<training>/*.json)
```

This keeps a single Cloud Run service, a single public URL, and the existing
CI/Terraform setup untouched, while allowing real (non-fixture) logic to live
alongside the static data for trainings that need it. If a training needs its
own real endpoint, add it as another route in `app/server.js` before the
catch-all proxy.

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
WireMock is started (by `app/server.js`) with `--global-response-templating`
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
