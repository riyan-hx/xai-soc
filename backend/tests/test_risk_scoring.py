from datetime import datetime, timedelta

from alerts.generator import Alert
from alerts.risk_scoring import RiskScoringModule


def make_alert(**overrides):
    defaults = dict(
        attack_type="DOS_DDOS",
        severity="HIGH",
        confidence=0.8,
        source_ip="10.0.0.5",
        dest_ip="10.0.0.1",
        description="test",
        timestamp=datetime.utcnow(),
    )
    defaults.update(overrides)
    return Alert(**defaults)


def test_prioritize_thresholds():
    rs = RiskScoringModule()
    assert rs.prioritize(0.85) == "P1"
    assert rs.prioritize(0.65) == "P2"
    assert rs.prioritize(0.45) == "P3"
    assert rs.prioritize(0.10) == "P4"


def test_frequency_correlation_increases_with_repeats_in_window():
    rs = RiskScoringModule(window_minutes=5)
    base_time = datetime.utcnow()
    scores = [rs.score(make_alert(timestamp=base_time + timedelta(seconds=i))) for i in range(5)]
    assert scores[-1] > scores[0]


def test_frequency_correlation_resets_outside_window():
    rs = RiskScoringModule(window_minutes=5)
    base_time = datetime.utcnow()
    for i in range(5):
        rs.score(make_alert(timestamp=base_time + timedelta(seconds=i)))

    later = make_alert(timestamp=base_time + timedelta(minutes=10))
    assert rs._frequency_correlation(later) == 0.0


def test_calculate_sets_risk_score_and_priority_on_alert():
    rs = RiskScoringModule()
    alert = make_alert(confidence=0.95, severity="CRITICAL")
    result = rs.calculate(alert)
    assert result is alert
    assert alert.risk_score is not None
    assert alert.priority in {"P1", "P2", "P3", "P4"}
