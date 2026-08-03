"""Structured application logging.

Centralised so every module logs through the same JSON formatter and the same
redaction safety net, instead of ad-hoc print() calls that can leak secrets,
OTPs, tokens or session identifiers into stdout / container logs.

Callers must still avoid passing sensitive values into log calls at all -
the redaction filter below is a defence-in-depth backstop, not a licence to
log secrets.
"""
import logging
import os
import re
import sys

_REDACT_PATTERNS = [
    re.compile(r'("?(?:password|passwd|pwd)"?\s*[:=]\s*")[^"]*(")', re.IGNORECASE),
    re.compile(r'("?(?:otp|otp_code|otp_secret)"?\s*[:=]\s*")[^"]*(")', re.IGNORECASE),
    re.compile(r'("?(?:token|access_token|refresh_token|id_token)"?\s*[:=]\s*")[^"]*(")', re.IGNORECASE),
    re.compile(r'("?(?:session_id|sessionid)"?\s*[:=]\s*")[^"]*(")', re.IGNORECASE),
    re.compile(r'("?(?:secret|client_secret|api_key)"?\s*[:=]\s*")[^"]*(")', re.IGNORECASE),
]


class RedactingFilter(logging.Filter):
    def filter(self, record: logging.LogRecord) -> bool:
        try:
            message = record.getMessage()
        except Exception:
            return True
        redacted = message
        for pattern in _REDACT_PATTERNS:
            redacted = pattern.sub(r"\1***REDACTED***\2", redacted)
        if redacted != message:
            record.msg = redacted
            record.args = ()
        return True


def configure_logging() -> None:
    level_name = os.getenv("LOG_LEVEL", "INFO").upper()
    level = getattr(logging, level_name, logging.INFO)

    root = logging.getLogger()
    root.setLevel(level)

    handler = logging.StreamHandler(sys.stdout)
    handler.setFormatter(
        logging.Formatter(
            fmt='{"time":"%(asctime)s","level":"%(levelname)s","logger":"%(name)s","message":"%(message)s"}'
        )
    )
    handler.addFilter(RedactingFilter())

    root.handlers = [handler]


def get_logger(name: str) -> logging.Logger:
    return logging.getLogger(name)
