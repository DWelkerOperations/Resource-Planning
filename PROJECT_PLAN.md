# Dispatch Tool Project Plan

## Purpose

Build a modern, frontend-only prototype for airline catering transportation dispatch and driver pairing operations. This replaces an Excel-based planning workflow with a visual, dispatcher-friendly web interface.

## Current Scope

- React, TypeScript, and Tailwind CSS.
- Mock data only.
- No backend, database, authentication, schedule import, optimization engine, or pairing algorithm.
- Desktop-first layout for dispatchers using large monitors.
- Primary focus is the Dispatcher Timeline.

## Current Screens

- Dispatcher Timeline: driver rows, shift times, timeline pucks, open flight lane, hover details, and simple drag reassignment.
- Exceptions: mock operational risks such as overtime, missing lunch, late load risk, truck conflict, and unplanned flights.
- Tour Sheet: print-friendly operational assignment table.
- Dashboard: mock KPI overview.
- Thumb Rules: mock settings/admin controls for planning assumptions.

## Near-Term Priorities

1. Improve dispatcher timeline usability.
   - Make shift, off-shift, overtime, lunch, edited flights, and unplanned work visually obvious.
   - Keep the grid dense enough for real dispatch use.
   - Preserve simple vertical drag reassignment only.

2. Strengthen mock data shape.
   - Keep driver, truck, radio, shift, flight, assignment, lunch, and exception fields easy to understand.
   - Avoid backend-style complexity until the workflow is clearer.

3. Add dispatcher workflow polish.
   - Improve hover details.
   - Add selected flight state.
   - Add simple filters only if they support dense operations review.

4. Prepare for real data later.
   - Document likely import fields.
   - Keep all data structures typed.
   - Do not add a database or API until the static workflow is validated.

## Non-Goals For Now

- No optimization logic.
- No pairing algorithms.
- No real airline schedule imports.
- No authentication.
- No database.
- No deployment automation until the prototype flow is stable.

## Development Workflow

- Work from the GitHub-connected local folder: `/Users/drewwelker/Documents/New project/Dispatch-Tool`.
- Keep changes small and build after each meaningful step.
- Push stable checkpoints to GitHub.
