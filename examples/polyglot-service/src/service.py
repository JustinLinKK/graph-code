from native import math


class Service:
    def score(self, value: int) -> int:
        return math.normalize(value)


def handle(value: int) -> int:
    service = Service()
    return service.score(value)
