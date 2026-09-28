import enum
import uuid
from datetime import datetime

from sqlalchemy import (
    Column, String, Integer, Float, Boolean, DateTime, Enum, ForeignKey, JSON, Text
)
from sqlalchemy.orm import declarative_base, relationship

Base = declarative_base()


def gen_id() -> str:
    return str(uuid.uuid4())


class AttackType(str, enum.Enum):
    NORMAL = "NORMAL"
    DNS_TUNNELING = "DNS_TUNNELING"
    DOS_DDOS = "DOS_DDOS"
    PORT_SCAN = "PORT_SCAN"
    BRUTE_FORCE = "BRUTE_FORCE"
    BOTNET = "BOTNET"


class Severity(str, enum.Enum):
    LOW = "LOW"
    MEDIUM = "MEDIUM"
    HIGH = "HIGH"
    CRITICAL = "CRITICAL"


class Priority(str, enum.Enum):
    P1 = "P1"
    P2 = "P2"
    P3 = "P3"
    P4 = "P4"


class AlertStatus(str, enum.Enum):
    """Case lifecycle. Stored as plain strings so adding a state never needs a
    DB migration; the API validates against this enum."""

    NEW = "NEW"
    INVESTIGATING = "INVESTIGATING"
    CONFIRMED = "CONFIRMED"
    RESOLVED = "RESOLVED"
    FALSE_POSITIVE = "FALSE_POSITIVE"


OPEN_STATUSES = (AlertStatus.NEW.value, AlertStatus.INVESTIGATING.value, AlertStatus.CONFIRMED.value)


class Role(str, enum.Enum):
    ANALYST = "ANALYST"
    ADMIN = "ADMIN"
    VIEWER = "VIEWER"


class User(Base):
    __tablename__ = "users"
    id = Column(String, primary_key=True, default=gen_id)
    name = Column(String, nullable=False)
    email = Column(String, unique=True, nullable=False)
    password_hash = Column(String, nullable=False)
    role = Column(Enum(Role), default=Role.VIEWER)
    # False = access revoked but history (verdicts, notes) kept for the audit trail
    is_active = Column(Boolean, default=True, nullable=False, server_default="1")


class MLModel(Base):
    __tablename__ = "ml_models"
    id = Column(String, primary_key=True, default=gen_id)
    model_type = Column(String)
    algorithm = Column(String)
    version = Column(String)
    artifact_path = Column(String)
    trained_at = Column(DateTime, default=datetime.utcnow)
    metrics = Column(JSON)


class ThreatIntelligence(Base):
    __tablename__ = "threat_intelligence"
    id = Column(String, primary_key=True, default=gen_id)
    rule_name = Column(String)
    condition = Column(String)
    attack_type = Column(Enum(AttackType))
    source = Column(String)
    updated_at = Column(DateTime, default=datetime.utcnow)


class Alert(Base):
    __tablename__ = "alerts"
    id = Column(String, primary_key=True, default=gen_id)
    alert_id = Column(String, unique=True, default=gen_id)
    attack_type = Column(Enum(AttackType), nullable=False)
    severity = Column(Enum(Severity), nullable=False)
    source_ip = Column(String)
    dest_ip = Column(String)
    timestamp = Column(DateTime, default=datetime.utcnow)
    confidence = Column(Float)
    description = Column(Text)
    risk_score = Column(Float)
    priority = Column(Enum(Priority))

    # case workflow
    status = Column(String, default=AlertStatus.NEW.value, nullable=False)
    assignee_id = Column(String, ForeignKey("users.id"), nullable=True)
    updated_at = Column(DateTime, default=datetime.utcnow)
    # provenance: "ingest" (API), "simulator" (Threat Simulator), "seed" (demo history)
    origin = Column(String, default="ingest", nullable=False)

    analysis = relationship("AttackAnalysis", back_populates="alert", uselist=False)
    assignee = relationship("User", foreign_keys=[assignee_id])
    events = relationship(
        "AlertEvent", back_populates="alert", order_by="AlertEvent.created_at", cascade="all, delete-orphan"
    )

    @property
    def assignee_name(self):
        return self.assignee.name if self.assignee else None

    @property
    def top_features(self):
        """Top three SHAP drivers, for list views (avoids shipping the full
        explanation for every row)."""
        exp = self.analysis.explanation if self.analysis else None
        if not exp or not exp.important_features:
            return []
        ranked = sorted(exp.important_features, key=lambda f: abs(f.get("shap_value", 0)), reverse=True)
        return [
            {"feature": f["feature"], "shap_value": f["shap_value"], "value": f.get("value")}
            for f in ranked[:5]
        ]


class AttackAnalysis(Base):
    __tablename__ = "attack_analysis"
    id = Column(String, primary_key=True, default=gen_id)
    alert_id = Column(String, ForeignKey("alerts.id"))
    attack_type = Column(Enum(AttackType))
    features = Column(JSON)
    score = Column(Float)

    alert = relationship("Alert", back_populates="analysis")
    explanation = relationship("Explanation", back_populates="analysis", uselist=False)


class Explanation(Base):
    __tablename__ = "explanations"
    id = Column(String, primary_key=True, default=gen_id)
    attack_analysis_id = Column(String, ForeignKey("attack_analysis.id"))
    reason = Column(Text)
    important_features = Column(JSON)
    confidence = Column(Float)

    analysis = relationship("AttackAnalysis", back_populates="explanation")


class Feedback(Base):
    """Analyst verdict on an alert (UML `ImproveModel` use case, v1: audit
    trail only -- a future retraining job can read this table to weight or
    relabel training samples)."""

    __tablename__ = "feedback"
    id = Column(String, primary_key=True, default=gen_id)
    alert_id = Column(String, ForeignKey("alerts.id"), nullable=False)
    user_id = Column(String, ForeignKey("users.id"), nullable=False)
    is_true_positive = Column(Boolean, nullable=False)
    notes = Column(Text)
    created_at = Column(DateTime, default=datetime.utcnow)


class AlertEvent(Base):
    """Audit trail for a case: analyst notes, status/assignee changes, verdicts.
    One append-only table keeps the timeline trivially orderable and gives the
    'who did what, when' record a SOC needs."""

    __tablename__ = "alert_events"
    id = Column(String, primary_key=True, default=gen_id)
    alert_id = Column(String, ForeignKey("alerts.id"), nullable=False, index=True)
    user_id = Column(String, ForeignKey("users.id"), nullable=True)
    kind = Column(String, nullable=False)  # NOTE | STATUS | ASSIGN | VERDICT
    body = Column(Text)
    meta = Column(JSON)
    created_at = Column(DateTime, default=datetime.utcnow, index=True)

    alert = relationship("Alert", back_populates="events")
    user = relationship("User")
