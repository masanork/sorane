---
type: reference
title: Transit Stops CSV Fields
description: Column definitions for the demo stops.csv distribution.
resource: https://example.pages.dev/static/stops.csv
profile: sorane-okf/0.3
identifier: https://example.pages.dev/refs/stops-csv-fields
language: en
tags: [open-data, reference, transit]
---

Field reference for [Transit Stops](transit-stops.html). Sample rows:

| Column | Type | Required | Description |
|--------|------|----------|-------------|
| `stop_id` | string | yes | Unique stop identifier in the demo dataset |
| `name` | string | yes | Human-readable stop label |
| `lat` | number | yes | WGS84 latitude (decimal degrees) |
| `lon` | number | yes | WGS84 longitude (decimal degrees) |