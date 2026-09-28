from datetime import datetime
from typing import Dict, Optional

from ml.preprocess import PreprocessingModule
from ml.model import MLIDSModel
from ml.classifier import AttackClassifier
from ml.attack_analyzer import AttackTypeAnalyzer
from xai.shap_explainer import ExplainableAIModule
from alerts.generator import SOCAlertGenerator, Alert
from alerts.risk_scoring import RiskScoringModule


class SOCPipeline:
    """Maps to UML class `SOCPipeline` -- orchestrates steps 1-8 of the
    architecture (PRD §4/§5) for a single flow's feature vector."""

    def __init__(self, model_path: str):
        self.preprocessor = PreprocessingModule()
        self.model = MLIDSModel().load_model(model_path)
        self.classifier = AttackClassifier()
        self.analyzer = AttackTypeAnalyzer()
        self.explainer = ExplainableAIModule(self.model.model)
        self.alert_generator = SOCAlertGenerator()
        self.risk_scoring = RiskScoringModule()

    def process(
        self,
        feature_dict: Dict[str, float],
        source_ip: str = "unknown",
        dest_ip: str = "unknown",
        timestamp: Optional[datetime] = None,
    ) -> Optional[Alert]:
        row = self.preprocessor.preprocess_features_only(feature_dict, self.model.scaler)

        prediction = self.model.predict(row)[0]
        classification = self.classifier.classify(prediction)

        if not classification.is_attack:
            return None  # normal traffic -> no alert

        analysis = self.analyzer.analyze(classification, feature_dict)
        explanation = self.explainer.explain(analysis, row)
        alert = self.alert_generator.generate(analysis, explanation, source_ip, dest_ip)
        if timestamp is not None:
            alert.timestamp = timestamp  # set before scoring: frequency term is time-windowed
        alert = self.risk_scoring.calculate(alert)
        return alert
