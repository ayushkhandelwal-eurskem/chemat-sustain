from fastapi.testclient import TestClient

from app import app


client = TestClient(app, raise_server_exceptions=False)


def test_cookie_authenticated_mutation_requires_origin():
    response = client.post("/health", cookies={"session_id": "not-a-real-session"})
    assert response.status_code == 403
    assert response.json() == {"detail": "Origin header required"}


def test_cookie_authenticated_mutation_rejects_cross_origin():
    response = client.post(
        "/health",
        cookies={"session_id": "not-a-real-session"},
        headers={"Origin": "https://evil.example"},
    )
    assert response.status_code == 403
    assert response.json() == {"detail": "Cross-origin request denied"}


def test_cookie_authenticated_mutation_accepts_configured_origin():
    response = client.post(
        "/health",
        cookies={"session_id": "not-a-real-session"},
        headers={"Origin": "http://localhost:3000"},
    )
    # The middleware allowed the request; /health itself intentionally has no POST.
    assert response.status_code == 405


def test_non_cookie_request_is_not_subject_to_browser_csrf_check():
    response = client.post("/health")
    assert response.status_code == 405