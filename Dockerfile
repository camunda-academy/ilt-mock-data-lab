# Pull the WireMock standalone jar from the official image -- we don't run
# this image directly anymore, but we still want its jar + fixture layout.
FROM wiremock/wiremock:3.13.2 AS wiremock

FROM node:20-slim

# WireMock is a JVM app. Copy a pinned, patched JRE (Corretto 21.0.13.1,
# fixes Java4Shell CVE-2026-114938) instead of Debian's default-jre-headless,
# whose patch timing we don't control. Bump tag + digest together.
COPY --from=amazoncorretto:21.0.13-al2023-headless@sha256:5085e890043da2b63af83b0fa7259b90e6687f867db2deed628f1b68c798cadb /usr/lib/jvm/java-21-amazon-corretto /opt/java
ENV JAVA_HOME=/opt/java
ENV PATH="${JAVA_HOME}/bin:${PATH}"

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
