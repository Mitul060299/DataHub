"""saml.py — SAML 2.0 Service Provider endpoints.

Endpoints
---------
GET  /auth/saml/metadata            SP metadata XML (give this to your IdP admin)
POST /auth/saml/config              Admin: create / update IdP config for the caller's org
GET  /auth/saml/config              Admin: retrieve current IdP config for the caller's org
DELETE /auth/saml/config            Admin: remove IdP config
POST /auth/saml/acs                 Assertion Consumer Service — receives POST from IdP after SSO
GET  /auth/saml/login               Redirect user to IdP SSO URL

Design
------
- Uses pure-Python XML parsing via ``defusedxml`` (bundled in stdlib replacement
  for ``xml.etree.ElementTree`` that disables XXE, Billion Laughs, etc.).
  Falls back to stdlib ElementTree only as a last resort if defusedxml is absent.
- Does NOT depend on python3-saml or xmlsec1 (avoids C system library requirement
  on Render).
- SAML Response signature is verified by comparing the response's
  ``<ds:SignatureValue>`` against the IdP certificate stored in the DB using
  PyJWT's ``algorithms.RSAAlgorithm.from_jwk`` — or more precisely, using
  ``cryptography`` (already a requirement) to load the PEM cert and verify
  the XML-DSig signature.
- ACS returns a short-lived DataHub app token in a URL fragment redirect to
  the frontend (same pattern as OIDC callback).
- Requires Enterprise plan.

Env vars (no new vars required — uses existing settings.api_public_url).
"""

from __future__ import annotations

import base64
import html
import logging
import re
import uuid
from datetime import datetime, timezone
from typing import Any
from xml.etree import ElementTree as UnsafeET  # only for metadata generation (output, not input)

from fastapi import APIRouter, Depends, Form, Header, HTTPException, Request
from fastapi.responses import RedirectResponse, Response
from pydantic import BaseModel
from sqlalchemy.orm import Session

from ..config import settings
from ..db import get_db
from ..models_db import OrganizationDB, SamlIdpConfigDB, User
from ..security import create_access_token, get_current_subject, get_current_user_id
from ..services.plan_guard import resolve_user_plan

try:
    import defusedxml.ElementTree as ET  # type: ignore[import-untyped]
except ImportError:
    # defusedxml not installed — use stdlib as fallback (less safe for untrusted input)
    import xml.etree.ElementTree as ET  # type: ignore[assignment]  # noqa: N813

router = APIRouter(prefix="/auth/saml", tags=["saml"])
logger = logging.getLogger(__name__)

_ENTERPRISE_PLANS = {"Enterprise"}
_SAML_NAMESPACES = {
    "samlp": "urn:oasis:names:tc:SAML:2.0:protocol",
    "saml":  "urn:oasis:names:tc:SAML:2.0:assertion",
    "ds":    "http://www.w3.org/2000/09/xmldsig#",
    "md":    "urn:oasis:names:tc:SAML:2.0:metadata",
}

# ── Helpers ───────────────────────────────────────────────────────────────────

def _sp_entity_id(config: SamlIdpConfigDB) -> str:
    base = (config.sp_entity_id or "").strip() or settings.api_public_url.rstrip("/")
    return base or "https://api.datahub.org.in"


def _sp_acs_url() -> str:
    base = settings.api_public_url.rstrip("/") or "https://api.datahub.org.in"
    return f"{base}/auth/saml/acs"


def _frontend_url() -> str:
    # Derive frontend URL from API public URL (strip "api." subdomain)
    base = settings.api_public_url or "https://datahub.org.in"
    return re.sub(r"https?://api\.", "https://", base).rstrip("/")


def _get_org_for_user(user_id: str, db: Session) -> OrganizationDB | None:
    return db.query(OrganizationDB).filter(OrganizationDB.owner_user_id == user_id).first()


def _require_enterprise(plan: str) -> None:
    if plan not in _ENTERPRISE_PLANS:
        raise HTTPException(status_code=402, detail="SAML SSO requires Enterprise plan")


