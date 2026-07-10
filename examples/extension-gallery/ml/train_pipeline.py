from dataclasses import dataclass


@dataclass
class TrainingConfig:
    dataset_path: str
    learning_rate: float
    epochs: int


def load_dataset(path: str) -> list[float]:
    if not path:
        return []
    return [0.1, 0.5, 0.9]


def train_model(config: TrainingConfig) -> dict[str, float]:
    dataset = load_dataset(config.dataset_path)
    if not dataset:
        return {"accuracy": 0.0, "loss": 1.0}
    return {
        "accuracy": min(0.99, 0.8 + config.learning_rate),
        "loss": max(0.01, 1.0 / max(config.epochs, 1)),
    }


def export_checkpoint(metrics: dict[str, float]) -> str:
    return f"checkpoint-acc-{metrics['accuracy']:.2f}.bin"
