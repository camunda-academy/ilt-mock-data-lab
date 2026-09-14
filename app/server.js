/**
 * Entry point for the ilt-mock-data-lab Cloud Run service.
 *
 * Fronts two things behind a single public port:
 *  - POST /check-consistency: real logic (see consistencyService.js), no
 *    fixture data involved.
 *  - Everything else: proxied to an internal WireMock process serving the
 *    static per-training JSON fixtures (wiremock/mappings/<training>/*.json),
 *    unchanged from before.
 */

const { spawn } = require('child_process');
const express = require('express');
const { createProxyMiddleware } = require('http-proxy-middleware');
const { checkConsistency } = require('./consistencyService');

const PORT = process.env.PORT || 8080;
const WIREMOCK_PORT = 8081;
const WIREMOCK_JAR = '/var/wiremock/lib/wiremock-standalone.jar';
const WIREMOCK_ROOT = '/home/wiremock';

function startWiremock() {
  const wiremock = spawn(
    'java',
    [
      '-jar',
      WIREMOCK_JAR,
      '--port',
      String(WIREMOCK_PORT),
      '--root-dir',
      WIREMOCK_ROOT,
      '--global-response-templating'
    ],
    { stdio: 'inherit' }
  );

  wiremock.on('exit', (code) => {
    console.error(`WireMock process exited with code ${code}, shutting down.`);
    process.exit(code ?? 1);
  });

  return wiremock;
}

function isValidSegments(segments) {
  return Array.isArray(segments) && segments.every((s) => s && typeof s === 'object');
}

function main() {
  startWiremock();

  const app = express();
  app.use(express.json());

  app.post('/check-consistency', (req, res) => {
    const { segments, minConnectionMinutes } = req.body ?? {};

    if (!isValidSegments(segments)) {
      res.status(400).json({ error: '"segments" must be an array of segment objects.' });
      return;
    }

    if (minConnectionMinutes !== undefined && typeof minConnectionMinutes !== 'number') {
      res.status(400).json({ error: '"minConnectionMinutes" must be a number when provided.' });
      return;
    }

    const result = checkConsistency({ segments, minConnectionMinutes });
    res.status(200).json(result);
  });

  // Everything else (fixture endpoints like /trip-context, /traveler-profile)
  // is served by the internal WireMock instance, unchanged.
  app.use(
    createProxyMiddleware({
      target: `http://127.0.0.1:${WIREMOCK_PORT}`,
      changeOrigin: false
    })
  );

  app.listen(PORT, () => {
    console.log(`ilt-mock-data-lab listening on port ${PORT} (WireMock internal on ${WIREMOCK_PORT})`);
  });
}

main();
