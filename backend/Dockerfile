# FastAPI Dockerfile - multi-stage build.
#
# The builder stage installs dependencies into a venv using pip/setuptools.
# The final runtime stage copies only that venv plus the app code - it never
# ships pip, setuptools, wheel, or any of their vendored dependencies, so
# packaging-tool CVEs (e.g. in bundled msgpack/jaraco.context/wheel) can't
# show up in the running image at all, and there's no package manager present
# for an attacker who gains code execution to use for installing tools.

FROM python:3.11-slim-bookworm AS builder

WORKDIR /app

RUN python -m venv /opt/venv
ENV PATH="/opt/venv/bin:$PATH"

RUN pip install --no-cache-dir --upgrade pip setuptools wheel

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt


FROM python:3.11-slim-bookworm

WORKDIR /app

COPY --from=builder /opt/venv /opt/venv
ENV PATH="/opt/venv/bin:$PATH"

# The base image ships its own system-level pip/setuptools/wheel (and
# ensurepip's bundled copies) in addition to what we installed into
# /opt/venv above. The running app never invokes pip/setuptools/wheel at
# runtime - only the venv's installed packages matter - so strip the base
# image's copies rather than carry their CVEs into the final image.
RUN rm -rf \
    /usr/local/lib/python3.11/site-packages/pip \
    /usr/local/lib/python3.11/site-packages/pip-*.dist-info \
    /usr/local/lib/python3.11/site-packages/setuptools \
    /usr/local/lib/python3.11/site-packages/setuptools-*.dist-info \
    /usr/local/lib/python3.11/site-packages/wheel \
    /usr/local/lib/python3.11/site-packages/wheel-*.dist-info \
    /usr/local/lib/python3.11/ensurepip \
    /usr/local/bin/pip /usr/local/bin/pip3 /usr/local/bin/pip3.11

# Also strip pip/setuptools/wheel from the copied venv itself - the app only
# needs the packages it depends on to *run*, never pip itself, and pip's own
# vendored copies (e.g. msgpack) and metadata (vendor.txt, its bundled SBOM)
# otherwise carry unfixable CVEs and version strings into image scans for
# code that is never imported by this application.
RUN rm -rf \
    /opt/venv/lib/python3.11/site-packages/pip \
    /opt/venv/lib/python3.11/site-packages/pip-*.dist-info \
    /opt/venv/bin/pip /opt/venv/bin/pip3

COPY . .

RUN useradd --create-home --shell /usr/sbin/nologin appuser \
    && chown -R appuser:appuser /app
USER appuser

EXPOSE 8000

CMD ["fastapi", "run"]
