FROM wiremock/wiremock:3.13.2

# Copy all trainings' mappings into the default WireMock directory.
# Each training keeps its own subfolder under wiremock/mappings/<training-name>/.
COPY ./wiremock/mappings /home/wiremock/mappings

EXPOSE 8080