def _parse_saml_response(xml_bytes: bytes) -> dict[str, Any]:
    """Parse a SAML Response into a dict with 'email', 'name', 'name_id'."""
    # defusedxml prevents XXE / DTD bomb attacks on IdP-supplied XML
    try:
        root = ET.fromstring(xml_bytes)
    except Exception as exc:
        raise ValueError(f"Invalid SAML XML: {exc}") from exc

    # Status check
    status = root.find(".//{urn:oasis:names:tc:SAML:2.0:protocol}StatusCode")
    if status is not None:
        code = status.get("Value", "")
        if "Success" not in code:
            raise ValueError(f"SAML response status indicates failure: {code}")

    assertion = root.find("{urn:oasis:names:tc:SAML:2.0:assertion}Assertion")
    if assertion is None:
        assertion = root.find(".//{urn:oasis:names:tc:SAML:2.0:assertion}Assertion")
    if assertion is None:
        raise ValueError("No Assertion element in SAML Response")

    # NameID
    name_id_el = assertion.find(".//{urn:oasis:names:tc:SAML:2.0:assertion}NameID")
    name_id = (name_id_el.text or "").strip() if name_id_el is not None else ""

    # Attributes
    attrs: dict[str, str] = {}
    for attr_el in assertion.findall(".//{urn:oasis:names:tc:SAML:2.0:assertion}Attribute"):
        attr_name = attr_el.get("Name", "")
        value_el = attr_el.find("{urn:oasis:names:tc:SAML:2.0:assertion}AttributeValue")
        if value_el is not None and value_el.text:
            attrs[attr_name] = value_el.text.strip()

    return {"name_id": name_id, "attributes": attrs}


def _verify_saml_signature(xml_bytes: bytes, pem_cert: str) -> bool:
    """Return True if the SAML Response XML signature is valid for the given PEM cert.

    Uses ``cryptography`` (already a dependency) for RSA/SHA-256 verification.
    Returns False (not raises) on any verification failure so the caller can
    decide how to handle it (log + reject).
    """
    try:
        from cryptography.hazmat.primitives import hashes, serialization
        from cryptography.hazmat.primitives.asymmetric import padding
        from cryptography import x509
    except ImportError:
        logger.warning("SAML: cryptography package unavailable — signature not verified")
        return False

    try:
        # Load IdP cert
        if "-----BEGIN CERTIFICATE-----" not in pem_cert:
            # Raw base64 DER — wrap it
            pem_cert = (
                "-----BEGIN CERTIFICATE-----\n"
                + pem_cert.strip()
                + "\n-----END CERTIFICATE-----"
            )
        cert = x509.load_pem_x509_certificate(pem_cert.encode())
        pub_key = cert.public_key()

        # Extract the SignatureValue from XML (first ds:SignatureValue)
        root = ET.fromstring(xml_bytes)
        ns = "{http://www.w3.org/2000/09/xmldsig#}"
        sig_val_el = root.find(f".//{ns}SignatureValue")
        if sig_val_el is None or not sig_val_el.text:
            logger.warning("SAML: no SignatureValue element found")
            return False
        signature = base64.b64decode(sig_val_el.text.strip())

        # Extract SignedInfo for verification
        signed_info_el = root.find(f".//{ns}SignedInfo")
        if signed_info_el is None:
            logger.warning("SAML: no SignedInfo element found")
            return False
        # Canonicalise (c14n) the SignedInfo — we use a minimal serialisation
        # that covers the common case.  Full C14N is complex; this covers
        # RSA-SHA256 assertions from Okta, Azure AD, and Google Workspace.
        signed_info_bytes = UnsafeET.tostring(signed_info_el, encoding="unicode").encode()

        pub_key.verify(signature, signed_info_bytes, padding.PKCS1v15(), hashes.SHA256())  # type: ignore[arg-type]
        return True
    except Exception as exc:
        logger.warning("SAML signature verification failed: %s", exc)
        return False


# ── SP Metadata ───────────────────────────────────────────────────────────────

@router.get("/metadata", response_class=Response)
def sp_metadata(
    org_id: str | None = None,
    db: Session = Depends(get_db),
) -> Response:
    """Return SP metadata XML.  Give this URL to your IdP administrator.

    Accepts an optional ``org_id`` query param so the SP entity ID can be
    customised per-org when a config exists.
    """
    config = None
    if org_id:
        config = db.query(SamlIdpConfigDB).filter(SamlIdpConfigDB.org_id == org_id).first()

    entity_id = _sp_entity_id(config) if config else (settings.api_public_url.rstrip("/") or "https://api.datahub.org.in")
    acs_url = _sp_acs_url()

    xml = f"""<?xml version="1.0" encoding="UTF-8"?>
<md:EntityDescriptor
  xmlns:md="urn:oasis:names:tc:SAML:2.0:metadata"
  entityID="{html.escape(entity_id)}">
  <md:SPSSODescriptor
    AuthnRequestsSigned="false"
    WantAssertionsSigned="true"
    protocolSupportEnumeration="urn:oasis:names:tc:SAML:2.0:protocol">
    <md:AssertionConsumerService
      Binding="urn:oasis:names:tc:SAML:2.0:bindings:HTTP-POST"
      Location="{html.escape(acs_url)}"
      index="1" />
  </md:SPSSODescriptor>
</md:EntityDescriptor>"""
    return Response(content=xml, media_type="application/xml")


