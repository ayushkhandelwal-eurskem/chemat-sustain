import logging
import os
from uuid import uuid4

from dotenv import load_dotenv

load_dotenv()

from fastapi import FastAPI, Response, Request
from fastapi.middleware.cors import CORSMiddleware
from utils.db import Base, engine
from security.config import get_settings

# Register all mapped classes before optional development-only create_all.
import api.models  # noqa: F401
from api.models.test import Test  # noqa: F401
from api.models_tree import Category, Protocol, ProtocolTest  # noqa: F401

settings = get_settings()
logger = logging.getLogger(__name__)

# Interactive docs and the OpenAPI schema are OFF unless explicitly switched on
# via ENABLE_API_DOCS=true.
#
# These were previously gated on `is_production`, which is derived from
# APP_ENV and DEFAULTS TO "development". A deployment that simply omits APP_ENV
# therefore served /docs, /redoc and /openapi.json to the internet - which is
# what production was doing when this was written: 38 endpoints and 45
# operations, 26 of them state-changing (DELETE /tests/{id},
# PATCH /tests/bulk-release-flags, ...) published anonymously as a complete
# attack-surface map, along with internal schema and field names.
#
# Keying the negative control off an env var that defaults to the permissive
# value is fail-open. This flag inverts that: the schema stays private unless
# someone asks for it, so forgetting a variable can no longer publish the API
# surface. Enable it in local development only.
_docs_enabled = settings.enable_api_docs

app = FastAPI(
    title="CheMatSustain Secure Research API",
    version="1.0.0",
    docs_url="/docs" if _docs_enabled else None,
    redoc_url="/redoc" if _docs_enabled else None,
    openapi_url="/openapi.json" if _docs_enabled else None,
)

# Initialize the database
async def init_models():
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

# Run database initialization
@app.on_event("startup")
async def startup_event():
    if settings.enable_auto_ddl:
        logger.warning("Development auto-DDL is enabled; use reviewed migrations outside development")
        await init_models()
    logger.info("Application startup completed", extra={"environment": settings.environment})

# Configure CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=list(settings.cors_origins),
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type", "X-Request-ID"],
)


@app.middleware("http")
async def security_headers(request: Request, call_next):
    request_id = request.headers.get("X-Request-ID") or str(uuid4())
    request.state.request_id = request_id
    response = await call_next(request)
    response.headers["X-Request-ID"] = request_id
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["Referrer-Policy"] = "no-referrer"
    response.headers["Permissions-Policy"] = "camera=(), microphone=(), geolocation=()"
    response.headers["Cache-Control"] = "no-store"
    return response



@app.get("/health")
async def health_check():
    return Response(status_code=200, content="OK")


from api.router_phase1 import router as phase1_router
from api.router_portal import router as portal_router

app.include_router(phase1_router)
app.include_router(portal_router)

# Compatibility mode is explicitly unavailable in production. It exists only
# to support a controlled migration of the current UI and old integrations.
if settings.enable_legacy_api:
    from api.controllers.file_navigator import router as file_navigator_router
    from api.controllers.test import router as test_router
    from api.controllers.user import router as user_router
    from api.router_protocol_files import router as protocol_files_router
    from api.router_tree import router as tree_router
    from api.router_tree_admin import router as tree_admin_router

    app.include_router(test_router, prefix="/tests", tags=["Legacy Tests"])
    app.include_router(file_navigator_router, prefix="/files", tags=["Legacy File Navigator"])
    app.include_router(user_router, prefix="/users", tags=["Legacy User Management"])
    app.include_router(tree_router, tags=["Legacy Tree"])
    app.include_router(protocol_files_router, tags=["Legacy Protocol Files"])
    app.include_router(tree_admin_router, tags=["Legacy Tree Admin"])
