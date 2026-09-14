# Pull the WireMock standalone jar from the official image -- we don't run
# this image directly anymore, but we still want its jar + fixture layout.
FROM wiremock/wiremock:3.13.2 AS wiremock

FROM node:20-slim

# WireMock is a JVM app; install a headless JRE alongside Node so both the
# proxy/logic app and WireMock itself run in the same container.
RUN apt-get update \
    && apt-get install -y --no-install-recommends default-jre-headless \
    && rm -rf /var/lib/apt/lists/*

COPY --from=wiremock /var/wiremock/lib/wiremock-standalone.jar /var/wiremock/lib/wiremock-standalone.jar

# Copy all trainings' mappings into the default WireMock directory.
# Each training keeps its own subfolder under wiremock/mappings/<training-name>/.
COPY ./wiremock/mappings /home/wiremock/mappings

WORKDIR /app
COPY app/package.json app/package-lock.json ./
RUN npm ci --omit=dev
COPY app/ ./

EXPOSE 8080

# server.js listens on $PORT (8080) and spawns WireMock internally on 8081;
# real logic (e.g. /check-consistency) is handled directly, everything else
# is proxied through to WireMock's static fixtures.
CMD ["node", "server.js"]
