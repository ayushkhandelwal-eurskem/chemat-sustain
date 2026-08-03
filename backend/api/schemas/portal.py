from __future__ import annotations

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field, field_validator


ALLOWED_PHASE1_SCOPES = {
    "tests:read",
    "experimental-data:read",
    "protocol-files:read",
    "protocol-files:download",
    "files:navigate",
    "files:read",
    "audit:read-own-organisation",
}


class ApplicationCreate(BaseModel):
    name: str = Field(min_length=3, max_length=120, pattern=r"^[A-Za-z0-9][A-Za-z0-9 _.-]+$")
    description: str = Field(default="", max_length=1000)


class AccessRequestCreate(BaseModel):
    application_id: str
    requested_scopes: list[str] = Field(min_length=1, max_length=7)
    justification: str = Field(min_length=20, max_length=2000)
    expires_at: datetime | None = None

    @field_validator("requested_scopes")
    @classmethod
    def validate_scopes(cls, value: list[str]) -> list[str]:
        unique = sorted(set(value))
        unknown = set(unique) - ALLOWED_PHASE1_SCOPES
        if unknown:
            raise ValueError(f"Unsupported Phase 1 scopes: {', '.join(sorted(unknown))}")
        return unique


class ApprovalCreate(BaseModel):
    decision: Literal["approved", "rejected"]
    reason: str = Field(min_length=10, max_length=2000)


class RevokeCreate(BaseModel):
    reason: str = Field(min_length=10, max_length=2000)