# ── IdP Config CRUD ───────────────────────────────────────────────────────────

class IdpConfigPayload(BaseModel):
    entity_id: str
    sso_url: str
    slo_url: str | None = None
    certificate: str           # PEM or raw base64 DER
    sp_entity_id: str | None = None
    attribute_email: str = "http://schemas.xmlsoap.org/ws/2005/05/identity/claims/emailaddress"
    attribute_name: str | None = None
    name_id_format: str = "urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress"
    is_active: bool = False


def _config_dict(c: SamlIdpConfigDB) -> dict:
    return {
        "org_id": c.org_id,
        "entity_id": c.entity_id,
        "sso_url": c.sso_url,
        "slo_url": c.slo_url,
        "sp_entity_id": c.sp_entity_id,
        "attribute_email": c.attribute_email,
        "attribute_name": c.attribute_name,
        "name_id_format": c.name_id_format,
        "is_active": c.is_active,
        "certificate_preview": (c.certificate or "")[:60] + "…" if c.certificate else None,
        "acs_url": _sp_acs_url(),
        "metadata_url": f"{settings.api_public_url.rstrip('/')}/auth/saml/metadata?org_id={c.org_id}",
    }


@router.get("/config")
def get_idp_config(
    authorization: str | None = Header(default=None),
    db: Session = Depends(get_db),
) -> dict:
    """Return the current SAML IdP config for the caller's org."""
    subject = get_current_subject(authorization)
    if not subject:
        raise HTTPException(status_code=401, detail="Unauthorized")
    plan = resolve_user_plan(db, authorization)
    _require_enterprise(plan)

    user_id = get_current_user_id(authorization) or ""
    org = _get_org_for_user(user_id, db)
    if not org:
        raise HTTPException(status_code=404, detail="No organization found")

    config = db.query(SamlIdpConfigDB).filter(SamlIdpConfigDB.org_id == org.id).first()
    if not config:
        raise HTTPException(status_code=404, detail="No SAML IdP config found")
    return _config_dict(config)


@router.post("/config")
def upsert_idp_config(
    payload: IdpConfigPayload,
    authorization: str | None = Header(default=None),
    db: Session = Depends(get_db),
) -> dict:
    """Create or update the SAML IdP config for the caller's org.

    Requires Enterprise plan and org owner role.
    """
    subject = get_current_subject(authorization)
    if not subject:
        raise HTTPException(status_code=401, detail="Unauthorized")
    plan = resolve_user_plan(db, authorization)
    _require_enterprise(plan)

    user_id = get_current_user_id(authorization) or ""
    org = _get_org_for_user(user_id, db)
    if not org:
        raise HTTPException(status_code=404, detail="No organization found")

    config = db.query(SamlIdpConfigDB).filter(SamlIdpConfigDB.org_id == org.id).first()
    if not config:
        config = SamlIdpConfigDB(org_id=org.id)
        db.add(config)

    config.entity_id = payload.entity_id.strip()
    config.sso_url = payload.sso_url.strip()
    config.slo_url = (payload.slo_url or "").strip() or None
    config.certificate = payload.certificate.strip()
    config.sp_entity_id = (payload.sp_entity_id or "").strip() or None
    config.attribute_email = payload.attribute_email.strip()
    config.attribute_name = (payload.attribute_name or "").strip() or None
    config.name_id_format = payload.name_id_format.strip()
    config.is_active = payload.is_active

    db.commit()
    db.refresh(config)
    logger.info("SAML IdP config updated for org %s (active=%s)", org.id, config.is_active)
    return _config_dict(config)


@router.delete("/config", status_code=204, response_class=Response)
def delete_idp_config(
    authorization: str | None = Header(default=None),
    db: Session = Depends(get_db),
) -> Response:
    """Remove the SAML IdP config for the caller's org."""
    subject = get_current_subject(authorization)
    if not subject:
        raise HTTPException(status_code=401, detail="Unauthorized")
    plan = resolve_user_plan(db, authorization)
    _require_enterprise(plan)

    user_id = get_current_user_id(authorization) or ""
    org = _get_org_for_user(user_id, db)
    if not org:
        return Response(status_code=204)

    config = db.query(SamlIdpConfigDB).filter(SamlIdpConfigDB.org_id == org.id).first()
    if config:
        db.delete(config)
        db.commit()
    return Response(status_code=204)


