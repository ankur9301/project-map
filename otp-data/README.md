# OTP data folder

Put OpenTripPlanner input and graph files here.

Expected files before graph build:

- `new-york-latest.osm.pbf`
- `new-jersey-latest.osm.pbf`
- `mta-subway.zip`
- `mta-bus.zip`
- `nj-transit.zip`
- optional `path.zip`

After graph build, OTP creates:

- `graph.obj`

This folder is mounted into the OTP Docker container at `/var/opentripplanner`.
