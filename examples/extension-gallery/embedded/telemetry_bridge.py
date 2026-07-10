from dataclasses import dataclass


@dataclass
class TelemetryPacket:
    topic: str
    channel: int
    millivolts: int


def publish_telemetry(packet: TelemetryPacket) -> str:
    return f"{packet.topic}:{packet.channel}:{packet.millivolts}"


def route_alarm(packet: TelemetryPacket) -> bool:
    return packet.millivolts > 1800
