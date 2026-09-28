from ml.classifier import AttackClassifier
from ml.model import PredictionResult


def test_is_attack_true_when_confident_non_normal():
    clf = AttackClassifier(threshold=0.5)
    result = PredictionResult(label="DOS_DDOS", score=0.9, probabilities={})
    assert clf.is_attack(result) is True


def test_is_attack_false_for_normal_label_even_if_confident():
    clf = AttackClassifier(threshold=0.5)
    result = PredictionResult(label="NORMAL", score=0.99, probabilities={})
    assert clf.is_attack(result) is False


def test_is_attack_false_below_threshold():
    clf = AttackClassifier(threshold=0.5)
    result = PredictionResult(label="PORT_SCAN", score=0.3, probabilities={})
    assert clf.is_attack(result) is False
