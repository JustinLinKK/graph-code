from dataclasses import dataclass
from native import math


@dataclass
class ScoreRequest:
    user_id: str
    raw_value: int
    source: str


@dataclass
class ScoreResult:
    user_id: str
    normalized_score: int
    risk_band: str


class RiskService:
    def score_request(self, request: ScoreRequest) -> ScoreResult:
        normalized = math.normalize(request.raw_value)
        return ScoreResult(
            user_id=request.user_id,
            normalized_score=normalized,
            risk_band=self._risk_band(normalized),
        )

    def _risk_band(self, normalized: int) -> str:
        if normalized >= 80:
            return "high"
        if normalized >= 40:
            return "medium"
        return "low"


def handle(value: int) -> int:
    service = RiskService()
    result = service.score_request(
        ScoreRequest(user_id="demo-user", raw_value=value, source="api")
    )
    return result.normalized_score
