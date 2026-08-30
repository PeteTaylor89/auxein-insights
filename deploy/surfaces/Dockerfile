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
#
# PYTHON 3.13, AND IT HAS TO BE.
#
# This said `python:3.11-slim-bookworm` until 2026-08-30, which meant the image
# could never build at all: `requirements.txt` pins rasterio 1.5.0, and rasterio
# dropped below 3.12 — pip resolves nothing and the build dies at
# `No matching distribution found for rasterio==1.5.0`.
#
# The irony is that 3.11 is the Elastic Beanstalk ceiling this container exists
# to escape, reimposed by the base image two lines under a comment explaining
# why we were escaping it. The pins are not negotiable — the 1986-2026 archive
# was produced on Python 3.13.3 with rasterio 1.5.0, scipy 1.18.0, numpy 2.2.5 —
# so the interpreter moves to meet them, not the other way round. Downgrading
# rasterio to 1.4.4 to fit 3.11 would change the LERC encoding the whole archive
# is written in.
FROM python:3.13-slim-bookworm

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
        ca-certificates curl unzip libexpat1 libgomp1 \
 && rm -rf /var/lib/apt/lists/*

# THE AWS CLI IS NOT OPTIONAL HERE — the entrypoint is built around it.
#
# `entrypoint.sh` fetches the grid, the LENZ raster and the era-offset fields
# with `aws s3 cp`/`sync`, and publishes with `aws s3 sync`. Without it the task
# dies at the first fetch with `aws: command not found` and exit 127, which
# reads as a broken script rather than a missing package. That is exactly how
# the first Fargate run failed.
#
# v2 rather than `pip install awscli`: the publish step depends on `s3 sync`
# skipping unchanged objects, the bucket holds 29k+ of them, and v1 is in
# maintenance. `unzip` is purged afterwards — it exists only to unpack this.
RUN curl -fsSL "https://awscli.amazonaws.com/awscli-exe-linux-x86_64.zip" \
        -o /tmp/awscliv2.zip \
 && unzip -q /tmp/awscliv2.zip -d /tmp \
 && /tmp/aws/install \
 && rm -rf /tmp/aws /tmp/awscliv2.zip \
 && apt-get purge -y unzip && apt-get autoremove -y \
 && aws --version

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
