/**
 * Consistency check logic.
 *
 * Checks that a set of itinerary segments (as re-woven by the AI agent after
 * a disruption) are chronologically consistent with each other: no segment
 * starts before the previous one ends, and connections leave at least a
 * minimum buffer. Pure function over the segments it's given -- it does not
 * fetch trip data itself.
 *
 * Ported from mcp-travel-agency's src/services/ConsistencyService.ts so the
 * BPMN process can call this logic directly over HTTP instead of via the MCP
 * connector.
 */

const DEFAULT_MIN_CONNECTION_MINUTES = 45;

/**
 * Resolves a segment's start/end instants based on its type's date fields.
 * Point-in-time segments (car/transfer/cruise) are treated as zero-duration
 * windows (start === end) so they still participate in ordering checks.
 */
function resolveWindow(segment) {
  const startRaw = segment.departure ?? segment.checkIn ?? segment.pickupDate ?? segment.departureDate;
  const endRaw = segment.arrival ?? segment.checkOut ?? segment.pickupDate ?? segment.departureDate;

  if (!startRaw || !endRaw) {
    return null;
  }

  const start = new Date(startRaw);
  const end = new Date(endRaw);

  if (isNaN(start.getTime()) || isNaN(end.getTime())) {
    return null;
  }

  return { segment, start, end };
}

/**
 * Checks chronological consistency across the given segments.
 * Segments are sorted by start time before checking; this makes the check
 * independent of the order the caller passes them in.
 */
function checkConsistency({ segments, minConnectionMinutes = DEFAULT_MIN_CONNECTION_MINUTES }) {
  const issues = [];
  const windows = [];

  for (const segment of segments) {
    const window = resolveWindow(segment);
    if (!window) {
      issues.push({
        type: 'UNPARSEABLE_DATES',
        fromBookingRef: segment.bookingRef ?? 'UNKNOWN',
        toBookingRef: segment.bookingRef ?? 'UNKNOWN',
        detail: `Segment ${segment.bookingRef ?? 'UNKNOWN'} (${segment.type}) has missing or unparseable date fields.`
      });
      continue;
    }
    windows.push(window);
  }

  windows.sort((a, b) => a.start.getTime() - b.start.getTime());

  for (let i = 1; i < windows.length; i++) {
    const previous = windows[i - 1];
    const current = windows[i];

    const gapMinutes = (current.start.getTime() - previous.end.getTime()) / (1000 * 60);

    if (gapMinutes < 0) {
      issues.push({
        type: 'OVERLAP',
        fromBookingRef: previous.segment.bookingRef,
        toBookingRef: current.segment.bookingRef,
        detail: `${current.segment.type} ${current.segment.bookingRef} starts ${Math.abs(Math.round(gapMinutes))} min before ${previous.segment.type} ${previous.segment.bookingRef} ends.`
      });
    } else if (gapMinutes < minConnectionMinutes) {
      issues.push({
        type: 'INSUFFICIENT_CONNECTION_TIME',
        fromBookingRef: previous.segment.bookingRef,
        toBookingRef: current.segment.bookingRef,
        detail: `Only ${Math.round(gapMinutes)} min between ${previous.segment.type} ${previous.segment.bookingRef} ending and ${current.segment.type} ${current.segment.bookingRef} starting (minimum ${minConnectionMinutes} min).`
      });
    }
  }

  return {
    consistent: issues.length === 0,
    segmentsChecked: segments.length,
    issues
  };
}

module.exports = { checkConsistency };
