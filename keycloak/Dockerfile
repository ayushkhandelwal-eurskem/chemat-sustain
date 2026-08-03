# Production Keycloak image.
#
# Keycloak splits configuration into *build-time* options (db vendor, enabled
# features, health/metrics endpoints) and *runtime* options (URLs, credentials,
# hostname). Build-time options must be baked in via `kc.sh build`; passing
# them as runtime environment variables alongside `start --optimized` fails
# with "The '--optimized' flag was used for first ever server start".
#
# So we run the build here and ship an already-optimized image, which is what
# Keycloak's production guidance recommends: faster startup and build-time
# config locked to the artefact rather than depending on the environment.
#
# Runtime-only settings (KC_DB_URL, credentials, KC_HOSTNAME, proxy headers)
# still come from the environment at container start - see docker-compose.yml.

FROM quay.io/keycloak/keycloak:26.7.0 AS builder

# Build-time options only.
ENV KC_DB=postgres
ENV KC_HEALTH_ENABLED=true
ENV KC_METRICS_ENABLED=true

RUN /opt/keycloak/bin/kc.sh build


FROM quay.io/keycloak/keycloak:26.7.0

COPY --from=builder /opt/keycloak/ /opt/keycloak/

ENTRYPOINT ["/opt/keycloak/bin/kc.sh"]