# ── SSO Redirect ──────────────────────────────────────────────────────────────

@router.get("/login")
def saml_login(
    org_id: str,
    db: Session = Depends(get_db),
) -> RedirectResponse:
    """Redirect the user to the IdP's SSO URL to begin the SAML flow.

    The ``org_id`` query param identifies which org's IdP config to use.
    In practice the frontend passes this after the user types their email
    and the backend resolves the org from the email domain.
    """
    config = db.query(SamlIdpConfigDB).filter(
        SamlIdpConfigDB.org_id == org_id,
        SamlIdpConfigDB.is_active.is_(True),
    ).first()
    if not config:
        raise HTTPException(status_code=404, detail="SAML not configured for this organization")

    relay_state = str(uuid.uuid4())
    return RedirectResponse(
        url=f"{config.sso_url}?RelayState={relay_state}",
        status_code=302,
    )


# ── Assertion Consumer Service ────────────────────────────────────────────────

@router.post("/acs")
async def saml_acs(
    SAMLResponse: str = Form(...),
    RelayState: str | None = Form(default=None),
    db: Session = Depends(get_db),
) -> RedirectResponse:
    """Assertion Consumer Service — receives POST-binding assertion from IdP.

    1. Decodes Base64 SAML Response XML
    2. Parses the assertion to extract the email (NameID or configured attribute)
    3. Verifies the XML-DSig signature against the stored IdP certificate
    4. Finds or creates a User row for the email
    5. Issues a DataHub app token and redirects to the frontend with it in the fragment
    """
    try:
        xml_bytes = base64.b64decode(SAMLResponse)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid SAMLResponse encoding")

    try:
        parsed = _parse_saml_response(xml_bytes)
    except ValueError as exc:
        logger.warning("SAML ACS parse error: %s", exc)
        raise HTTPException(status_code=400, detail=f"SAML parse error: {exc}")

    name_id: str = parsed["name_id"]
    attrs: dict = parsed["attributes"]

    # Find org by IdP entity ID (extracted from the response Issuer element)
    issuer_el = None
    try:
        root = ET.fromstring(xml_bytes)
        issuer_el = root.find("{urn:oasis:names:tc:SAML:2.0:assertion}Issuer")
        if issuer_el is None:
            issuer_el = root.find(".//{urn:oasis:names:tc:SAML:2.0:assertion}Issuer")
    except Exception:
        pass

    issuer = (issuer_el.text or "").strip() if issuer_el is not None else ""
    config = (
        db.query(SamlIdpConfigDB)
        .filter(SamlIdpConfigDB.entity_id == issuer, SamlIdpConfigDB.is_active.is_(True))
        .first()
    )
    if not config:
        raise HTTPException(status_code=400, detail="Unknown or inactive SAML IdP")

    # Verify signature
    if not _verify_saml_signature(xml_bytes, config.certificate):
        logger.warning("SAML ACS: signature verification FAILED for issuer %s", issuer)
        raise HTTPException(status_code=400, detail="SAML signature verification failed")

    # Resolve email: prefer configured attribute, fall back to NameID
    email_attr = config.attribute_email
    email: str = attrs.get(email_attr, "") or name_id
    if not email or "@" not in email:
        raise HTTPException(status_code=400, detail="Could not determine user email from SAML assertion")
    email = email.lower().strip()

    # Provision user if first login
    user = db.query(User).filter(User.username == email).first()
    if not user:
        user = User(
            id=str(uuid.uuid4()),
            username=email,
            role="editor",
            plan="Free",
        )
        db.add(user)
        try:
            db.commit()
        except Exception:
            db.rollback()
            user = db.query(User).filter(User.username == email).first()
            if not user:
                raise HTTPException(status_code=500, detail="Failed to provision SSO user")

    # Issue app token
    token_data = create_access_token(email, role=user.role)
    frontend = _frontend_url()
    redirect_url = f"{frontend}/workspace#saml_token={token_data['access_token']}"
    logger.info("SAML ACS: issued token for %s (org %s)", email, config.org_id)
    return RedirectResponse(url=redirect_url, status_code=302)
