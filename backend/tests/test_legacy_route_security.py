"""Regression guards for legacy compatibility-route authorization.

Legacy mode is forbidden in production, but development and migration
deployments can still enable it.  Sensitive handlers must therefore enforce
their own authorization rather than trusting one environment switch as the
only barrier.
"""

from pathlib import Path

import pytest
from fastapi import HTTPException
from fastapi.routing import APIRoute

from api.controllers.test import router as test_router
from api.router_protocol_files import _stored_file_path, router as protocol_router
from api.router_tree_admin import router as tree_admin_router


def _dependency_names(route: APIRoute) -> set[str]:
    names: set[str] = set()

    def visit(dependant):
        for dependency in dependant.dependencies:
            call = dependency.call
            names.add(getattr(call, "__name__", call.__class__.__name__))
            visit(dependency)

    visit(route.dependant)
    return names


def _routes(router, methods: set[str]) -> list[APIRoute]:
    return [
        route
        for route in router.routes
        if isinstance(route, APIRoute) and route.methods.intersection(methods)
    ]


@pytest.mark.parametrize(
    "path,method",
    [
        ("/json", "POST"),
        ("/json/{test_id}", "PUT"),
        ("/bulk-release-flags", "PATCH"),
        ("/{test_id}/publish", "PATCH"),
        ("/{test_id}/unpublish", "PATCH"),
    ],
)
def test_sensitive_legacy_test_routes_require_admin(path: str, method: str):
    route = next(
        route
        for route in _routes(test_router, {method})
        if route.path == path and method in route.methods
    )
    assert "check_role" in _dependency_names(route)


def test_all_tree_admin_routes_require_admin():
    routes = _routes(tree_admin_router, {"POST", "PUT", "PATCH", "DELETE"})
    assert routes
    for route in routes:
        assert "check_role" in _dependency_names(route), route.path


def test_protocol_file_writes_require_admin_and_reads_require_login():
    for route in _routes(protocol_router, {"POST", "DELETE"}):
        assert "check_role" in _dependency_names(route), route.path

    download = next(route for route in _routes(protocol_router, {"GET"}))
    assert "get_current_user" in _dependency_names(download)


def test_stored_protocol_path_accepts_file_beneath_upload_root(tmp_path, monkeypatch):
    import api.router_protocol_files as protocol_files

    root = tmp_path / "protocols"
    root.mkdir()
    target = root / "safe.pdf"
    target.write_bytes(b"%PDF")
    monkeypatch.setattr(protocol_files, "UPLOAD_DIR", root)

    assert _stored_file_path(str(target)) == target


def test_stored_protocol_path_rejects_absolute_escape(tmp_path, monkeypatch):
    import api.router_protocol_files as protocol_files

    root = tmp_path / "protocols"
    root.mkdir()
    outside = tmp_path / "outside.pdf"
    outside.write_bytes(b"%PDF")
    monkeypatch.setattr(protocol_files, "UPLOAD_DIR", root)

    with pytest.raises(HTTPException) as error:
        _stored_file_path(str(outside))
    assert error.value.status_code == 404


def test_stored_protocol_path_rejects_symlink_escape(tmp_path, monkeypatch):
    import api.router_protocol_files as protocol_files

    root = tmp_path / "protocols"
    root.mkdir()
    outside = tmp_path / "outside.pdf"
    outside.write_bytes(b"%PDF")
    (root / "escape.pdf").symlink_to(outside)
    monkeypatch.setattr(protocol_files, "UPLOAD_DIR", root)

    with pytest.raises(HTTPException) as error:
        _stored_file_path(str(root / "escape.pdf"))
    assert error.value.status_code == 404