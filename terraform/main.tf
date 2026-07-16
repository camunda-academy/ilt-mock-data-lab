# Infrastructure for this service is now managed in the terraform-dev repo,
# under terraform-dev/ilt-mock-data-lab/ (Cloud Run service, Artifact
# Registry repository, service account). See that directory's README for
# how to provision/update infrastructure.
#
# This directory intentionally defines no resources, to avoid two Terraform
# configs managing the same GCP resources (ilt-mock-data-lab Cloud Run
# service + Artifact Registry repo) and colliding on apply.
