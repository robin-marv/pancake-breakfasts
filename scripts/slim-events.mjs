#!/usr/bin/env node
// Strips fields the frontend doesn't need and PII (email/phone) from organizer.
// Mirrors the logic in server.js so the deployed payload matches what the
// local dev server serves.

import { readFileSync, writeFileSync } from "node:fs";

const DROP_FIELDS = ["description_html", "image", "source", "start_date", "end_date"];
const DROP_ORGANIZER_FIELDS = ["email", "phone"];

const [, , input, output] = process.argv;
if (!input || !output) {
  console.error("Usage: slim-events.mjs <input.json> <output.json>");
  process.exit(1);
}

const events = JSON.parse(readFileSync(input, "utf8"));
const slim = events.map((event) => {
  const copy = { ...event };
  for (const field of DROP_FIELDS) delete copy[field];
  if (copy.organizer) {
    const organizer = { ...copy.organizer };
    for (const field of DROP_ORGANIZER_FIELDS) delete organizer[field];
    copy.organizer = organizer;
  }
  return copy;
});

writeFileSync(output, JSON.stringify(slim));
console.log(`Slimmed ${events.length} events → ${output}`);
