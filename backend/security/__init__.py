"""Security foundation for CheMatSustain.

The package is deliberately independent from the legacy password/session flow.
Production should use ``AUTH_MODE=keycloak`` and the OAuth dependencies exposed
from :mod:`security.auth`.
"""

from .auth import Principal, get_principal, require_roles, require_scopes

__all__ = ["Principal", "get_principal", "require_roles", "require_scopes"]
