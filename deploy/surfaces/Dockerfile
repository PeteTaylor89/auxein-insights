# Daily climate surface engine — QC, fit, publish, index.
#
# Why a container and not the existing EC2 ingest box: the rainfall grid basis
# is 789 stations x 1,429,944 cells x 4 B = **4.6 GB** at float32, against a
# t3.micro's 1 GB. Upsizing that box to carry a job that runs for ~20 minutes a
# day means paying for 8 GB around the clock; a Fargate task sized at 8 GB and
# billed per second costs a couple of dollars a month.
#
# Why not Elastic Beanstalk: the EB platform pins Python 3.11 and caps rasterio
# at 1.4.4. Nothing here needs to fight that — the image pins its own GDAL.
#
# Build with CodeBuild (see buildspec.yml) rather than locally; the workstation
# has no Docker.

FROM python:3.11-slim-bookworm

# rasterio ships manylinux wheels with GDAL bundled, so no system GDAL is
# needed — and deliberately so. A system GDAL here would reintroduce exactly the
# PROJ_LIB collision that `raster._configure_proj()` exists to defend against on
# the workstation, where a PostGIS install's older `proj.db` silently breaks
# every CRS lookup and fails as a GDAL LOG LINE rather than an exception.
#
# `libexpat1` and `libgomp1` are the two shared libraries the wheels themselves
# link against that slim does not carry.
RUN apt-get update \
 && apt-get install -y --no-install-recommends \
        ca-certificates curl libexpat1 libgomp1 \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Pinned deliberately. A surface archive is a time series: an estimator that
# changes underneath it puts a step in the middle of the record that nothing
# downstream can see. scipy and numpy are load-bearing for the spline, and
# rasterio decides the LERC encoding the whole archive is written in.
COPY deploy/surfaces/requirements.txt /app/requirements.txt
RUN pip install --no-cache-dir -r /app/requirements.txt

COPY backend /app/backend
COPY deploy/surfaces/entrypoint.sh /app/entrypoint.sh
RUN chmod +x /app/entrypoint.sh

# `run_live.py` resolves paths relative to the repo root (parents[3] from the
# script), so the layout under /app must mirror the repository.
ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    AUXEIN_SURFACE_HOME=/app

ENTRYPOINT ["/app/entrypoint.sh"]
